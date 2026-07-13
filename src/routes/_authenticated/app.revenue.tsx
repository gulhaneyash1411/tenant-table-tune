import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { format, subDays } from "date-fns";
import { TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/revenue")({ component: Revenue });

function Revenue() {
  const [from, setFrom] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    const start = new Date(from + "T00:00:00").toISOString();
    const end = new Date(to + "T23:59:59").toISOString();
    supabase.from("orders").select("created_at,total,payment_status,order_type").gte("created_at", start).lte("created_at", end).order("created_at").then(({ data }) => setRows(data || []));
  }, [from, to]);

  const byDay = useMemo(() => {
    const m: Record<string, { revenue: number; paid: number; orders: number }> = {};
    for (const o of rows) {
      const d = format(new Date(o.created_at), "yyyy-MM-dd");
      m[d] ||= { revenue: 0, paid: 0, orders: 0 };
      m[d].revenue += Number(o.total || 0);
      if (o.payment_status === "paid") m[d].paid += Number(o.total || 0);
      m[d].orders += 1;
    }
    return Object.entries(m).sort(([a],[b]) => a.localeCompare(b));
  }, [rows]);

  const total = rows.reduce((a,b) => a + Number(b.total || 0), 0);
  const paid = rows.filter(r => r.payment_status === "paid").reduce((a,b) => a + Number(b.total || 0), 0);
  const maxDay = Math.max(1, ...byDay.map(([,v]) => v.revenue));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><TrendingUp className="h-6 w-6"/><h1 className="text-2xl font-semibold">Revenue</h1></div>
      <Card className="p-4 flex flex-wrap gap-4 items-end">
        <div><Label>From</Label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
        <div><Label>To</Label><Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Gross revenue</div><div className="text-2xl font-semibold mt-1">{money(total)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Collected (paid)</div><div className="text-2xl font-semibold mt-1">{money(paid)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Orders</div><div className="text-2xl font-semibold mt-1">{rows.length}</div></Card>
      </div>
      <Card className="p-4">
        <div className="font-medium mb-3">Daily revenue</div>
        {byDay.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">No orders in this range.</div>}
        <div className="space-y-2">
          {byDay.map(([d, v]) => (
            <div key={d} className="flex items-center gap-3 text-sm">
              <div className="w-24 text-muted-foreground">{format(new Date(d), "PP")}</div>
              <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(v.revenue / maxDay) * 100}%` }}/>
              </div>
              <div className="w-24 text-right font-medium">{money(v.revenue)}</div>
              <div className="w-16 text-right text-xs text-muted-foreground">{v.orders} ord</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
