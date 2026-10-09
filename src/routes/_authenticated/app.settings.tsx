import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentOutlet } from "@/lib/outlet-context";
import { useTenantContext } from "@/hooks/use-session";
import { planAllows } from "@/config/plan-features";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const { setTenant, isOutletManager, plan } = useTenantContext();
  // Outlet managers can look at everything here but change nothing — the owner sets
  // the profile, address, PIN and kitchen login (the database enforces it too).
  const readOnly = !!isOutletManager;
  const [t, setT] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const data = await fetchCurrentOutlet(u.user!.id);
      setT(data);
    })();
  }, []);
  async function save() {
    if (!t || readOnly) return;
    const requiredFields: [string, unknown][] = [
      ["Restaurant name", t.name],
      ["Owner name", t.owner_name],
      ["Owner phone", t.owner_phone],
      ["Slogan / tagline", t.slogan],
      ["Logo URL", t.logo_url],
      ["Opening time", t.opening_time || "09:00"],
      ["Closing time", t.closing_time],
      ["Address", t.address],
      ["City", t.city],
      ["State", t.state],
      ["Pincode", t.pincode],
    ];
    const missing = requiredFields.filter(([, v]) => !String(v ?? "").trim()).map(([label]) => label);
    if (missing.length) return toast.error(`Please fill: ${missing.join(", ")}`);
    setSaving(true);
    const { error } = await supabase.from("tenants").update({
      name: t.name, owner_name: t.owner_name, owner_phone: t.owner_phone,
      address: t.address, city: t.city, state: t.state, pincode: t.pincode,
      gst_number: t.gst_number, business_type: t.business_type, brand_color: t.brand_color,
      currency: t.currency, timezone: "Asia/Kolkata", settings: t.settings || {},
      slogan: t.slogan, opening_time: t.opening_time || "09:00", closing_time: t.closing_time, logo_url: t.logo_url,
      google_review_url: t.google_review_url || null,
    } as any).eq("id", t.id);
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
  const settingsTabs = [
    { value: "restaurant", label: "Restaurant", feature: undefined },
    { value: "pin", label: "Lock PIN", feature: "settings_lock_pin" },
    { value: "kitchen", label: "Kitchen account", feature: "settings_kitchen_account" },
  ].filter((tab) => (!readOnly || tab.value === "kitchen") && planAllows(plan?.features, tab.feature));
  return (
    <div className="space-y-6 max-w-3xl">
      {readOnly && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          View only. The owner manages this outlet's profile, address, PIN and kitchen login.
        </div>
      )}

      {/* Tabs the owner's plan includes; a manager only ever sees the kitchen account tab. */}
      <Tabs defaultValue={settingsTabs[0]?.value ?? "restaurant"} className="space-y-6">
        {/* Same underline bar as Tables & QR — these switch the whole page, so
            it reads as navigation. shadcn's TabsList brings its own background,
            padding and rounding and TabsTrigger its own active pill, so all of
            that is nulled out here rather than added to. overflow-x-auto keeps
            the three labels on one row at 360px instead of wrapping. */}
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0 overflow-x-auto">
          {settingsTabs.map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="relative rounded-none border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:text-foreground"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="restaurant" className="space-y-6">
          {!readOnly && planAllows(plan?.features, "settings_outlets") && (
            <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">Outlets</div>
                <div className="text-xs text-muted-foreground">Run more than one location from this same account.</div>
              </div>
              <Link to="/app/franchise"><Button variant="outline" size="sm">Manage / add outlet</Button></Link>
            </Card>
          )}
          {/* A disabled fieldset disables every input inside it — nothing is editable for a manager. */}
          <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-6 border-0 p-0">
          <Card className="p-5 space-y-4">
            <div className="font-medium">Restaurant profile</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Restaurant name" v={t.name} on={v=>set("name",v)} required />
              <Field label="Owner name" v={t.owner_name||""} on={v=>set("owner_name",v)} required />
              <div>
                <Label>Owner phone<span className="text-destructive"> *</span></Label>
                <Input type="tel" inputMode="numeric" maxLength={10} required value={t.owner_phone||""} onChange={e=>set("owner_phone",e.target.value.replace(/\D/g,"").slice(0,10))}/>
              </div>
              <Field label="Slogan / tagline" v={t.slogan||""} on={v=>set("slogan",v)} required />
              <Field label="Logo URL" v={t.logo_url||""} on={v=>set("logo_url",v)} required />
              <Field label="Google review link" v={t.google_review_url||""} on={v=>set("google_review_url",v)} />
              <div className="col-span-2">
                <Label>Business hours<span className="text-destructive"> *</span></Label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    required
                    aria-label="Opening time"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={t.opening_time||"09:00"}
                    onChange={e=>set("opening_time",e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <input
                    type="time"
                    required
                    aria-label="Closing time"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={t.closing_time||""}
                    onChange={e=>set("closing_time",e.target.value)}
                  />
                </div>
              </div>
            </div>
            {t.logo_url && <img src={t.logo_url} alt="logo" className="h-16 w-16 rounded object-cover border"/>}
          </Card>
          <Card className="p-5 space-y-4">
            <div className="font-medium">Address</div>
            <Field label="Address" v={t.address||""} on={v=>set("address",v)} required />
            <div className="grid grid-cols-3 gap-3">
              <Field label="City" v={t.city||""} on={v=>set("city",v)} required />
              <Field label="State" v={t.state||""} on={v=>set("state",v)} required />
              <Field label="Pincode" v={t.pincode||""} on={v=>set("pincode",v)} required />
            </div>
          </Card>
          <Card className="p-5 space-y-4">
            <div className="font-medium">Invoice & tax</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="GST number" v={t.gst_number||""} on={v=>set("gst_number",v)} />
              <Field label="Tax rate (%)" v={t.settings?.tax_rate ?? "0"} on={v=>setJ("tax_rate", v.replace(/^0+(?=\d)/, ""))} />
              <Field label="Currency" v={t.currency||"INR"} on={v=>set("currency",v)} />
              <div>
                <Label>Timezone</Label>
                <Input value="Asia/Kolkata" readOnly disabled />
              </div>
            </div>
          </Card>
          <Card className="p-5 space-y-4">
            <div className="font-medium">Printer</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kitchen printer IP" v={t.settings?.printer_ip||""} on={v=>setJ("printer_ip",v)} />
            </div>
          </Card>
          </fieldset>
          {!readOnly && <Button onClick={save} disabled={saving}>{saving?"Saving…":"Save changes"}</Button>}
        </TabsContent>

        <TabsContent value="pin">
          <SectionPasswordCard tenantId={t.id} readOnly={readOnly} />
        </TabsContent>

        <TabsContent value="kitchen">
          <KitchenAccountCard tenantId={t.id} readOnly={readOnly} />
        </TabsContent>
      </Tabs>
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
function SectionPasswordCard({ tenantId, readOnly = false }: { tenantId: string; readOnly?: boolean }) {
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
      ) : readOnly ? (
        <p className="text-sm">
          {hasPassword
            ? "A 4-digit PIN is set for this outlet. Ask the owner for it to open the locked pages."
            : "No PIN has been set yet. The owner creates the 4-digit PIN — ask them to set it here."}
        </p>
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
function KitchenAccountCard({ tenantId, readOnly = false }: { tenantId: string; readOnly?: boolean }) {
  const [account, setAccount] = useState<KitchenAccount | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    // Use the server-side API to load the kitchen account (bypasses RLS restrictions)
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setAccount(null);
      return;
    }
    const res = await fetch("/api/kitchen-account", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-outlet-id": tenantId },
      body: JSON.stringify({ action: "get" }),
    });
    const json = await res.json().catch(() => ({}));
    setAccount((json.account as KitchenAccount | null) ?? null);
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
      // x-outlet-id: the kitchen account belongs to the outlet being edited.
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-outlet-id": tenantId },
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
    if (!email.trim()) return toast.error("Enter an email for the kitchen login");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Enter a valid email");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    const res = await call({ action: "create", email: email.trim().toLowerCase(), password });
    setBusy(false);
    // Always clear form inputs and reload, whether create succeeded or account already existed
    setEmail("");
    setPassword("");
    if (res) {
      toast.success("Kitchen account created");
    }
    // Reload to display the account (either the newly created one or the existing one)
    await load();
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
      ) : readOnly ? (
        <p className="text-sm">
          {account
            ? `A kitchen account exists for this outlet and is ${account.is_active ? "active" : "disabled"}. The owner manages its login and password.`
            : "No kitchen account has been created for this outlet yet. The owner creates it."}
        </p>
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
          {!readOnly && (
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
          )}

          {!readOnly && (
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
          )}
        </div>
      ) : (
        <form onSubmit={create} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="kitchen-email">Login email</Label>
              <Input
                id="kitchen-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. kitchen@restaurant.com"
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
                placeholder="At least 6 characters"
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

function Field({ label, v, on, type = "text", required = false }: { label: string; v: any; on: (v: string)=>void; type?: string; required?: boolean }) {
  return (
    <div>
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input type={type} value={v} required={required} onChange={e=>on(e.target.value)}/>
    </div>
  );
}