import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOrdersByPhone, getOrderDetail } from "@/lib/public-orders.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { mergeOrderItems } from "@/lib/order-items";
import { downloadInvoicePdf } from "@/lib/invoice";
import { discountLabel, readOrderBill } from "@/lib/billing";
import { format } from "date-fns";
import { Download, Loader2, Plus, Receipt, ChefHat, BellRing, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { ChefMascot } from "@/components/ChefMascot";
import { noindexHead } from "@/lib/seo";

export const Route = createFileRoute("/status")({ head: noindexHead, component: StatusPage });

/**
 * The four stages a customer actually cares about, in order. Everything the
 * kitchen reports is mapped onto one of these — the raw status string is a
 * back-of-house vocabulary ("confirmed", "in_progress") that means nothing to
 * someone waiting at a table.
 */
const STAGES = ["placed", "preparing", "ready", "served"] as const;
type Stage = typeof STAGES[number];

const STAGE_OF: Record<string, Stage> = {
  new: "placed", pending: "placed", placed: "placed",
  confirmed: "preparing", accepted: "preparing", preparing: "preparing", in_progress: "preparing", cooking: "preparing",
  ready: "ready", prepared: "ready",
  served: "served", completed: "served", delivered: "served", done: "served",
};

const STAGE_COPY: Record<Stage, { label: string; Icon: typeof Receipt }> = {
  placed: { label: "Order received", Icon: Receipt },
  preparing: { label: "Preparing your food", Icon: ChefHat },
  ready: { label: "Ready to serve", Icon: BellRing },
  served: { label: "Served — enjoy your meal", Icon: CheckCircle2 },
};

const CANCELLED = new Set(["cancelled", "canceled", "rejected", "refunded"]);

const TYPE_LABELS: Record<string, string> = { dine_in: "Dine-in", takeaway: "Takeaway" };

/**
 * Four-segment bar plus a plain-language line. The list refreshes on every
 * realtime order event (and on a 5s poll as a fallback), so a kitchen status
 * change shows up here as the bar filling one more segment.
 */
function OrderProgress({ status }: { status: string }) {
  const key = String(status || "").toLowerCase().trim();

  if (CANCELLED.has(key)) {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
        <XCircle className="h-4 w-4 shrink-0" />
        <span className="font-medium">Order cancelled</span>
      </div>
    );
  }

  // An unrecognised status is shown verbatim rather than guessed at — a wrong
  // stage is worse than no stage when someone is waiting on their food. If you
  // see this line in the app, add that status string to STAGE_OF above.
  const stage = STAGE_OF[key];
  if (!stage) {
    return <div className="mt-3 text-sm text-muted-foreground capitalize">{key.replace(/_/g, " ") || "Status unavailable"}</div>;
  }

  const reached = STAGES.indexOf(stage);
  const { label, Icon } = STAGE_COPY[stage];

  return (
    <div className="mt-3">
      <div
        className="flex items-center gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STAGES.length}
        aria-valuenow={reached + 1}
        aria-valuetext={label}
      >
        {STAGES.map((s, idx) => (
          <span
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${idx <= reached ? "bg-primary" : "bg-muted-foreground/20"}`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-sm font-medium text-primary">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function StatusPage() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const phone = params.get("phone");
  // Opened from a table where the order was placed without a phone number: the
  // order ID is the only handle, so the page follows that one order.
  const orderId = phone ? null : params.get("order");
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [tenant, setTenant] = useState<any>(null);
  const cancelledRef = useRef(false);

  // A second round of the same dish is a second order_items row, so the guest
  // would see the dish listed twice at ×1 rather than once at ×2 — and after
  // an added round the duplicates aren't even adjacent. One line per dish,
  // quantities summed; rows only merge at the same unit price, so the line
  // amounts still add up to the subtotal shown below.
  const displayItems = useMemo(() => mergeOrderItems(items), [items]);
  // The bill as it was charged — the same figures the invoice PDF prints.
  const selectedBill = readOrderBill(selected);

  // Single refresh used by the first load, the poll and the realtime handler,
  // so all three paths behave identically.
  const refresh = useCallback(async (isFirst: boolean) => {
    if (!phone && !orderId) return;
    try {
      const list = await getOrdersByPhone({ data: phone ? { phone } : { order_id: orderId! } });
      if (cancelledRef.current) return;
      setOrders(list || []);
      setRefreshError(false);
    } catch (err) {
      // Previously swallowed. A silently failing refresh looks exactly like
      // "nothing has changed", which is what makes a stale status so hard to
      // diagnose — so it's logged and surfaced in the UI instead.
      console.error("[status] refresh failed", err);
      if (!cancelledRef.current) setRefreshError(true);
    } finally {
      if (!cancelledRef.current && isFirst) setLoading(false);
    }
  }, [phone, orderId]);

  useEffect(() => {
    if (!phone && !orderId) { setLoading(false); return; }
    cancelledRef.current = false;
    refresh(true);

    // Poll is the fallback path. Realtime below is what makes a kitchen status
    // change appear immediately; if realtime isn't enabled on the orders table
    // in Supabase, this still catches it within 5s.
    const timer = setInterval(() => refresh(false), 5000);

    // Filtering by customer_phone keeps this client from waking on every
    // order in the restaurant. If your column differs, change the filter.
    const filter = phone ? `customer_phone=eq.${phone}` : `id=eq.${orderId}`;
    const channel = supabase
      .channel(`orders-status-${phone ?? orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter },
        () => refresh(false),
      )
      .subscribe();

    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [phone, orderId, refresh]);

  // Keep the open dialog in step with the refreshed list, otherwise the sheet
  // holds the snapshot from the moment it was opened and shows a stale stage
  // while the card behind it has already advanced. Totals are compared too:
  // staff can add a round to a running order, which changes the amount due
  // without touching the status.
  useEffect(() => {
    if (!selected) return;
    const fresh = orders.find((o: any) => o.id === selected.id);
    if (!fresh) return;
    if (fresh.status !== selected.status || Number(fresh.total) !== Number(selected.total)) {
      setSelected(fresh);
    }
  }, [orders, selected]);

  async function openOrder(o: any) {
    setSelected(o);
    const detail = await getOrderDetail({ data: { order_id: o.id, phone: phone ?? "" } });
    setItems(detail.items || []); setTenant(detail.tenant);
  }

  /**
   * The PDF itself lives in @/lib/invoice, shared with the staff order-history
   * screen so the two can't drift apart. Called with no argument from the open
   * sheet, where the items and tenant are already loaded; called with an order
   * from a card in the list, where they still have to be fetched.
   */
  async function downloadInvoice(orderArg?: any) {
    const order = orderArg || selected;
    if (!order) return;
    let its = orderArg ? [] as any[] : items;
    let ten = tenant;
    if (orderArg) {
      const detail = await getOrderDetail({ data: { order_id: order.id, phone: phone ?? "" } });
      its = detail.items || []; ten = detail.tenant;
    }
    await downloadInvoicePdf(order, its, ten);
  }

  function keepOrdering(order?: any) {
    const o = order || selected;
    if (!o) return;
    if (o.order_type === "takeaway") window.location.href = `/takeaway/${o.tenant_id}`;
    else if (o.table_id) {
      navigate({
        to: "/t/$tableId",
        // The table page is addressed by the QR token; the raw id only works
        // for QRs printed before tokens existed.
        params: { tableId: o.table_qr_token ?? o.table_id },
        search: {
          order: String(o.id),
          phone: String(phone ?? o.customer_phone ?? ""),
        },
      });
    }
    else window.location.href = `/takeaway/${o.tenant_id}`;
  }

  return (
    // Same frame as the menu and order-status screens: plain page behind a
    // phone-width tinted column, so the gutters on a desktop viewport match
    // and this doesn't read as a different app.
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-lg min-h-screen flex flex-col bg-slate-100 p-4 pb-16 space-y-4 shadow-xl shadow-black/5">
        <h1 className="text-2xl font-bold tracking-tight px-1 pt-2">Your orders</h1>

        {refreshError && (
          <div className="flex items-center gap-2 rounded-2xl bg-warning/15 text-warning px-4 py-3 text-xs font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Can't reach the kitchen right now — this status may be out of date.
          </div>
        )}

        {orders.filter(o => {
          // Hide paid & served orders only if they're older than 1 hour
          if (o.payment_status === "paid" && o.status === "served") {
            const createdTime = new Date(o.created_at).getTime();
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            return createdTime > oneHourAgo; // Keep if less than 1 hour old
          }
          return true; // Show all other orders
        }).map(o => (
          <div key={o.id} className="space-y-2">
            <Card className="p-4 rounded-3xl border-0 bg-background shadow-md shadow-black/5">
              <button
                onClick={() => openOrder(o)}
                className="w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div className="flex justify-between items-baseline gap-3">
                  <span className="font-bold">Order #{o.order_number}</span>
                  <span className="text-lg font-bold tabular-nums">{money(Number(o.total))}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(o.created_at), "PPp")}
                  {o.order_type && <> · {TYPE_LABELS[o.order_type] ?? "Other"}</>}
                  {o.table_label && <> · {o.table_label}</>}
                </div>
                <OrderProgress status={o.status} />
              </button>

              <div className="mt-4 pt-3 border-t flex items-center justify-between">
                <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${o.payment_status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{o.payment_status}</span>
                <Button size="sm" variant="outline" className="rounded-full h-9 px-4 border-2 font-semibold" onClick={() => downloadInvoice(o)}>
                  <Download className="h-3.5 w-3.5 mr-1.5"/>Invoice
                </Button>
              </div>
            </Card>
            {(() => {
              const statusKey = String(o.status || "").toLowerCase().trim();
              if (CANCELLED.has(statusKey)) return null;
              if (o.payment_status === "paid") return <ChefMascot stage="thankyou" />;
              const mascotStage = STAGE_OF[statusKey] ?? null;
              return mascotStage ? <ChefMascot stage={mascotStage} /> : null;
            })()}
            {o.payment_status === "unpaid" && !CANCELLED.has(String(o.status || "").toLowerCase().trim()) && (
              <div className="flex justify-center">
                <Button size="sm" className="h-9 rounded-full px-5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => keepOrdering(o)}>
                  <Plus className="h-3.5 w-3.5 mr-1 shrink-0"/>Keep ordering
                </Button>
              </div>
            )}
          </div>
        ))}

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />Loading your orders…
          </div>
        ) : orders.length === 0 ? (
          <div className="text-muted-foreground text-sm text-center py-10">No recent orders.</div>
        ) : null}

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          {/*
            Three bands: header, scrolling middle, pinned footer. The sheet is
            capped at 85% of the viewport (dvh, so an iOS address bar sliding in
            doesn't push the buttons off-screen) and only the item list scrolls,
            which keeps the total and the two actions reachable no matter how
            many rounds have been added to the order.

            p-0/gap-0 override the padding shadcn's DialogContent applies by
            default, so each band can carry its own.
          */}
          <DialogContent className="max-w-md w-[calc(100%-2rem)] rounded-[28px] p-0 gap-0 flex flex-col max-h-[85vh] max-h-[85dvh] overflow-hidden">
            <DialogHeader className="shrink-0 px-5 pt-5 pb-3 text-left">
              <DialogTitle>Order #{selected?.order_number}</DialogTitle>
            </DialogHeader>

            {selected && (
              <>
                {/* min-h-0 is what actually lets this shrink inside the flex
                    column — without it the list forces the sheet taller than
                    the cap instead of scrolling. */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4 space-y-3">
                  <OrderProgress status={selected.status} />
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{format(new Date(selected.created_at), "PPpp")}</span>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full font-medium ${selected.payment_status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{selected.payment_status}</span>
                  </div>

                  <div className="divide-y rounded-2xl bg-muted/40">
                    {displayItems.map(i => (
                      <div key={i.id} className="p-3 flex justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words">{i.quantity}× {i.name}</span>
                        <span className="shrink-0 tabular-nums">{money(Number(i.price) * i.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pinned: the amount due and the two actions stay visible. */}
                <div className="shrink-0 border-t bg-background px-5 py-4 space-y-3">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{money(selectedBill.itemsSubtotal)}</span></div>
                    {selectedBill.discountAmount > 0 && (
                      <>
                        <div className="flex justify-between text-muted-foreground"><span>{discountLabel(selectedBill, money)}</span><span className="tabular-nums">− {money(selectedBill.discountAmount)}</span></div>
                        <div className="flex justify-between text-muted-foreground"><span>After discount</span><span className="tabular-nums">{money(selectedBill.subtotalAfterDiscount)}</span></div>
                      </>
                    )}
                    <div className="flex justify-between text-muted-foreground"><span>Tax</span><span className="tabular-nums">{money(selectedBill.tax)}</span></div>
                    {selectedBill.serviceCharge > 0 && (
                      <div className="flex justify-between text-muted-foreground"><span>Service charges</span><span className="tabular-nums">+ {money(selectedBill.serviceCharge)}</span></div>
                    )}
                    {selectedBill.deliveryFee > 0 && (
                      <div className="flex justify-between text-muted-foreground"><span>Additional charges</span><span className="tabular-nums">{money(selectedBill.deliveryFee)}</span></div>
                    )}
                    <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{money(selectedBill.total)}</span></div>
                  </div>
                  <div className="flex justify-center">
                    <Button size="sm" className="h-9 rounded-full px-5 text-xs font-semibold shadow-lg shadow-primary/25" onClick={() => downloadInvoice()}>
                      <Download className="h-3.5 w-3.5 mr-1 shrink-0"/>Invoice
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
        <p className="mt-auto pt-8 text-center text-xs text-muted-foreground">Powered by DineEatz</p>
      </div>
    </div>
  );
}