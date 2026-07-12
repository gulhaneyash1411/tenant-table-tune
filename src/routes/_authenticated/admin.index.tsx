import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
import { Building2, Clock, CircleDollarSign, ListOrdered, Users, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminDash });

function AdminDash() {
  const [s, setS] = useState<any>({});
  useEffect(() => {
    (async () => {
      const [{ data: tenants }, { data: subs }, { count: orderCount }, { count: custCount }, { count: revCount }, { data: recent }] = await Promise.all([
        supabase.from("tenants").select("id,status,name,city,created_at,owner_email"),
        supabase.from("subscriptions").select("*, subscription_plans(monthly_price)"),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("reviews").select("id", { count: "exact", head: true }),
        supabase.from("tenants").select("*").order("created_at", { ascending: false }).limit(6),
      ]);
      const mrr = (subs || []).filter((s: any) => s.status === "active").reduce((a: number, b: any) => a + Number(b.subscription_plans?.monthly_price || 0), 0);
      setS({
        total: tenants?.length ?? 0,
        active: (tenants||[]).filter(t=>t.status==="approved").length,
        pending: (tenants||[]).filter(t=>t.status==="pending").length,
        suspended: (tenants||[]).filter(t=>t.status==="suspended").length,
        mrr, arr: mrr * 12,
        orders: orderCount ?? 0, customers: custCount ?? 0, reviews: revCount ?? 0,
        recent: recent || [],
      });
    })();
  }, []);
  const kpis = [
    { icon: Building2, label: "Restaurants", value: s.total },
    { icon: Clock, label: "Pending approvals", value: s.pending },
    { icon: CircleDollarSign, label: "MRR", value: money(s.mrr || 0) },
    { icon: CircleDollarSign, label: "ARR", value: money(s.arr || 0) },
    { icon: ListOrdered, label: "Total orders", value: s.orders },
    { icon: Users, label: "Total customers", value: s.customers },
    { icon: Star, label: "Reviews", value: s.reviews },
    { icon: Building2, label: "Suspended", value: s.suspended },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Platform overview</h1>
      <div className="grid gap-4 md:grid-cols-4">
        {kpis.map(k => (
          <Card key={k.label} className="p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{k.label}</span><k.icon className="h-4 w-4"/></div>
            <div className="text-2xl font-semibold mt-2">{k.value ?? 0}</div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <div className="font-medium mb-3">Recent signups</div>
        <div className="divide-y">
          {(s.recent || []).map((t: any) => (
            <div key={t.id} className="py-3 flex items-center justify-between text-sm">
              <div><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.owner_email} · {t.city}</div></div>
              <span className="text-xs px-2 py-0.5 rounded bg-accent">{t.status}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}