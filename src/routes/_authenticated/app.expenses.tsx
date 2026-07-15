import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { Wallet, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/expenses")({ component: ExpensesPage });

function ExpensesPage() {
  const [tenantId, setTenantId] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ title: "", category: "supplies", amount: 0, incurred_on: new Date().toISOString().slice(0,10), notes: "" });

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const { data: t } = await supabase.from("tenants").select("id").eq("owner_id", u.user!.id).maybeSingle();
    if (!t) return;
    setTenantId(t.id);
    const { data } = await (supabase as any).from("expenses").select("*").order("incurred_on", { ascending: false }).limit(200);
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!f.title.trim()) return toast.error("Title required");
    const { error } = await (supabase as any).from("expenses").insert({ ...f, tenant_id: tenantId, amount: Number(f.amount)||0 });
    if (error) return toast.error(error.message);
    toast.success("Expense added"); setOpen(false);
    setF({ title: "", category: "supplies", amount: 0, incurred_on: new Date().toISOString().slice(0,10), notes: "" });
    load();
  }
  async function remove(id: string) { await (supabase as any).from("expenses").delete().eq("id", id); load(); }

  const thisMonth = rows.filter(r => new Date(r.incurred_on).getMonth() === new Date().getMonth() && new Date(r.incurred_on).getFullYear() === new Date().getFullYear());
  const monthTotal = thisMonth.reduce((a,b)=>a+Number(b.amount||0),0);
  const byCat = thisMonth.reduce<Record<string,number>>((acc, r) => { acc[r.category||"other"] = (acc[r.category||"other"]||0) + Number(r.amount||0); return acc; }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Wallet className="h-6 w-6"/><h1 className="text-2xl font-semibold">Expenses</h1></div>
        <Button onClick={()=>setOpen(true)}><Plus className="h-4 w-4 mr-1"/>Add expense</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">This month total</div><div className="text-2xl font-semibold">{money(monthTotal)}</div></Card>
        {Object.entries(byCat).slice(0,3).map(([c,v]) => <Card key={c} className="p-4"><div className="text-xs text-muted-foreground capitalize">{c}</div><div className="text-2xl font-semibold">{money(v)}</div></Card>)}
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr><th className="p-3">Date</th><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3 text-right">Amount</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{format(new Date(r.incurred_on), "PP")}</td>
                <td className="p-3 font-medium">{r.title}{r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}</td>
                <td className="p-3 capitalize">{r.category}</td>
                <td className="p-3 text-right font-medium">{money(Number(r.amount||0))}</td>
                <td className="p-3 text-right"><Button size="sm" variant="ghost" className="text-destructive" onClick={()=>remove(r.id)}><Trash2 className="h-3 w-3"/></Button></td>
              </tr>
            ))}
            {rows.length===0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No expenses yet</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={f.title} onChange={e=>setF({...f,title:e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Input value={f.category} onChange={e=>setF({...f,category:e.target.value})} placeholder="supplies, rent, utilities" /></div>
              <div><Label>Amount</Label><Input type="number" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})} /></div>
              <div><Label>Date</Label><Input type="date" value={f.incurred_on} onChange={e=>setF({...f,incurred_on:e.target.value})} /></div>
            </div>
            <div><Label>Notes</Label><Input value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={add}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}