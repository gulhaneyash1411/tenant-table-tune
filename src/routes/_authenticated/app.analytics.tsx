import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
import { LineChart as LineChartIcon } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, Cell } from "recharts";

export const Route = createFileRoute("/_authenticated/app/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const { tenant } = useTenantContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { (async () => {
    if (!tenant) return;
    const since = new Date(Date.now() - 29 * 86400000).toISOString();
    const { data: o } = await supabase.from("orders").select("*").eq("tenant_id", tenant.id).gte("created_at", since).order("created_at", { ascending: true });
    setOrders(o || []);
    if (o && o.length) {
      const { data: oi } = await supabase.from("order_items").select("name,quantity,price,order_id").in("order_id", o.map(x=>x.id));
      setItems(oi || []);
    }
  })(); }, [tenant]);

  const daily = useMemo(() => {
    const map: Record<string, { date: string; orders: number; revenue: number }> = {};
    for (let i=29;i>=0;i--) { const d = new Date(Date.now()-i*86400000).toISOString().slice(0,10); map[d] = { date: d.slice(5), orders: 0, revenue: 0 }; }
    orders.forEach(o => { const k = o.created_at.slice(0,10); if (!map[k]) return; map[k].orders++; if (o.payment_status==="paid") map[k].revenue += Number(o.total||0); });
    return Object.values(map);
  }, [orders]);

  const topItems = useMemo(() => {
    const m: Record<string, { name: string; qty: number; revenue: number }> = {};
    items.forEach(i => { const k = i.name; (m[k] ||= { name: k, qty: 0, revenue: 0 }); m[k].qty += i.quantity; m[k].revenue += Number(i.price) * i.quantity; });
    return Object.values(m).sort((a,b)=>b.qty-a.qty).slice(0,8);
  }, [items]);

  const paidOrders = orders.filter(o=>o.payment_status==="paid");
  const totalRevenue = paidOrders.reduce((a,b)=>a+Number(b.total||0),0);
  const avgOrder = paidOrders.length ? totalRevenue / paidOrders.length : 0;

  const BAR_COLORS = ["#6366f1", "#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><LineChartIcon className="h-6 w-6"/></div>
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-indigo-500"><div className="text-xs text-muted-foreground">Orders (30d)</div><div className="text-2xl font-semibold">{orders.length}</div></Card>
        <Card className="p-4 border-l-4 border-l-emerald-500"><div className="text-xs text-muted-foreground">Revenue (30d)</div><div className="text-2xl font-semibold">{money(totalRevenue)}</div></Card>
        <Card className="p-4 border-l-4 border-l-amber-500"><div className="text-xs text-muted-foreground">Avg order value</div><div className="text-2xl font-semibold">{money(avgOrder||0)}</div></Card>
        <Card className="p-4 border-l-4 border-l-rose-500"><div className="text-xs text-muted-foreground">Unique dishes sold</div><div className="text-2xl font-semibold">{topItems.length}</div></Card>
      </div>
      <Card className="p-4">
        <div className="font-medium mb-3">Revenue trend</div>
        <div style={{width:"100%",height:300}}>
          <ResponsiveContainer>
            <AreaChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15}/>
              <XAxis dataKey="date" fontSize={11} tickMargin={6} stroke="#94a3b8"/>
              <YAxis fontSize={11} width={70} stroke="#94a3b8" tickFormatter={(v:number)=>v>=1000?`${(v/1000).toFixed(1)}k`:String(v)}/>
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                labelStyle={{ fontSize: 12 }}
                formatter={(v: any)=>[money(Number(v)), "Revenue"]}
              />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#revGrad)" activeDot={{ r: 5, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="p-4">
        <div className="font-medium mb-3">Top-selling items</div>
        <div style={{width:"100%",height:280}}>
          <ResponsiveContainer>
            <BarChart data={topItems}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15}/>
              <XAxis dataKey="name" fontSize={11} interval={0} angle={-20} textAnchor="end" height={70} stroke="#94a3b8"/>
              <YAxis fontSize={11} stroke="#94a3b8"/>
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} formatter={(v: any, _: any, entry: any) => [v, entry.payload.name]} labelFormatter={() => ""}/>
              <Bar dataKey="qty" name="Quantity" radius={[6, 6, 0, 0]}>
                {topItems.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
