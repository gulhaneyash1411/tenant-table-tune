import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { mergeOrderItemsMap, splitByRound, NEW_ROUND_MARKER } from "@/lib/order-items";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChefHat, Clock, Bike, Flame } from "lucide-react";
import { clearRoundMarkers } from "@/lib/public-orders.functions";
import { fetchCurrentOutlet } from "@/lib/outlet-context";

// Shared by the Hotel Owner's dashboard (/app/kds) and the dedicated Kitchen
// User portal (/kitchen) — one component, one set of orders/RLS behavior,
// so there's nothing kitchen-specific to keep in sync between the two.

// "Served" means handed to the rider on a delivery ticket, so the last column
// and its button are relabelled when the ticket is a delivery.
const STAGES = [
  { key: "new", label: "Incoming", next: "preparing", nextLabel: "Start cooking" },
  { key: "preparing", label: "In kitchen", next: "ready", nextLabel: "Mark ready" },
  { key: "ready", label: "Ready to serve", next: "served", nextLabel: "Served" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  dine_in: "Table",
  takeaway: "Takeaway",
  home_delivery: "Home delivery",
};

export function KitchenDisplay() {
  const [tenant, setTenant] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const t = await fetchCurrentOutlet(u.user!.id);
      setTenant(t);
    })();
  }, []);

  async function load() {
    if (!tenant?.id) return;
    const { data } = await supabase.from("orders").select("*").eq("tenant_id", tenant.id).in("status", ["new", "preparing", "ready"]).order("created_at", { ascending: true });
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
    const ch = supabase.channel("kds")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenant?.id]);

  // Two rounds of the same dish arrive as two order_items rows, so the ticket
  // would read "Paneer Butter Masala ×1" twice — and the rows need not be
  // adjacent, so this groups by dish rather than comparing neighbours. The
  // line the cook reads is one per dish with the quantities summed. Display
  // only: the rows in state are the real records.
  const displayItems = useMemo(() => mergeOrderItemsMap(items), [items]);

  // For orders that came back to "preparing" after a new round was added, the
  // kitchen only needs to cook the new items.  `kitchenItems` holds only the
  // new-round rows when they exist, or the full list otherwise.
  const kitchenItems = useMemo(() => {
    const out: Record<string, { merged: any[]; isAddedRound: boolean }> = {};
    for (const o of orders) {
      const raw = items[o.id] || [];
      const { newRound } = splitByRound(raw, o);
      if (newRound.length > 0) {
        out[o.id] = {
          merged: mergeOrderItemsMap({ _: newRound })["_"] || [],
          isAddedRound: true,
        };
      } else {
        out[o.id] = {
          merged: displayItems[o.id] || [],
          isAddedRound: false,
        };
      }
    }
    return out;
  }, [orders, items, displayItems]);

  async function advance(o: any, to: string) {
    const patch: any = { status: to };
    if (to === "served") {
      patch.served_at = new Date().toISOString();
      await clearRoundMarkers({ data: { order_id: o.id } });
    }
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
                const isDelivery = o.order_type === "home_delivery";
                const nextLabel = isDelivery && s.next === "served" ? "Handed to rider" : s.nextLabel;
                return (
                  <Card key={o.id} className={`p-4 ${hot ? "border-destructive" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">#{o.order_number}</div>
                      <div className={`text-xs flex items-center gap-1 ${hot ? "text-destructive" : "text-muted-foreground"}`}><Clock className="h-3 w-3"/>{mins}m</div>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {isDelivery && <Bike className="h-3 w-3 shrink-0" />}
                      {TYPE_LABELS[o.order_type] ?? o.order_type} · {format(new Date(o.created_at), "p")}
                    </div>
                    {isDelivery && o.delivery_address && (
                      <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                        {o.delivery_address}{o.delivery_pincode ? ` — ${o.delivery_pincode}` : ""}
                      </div>
                    )}
                    {kitchenItems[o.id]?.isAddedRound && (
                      <div className="flex items-center gap-1.5 mt-3 text-xs font-semibold text-orange-600">
                        <Flame className="h-3.5 w-3.5 shrink-0" />New round — cook only these:
                      </div>
                    )}
                    <ul className={`text-sm ${kitchenItems[o.id]?.isAddedRound ? "mt-1" : "mt-3"} space-y-1`}>
                      {(kitchenItems[o.id]?.merged || []).map(i => (
                        <li key={i.id} className={`flex justify-between ${kitchenItems[o.id]?.isAddedRound ? "font-semibold text-orange-600" : ""}`}>
                          <span>{i.name}</span><span className="font-medium">×{i.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    <Button className="w-full mt-3" size="sm" onClick={() => advance(o, s.next)}>{nextLabel}</Button>
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
