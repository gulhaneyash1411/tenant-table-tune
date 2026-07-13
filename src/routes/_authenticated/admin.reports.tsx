import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/reports")({ component: Reports });

function download(rows: any[], name: string) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
}

function Reports() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("tenants").select("*").then(({data})=>setTenants(data||[]));
    supabase.from("orders").select("*").then(({data})=>setOrders(data||[]));
    supabase.from("invoices").select("*").then(({data})=>setInvoices(data||[]));
  }, []);

  const kpis = useMemo(() => ({
    tenants: tenants.length,
    approved: tenants.filter(t=>t.status==="approved").length,
    orders: orders.length,
    grossRevenue: orders.reduce((a,b)=>a+Number(b.total||0),0),
    collected: invoices.filter(i=>i.status==="paid").reduce((a,b)=>a+Number(b.amount||0),0),
  }), [tenants, orders, invoices]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div className="grid md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Restaurants</div><div className="text-2xl font-semibold">{kpis.tenants}</div><div className="text-xs text-muted-foreground">{kpis.approved} approved</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total orders</div><div className="text-2xl font-semibold">{kpis.orders}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Gross GMV</div><div className="text-2xl font-semibold">{money(kpis.grossRevenue)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Platform revenue</div><div className="text-2xl font-semibold">{money(kpis.collected)}</div></Card>
      </div>
      <Card className="p-5 space-y-3 max-w-2xl">
        <div className="font-medium">Downloadable exports (CSV)</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={()=>download(tenants.map(t=>({id:t.id,name:t.name,owner_email:t.owner_email,owner_phone:t.owner_phone,city:t.city,status:t.status,created_at:t.created_at})), `restaurants_${format(new Date(),"yyyyMMdd")}`)}><Download className="h-4 w-4 mr-1"/>Restaurants</Button>
          <Button variant="outline" onClick={()=>download(orders.map(o=>({order_number:o.order_number,tenant_id:o.tenant_id,customer:o.customer_name,total:o.total,payment_status:o.payment_status,created_at:o.created_at})), `orders_${format(new Date(),"yyyyMMdd")}`)}><Download className="h-4 w-4 mr-1"/>Orders</Button>
          <Button variant="outline" onClick={()=>download(invoices.map(i=>({number:i.invoice_number,tenant_id:i.tenant_id,amount:i.amount,status:i.status,issued_at:i.issued_at,paid_at:i.paid_at})), `invoices_${format(new Date(),"yyyyMMdd")}`)}><Download className="h-4 w-4 mr-1"/>Invoices</Button>
        </div>
      </Card>
    </div>
  );
}
