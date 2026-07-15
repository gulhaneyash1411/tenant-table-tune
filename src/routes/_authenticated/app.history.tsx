import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { History, Download, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/history")({ component: OrderHistory });

function OrderHistory() {
  const [from, setFrom] = useState<string>(new Date(Date.now()-6*86400000).toISOString().slice(0,10));
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0,10));
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [selected, setSelected] = useState<any>(null);

  async function load() {
    const start = new Date(from + "T00:00:00").toISOString();
    const end = new Date(to + "T23:59:59").toISOString();
    const { data } = await supabase.from("orders").select("*").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false });
    setRows(data || []);
    const ids = (data || []).map(o => o.id);
    if (ids.length) {
      const { data: oi } = await supabase.from("order_items").select("*").in("order_id", ids);
      const by: Record<string, any[]> = {};
      (oi || []).forEach(i => (by[i.order_id] ||= []).push(i));
      setItems(by);
    } else setItems({});
  }
  useEffect(() => { load(); }, [from, to]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(o => o.order_number?.toString().includes(s) || (o.customer_name||"").toLowerCase().includes(s) || (o.customer_phone||"").includes(s));
  }, [rows, q]);

  const totalRevenue = filtered.filter(o=>o.payment_status==="paid").reduce((a,b)=>a+Number(b.total||0),0);

  function exportCsv() {
    const header = ["Order #","Date","Customer","Phone","Type","Status","Payment","Subtotal","Tax","Total"];
    const lines = [header.join(",")];
    filtered.forEach(o => {
      lines.push([o.order_number, format(new Date(o.created_at),"yyyy-MM-dd HH:mm"), `"${o.customer_name||""}"`, o.customer_phone||"", o.order_type, o.status, o.payment_status, o.subtotal, o.tax, o.total].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `orders-${from}-to-${to}.csv`; a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2"><History className="h-6 w-6"/><h1 className="text-2xl font-semibold">Order history</h1></div>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-auto"/>
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-auto"/>
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1"/>CSV</Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total orders</div><div className="text-2xl font-semibold">{filtered.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Paid revenue</div><div className="text-2xl font-semibold">{money(totalRevenue)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Unpaid</div><div className="text-2xl font-semibold">{filtered.filter(o=>o.payment_status!=="paid").length}</div></Card>
      </div>
      <Card className="p-3"><div className="relative"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><Input placeholder="Search #, customer, phone" className="pl-9" value={q} onChange={e=>setQ(e.target.value)}/></div></Card>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="p-3">#</th><th className="p-3">Date</th><th className="p-3">Customer</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3 text-right">Total</th>
          </tr></thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} className="border-t cursor-pointer hover:bg-accent/40" onClick={()=>setSelected(o)}>
                <td className="p-3 font-medium">#{o.order_number}</td>
                <td className="p-3">{format(new Date(o.created_at),"PP p")}</td>
                <td className="p-3">{o.customer_name}<div className="text-xs text-muted-foreground">{o.customer_phone}</div></td>
                <td className="p-3 capitalize">{o.order_type?.replace("_"," ")}</td>
                <td className="p-3 capitalize">{o.status}</td>
                <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded ${o.payment_status==="paid"?"bg-success/15 text-success":"bg-warning/15 text-warning"}`}>{o.payment_status}</span></td>
                <td className="p-3 text-right font-medium">{money(Number(o.total||0))}</td>
              </tr>
            ))}
            {filtered.length===0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No orders in this range</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o)=>!o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Order #{selected?.order_number}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{format(new Date(selected.created_at),"PPpp")} · {selected.customer_name} · {selected.customer_phone}</div>
              <div className="border rounded divide-y">
                {(items[selected.id]||[]).map(i => <div key={i.id} className="p-2 flex justify-between text-sm"><span>{i.quantity}× {i.name}</span><span>{money(Number(i.price)*i.quantity)}</span></div>)}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(Number(selected.subtotal))}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{money(Number(selected.tax))}</span></div>
                <div className="flex justify-between font-semibold"><span>Total</span><span>{money(Number(selected.total))}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}