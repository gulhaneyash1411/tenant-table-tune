import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
import { LineChart as LineChartIcon } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/app/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { (async () => {
    const since = new Date(Date.now() - 29 * 86400000).toISOString();
    const { data: o } = await supabase.from("orders").select("*").gte("created_at", since).order("created_at", { ascending: true });
    setOrders(o || []);
    if (o && o.length) {
      const { data: oi } = await supabase.from("order_items").select("name,quantity,price,order_id").in("order_id", o.map(x=>x.id));
      setItems(oi || []);
    }
  })(); }, []);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><LineChartIcon className="h-6 w-6"/><h1 className="text-2xl font-semibold">Analytics</h1></div>
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Orders (30d)</div><div className="text-2xl font-semibold">{orders.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Revenue (30d)</div><div className="text-2xl font-semibold">{money(totalRevenue)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Avg order value</div><div className="text-2xl font-semibold">{money(avgOrder||0)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Unique dishes sold</div><div className="text-2xl font-semibold">{topItems.length}</div></Card>
      </div>
      <Card className="p-4">
        <div className="font-medium mb-3">Revenue trend</div>
        <div style={{width:"100%",height:260}}>
          <ResponsiveContainer>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3}/>
              <XAxis dataKey="date" fontSize={11}/><YAxis fontSize={11}/>
              <Tooltip formatter={(v: any)=>money(Number(v))}/>
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="p-4">
        <div className="font-medium mb-3">Top-selling items</div>
        <div style={{width:"100%",height:280}}>
          <ResponsiveContainer>
            <BarChart data={topItems}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3}/>
              <XAxis dataKey="name" fontSize={11} interval={0} angle={-20} textAnchor="end" height={70}/><YAxis fontSize={11}/>
              <Tooltip/>
              <Bar dataKey="qty" fill="hsl(var(--primary))"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}