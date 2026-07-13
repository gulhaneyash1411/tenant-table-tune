import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/audit")({ component: Audit });

function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200).then(({ data }) => setRows(data || [])); }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit logs</h1>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Actor</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{format(new Date(r.created_at), "PPp")}</TableCell>
                <TableCell className="font-mono text-xs">{r.action}</TableCell>
                <TableCell className="text-xs">{r.entity} {r.entity_id ? `#${r.entity_id.slice(0,8)}` : ""}</TableCell>
                <TableCell className="text-xs">{r.actor_id ? r.actor_id.slice(0,8) : "system"}</TableCell>
                <TableCell className="text-xs">{r.ip || "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length===0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No audit events recorded.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
