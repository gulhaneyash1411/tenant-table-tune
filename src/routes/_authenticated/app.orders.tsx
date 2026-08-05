import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { format } from "date-fns";
import { sendOrderInvoice } from "@/lib/whatsapp.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/orders")({ component: LiveOrders });

const COLUMNS: { key: any; label: string }[] = [
  { key: "new", label: "New" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "served", label: "Served" },
];

function LiveOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const start = new Date(date + "T00:00:00");
    const end = new Date(date + "T23:59:59");
    const { data } = await supabase.from("orders").select("*").gte("created_at", start.toISOString()).lte("created_at", end.toISOString()).order("created_at", { ascending: false });
    setOrders(data || []);
    const ids = (data || []).map(o => o.id);
    if (ids.length) {
      const { data: oi } = await supabase.from("order_items").select("*").in("order_id", ids);
      const byOrder: Record<string, any[]> = {};
      (oi || []).forEach(i => { (byOrder[i.order_id] ||= []).push(i); });
      setItems(byOrder);
    } else setItems({});
    setLoading(false);
  }
  useEffect(() => { setLoading(true); load(); }, [date]);
  useEffect(() => {
    const ch = supabase.channel("orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [date]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { new: [], preparing: [], ready: [], served: [] };
    for (const o of orders) if (g[o.status]) g[o.status].push(o);
    return g;
  }, [orders]);

  async function move(order: any, status: string) {
    const patch: any = { status };
    if (status === "served") patch.served_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (error) return toast.error(error.message);
    load();
  }
  async function markPaid(o: any) {
    const { error } = await supabase.from("orders").update({ payment_status: "paid" }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Marked as paid");
    try {
      const res = await sendOrderInvoice({ data: { order_id: o.id } });
      if (res.ok) toast.success(`Invoice sent on WhatsApp to ${o.customer_phone}`);
      else toast.warning(`Invoice not sent: ${res.error}`);
    } catch (e) {
      toast.warning(e instanceof Error ? e.message : "Invoice could not be sent");
    }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Live orders</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden md:inline">Drag cards between columns to update status</span>
          <span className="text-sm text-muted-foreground">Date</span>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-auto" />
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
              {grouped[col.key].map((o) => (
                <Card
                  key={o.id}
                  className={`p-3 cursor-grab active:cursor-grabbing transition-opacity ${dragging === o.id ? "opacity-40" : ""}`}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); setDragging(o.id); }}
                  onDragEnd={() => setDragging(null)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">#{o.order_number} · {o.customer_name}</div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${o.payment_status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{o.payment_status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{o.order_type === "dine_in" ? "Dine-in" : "Takeaway"} · {format(new Date(o.created_at), "p")}</div>
                  <ul className="text-xs mt-2 space-y-0.5">
                    {(items[o.id] || []).map(i => <li key={i.id}>{i.quantity}× {i.name}</li>)}
                  </ul>
                  <div className="text-sm font-medium mt-2">{money(o.total)}</div>
                  {o.payment_status !== "paid" && (
                    <div className="mt-2"><Button size="sm" onClick={() => markPaid(o)} className="h-7 text-xs w-full">Mark paid</Button></div>
                  )}
                </Card>
              ))}
            </div>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}