import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/billing")({ component: Billing });

function Billing() {
  const [rows, setRows] = useState<any[]>([]);
  const [tenants, setTenants] = useState<Record<string, any>>({});
  async function load() {
    const [{ data: inv }, { data: t }] = await Promise.all([
      supabase.from("invoices").select("*").order("issued_at", { ascending: false }),
      supabase.from("tenants").select("id,name"),
    ]);
    setRows(inv || []);
    const m: Record<string,any> = {}; (t||[]).forEach(x=>{m[x.id]=x}); setTenants(m);
  }
  useEffect(()=>{load();},[]);

  const revenue = rows.filter(r=>r.status==="paid").reduce((a,b)=>a+Number(b.amount||0),0);
  const outstanding = rows.filter(r=>r.status!=="paid").reduce((a,b)=>a+Number(b.amount||0),0);

  async function markPaid(id: string) {
    const { error } = await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked paid"); load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <div className="grid md:grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Collected</div><div className="text-2xl font-semibold">{money(revenue)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-2xl font-semibold">{money(outstanding)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Invoices</div><div className="text-2xl font-semibold">{rows.length}</div></Card>
      </div>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>Restaurant</TableHead><TableHead>Amount</TableHead><TableHead>Issued</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.invoice_number || r.id.slice(0,8)}</TableCell>
                <TableCell>{tenants[r.tenant_id]?.name || "—"}</TableCell>
                <TableCell>{money(Number(r.amount))}</TableCell>
                <TableCell className="text-xs">{format(new Date(r.issued_at), "PP")}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded ${r.status==="paid"?"bg-success/15 text-success":"bg-warning/15 text-warning"}`}>{r.status}</span></TableCell>
                <TableCell>{r.status!=="paid" && <Button size="sm" onClick={()=>markPaid(r.id)}>Mark paid</Button>}</TableCell>
              </TableRow>
            ))}
            {rows.length===0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No invoices yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
