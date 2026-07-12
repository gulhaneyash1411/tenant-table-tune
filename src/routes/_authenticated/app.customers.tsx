import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/app/customers")({ component: Customers });

function Customers() {
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  useEffect(() => { supabase.from("customers").select("*").order("last_visit", { ascending: false }).then(({ data }) => setRows(data || [])); }, []);
  async function open(c: any) {
    setSelected(c);
    const { data } = await supabase.from("orders").select("*").eq("customer_phone", c.phone).order("created_at", { ascending: false });
    setOrders(data || []);
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Customers</h1>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead><TableHead>Visits</TableHead><TableHead>Total spend</TableHead><TableHead>Last visit</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{c.email || "—"}</TableCell>
                <TableCell>{c.visits}</TableCell>
                <TableCell>{money(Number(c.total_spend))}</TableCell>
                <TableCell>{c.last_visit ? format(new Date(c.last_visit), "PP") : "—"}</TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={()=>open(c)}>Orders</Button></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No customers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{selected?.name} — Order history</DialogTitle></DialogHeader>
          <div className="divide-y max-h-[60vh] overflow-y-auto">
            {orders.map(o => (
              <div key={o.id} className="py-3 flex justify-between text-sm">
                <div>#{o.order_number} · {format(new Date(o.created_at), "PPp")} · {o.status}</div>
                <div>{money(Number(o.total))}</div>
              </div>
            ))}
            {orders.length === 0 && <div className="py-6 text-center text-muted-foreground text-sm">No orders</div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}