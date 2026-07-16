import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { Wallet, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/expenses")({ component: ExpensesPage });

const CATEGORIES = [
  { value: "supplies", label: "Supplies" },
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "salaries", label: "Salaries" },
  { value: "marketing", label: "Marketing" },
  { value: "equipment", label: "Equipment" },
  { value: "maintenance", label: "Maintenance" },
  { value: "food", label: "Food & ingredients" },
  { value: "packaging", label: "Packaging" },
  { value: "delivery", label: "Delivery" },
  { value: "taxes", label: "Taxes" },
  { value: "other", label: "Other" },
];

function todayISO() { return new Date().toISOString().slice(0,10); }
function firstOfMonthISO() {
  const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10);
}

function ExpensesPage() {
  const [tenantId, setTenantId] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ title: "", category: "supplies", amount: "", incurred_on: todayISO(), notes: "" });
  const [fromDate, setFromDate] = useState(firstOfMonthISO());
  const [toDate, setToDate] = useState(todayISO());
  const [catFilter, setCatFilter] = useState<string>("all");

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
    const amt = Number(f.amount);
    if (!amt || amt <= 0) return toast.error("Amount must be greater than 0");
    const { error } = await (supabase as any).from("expenses").insert({ ...f, tenant_id: tenantId, amount: amt });
    if (error) return toast.error(error.message);
    toast.success("Expense added"); setOpen(false);
    setF({ title: "", category: "supplies", amount: "", incurred_on: todayISO(), notes: "" });
    load();
  }
  async function remove(id: string) { await (supabase as any).from("expenses").delete().eq("id", id); load(); }

  const filtered = useMemo(() => rows.filter(r => {
    const d = r.incurred_on;
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    if (catFilter !== "all" && (r.category || "other") !== catFilter) return false;
    return true;
  }), [rows, fromDate, toDate, catFilter]);
  const rangeTotal = filtered.reduce((a,b)=>a+Number(b.amount||0),0);
  const byCat = filtered.reduce<Record<string,number>>((acc, r) => { acc[r.category||"other"] = (acc[r.category||"other"]||0) + Number(r.amount||0); return acc; }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Wallet className="h-6 w-6"/><h1 className="text-2xl font-semibold">Expenses</h1></div>
        <Button onClick={()=>setOpen(true)}><Plus className="h-4 w-4 mr-1"/>Add expense</Button>
      </div>
      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">From</Label><Input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="w-[160px]"/></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="w-[160px]"/></div>
        <div className="min-w-[180px]">
          <Label className="text-xs">Category</Label>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="sm" onClick={()=>{ setFromDate(firstOfMonthISO()); setToDate(todayISO()); setCatFilter("all"); }}>Reset</Button>
      </Card>
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Range total</div><div className="text-2xl font-semibold">{money(rangeTotal)}</div></Card>
        {Object.entries(byCat).slice(0,3).map(([c,v]) => <Card key={c} className="p-4"><div className="text-xs text-muted-foreground capitalize">{c}</div><div className="text-2xl font-semibold">{money(v)}</div></Card>)}
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr><th className="p-3">Date</th><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3 text-right">Amount</th><th className="p-3"></th></tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{format(new Date(r.incurred_on), "PP")}</td>
                <td className="p-3 font-medium">{r.title}{r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}</td>
                <td className="p-3 capitalize">{r.category}</td>
                <td className="p-3 text-right font-medium">{money(Number(r.amount||0))}</td>
                <td className="p-3 text-right"><Button size="sm" variant="ghost" className="text-destructive" onClick={()=>remove(r.id)}><Trash2 className="h-3 w-3"/></Button></td>
              </tr>
            ))}
            {filtered.length===0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No expenses in this range</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={f.title} onChange={e=>setF({...f,title:e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={f.category} onValueChange={(v)=>setF({...f,category:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Amount</Label><Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})} /></div>
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