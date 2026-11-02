import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";
import { mergeOrderItemsMap, splitByRound, NEW_ROUND_MARKER } from "@/lib/order-items";
import { toast } from "sonner";
import { format } from "date-fns";
import { sendOrderInvoice } from "@/lib/whatsapp.functions";
import { Loader2, ChevronLeft, Flame } from "lucide-react";
import { NewOrderDialog, AddItemsDialog } from "@/components/orders/NewOrderDialog";
import { clearRoundMarkers, closeSessionOnPayment } from "@/lib/public-orders.functions";
import { fetchCurrentOutlet } from "@/lib/outlet-context";

export const Route = createFileRoute("/_authenticated/app/orders")({ component: LiveOrders });

// Name of the relation holding dining tables. Change this to whatever it is in
// your schema (check src/integrations/supabase/types.ts) — "tables" is not in
// the generated types, so it is almost certainly named something else here.
const TABLES_RELATION = "restaurant_tables";

// payment_status enum on this database: unpaid | paid | refunded.
// Only "unpaid" is still open for money — the other two are settled, so the
// card treats them the same way (no Mark paid, no Add items).
const UNPAID_STATUS = "unpaid";

// Badge colour per payment state. Refunded is deliberately neutral: it is not
// money owed (amber) and not money taken (green).
const PAYMENT_BADGE: Record<string, string> = {
  unpaid: "bg-warning/15 text-warning",
  paid: "bg-success/15 text-success",
  refunded: "bg-muted text-muted-foreground",
};

const COLUMNS: { key: any; label: string }[] = [
  { key: "new", label: "New" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "served", label: "Served" },
];

const FLOW = ["new", "preparing", "ready", "served"] as const;

// Button copy for advancing a card one stage.
const NEXT_LABEL: Record<string, string> = {
  preparing: "Start preparing",
  ready: "Mark ready",
  served: "Mark served",
};

function nextStatus(status: string) {
  const i = FLOW.indexOf(status as any);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}
function prevStatus(status: string) {
  const i = FLOW.indexOf(status as any);
  return i > 0 ? FLOW[i - 1] : null;
}
function columnLabel(key: string) {
  return COLUMNS.find(c => c.key === key)?.label ?? key;
}

