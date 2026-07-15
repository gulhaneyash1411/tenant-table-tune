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
import { UsersRound, Wallet, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/staff")({ component: StaffPage });

function StaffPage() {
  const [tenantId, setTenantId] = useState<string>("");
  const [staff, setStaff] = useState<any[]>([]);
  const [pays, setPays] = useState<any[]>([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [openPay, setOpenPay] = useState<any>(null);
  const [f, setF] = useState<any>({ name: "", role: "waiter", phone: "", monthly_salary: 0, join_date: new Date().toISOString().slice(0,10) });
  const [payForm, setPayForm] = useState<any>({ amount: 0, paid_on: new Date().toISOString().slice(0,10), notes: "" });

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const { data: t } = await supabase.from("tenants").select("id").eq("owner_id", u.user!.id).maybeSingle();
    if (!t) return;
    setTenantId(t.id);
    const [{ data: s }, { data: p }] = await Promise.all([
      (supabase as any).from("staff_members").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("salary_payments").select("*").order("paid_on", { ascending: false }).limit(50),
    ]);
    setStaff(s || []); setPays(p || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!f.name.trim()) return toast.error("Name required");
    const { error } = await (supabase as any).from("staff_members").insert({ ...f, tenant_id: tenantId, monthly_salary: Number(f.monthly_salary) || 0 });
    if (error) return toast.error(error.message);
    toast.success("Staff added"); setOpenAdd(false);
    setF({ name: "", role: "waiter", phone: "", monthly_salary: 0, join_date: new Date().toISOString().slice(0,10) });
    load();
  }
  async function remove(id: string) {
    const { error } = await (supabase as any).from("staff_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }
  async function paySalary() {
    const { error } = await (supabase as any).from("salary_payments").insert({
      tenant_id: tenantId, staff_id: openPay.id, amount: Number(payForm.amount)||0, paid_on: payForm.paid_on, notes: payForm.notes,
    });
    if (error) return toast.error(error.message);
    toast.success("Salary paid"); setOpenPay(null); load();
  }

  const totalMonthly = staff.filter(s=>s.status==="active").reduce((a,b)=>a+Number(b.monthly_salary||0),0);
  const totalPaidThisMonth = pays.filter(p => new Date(p.paid_on).getMonth() === new Date().getMonth() && new Date(p.paid_on).getFullYear() === new Date().getFullYear()).reduce((a,b)=>a+Number(b.amount||0),0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><UsersRound className="h-6 w-6"/><h1 className="text-2xl font-semibold">Staff</h1></div>
        <Button onClick={() => setOpenAdd(true)}><Plus className="h-4 w-4 mr-1"/>Add staff</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Active staff</div><div className="text-2xl font-semibold">{staff.filter(s=>s.status==="active").length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Monthly payroll</div><div className="text-2xl font-semibold">{money(totalMonthly)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Paid this month</div><div className="text-2xl font-semibold">{money(totalPaidThisMonth)}</div></Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Phone</th><th className="p-3">Salary</th><th className="p-3">Joined</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id} className="border-t">
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 capitalize">{s.role}</td>
                <td className="p-3">{s.phone || "—"}</td>
                <td className="p-3">{money(Number(s.monthly_salary||0))}</td>
                <td className="p-3">{s.join_date}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="outline" onClick={()=>{ setOpenPay(s); setPayForm({ amount: s.monthly_salary || 0, paid_on: new Date().toISOString().slice(0,10), notes: "" }); }}><Wallet className="h-3 w-3 mr-1"/>Pay</Button>
                  <Button size="sm" variant="ghost" className="ml-1 text-destructive" onClick={()=>remove(s.id)}><Trash2 className="h-3 w-3"/></Button>
                </td>
              </tr>
            ))}
            {staff.length===0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No staff yet</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <div className="font-medium mb-3">Recent salary payments</div>
        <div className="divide-y">
          {pays.slice(0,10).map(p => {
            const s = staff.find(x => x.id === p.staff_id);
            return <div key={p.id} className="py-2 flex justify-between text-sm"><span>{s?.name || "—"} <span className="text-muted-foreground">· {format(new Date(p.paid_on), "PP")}</span></span><span className="font-medium">{money(Number(p.amount||0))}</span></div>;
          })}
          {pays.length===0 && <div className="text-sm text-muted-foreground py-3">No payments recorded.</div>}
        </div>
      </Card>

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent><DialogHeader><DialogTitle>Add staff</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Role</Label><Input value={f.role} onChange={e=>setF({...f,role:e.target.value})} placeholder="waiter, chef…" /></div>
              <div><Label>Phone</Label><Input value={f.phone} onChange={e=>setF({...f,phone:e.target.value})} /></div>
              <div><Label>Monthly salary</Label><Input type="number" value={f.monthly_salary} onChange={e=>setF({...f,monthly_salary:e.target.value})} /></div>
              <div><Label>Join date</Label><Input type="date" value={f.join_date} onChange={e=>setF({...f,join_date:e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={add}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!openPay} onOpenChange={(o)=>!o && setOpenPay(null)}>
        <DialogContent><DialogHeader><DialogTitle>Pay {openPay?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount</Label><Input type="number" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} /></div>
            <div><Label>Paid on</Label><Input type="date" value={payForm.paid_on} onChange={e=>setPayForm({...payForm,paid_on:e.target.value})} /></div>
            <div><Label>Notes</Label><Input value={payForm.notes} onChange={e=>setPayForm({...payForm,notes:e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={paySalary}>Record payment</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}