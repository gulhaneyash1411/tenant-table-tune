import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCard } from "@/components/qr-card";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/tables")({ component: TablesPage });

function TablesPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [label, setLabel] = useState(""); const [seats, setSeats] = useState(4);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const { data: t } = await supabase.from("tenants").select("*").eq("owner_id", u.user!.id).single();
    setTenant(t);
    const { data: rows } = await supabase.from("restaurant_tables").select("*").order("label");
    setTables(rows || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!label || !tenant) return;
    const { error } = await supabase.from("restaurant_tables").insert({ tenant_id: tenant.id, label, seats });
    if (error) return toast.error(error.message);
    setLabel(""); load();
  }
  async function removeTable(id: string) {
    const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Table QR deleted");
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tables & QR</h1>
      {tenant && (
        <div className="grid gap-4 md:grid-cols-2">
          <QRCard url={`${origin}/review?t=${tenant.id}`} title="Feedback QR" subtitle="Universal review code — one per counter."/>
          <QRCard url={`${origin}/takeaway/${tenant.id}`} title="Takeaway QR" subtitle="Walk-in guests scan to place a parcel order."/>
        </div>
      )}
      <Card className="p-4 flex gap-2 items-end">
        <div><Label>Table label</Label><Input value={label} onChange={e=>setLabel(e.target.value)} placeholder="T13"/></div>
        <div><Label>Seats</Label><Input type="number" value={seats} onChange={e=>setSeats(Number(e.target.value))} className="w-24"/></div>
        <Button onClick={add}><Plus className="h-4 w-4 mr-1"/>Add table</Button>
      </Card>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {tables.map(t => (
          <QRCard key={t.id} url={`${origin}/t/${t.id}`} title={t.label} subtitle={`${t.seats} seats`} onDelete={()=>removeTable(t.id)} />
        ))}
      </div>
    </div>
  );
}