import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChefHat, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/kds")({ component: KDS });

const STAGES = [
  { key: "new", label: "Incoming", next: "preparing", nextLabel: "Start cooking" },
  { key: "preparing", label: "In kitchen", next: "ready", nextLabel: "Mark ready" },
  { key: "ready", label: "Ready to serve", next: "served", nextLabel: "Served" },
] as const;

function KDS() {
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});

  async function load() {
    const { data } = await supabase.from("orders").select("*").in("status", ["new", "preparing", "ready"]).order("created_at", { ascending: true });
    setOrders(data || []);
    const ids = (data || []).map(o => o.id);
    if (ids.length) {
      const { data: oi } = await supabase.from("order_items").select("*").in("order_id", ids);
      const by: Record<string, any[]> = {};
      (oi || []).forEach(i => { (by[i.order_id] ||= []).push(i); });
      setItems(by);
    } else setItems({});
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("kds").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function advance(o: any, to: string) {
    const patch: any = { status: to };
    if (to === "served") patch.served_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(patch).eq("id", o.id);
    if (error) toast.error(error.message);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ChefHat className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Kitchen Display</h1>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {STAGES.map(s => {
          const list = orders.filter(o => o.status === s.key);
          return (
            <div key={s.key} className="space-y-2">
              <div className="text-sm font-medium flex items-center justify-between px-1"><span>{s.label}</span><span className="text-xs text-muted-foreground">{list.length}</span></div>
              {list.map(o => {
                const mins = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
                const hot = mins > 15;
                return (
                  <Card key={o.id} className={`p-4 ${hot ? "border-destructive" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">#{o.order_number}</div>
                      <div className={`text-xs flex items-center gap-1 ${hot ? "text-destructive" : "text-muted-foreground"}`}><Clock className="h-3 w-3"/>{mins}m</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{o.order_type === "dine_in" ? `Table` : "Takeaway"} · {format(new Date(o.created_at), "p")}</div>
                    <ul className="text-sm mt-3 space-y-1">
                      {(items[o.id] || []).map(i => <li key={i.id} className="flex justify-between"><span>{i.name}</span><span className="font-medium">×{i.quantity}</span></li>)}
                    </ul>
                    <Button className="w-full mt-3" size="sm" onClick={() => advance(o, s.next)}>{s.nextLabel}</Button>
                  </Card>
                );
              })}
              {list.length === 0 && <div className="text-xs text-muted-foreground text-center py-6">No orders</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
