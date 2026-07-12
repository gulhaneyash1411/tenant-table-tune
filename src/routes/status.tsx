import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
export const Route = createFileRoute("/status")({ component: StatusPage });
function StatusPage() {
  const phone = new URLSearchParams(typeof window!=="undefined"?window.location.search:"").get("phone");
  const [orders, setOrders] = useState<any[]>([]);
  useEffect(() => {
    if (!phone) return;
    const load = async () => { const { data } = await supabase.from("orders").select("*").eq("customer_phone", phone).order("created_at", { ascending: false }).limit(5); setOrders(data || []); };
    load();
    const ch = supabase.channel("status-"+phone).on("postgres_changes",{event:"*",schema:"public",table:"orders"},load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [phone]);
  return (
    <div className="min-h-screen p-6 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Your orders</h1>
      {orders.map(o => (
        <Card key={o.id} className="p-4">
          <div className="flex justify-between"><div className="font-medium">Order #{o.order_number}</div><span className="text-xs px-2 py-0.5 rounded bg-accent">{o.status}</span></div>
          <div className="text-sm text-muted-foreground mt-1">{o.customer_name}</div>
          <div className="mt-2 font-medium">{money(Number(o.total))}</div>
        </Card>
      ))}
      {orders.length === 0 && <div className="text-muted-foreground text-sm">No recent orders.</div>}
    </div>
  );
}
