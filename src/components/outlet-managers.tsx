import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { ResetPasswordDialog } from "@/components/reset-password-dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Tenant } from "@/hooks/use-session";
import type { OutletFields } from "@/lib/outlet-context";

type Manager = {
  user_id: string;
  full_name: string | null;
  email: string;
  mobile: string | null;
  is_active: boolean;
  status: "invited" | "active" | "disabled";
  outlet_ids: string[];
};

async function call(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/outlet-users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

/** Owner-only: invite outlet managers and choose which outlets each can manage. */
export function OutletManagers({ outlets }: { outlets: Tenant[] }) {
  const activeOutlets = outlets.filter(
    (o) => ((o as Tenant & Partial<OutletFields>).outlet_status ?? "ACTIVE") === "ACTIVE",
  );
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ full_name: "", email: "", mobile: "", password: "" });
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await call({ action: "list" });
      setManagers(r.users as Manager[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load managers");
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "Outlet";
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await action();
      toast.success(ok);
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const done = await run(
      () => call({ action: "invite", ...f, outlet_ids: picked }),
      `Manager created — share the email and password with ${f.full_name || "them"} to sign in`,
    );
    if (done) { setAdding(false); setF({ full_name: "", email: "", mobile: "", password: "" }); setPicked([]); }
  }

  const [resetFor, setResetFor] = useState<Manager | null>(null);
  // One manager per outlet: which manager (if any) holds each outlet.
  const managerOf = (outletId: string) => managers.find((m) => m.outlet_ids.includes(outletId))?.user_id ?? null;
  const freeOutlets = activeOutlets.filter((o) => !managerOf(o.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Outlet managers</h2>
          <p className="text-sm text-muted-foreground">
            Create a login (email + password) for each manager and share it with them. They see and run only the outlets you assign — not billing, settings or other outlets.
          </p>
        </div>
        {!adding && (
          <Button variant="outline" onClick={() => setAdding(true)} disabled={freeOutlets.length === 0}>
            <UserPlus className="mr-1 h-4 w-4" />Add manager
          </Button>
        )}
      </div>
      {activeOutlets.length === 0 && (
        <p className="text-xs text-muted-foreground">Activate an outlet first — managers can only be assigned to active outlets.</p>
      )}
      {activeOutlets.length > 0 && loaded && freeOutlets.length === 0 && (
        <p className="text-xs text-muted-foreground">Every active outlet already has a manager (one manager per outlet).</p>
      )}

      {adding && (
        <Card className="p-5">
          <form onSubmit={invite} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Full name</Label><Input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
              <div><Label>Mobile</Label><Input type="tel" inputMode="numeric" maxLength={10} value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10 digit phone number" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Login email</Label><Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
              <div><Label>Password</Label><PasswordInput required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="At least 6 characters" /></div>
            </div>
            <div>
              <Label>Outlets they manage</Label>
              <div className="mt-1 flex flex-wrap gap-3">
                {freeOutlets.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={picked.includes(o.id)} onChange={() => setPicked(toggle(picked, o.id))} />
                    {o.name}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Only outlets without a manager are listed — each outlet has one manager.</p>
            </div>
            <div className="flex gap-2">
              <Button disabled={busy || picked.length === 0}>{busy ? "Creating…" : "Create manager login"}</Button>
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {loaded && managers.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">No managers yet.</p>
      )}
      {managers.map((m) => (
        <Card key={m.user_id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{m.full_name || m.email}</div>
              <div className="text-xs text-muted-foreground">{m.email}{m.mobile ? ` · ${m.mobile}` : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={m.status === "active" ? "default" : "secondary"}>
                {m.status === "invited" ? "Invited" : m.status === "active" ? "Active" : "Disabled"}
              </Badge>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setResetFor(m)}>Reset password</Button>
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => run(() => call({ action: "set_active", user_id: m.user_id, is_active: !m.is_active }), m.is_active ? "Manager disabled" : "Manager enabled")}>
                {m.is_active ? "Disable" : "Enable"}
              </Button>
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy}
                onClick={() => { if (window.confirm(`Remove ${m.full_name || m.email}? Their login will be deleted.`)) run(() => call({ action: "remove", user_id: m.user_id }), "Manager removed"); }}>
                Remove
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {activeOutlets.filter((o) => m.outlet_ids.includes(o.id) || !managerOf(o.id)).map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  disabled={busy || (m.outlet_ids.length === 1 && m.outlet_ids.includes(o.id))}
                  checked={m.outlet_ids.includes(o.id)}
                  onChange={() => run(() => call({ action: "set_outlets", user_id: m.user_id, outlet_ids: toggle(m.outlet_ids, o.id) }), "Access updated")}
                />
                {o.name}
              </label>
            ))}
            {m.outlet_ids.filter((id) => !activeOutlets.some((o) => o.id === id)).map((id) => (
              <span key={id} className="text-xs text-muted-foreground">{outletName(id)}</span>
            ))}
          </div>
        </Card>
      ))}

      <ResetPasswordDialog
        open={!!resetFor}
        name={resetFor?.full_name || resetFor?.email || "this manager"}
        onClose={() => setResetFor(null)}
        onSubmit={async (password) => {
          await call({ action: "update_password", user_id: resetFor!.user_id, password });
          toast.success("Password updated — share it with the manager");
        }}
      />
    </div>
  );
}