function LiveOrders() {
  const [tenant, setTenant] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  // Local calendar date, not UTC. toISOString() here would name yesterday for
  // the whole IST small hours, while the range below is built in local time —
  // orders placed after midnight would fall outside the window and the board
  // would show nothing.
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [tableLabels, setTableLabels] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const t = await fetchCurrentOutlet(u.user!.id);
      setTenant(t);
    })();
  }, []);

  async function load() {
    if (!tenant?.id) return;
    // Half-open [start, next midnight): an inclusive 23:59:59 end drops
    // anything in the final second of the day.
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const { data } = await supabase.from("orders").select("*, restaurant_tables(label)").eq("tenant_id", tenant.id).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()).order("created_at", { ascending: false });
    const enriched = (data || []).map((o: any) => ({
      ...o,
      _table_label: o.restaurant_tables?.label ?? null,
    }));
    setOrders(enriched);
    const ids = (data || []).map(o => o.id);
    if (ids.length) {
      const { data: oi } = await supabase.from("order_items").select("*").in("order_id", ids);
      const byOrder: Record<string, any[]> = {};
      (oi || []).forEach(i => { (byOrder[i.order_id] ||= []).push(i); });
      setItems(byOrder);
    } else setItems({});
    setLoading(false);
  }
  useEffect(() => { setLoading(true); load(); }, [date, tenant?.id]);
  useEffect(() => {
    const ch = supabase.channel("orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      // Items can change without the order row changing (staff adding a round),
      // so listen on order_items too or the card silently goes stale.
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [date, tenant?.id]);

  // Resolve table ids to their labels. Cast to any because the relation name is
  // set above rather than known to the generated types.
  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any).from(TABLES_RELATION).select("*").eq("tenant_id", tenant?.id);
      if (error || !data) {
        console.warn(`Table labels unavailable from "${TABLES_RELATION}":`, error?.message);
        return;
      }
      const map: Record<string, string> = {};
      for (const t of data as any[]) {
        const label = t.label ?? t.name ?? t.table_number ?? t.number ?? t.code ?? t.title;
        if (label !== null && label !== undefined && label !== "") map[t.id] = String(label);
      }
      setTableLabels(map);
    })();
  }, []);

  // Never renders a raw uuid — falls back to "Dine-in" if no label is known.
  function tableLabel(o: any): string | null {
    const direct = o._table_label ?? o.table_number ?? o.table_no ?? o.table_label;
    const raw = direct ?? (o.table_id ? tableLabels[o.table_id] : null);
    if (raw === null || raw === undefined || raw === "") return null;
    const s = String(raw);
    return /^table/i.test(s) ? s : `Table ${s}`;
  }

  function orderTypeLabel(o: any): string {
    if (o.order_type === "dine_in") return tableLabel(o) ?? "Dine-in";
    return o.order_type === "takeaway" ? "Takeaway" : "Other";
  }

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { new: [], preparing: [], ready: [], served: [] };
    for (const o of orders) if (g[o.status]) g[o.status].push(o);
    return g;
  }, [orders]);

  // The same dish added in separate rounds arrives as separate order_items
  // rows; the card shows one line per dish with the quantities summed. Done
  // once per load rather than on every render — and only for display, so the
  // raw rows behind Add items and the invoice are untouched.
  const displayItems = useMemo(() => mergeOrderItemsMap(items), [items]);

  async function move(order: any, status: string) {
    setBusy(order.id);
    const patch: any = { status };
    if (status === "served") {
      patch.served_at = new Date().toISOString();
      await clearRoundMarkers({ data: { order_id: order.id } });
    }
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    // Optimistic local update so the card moves before the realtime echo lands.
    setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, ...patch } : o)));
    toast.success(`#${order.order_number} moved to ${columnLabel(status)}`);
    load();
  }
  async function markPaid(o: any) {
    const { error } = await supabase.from("orders").update({ payment_status: "paid" }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Marked as paid");
    // Close the ordering session so the QR link can't place new orders.
    try { await closeSessionOnPayment({ data: { order_id: o.id } }); } catch {}
    try {
      const res = await sendOrderInvoice({ data: { order_id: o.id } });
      if (res.ok) toast.success(`Invoice sent on WhatsApp to ${o.customer_phone}`);
      // Invoice skipped (no WhatsApp sender set up, or no WhatsApp number on the
      // order): nothing to report, the order is still marked paid.
      else if (!("skipped" in res && res.skipped)) toast.warning(`Invoice not sent: ${res.error}`);
    } catch (e) {
      toast.warning(e instanceof Error ? e.message : "Invoice could not be sent");
    }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden md:inline">Drag cards, or use the buttons, to update status</span>
          <span className="text-sm text-muted-foreground">Date</span>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-auto" />
          <NewOrderDialog tenantId={tenant?.id} onSaved={load} />
        </div>
      </div>
      {loading ? (
        <div className="min-h-[40vh] grid place-items-center text-muted-foreground">
          <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading orders…</div>
        </div>
      ) : (
      <div className="grid gap-3 md:grid-cols-4">
        {COLUMNS.map(col => (
          <Card
            key={col.key}
            className="p-3 bg-muted/30 min-h-[60vh]"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              const o = orders.find(x => x.id === id);
              if (o && o.status !== col.key) move(o, col.key);
              setDragging(null);
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">{col.label}</div>
              <div className="text-xs text-muted-foreground">{grouped[col.key].length}</div>
            </div>
            <div className="space-y-2">
              {grouped[col.key].map((o) => {
                const next = nextStatus(o.status);
                const back = prevStatus(o.status);
                const labels = NEXT_LABEL;
                const isBusy = busy === o.id;
                // Only an unpaid order is still open for money. Paid and
                // refunded orders both have an invoice out against them.
                const isUnpaid = o.payment_status === UNPAID_STATUS;
                const badgeClass = PAYMENT_BADGE[o.payment_status] ?? "bg-muted text-muted-foreground";
                return (
                <Card
                  key={o.id}
                  className={`p-3 cursor-grab active:cursor-grabbing transition-opacity ${dragging === o.id ? "opacity-40" : ""}`}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); setDragging(o.id); }}
                  onDragEnd={() => setDragging(null)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">#{o.order_number} · {o.customer_name}</div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeClass}`}>{o.payment_status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {orderTypeLabel(o)} · {format(new Date(o.created_at), "p")}
                  </div>
                  {(() => {
                    const raw = items[o.id] || [];
                    const { original, newRound } = splitByRound(raw, o);
                    const hasNew = newRound.length > 0;
                    return (
                      <ul className="text-xs mt-2 space-y-0.5">
                        {mergeOrderItemsMap({ _: original })["_"]?.map(i => (
                          <li key={i.id} className={hasNew ? "text-muted-foreground" : ""}>{i.quantity}× {i.name}</li>
                        ))}
                        {hasNew && (
                          <li className="flex items-center gap-1 text-[10px] font-semibold text-orange-600 pt-1">
                            <Flame className="h-3 w-3 shrink-0" />New round
                          </li>
                        )}
                        {mergeOrderItemsMap({ _: newRound })["_"]?.map(i => (
                          <li key={i.id} className="font-semibold text-orange-600">{i.quantity}× {i.name}</li>
                        ))}
                      </ul>
                    );
                  })()}
                  <div className="text-sm font-medium mt-2">{money(o.total)}</div>

                  {(next || back) && (
                    <div
                      className="mt-2 flex items-center gap-1.5"
                      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    >
                      {back && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          disabled={isBusy}
                          aria-label={`Move #${o.order_number} back to ${columnLabel(back)}`}
                          title={`Back to ${columnLabel(back)}`}
                          onClick={() => move(o, back)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      )}
                      {next && (
                        <Button
                          size="sm"
                          className="h-7 text-xs flex-1"
                          disabled={isBusy}
                          onClick={() => move(o, next)}
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : labels[next]}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Adding to a settled order would leave the WhatsApp invoice wrong. */}
                  {isUnpaid && (
                    <div
                      className="mt-2"
                      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    >
                      <AddItemsDialog order={o} onSaved={load} />
                    </div>
                  )}

                  {isUnpaid && (
                    <div className="mt-2">
                      <Button size="sm" variant="outline" onClick={() => markPaid(o)} className="h-7 text-xs w-full">Mark paid</Button>
                    </div>
                  )}
                </Card>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}