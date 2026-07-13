import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/tickets")({ component: Tickets });

function Tickets() {
  const [rows, setRows] = useState<any[]>([]);
  const [tenants, setTenants] = useState<Record<string, any>>({});
  async function load() {
    const [{ data }, { data: t }] = await Promise.all([
      supabase.from("support_tickets").select("*").order("created_at", { ascending: false }),
      supabase.from("tenants").select("id,name"),
    ]);
    setRows(data || []);
    const m: Record<string,any> = {}; (t||[]).forEach(x=>{m[x.id]=x}); setTenants(m);
  }
  useEffect(()=>{load();},[]);
  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("support_tickets").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Support tickets</h1>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Restaurant</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Opened</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell><div className="font-medium text-sm">{r.subject}</div><div className="text-xs text-muted-foreground line-clamp-1">{r.body}</div></TableCell>
                <TableCell>{tenants[r.tenant_id]?.name || "—"}</TableCell>
                <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted capitalize">{r.priority}</span></TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded ${r.status==="open"?"bg-warning/15 text-warning":r.status==="resolved"?"bg-success/15 text-success":"bg-muted"}`}>{r.status}</span></TableCell>
                <TableCell className="text-xs">{format(new Date(r.created_at), "PP")}</TableCell>
                <TableCell><div className="flex gap-1">
                  {r.status!=="in_progress" && <Button size="sm" variant="outline" onClick={()=>setStatus(r.id,"in_progress")}>In progress</Button>}
                  {r.status!=="resolved" && <Button size="sm" onClick={()=>setStatus(r.id,"resolved")}>Resolve</Button>}
                </div></TableCell>
              </TableRow>
            ))}
            {rows.length===0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No tickets.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
