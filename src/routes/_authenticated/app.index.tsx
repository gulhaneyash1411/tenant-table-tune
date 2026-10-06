import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
import { ListOrdered, Utensils, Users, Star } from "lucide-react";
import { BusinessOverview } from "@/components/business-overview";
import { fetchCurrentOutlet } from "@/lib/outlet-context";

export const Route = createFileRoute("/_authenticated/app/")({ component: Dashboard });

function Dashboard() {
  const [s, setS] = useState({ orders: 0, revenue: 0, customers: 0, avgRating: 0, recent: [] as any[] });
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const tenant = await fetchCurrentOutlet(u.user!.id);
      if (!tenant?.id) return;

      const today = new Date(); today.setHours(0,0,0,0);
      const iso = today.toISOString();
      const [{ data: orders }, { count: custCount }, { data: reviews }] = await Promise.all([
        supabase.from("orders").select("*").eq("tenant_id", tenant.id).gte("created_at", iso).order("created_at", { ascending: false }).limit(200),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
        supabase.from("reviews").select("rating").eq("tenant_id", tenant.id),
      ]);
      const rev = (orders || []).filter(o => o.payment_status === "paid").reduce((a, b) => a + Number(b.total || 0), 0);
      const ratings = (reviews || []).map((r: any) => r.rating);
      const avg = ratings.length ? ratings.reduce((a,b)=>a+b,0)/ratings.length : 0;
      setS({ orders: orders?.length ?? 0, revenue: rev, customers: custCount ?? 0, avgRating: avg, recent: (orders||[]).slice(0,8) });
    })();
  }, []);
  const cards = [
    { icon: ListOrdered, label: "Orders today", value: s.orders },
    { icon: Utensils, label: "Revenue today", value: money(s.revenue) },
    { icon: Users, label: "Customers", value: s.customers },
    { icon: Star, label: "Avg rating", value: s.avgRating ? s.avgRating.toFixed(1) : "—" },
  ];
  return (
    <div className="space-y-6">
      <BusinessOverview />
      <div className="grid gap-4 md:grid-cols-4">
        {cards.map(c => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{c.label}</div>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-semibold mt-2">{c.value}</div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <div className="font-medium mb-3">Recent orders</div>
        <div className="divide-y">
          {s.recent.length === 0 && <div className="text-sm text-muted-foreground py-4">No orders yet today.</div>}
          {s.recent.map((o: any) => (
            <div key={o.id} className="py-3 flex items-center justify-between text-sm">
              <div><span className="font-medium">#{o.order_number}</span> · {o.customer_name}</div>
              <div className="flex items-center gap-3"><span className="text-muted-foreground">{o.status}</span><span>{money(o.total)}</span></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}