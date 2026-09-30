import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
          <div><Label>Owner phone</Label><Input type="tel" inputMode="numeric" maxLength={10} value={t.owner_phone||""} onChange={e=>set("owner_phone",e.target.value.replace(/\D/g,"").slice(0,10))}/></div>
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
      <KitchenAccountCard tenantId={t.id} />
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

type KitchenAccount = { login_email: string; is_active: boolean };

/**
 * One dedicated Kitchen User login per hotel — sign-in is at /kitchen/login,
 * scoped to /kitchen only (see src/routes/_authenticated/kitchen.tsx). All
 * writes (create / rotate password / enable-disable) go through the
 * server-side /api/kitchen-account route: it uses the Supabase admin API to
 * create and manage that login without ever touching the owner's own
 * session in this tab.
 */
function KitchenAccountCard({ tenantId }: { tenantId: string }) {
  const [account, setAccount] = useState<KitchenAccount | null | undefined>(undefined);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    // kitchen_accounts predates the generated Database types — see the
    // comment in src/routes/api/kitchen-account.ts for why it's queried
    // untyped here rather than through the generated `supabase` client.
    const { data } = await (supabase as unknown as SupabaseClient)
      .from("kitchen_accounts")
      .select("login_email,is_active")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    setAccount((data as KitchenAccount | null) ?? null);
  }
  useEffect(() => {
    load();
  }, [tenantId]);

  async function call(body: Record<string, unknown>) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      toast.error("Session expired. Please sign in again.");
      return null;
    }
    const res = await fetch("/api/kitchen-account", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error || "Something went wrong");
      return null;
    }
    return json;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim()) return toast.error("Enter a login name");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    const res = await call({ action: "create", login, password });
    setBusy(false);
    if (!res) return;
    toast.success("Kitchen account created");
    setLogin("");
    setPassword("");
    load();
  }

  async function rotate(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    const res = await call({ action: "update_password", password: newPassword });
    setBusy(false);
    if (!res) return;
    toast.success("Kitchen account password updated");
    setNewPassword("");
  }

  async function toggleActive(next: boolean) {
    setBusy(true);
    const res = await call({ action: "set_active", is_active: next });
    setBusy(false);
    if (!res) return;
    toast.success(next ? "Kitchen account enabled" : "Kitchen account disabled");
    load();
  }

  async function copyLogin() {
    if (!account) return;
    await navigator.clipboard.writeText(account.login_email);
    toast.success("Login ID copied");
  }

  async function deleteAccount() {
    setBusy(true);
    const res = await call({ action: "delete" });
    setBusy(false);
    if (!res) return;
    toast.success("Kitchen account deleted");
    // Frees the tenant back up to create a new kitchen account — same "one
    // at a time" rule the create check and the DB's unique index enforce.
    load();
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <div className="font-medium">Kitchen account</div>
        <p className="mt-1 text-sm text-muted-foreground">
          One dedicated login for kitchen staff. It only opens the Kitchen Display — nothing else in
          your dashboard, settings, staff or billing.
        </p>
      </div>

      {account === undefined ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : account ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Login ID</div>
              <div className="font-mono text-sm truncate">{account.login_email}</div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Button type="button" size="sm" variant="outline" onClick={copyLogin}>
                Copy
              </Button>
              <Switch
                checked={account.is_active}
                onCheckedChange={toggleActive}
                disabled={busy}
                aria-label="Kitchen account enabled"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {account.is_active
              ? "Active — share this Login ID and the account password with your kitchen staff."
              : "Disabled — this login can't sign in until you turn it back on."}
          </p>
          <form onSubmit={rotate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="kitchen-new-password">New password</Label>
              <PasswordInput
                id="kitchen-new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" variant="outline" disabled={busy || newPassword.length < 6}>
              Update password
            </Button>
          </form>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" size="sm" disabled={busy}>
                Delete kitchen account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this kitchen account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the login <b>{account.login_email}</b> — kitchen staff
                  using it will be signed out immediately and won't be able to sign back in. You can
                  create a new kitchen account afterwards.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAccount}>Yes, delete it</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <form onSubmit={create} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="kitchen-login">Login name</Label>
              <Input
                id="kitchen-login"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="e.g. kitchen"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kitchen-password">Password</Label>
              <PasswordInput
                id="kitchen-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create kitchen account"}
          </Button>
        </form>
      )}
    </Card>
  );
}

function Field({ label, v, on, type = "text" }: { label: string; v: any; on: (v: string)=>void; type?: string }) {
  return <div><Label>{label}</Label><Input type={type} value={v} onChange={e=>on(e.target.value)}/></div>;
}