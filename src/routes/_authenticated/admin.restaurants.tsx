import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/restaurants")({ component: Restaurants });

function Restaurants() {
  const [rows, setRows] = useState<any[]>([]);
  const [subs, setSubs] = useState<Record<string, any>>({});
  const [plans, setPlans] = useState<Record<string, any>>({});
  const [q, setQ] = useState("");
  const [notifTarget, setNotifTarget] = useState<any | null>(null);
  const [notifTitle, setNotifTitle] = useState(""); const [notifBody, setNotifBody] = useState("");

  async function load() {
    const [{ data: t }, { data: s }, { data: p }] = await Promise.all([
      supabase.from("tenants").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*"),
      supabase.from("subscription_plans").select("*"),
    ]);
    setRows(t || []);
    const sMap: Record<string, any> = {}; (s || []).forEach((x: any) => { sMap[x.tenant_id] = x; }); setSubs(sMap);
    const pMap: Record<string, any> = {}; (p || []).forEach((x: any) => { pMap[x.id] = x; }); setPlans(pMap);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(t: any, status: "approved"|"pending"|"rejected"|"suspended") {
    const { error } = await supabase.from("tenants").update({ status }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`); load();
  }

  async function sendNotif() {
    if (!notifTarget) return;
    const { error } = await supabase.from("notifications").insert({
      recipient_id: notifTarget.owner_id, tenant_id: notifTarget.id,
      title: notifTitle, body: notifBody, kind: "admin_message",
    });
    if (error) return toast.error(error.message);
    toast.success("Notification sent");
    setNotifTarget(null); setNotifTitle(""); setNotifBody("");
  }

  const filtered = rows.filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.owner_email?.toLowerCase().includes(q.toLowerCase()) || r.owner_phone?.includes(q));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Restaurants</h1><Input placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)} className="max-w-xs"/></div>
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Owner</TableHead><TableHead>Phone</TableHead><TableHead>City</TableHead>
            <TableHead>Plan</TableHead><TableHead>Expires</TableHead>
            <TableHead>Registered</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map(r => {
              const sub = subs[r.id];
              const plan = sub ? plans[sub.plan_id] : null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><div className="text-sm">{r.owner_name}</div><div className="text-xs text-muted-foreground">{r.owner_email}</div></TableCell>
                  <TableCell className="text-sm">{r.owner_phone || "—"}</TableCell>
                  <TableCell>{r.city || "—"}</TableCell>
                  <TableCell>{plan ? <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{plan.name}</span> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs">{sub ? format(new Date(sub.current_period_end), "PP") : "—"}</TableCell>
                  <TableCell className="text-xs">{format(new Date(r.created_at), "PP")}</TableCell>
                  <TableCell><span className={`text-xs px-2 py-0.5 rounded ${r.status==="approved"?"bg-success/15 text-success":r.status==="pending"?"bg-warning/15 text-warning":r.status==="suspended"?"bg-destructive/15 text-destructive":"bg-muted"}`}>{r.status}</span></TableCell>
                  <TableCell><div className="flex gap-1 flex-wrap">
                    {r.status==="pending" && <><Button size="sm" onClick={()=>setStatus(r,"approved")}>Approve</Button><Button size="sm" variant="outline" onClick={()=>setStatus(r,"rejected")}>Reject</Button></>}
                    {r.status==="approved" && <Button size="sm" variant="outline" onClick={()=>setStatus(r,"suspended")}>Suspend</Button>}
                    {(r.status==="suspended"||r.status==="rejected") && <Button size="sm" onClick={()=>setStatus(r,"approved")}>Activate</Button>}
                    <Button size="sm" variant="ghost" onClick={()=>setNotifTarget(r)}>Notify</Button>
                  </div></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <Dialog open={!!notifTarget} onOpenChange={o=>!o&&setNotifTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send notification to {notifTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={notifTitle} onChange={e=>setNotifTitle(e.target.value)} /></div>
            <div><Label>Message</Label><Textarea value={notifBody} onChange={e=>setNotifBody(e.target.value)} rows={4}/></div>
            <Button onClick={sendNotif}>Send</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
