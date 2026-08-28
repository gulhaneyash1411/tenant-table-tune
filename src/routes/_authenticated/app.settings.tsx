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
    </div>
  );
}
function Field({ label, v, on, type = "text" }: { label: string; v: any; on: (v: string)=>void; type?: string }) {
  return <div><Label>{label}</Label><Input type={type} value={v} onChange={e=>on(e.target.value)}/></div>;
}