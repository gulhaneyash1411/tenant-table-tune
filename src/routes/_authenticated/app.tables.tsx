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
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState(4);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const { data: t } = await supabase.from("tenants").select("*").eq("owner_id", u.user!.id).single();
    setTenant(t);
    if (!t) return;
    const { data: rows } = await supabase
      .from("restaurant_tables")
      .select("*")
      .eq("tenant_id", t.id)
      .order("label");
    setTables(rows || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!label || !tenant) return;
    const { error } = await supabase
      .from("restaurant_tables")
      .insert({ tenant_id: tenant.id, label, seats });
    if (error) return toast.error(error.message);
    setLabel("");
    load();
  }

  async function removeTable(id: string) {
    const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Table QR deleted");
    load();
  }

  // Delivery config lives in tenants.settings; the QR is only useful once the
  // owner has turned delivery on, so the card says so rather than printing a
  // code that lands on a "delivery is paused" screen.
  const settings = (tenant?.settings && typeof tenant.settings === "object" ? tenant.settings : {}) as Record<string, any>;
  const deliveryEnabled = settings.delivery_enabled !== false;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tables &amp; QR</h1>

      {tenant && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Counter &amp; outreach codes</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <QRCard
              url={`${origin}/review?t=${tenant.id}`}
              title="Feedback QR"
              subtitle="Universal review code — one per counter."
            />
            <QRCard
              url={`${origin}/takeaway/${tenant.id}`}
              title="Takeaway QR"
              subtitle="Walk-in guests scan to place a parcel order."
            />
            <QRCard
              url={`${origin}/delivery/${tenant.id}`}
              title="Home Delivery QR"
              subtitle={
                deliveryEnabled
                  ? "Print on flyers and packaging — guests order from home."
                  : "Turn delivery on in Settings before printing this code."
              }
            />
          </div>
        </section>
      )}

      <Card className="p-4 flex gap-2 items-end">
        <div>
          <Label htmlFor="tbl-label">Table label</Label>
          <Input id="tbl-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="T13" />
        </div>
        <div>
          <Label htmlFor="tbl-seats">Seats</Label>
          <Input
            id="tbl-seats"
            type="number"
            value={seats}
            onChange={e => setSeats(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Add table</Button>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {tables.map(t => (
          <QRCard
            key={t.id}
            url={`${origin}/t/${t.id}`}
            title={t.label}
            subtitle={`${t.seats} seats`}
            onDelete={() => removeTable(t.id)}
          />
        ))}
      </div>
    </div>
  );
}