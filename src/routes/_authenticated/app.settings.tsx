import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { setTenant } = useTenantContext();
  const [t, setT] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("tenants").select("*").eq("owner_id", u.user!.id).single();
      setT(data);
    })();
  }, []);
  async function save() {
    if (!t) return;
    setSaving(true);
    const { error } = await supabase.from("tenants").update({
      name: t.name, owner_name: t.owner_name, owner_phone: t.owner_phone,
      address: t.address, city: t.city, state: t.state, pincode: t.pincode,
      gst_number: t.gst_number, business_type: t.business_type, brand_color: t.brand_color,
      currency: t.currency, timezone: t.timezone, settings: t.settings || {},
      slogan: t.slogan, opening_time: t.opening_time, closing_time: t.closing_time, logo_url: t.logo_url,
    }).eq("id", t.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    // Push the freshly-saved row into the layout's cached tenant so the
    // "complete your profile" banner and sidebar update immediately —
    // no refetch, no full page reload needed.
    setTenant(t);
    toast.success("Settings saved");
  }
  if (!t) return <div>Loading…</div>;
  const set = (k: string, v: any) => setT({ ...t, [k]: v });
  const setJ = (k: string, v: any) => setT({ ...t, settings: { ...(t.settings || {}), [k]: v } });
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card className="p-5 space-y-4">
        <div className="font-medium">Restaurant profile</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Restaurant name" v={t.name} on={v=>set("name",v)} />
          <Field label="Owner name" v={t.owner_name||""} on={v=>set("owner_name",v)} />
          <Field label="Owner phone" v={t.owner_phone||""} on={v=>set("owner_phone",v)} />
          <Field label="Business type" v={t.business_type||""} on={v=>set("business_type",v)} />
          <Field label="Slogan / tagline" v={t.slogan||""} on={v=>set("slogan",v)} />
          <Field label="Logo URL" v={t.logo_url||""} on={v=>set("logo_url",v)} />
          <Field type="time" label="Opening time" v={t.opening_time||""} on={v=>set("opening_time",v)} />
          <Field type="time" label="Closing time" v={t.closing_time||""} on={v=>set("closing_time",v)} />
        </div>
        {t.logo_url && <img src={t.logo_url} alt="logo" className="h-16 w-16 rounded object-cover border"/>}
      </Card>
      <Card className="p-5 space-y-4">
        <div className="font-medium">Address</div>
        <Field label="Address" v={t.address||""} on={v=>set("address",v)} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" v={t.city||""} on={v=>set("city",v)} />
          <Field label="State" v={t.state||""} on={v=>set("state",v)} />
          <Field label="Pincode" v={t.pincode||""} on={v=>set("pincode",v)} />
        </div>
      </Card>
      <Card className="p-5 space-y-4">
        <div className="font-medium">Invoice & tax</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GST number" v={t.gst_number||""} on={v=>set("gst_number",v)} />
          <Field label="Tax rate (%)" v={t.settings?.tax_rate||"5"} on={v=>setJ("tax_rate", v)} />
          <Field label="Currency" v={t.currency||"INR"} on={v=>set("currency",v)} />
          <Field label="Timezone" v={t.timezone||"Asia/Kolkata"} on={v=>set("timezone",v)} />
        </div>
      </Card>
      <Card className="p-5 space-y-4">
        <div className="font-medium">Branding, hours, printers, KDS, Twilio, UPI</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand color" v={t.brand_color||"#0ea5e9"} on={v=>set("brand_color",v)} />
          <Field label="Business hours" v={t.settings?.hours||"11:00 - 23:00"} on={v=>setJ("hours",v)} />
          <Field label="Kitchen printer IP" v={t.settings?.printer_ip||""} on={v=>setJ("printer_ip",v)} />
          <Field label="KDS token" v={t.settings?.kds_token||""} on={v=>setJ("kds_token",v)} />
          <Field label="Twilio Account SID" v={t.settings?.twilio_sid||""} on={v=>setJ("twilio_sid",v)} />
          <Field label="Twilio number" v={t.settings?.twilio_number||""} on={v=>setJ("twilio_number",v)} />
          <Field label="UPI VPA" v={t.settings?.upi_vpa||""} on={v=>setJ("upi_vpa",v)} />
        </div>
      </Card>
      <Button onClick={save} disabled={saving}>{saving?"Saving…":"Save changes"}</Button>

      <SectionPasswordCard tenantId={t.id} />
    </div>
  );
}

const PIN_RE = /^\d{4}$/;

/** Masked input that accepts digits only, max 4. */
function PinInput({ id, value, onChange, autoComplete }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string;
}) {
  return (
    <Input
      id={id}
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={4}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      className="text-center text-lg tracking-[0.5em]"
    />
  );
}

/**
 * 4-digit PIN for the locked pages (marked with a lock in the sidebar).
 * Separate from the login password and saved on its own — not by "Save changes".
 */
function SectionPasswordCard({ tenantId }: { tenantId: string }) {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("has_section_password", { p_tenant: tenantId });
      if (cancelled) return;
      if (error) { toast.error(error.message); return; }
      setHasPassword(!!data);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (hasPassword && current && !PIN_RE.test(current)) return toast.error("Current PIN must be 4 digits");
    if (!PIN_RE.test(next)) return toast.error("PIN must be exactly 4 digits");
    if (next !== confirm) return toast.error("New PINs don't match");

    setSaving(true);
    const { data, error } = await supabase.rpc("set_section_password", {
      p_tenant: tenantId,
      p_current: current,
      p_new: next,
    });
    setSaving(false);

    if (error) return toast.error(error.message);
    const res = data as unknown as { ok: boolean; error?: string };
    if (!res.ok) return toast.error(res.error ?? "Couldn't update the section PIN");

    toast.success(hasPassword ? "Section PIN changed" : "Section PIN set");
    setCurrent(""); setNext(""); setConfirm("");
    setHasPassword(true);
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <div className="font-medium">Section lock PIN</div>
        <p className="mt-1 text-sm text-muted-foreground">
          A 4-digit PIN that unlocks the pages marked with a lock in the sidebar. It's separate
          from your login password, so staff using a signed-in device can't open them.
        </p>
      </div>

      {hasPassword === null ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          {hasPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="sp-current">Current PIN</Label>
              <PinInput id="sp-current" value={current} onChange={setCurrent} autoComplete="off" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sp-new">New PIN</Label>
              <PinInput id="sp-new" value={next} onChange={setNext} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-confirm">Confirm new PIN</Label>
              <PinInput id="sp-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </div>
          </div>
          <Button type="submit" variant="outline" disabled={saving || next.length !== 4 || confirm.length !== 4}>
            {saving ? "Saving…" : hasPassword ? "Change PIN" : "Set PIN"}
          </Button>
        </form>
      )}
    </Card>
  );
}

function Field({ label, v, on, type = "text" }: { label: string; v: any; on: (v: string)=>void; type?: string }) {
  return <div><Label>{label}</Label><Input type={type} value={v} onChange={e=>on(e.target.value)}/></div>;
}