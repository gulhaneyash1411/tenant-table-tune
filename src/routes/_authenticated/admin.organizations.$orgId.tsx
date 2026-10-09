import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, MoreHorizontal, Plus, UserPlus, Copy, KeyRound, Pencil, Loader2, Trash2,
} from "lucide-react";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { ResetPasswordDialog } from "@/components/reset-password-dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ADMIN_PAGE_SIZE, Pager, StatusBadge, BUSINESS_TYPE_LABEL, fmtMoney, fmtDate, adminRpc,
} from "@/components/admin/admin-ui";

export const Route = createFileRoute("/_authenticated/admin/organizations/$orgId")({ component: OrganizationDetails });

// supabase types are stale for the multi-outlet schema
const sb = supabase as any;

type Org = { id: string; name: string; business_type: string; status: string | null; created_at: string };
type Outlet = {
  id: string; name: string; city: string | null; state: string | null; address: string | null; pincode: string | null;
  gst_number: string | null; opening_time: string | null; closing_time: string | null;
  owner_name: string | null; owner_email: string | null; owner_phone: string | null;
  status: string | null; outlet_status: string; settings: Record<string, any> | null; created_at: string;
};
type Sub = {
  id: string; tenant_id: string; plan_id: string | null; status: string;
  current_period_start: string | null; current_period_end: string | null; subscription_plans?: { name: string } | null;
};
type Manager = {
  user_id: string; full_name: string | null; email: string; mobile: string | null;
  is_active: boolean; status: "invited" | "active" | "disabled"; outlet_ids: string[];
};

const OUTLET_COLS =
  "id, name, city, state, address, pincode, gst_number, opening_time, closing_time, owner_name, owner_email, owner_phone, status, outlet_status, settings, created_at";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : (e as any)?.message || "Something went wrong");
const outletCode = (o: Outlet) => (o.settings?.outlet_code as string) || "—";

async function postJson(url: string, body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

async function insertAudit(row: Record<string, unknown>) {
  const { data } = await supabase.auth.getUser();
  const { error } = await sb.from("audit_logs").insert({ actor_id: data.user?.id ?? null, ...row });
  if (error) toast.error(`Action done, but the audit entry failed: ${error.message}`);
}

/** Tiny loader hook: runs `fn` on mount / when deps change / on reload(). */
function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    setLoading(true);
    fn().then(
      (d) => { if (!off) { setData(d); setError(null); setLoading(false); } },
      (e) => { if (!off) { setError(errMsg(e)); setLoading(false); } },
    );
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

function Loading() {
  return <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
}
function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4 text-sm text-destructive">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

type Confirm = { title: string; description: string; confirmLabel?: string; destructive?: boolean; run: () => Promise<void> };

function ConfirmDialog({ confirm, onClose }: { confirm: Confirm | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={confirm?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              if (!confirm) return;
              setBusy(true);
              try { await confirm.run(); onClose(); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
            }}
          >
            {busy ? "Working…" : confirm?.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// =====================================================================================================
function OrganizationDetails() {
  const { orgId } = Route.useParams();
  const org = useAsync(async () => {
    const { data, error } = await sb.from("organizations").select("id, name, business_type, status, created_at").eq("id", orgId).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Org | null;
  }, [orgId]);
  // an organization has a handful of outlets; the cap is a safety net, not pagination
  const outletsQ = useAsync(async () => {
    const { data, error } = await sb.from("tenants").select(OUTLET_COLS).eq("organization_id", orgId)
      .order("created_at", { ascending: true }).limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as Outlet[];
  }, [orgId]);
  const [tab, setTab] = useState("overview");

  const outlets = outletsQ.data ?? [];
  const o = org.data;
  const owner = outlets[0];
  const reloadAll = () => { org.reload(); outletsQ.reload(); };

  const back = (
    <a href="/admin/organizations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />All organizations
    </a>
  );

  if (org.loading && !o) return <div className="space-y-4">{back}<Loading /></div>;
  if (org.error) return <div className="space-y-4">{back}<Card><ErrorBox message={org.error} onRetry={org.reload} /></Card></div>;
  if (!o) return <div className="space-y-4">{back}<Card><Empty>Organization not found.</Empty></Card></div>;

  const activeCount = outlets.filter((x) => x.outlet_status === "ACTIVE").length;

  return (
    <div className="space-y-5">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{BUSINESS_TYPE_LABEL[o.business_type] ?? o.business_type}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {owner ? (
              <>
                Owner: {owner.owner_name || "—"} · {owner.owner_email || "—"}{owner.owner_phone ? ` · ${owner.owner_phone}` : ""}
                {owner.status && <span className="ml-2 inline-block align-middle"><StatusBadge status={owner.status} /></span>}
              </>
            ) : "No owner on record"}
          </div>
          <div className="text-xs text-muted-foreground">
            {outlets.length} outlet{outlets.length === 1 ? "" : "s"} · {activeCount} active · created {fmtDate(o.created_at)}
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="outlets">Outlets</TabsTrigger>
          <TabsTrigger value="managers">Managers</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        {/* inactive tabs are unmounted, so each tab fetches only when first opened */}
        <TabsContent value="overview">
          <OverviewTab org={o} outlets={outlets} outletsLoading={outletsQ.loading} onChanged={reloadAll} />
        </TabsContent>
        <TabsContent value="outlets">
          <OutletsTab orgId={orgId} outlets={outlets} loading={outletsQ.loading} error={outletsQ.error} onChanged={outletsQ.reload} />
        </TabsContent>
        <TabsContent value="managers"><ManagersTab orgId={orgId} outlets={outlets} /></TabsContent>
        <TabsContent value="invoices"><InvoicesTab orgId={orgId} outlets={outlets} /></TabsContent>
        <TabsContent value="payments"><PaymentsTab orgId={orgId} outlets={outlets} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Overview --------------------------------------------------------------------------------
function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function OverviewTab({ org, outlets, outletsLoading, onChanged }: {
  org: Org; outlets: Outlet[]; outletsLoading: boolean; onChanged: () => void;
}) {
  const ids = outlets.map((x) => x.id);
  const idKey = ids.join(",");
  const count = (s: string) => outlets.filter((x) => x.outlet_status === s).length;

  const subs = useAsync(async () => {
    if (!ids.length) return [] as { current_period_end: string | null }[];
    const { data, error } = await sb.from("subscriptions").select("current_period_end")
      .in("tenant_id", ids).in("status", ["active", "trialing"]).limit(2000);
    if (error) throw new Error(error.message);
    return data as { current_period_end: string | null }[];
  }, [idKey]);

  const fin = useAsync(async () => {
    const { data, error } = await sb.from("invoices").select("amount, amount_paid, status")
      .eq("organization_id", org.id).not("status", "in", "(cancelled,draft)").limit(5000);
    if (error) throw new Error(error.message);
    let invoiced = 0, paid = 0;
    for (const r of data as any[]) { invoiced += Number(r.amount ?? 0); paid += Number(r.amount_paid ?? 0); }
    return { invoiced, paid, outstanding: invoiced - paid };
  }, [org.id]);

  const now = Date.now();
  const ends = (subs.data ?? []).map((s) => s.current_period_end).filter(Boolean).map((d) => new Date(d as string).getTime());
  const soonest = ends.length ? Math.min(...ends.filter((t) => t >= now), Infinity) : Infinity;
  const expiring = ends.filter((t) => t >= now && t <= now + 30 * 864e5).length;

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function saveName() {
    const name = (edit ?? "").trim();
    if (!name) return toast.error("Name is required");
    if (name === org.name) return setEdit(null);
    setSavingName(true);
    try {
      const { error } = await sb.from("organizations").update({ name }).eq("id", org.id);
      if (error) throw new Error(error.message);
      await insertAudit({
        organization_id: org.id, action: "organization.updated", entity: "organization", entity_id: org.id,
        old_value: { name: org.name }, new_value: { name },
      });
      toast.success("Organization renamed");
      setEdit(null);
      onChanged();
    } catch (e) { toast.error(errMsg(e)); } finally { setSavingName(false); }
  }

  async function resetPassword() {
    if (!outlets[0]) return;
    setResetting(true);
    try {
      const r = await postJson("/api/admin-create-restaurant", { action: "reset_password", tenant_id: outlets[0].id });
      setTemp(r.temp_password as string);
    } catch (e) { toast.error(errMsg(e)); } finally { setResetting(false); }
  }

  function orgStatus(target: "SUSPENDED" | "ACTIVE") {
    const targets = outlets.filter((x) => x.outlet_status !== "CANCELLED" && x.outlet_status !== target);
    if (!targets.length) return toast.info(`No outlets to ${target === "ACTIVE" ? "activate" : "suspend"}`);
    setConfirm({
      title: target === "ACTIVE" ? "Activate all outlets?" : "Suspend all outlets?",
      description: `${targets.length} outlet${targets.length === 1 ? "" : "s"} of ${org.name} will be set to ${target === "ACTIVE" ? "Active" : "Suspended"}. Cancelled outlets are not touched.`,
      confirmLabel: target === "ACTIVE" ? "Activate all" : "Suspend all",
      destructive: target === "SUSPENDED",
      run: async () => {
        let failed = 0;
        for (const t of targets) {
          try { await adminRpc(sb, "admin_set_outlet_status", { p_tenant_id: t.id, p_status: target, p_reason: null }); } catch { failed++; }
        }
        if (failed) toast.error(`${failed} outlet(s) could not be updated`); else toast.success("Outlets updated");
        onChanged();
      },
    });
  }

  const owner = outlets[0];
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Outlets</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Total" value={outletsLoading ? "…" : outlets.length} />
          <Stat label="Active" value={outletsLoading ? "…" : count("ACTIVE")} />
          <Stat label="Pending payment" value={outletsLoading ? "…" : count("PENDING_PAYMENT")} />
          <Stat label="Suspended" value={outletsLoading ? "…" : count("SUSPENDED")} />
          <Stat label="Cancelled" value={outletsLoading ? "…" : count("CANCELLED")} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Subscriptions</h2>
        {subs.error ? <Card><ErrorBox message={subs.error} onRetry={subs.reload} /></Card> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat label="Active subscriptions" value={subs.loading ? "…" : subs.data?.length ?? 0} />
            <Stat label="Soonest expiry" value={subs.loading ? "…" : Number.isFinite(soonest) ? fmtDate(new Date(soonest)) : "—"} />
            <Stat label="Expiring within 30 days" value={subs.loading ? "…" : expiring} />
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Financials (excludes draft and cancelled invoices)</h2>
        {fin.error ? <Card><ErrorBox message={fin.error} onRetry={fin.reload} /></Card> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat label="Invoiced" value={fin.loading ? "…" : fmtMoney(fin.data?.invoiced)} />
            <Stat label="Paid" value={fin.loading ? "…" : fmtMoney(fin.data?.paid)} />
            <Stat label="Outstanding" value={fin.loading ? "…" : fmtMoney(fin.data?.outstanding)} />
          </div>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">Owner</h2>
          {owner ? (
            <div className="space-y-1 text-sm">
              <div>{owner.owner_name || "—"}</div>
              <div className="text-muted-foreground">{owner.owner_email || "—"}</div>
              <div className="text-muted-foreground">{owner.owner_phone || "—"}</div>
              <div className="flex items-center gap-2 pt-1 text-muted-foreground">Account status <StatusBadge status={owner.status} /></div>
            </div>
          ) : <p className="text-sm text-muted-foreground">No outlets yet.</p>}
          <Button size="sm" variant="outline" disabled={!owner || resetting} onClick={resetPassword}>
            <KeyRound className="mr-1 h-4 w-4" />{resetting ? "Resetting…" : "Reset password"}
          </Button>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="font-medium">Organization</h2>
          <div className="flex items-center gap-2 text-sm">
            <span>{org.name}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(org.name)} aria-label="Edit name">
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={outletsLoading} onClick={() => orgStatus("ACTIVE")}>Activate all outlets</Button>
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={outletsLoading} onClick={() => orgStatus("SUSPENDED")}>
              Suspend all outlets
            </Button>
          </div>
        </Card>
      </div>

      <Dialog open={edit !== null} onOpenChange={(v) => { if (!v && !savingName) setEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit organization name</DialogTitle></DialogHeader>
          <div><Label>Name</Label><Input value={edit ?? ""} onChange={(e) => setEdit(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)} disabled={savingName}>Cancel</Button>
            <Button onClick={saveName} disabled={savingName}>{savingName ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={temp !== null} onOpenChange={(v) => { if (!v) setTemp(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
            <DialogDescription>Shown only once. Share it with the owner securely; they should change it after signing in.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-sm">{temp}</code>
            <Button variant="outline" size="icon" aria-label="Copy" onClick={() => { navigator.clipboard.writeText(temp ?? ""); toast.success("Copied"); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter><Button onClick={() => setTemp(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

// ---------- Outlets ---------------------------------------------------------------------------------
type Plan = { id: string; name: string; monthly_price: number | null; half_yearly_price: number | null; yearly_price: number | null };
const blankOutlet = {
  name: "", code: "", address: "", city: "", state: "", pincode: "", contact: "", email: "", gst: "", opening: "", closing: "",
};

function OutletsTab({ orgId, outlets, loading, error, onChanged }: {
  orgId: string; outlets: Outlet[]; loading: boolean; error: string | null; onChanged: () => void;
}) {
  const ids = outlets.map((x) => x.id);
  const idKey = ids.join(",");
  const extra = useAsync(async () => {
    if (!ids.length) return { subs: {} as Record<string, Sub>, tables: {} as Record<string, number>, mgrs: {} as Record<string, number> };
    const [s, t, m] = await Promise.all([
      sb.from("subscriptions")
        .select("id, tenant_id, plan_id, status, current_period_start, current_period_end, subscription_plans(name)")
        .in("tenant_id", ids).order("created_at", { ascending: false }).limit(Math.max(50, ids.length * 5)),
      sb.from("restaurant_tables").select("tenant_id").in("tenant_id", ids).limit(10000),
      sb.from("user_roles").select("tenant_id").eq("role", "manager").in("tenant_id", ids).limit(10000),
    ]);
    for (const r of [s, t, m]) if (r.error) throw new Error(r.error.message);
    const subs: Record<string, Sub> = {};
    for (const r of s.data as Sub[]) if (!subs[r.tenant_id]) subs[r.tenant_id] = r; // newest first
    const tables: Record<string, number> = {};
    for (const r of t.data as any[]) tables[r.tenant_id] = (tables[r.tenant_id] ?? 0) + 1;
    const mgrs: Record<string, number> = {};
    for (const r of m.data as any[]) mgrs[r.tenant_id] = (mgrs[r.tenant_id] ?? 0) + 1;
    return { subs, tables, mgrs };
  }, [idKey]);

  const plans = useAsync(async () => {
    const { data, error } = await sb.from("subscription_plans").select("id, name, monthly_price, half_yearly_price, yearly_price").eq("is_active", true).order("monthly_price");
    if (error) throw new Error(error.message);
    return data as Plan[];
  }, []);

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [subFor, setSubFor] = useState<Outlet | null>(null);
  const [extendFor, setExtendFor] = useState<Sub | null>(null);
  const [detail, setDetail] = useState<Outlet | null>(null);
  const [adding, setAdding] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOutletId, setDeleteOutletId] = useState<string | null>(null);
  const [deleteOutletName, setDeleteOutletName] = useState("");
  const [deleteImpact, setDeleteImpact] = useState<any>(null);
  const [deleteFetching, setDeleteFetching] = useState(false);

  const refresh = () => { onChanged(); extra.reload(); };

  const handleDeleteClick = async (outletId: string, outletName: string) => {
    setDeleteOutletId(outletId);
    setDeleteOutletName(outletName);
    setDeleteOpen(true);
    setDeleteFetching(true);

    try {
      const response = await fetch(`/api/delete-outlet?outletId=${outletId}`);
      const data = await response.json();
      setDeleteImpact(data.impact);
    } catch (error: any) {
      toast.error("Failed to load deletion impact");
      setDeleteOpen(false);
    } finally {
      setDeleteFetching(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteOutletId) return;

    try {
      const response = await fetch(`/api/delete-outlet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId: deleteOutletId, confirmationText: "DELETE" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete outlet");
      }

      const result = await response.json();
      if (result.success) {
        refresh();
        setDeleteOpen(false);
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      throw error;
    }
  };

  function setOutletStatus(o: Outlet, status: "ACTIVE" | "SUSPENDED" | "CANCELLED") {
    const verb = status === "ACTIVE" ? "Activate" : status === "SUSPENDED" ? "Suspend" : "Cancel";
    setConfirm({
      title: `${verb} ${o.name}?`,
      description: status === "ACTIVE"
        ? "The outlet goes live and its QR codes start working."
        : status === "SUSPENDED"
          ? "Customers will not be able to order from this outlet until it is activated again."
          : "Cancelling is intended to be final for this outlet. Its QR codes stop working.",
      confirmLabel: verb, destructive: status !== "ACTIVE",
      run: async () => {
        await adminRpc(sb, "admin_set_outlet_status", { p_tenant_id: o.id, p_status: status, p_reason: null });
        toast.success(`Outlet ${status === "ACTIVE" ? "activated" : status === "SUSPENDED" ? "suspended" : "cancelled"}`);
        refresh();
      },
    });
  }

  function setSubStatus(s: Sub, status: "active" | "paused" | "canceled") {
    const label = status === "active" ? "Activate" : status === "paused" ? "Suspend" : "Cancel";
    setConfirm({
      title: `${label} subscription?`,
      description: "This also moves the outlet status to match (active = Active, suspended = Suspended, cancelled = Cancelled).",
      confirmLabel: label, destructive: status !== "active",
      run: async () => {
        await adminRpc(sb, "admin_set_subscription_status", { p_subscription_id: s.id, p_status: status });
        toast.success("Subscription updated");
        refresh();
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Outlets of this organization and their current subscription.</p>
        <Button onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Add Outlet</Button>
      </div>
      <Card className="overflow-x-auto">
        {loading || extra.loading ? <Loading />
          : error || extra.error ? <ErrorBox message={(error || extra.error)!} onRetry={refresh} />
          : outlets.length === 0 ? <Empty>No outlets yet. Add the first one.</Empty> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Outlet</TableHead><TableHead>Code</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead>
                <TableHead>Subscription</TableHead><TableHead className="text-right">Tables</TableHead>
                <TableHead className="text-right">Managers</TableHead><TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {outlets.map((o) => {
                const s = extra.data?.subs[o.id];
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      <button className="text-left hover:underline" onClick={() => setDetail(o)}>{o.name}</button>
                    </TableCell>
                    <TableCell>{outletCode(o)}</TableCell>
                    <TableCell>{[o.city, o.state].filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell><StatusBadge status={o.outlet_status} /></TableCell>
                    <TableCell>
                      {s ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">{s.subscription_plans?.name ?? "—"} <StatusBadge status={s.status} /></div>
                          <div className="text-xs text-muted-foreground">Ends {fmtDate(s.current_period_end)}</div>
                        </div>
                      ) : <span className="text-muted-foreground">None</span>}
                    </TableCell>
                    <TableCell className="text-right">{extra.data?.tables[o.id] ?? 0}</TableCell>
                    <TableCell className="text-right">{extra.data?.mgrs[o.id] ?? 0}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetail(o)}>Outlet details</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Outlet</DropdownMenuLabel>
                          {o.outlet_status !== "ACTIVE" && <DropdownMenuItem onClick={() => setOutletStatus(o, "ACTIVE")}>Activate</DropdownMenuItem>}
                          {o.outlet_status !== "SUSPENDED" && <DropdownMenuItem onClick={() => setOutletStatus(o, "SUSPENDED")}>Suspend</DropdownMenuItem>}
                          {o.outlet_status !== "CANCELLED" && <DropdownMenuItem className="text-destructive" onClick={() => setOutletStatus(o, "CANCELLED")}>Cancel</DropdownMenuItem>}
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteClick(o.id, o.name)}>
                            <Trash2 className="h-4 w-4 mr-2" />Delete
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Subscription</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setSubFor(o)}>Create / renew subscription</DropdownMenuItem>
                          {s && s.status !== "active" && <DropdownMenuItem onClick={() => setSubStatus(s, "active")}>Activate subscription</DropdownMenuItem>}
                          {s && s.status !== "paused" && <DropdownMenuItem onClick={() => setSubStatus(s, "paused")}>Suspend subscription</DropdownMenuItem>}
                          {s && s.status !== "canceled" && <DropdownMenuItem className="text-destructive" onClick={() => setSubStatus(s, "canceled")}>Cancel subscription</DropdownMenuItem>}
                          {s && <DropdownMenuItem onClick={() => setExtendFor(s)}>Extend subscription</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <AddOutletDialog orgId={orgId} open={adding} onClose={() => setAdding(false)} onDone={refresh} />
      <SubscribeDialog outlet={subFor} plans={plans.data ?? []} onClose={() => setSubFor(null)} onDone={refresh} />
      <ExtendDialog sub={extendFor} onClose={() => setExtendFor(null)} onDone={refresh} />
      <OutletSheet outlet={detail} sub={detail ? extra.data?.subs[detail.id] : undefined} onClose={() => setDetail(null)} />
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Outlet"
        description="This will permanently delete the outlet and all its orders, customers, subscriptions, tables, and related data."
        itemName="outlet"
        isLoading={deleteFetching}
        impact={deleteImpact}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function AddOutletDialog({ orgId, open, onClose, onDone }: { orgId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState(blankOutlet);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blankOutlet) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminRpc(sb, "admin_add_outlet", {
        p_org_id: orgId, p_name: f.name.trim(), p_outlet_code: f.code.trim(), p_address: f.address, p_city: f.city, p_state: f.state,
        p_pincode: f.pincode, p_contact: f.contact, p_email: f.email, p_gst: f.gst, p_opening: f.opening, p_closing: f.closing,
      });
      toast.success("Outlet added as Pending payment");
      setF(blankOutlet);
      onDone();
      onClose();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add outlet</DialogTitle>
          <DialogDescription>
            The outlet is created as Pending payment. Next: create a subscription (or an invoice), record the payment, then activate the outlet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Outlet name *</Label><Input required value={f.name} onChange={set("name")} /></div>
            <div><Label>Outlet code</Label><Input value={f.code} onChange={set("code")} /></div>
          </div>
          <div><Label>Address</Label><Input value={f.address} onChange={set("address")} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>City</Label><Input value={f.city} onChange={set("city")} /></div>
            <div><Label>State</Label><Input value={f.state} onChange={set("state")} /></div>
            <div><Label>Pincode</Label><Input value={f.pincode} onChange={set("pincode")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contact</Label><Input value={f.contact} onChange={set("contact")} /></div>
            <div><Label>Email</Label><Input type="email" value={f.email} onChange={set("email")} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>GST number</Label><Input value={f.gst} onChange={set("gst")} /></div>
            <div><Label>Opening</Label><Input type="time" value={f.opening} onChange={set("opening")} /></div>
            <div><Label>Closing</Label><Input type="time" value={f.closing} onChange={set("closing")} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button disabled={busy}>{busy ? "Adding…" : "Add outlet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubscribeDialog({ outlet, plans, onClose, onDone }: { outlet: Outlet | null; plans: Plan[]; onClose: () => void; onDone: () => void }) {
  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!outlet || !planId) return toast.error("Choose a plan");
    setBusy(true);
    try {
      await adminRpc(sb, "admin_create_subscription", { p_tenant_id: outlet.id, p_plan_id: planId, p_cycle: cycle, p_activate: true });
      toast.success("Subscription saved and outlet activated");
      onDone();
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!outlet} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create / renew subscription</DialogTitle>
          <DialogDescription>{outlet?.name}. A running subscription is extended; the outlet is activated.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Select a plan" /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Billing cycle</Label>
            <Select value={cycle} onValueChange={setCycle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="half_yearly">Half-yearly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !planId}>{busy ? "Saving…" : "Save subscription"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtendDialog({ sub, onClose, onDone }: { sub: Sub | null; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  async function submit() {
    const n = Math.floor(Number(days));
    if (!sub || !n) return toast.error("Enter a number of days");
    setBusy(true);
    try {
      await adminRpc(sb, "admin_extend_subscription", { p_subscription_id: sub.id, p_days: n });
      toast.success(`Extended by ${n} days`);
      onDone();
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!sub} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend subscription</DialogTitle>
          <DialogDescription>Currently ends {fmtDate(sub?.current_period_end)}.</DialogDescription>
        </DialogHeader>
        <div><Label>Days to add</Label><Input type="number" value={days} onChange={(e) => setDays(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Extending…" : "Extend"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutletSheet({ outlet, sub, onClose }: { outlet: Outlet | null; sub?: Sub; onClose: () => void }) {
  const id = outlet?.id;
  const q = useAsync(async () => {
    if (!id) return null;
    const [t, qr, roles, inv, pay] = await Promise.all([
      sb.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("tenant_id", id),
      sb.from("qr_codes").select("id", { count: "exact", head: true }).eq("tenant_id", id).eq("status", "ACTIVE"),
      sb.from("user_roles").select("user_id").eq("tenant_id", id).eq("role", "manager").limit(100),
      sb.from("invoices").select("amount, amount_paid").eq("tenant_id", id).not("status", "in", "(cancelled,draft)").limit(2000),
      sb.from("payments").select("amount").eq("tenant_id", id).eq("status", "completed").limit(2000),
    ]);
    for (const r of [t, qr, roles, inv, pay]) if (r.error) throw new Error(r.error.message);
    const userIds = (roles.data as any[]).map((r) => r.user_id);
    let names: string[] = [];
    if (userIds.length) {
      const { data } = await sb.from("organization_users").select("full_name, email").in("user_id", userIds);
      names = ((data ?? []) as any[]).map((u) => u.full_name || u.email);
    }
    const sum = (rows: any[], k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    return {
      tables: t.count ?? 0, qrs: qr.count ?? 0, managers: names,
      invoiced: sum(inv.data, "amount"), paidOnInvoices: sum(inv.data, "amount_paid"), payments: sum(pay.data, "amount"),
    };
  }, [id]);

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right">{v || "—"}</span></div>
  );
  return (
    <Sheet open={!!outlet} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{outlet?.name}</SheetTitle>
          <SheetDescription>Outlet details</SheetDescription>
        </SheetHeader>
        {outlet && (
          <div className="space-y-5 px-4 pb-6">
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Basic info</h3>
              {row("Status", <StatusBadge status={outlet.outlet_status} />)}
              {row("Code", outletCode(outlet))}
              {row("Opening / closing", [outlet.opening_time, outlet.closing_time].filter(Boolean).join(" – "))}
              {row("Created", fmtDate(outlet.created_at))}
            </section>
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Address &amp; contact</h3>
              {row("Address", [outlet.address, outlet.city, outlet.state, outlet.pincode].filter(Boolean).join(", "))}
              {row("Contact", outlet.owner_phone)}
              {row("Email", outlet.owner_email)}
              {row("GST", outlet.gst_number)}
            </section>
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Subscription</h3>
              {sub ? (
                <>
                  {row("Plan", sub.subscription_plans?.name)}
                  {row("Status", <StatusBadge status={sub.status} />)}
                  {row("Period", `${fmtDate(sub.current_period_start)} – ${fmtDate(sub.current_period_end)}`)}
                </>
              ) : <p className="text-sm text-muted-foreground">No subscription.</p>}
            </section>
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Usage &amp; billing</h3>
              {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : q.data && (
                <>
                  {row("Tables", q.data.tables)}
                  {row("Active QR codes", q.data.qrs)}
                  {row("Managers", q.data.managers.length ? q.data.managers.join(", ") : "None assigned")}
                  {row("Invoiced", fmtMoney(q.data.invoiced))}
                  {row("Paid on invoices", fmtMoney(q.data.paidOnInvoices))}
                  {row("Payments received", fmtMoney(q.data.payments))}
                </>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------- Managers --------------------------------------------------------------------------------
function ManagersTab({ orgId, outlets }: { orgId: string; outlets: Outlet[] }) {
  const active = outlets.filter((o) => o.outlet_status === "ACTIVE");
  const q = useAsync(async () => {
    const r = await postJson("/api/outlet-users", { action: "list", organization_id: orgId });
    return r.users as Manager[];
  }, [orgId]);
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [f, setF] = useState({ full_name: "", email: "", mobile: "", password: "" });
  const [picked, setPicked] = useState<string[]>([]);
  const [assign, setAssign] = useState<{ m: Manager; ids: string[] } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "Outlet";

  async function run(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      await postJson("/api/outlet-users", { organization_id: orgId, ...body });
      toast.success(ok);
      q.reload();
      return true;
    } catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(
      { action: "invite", ...f, outlet_ids: picked },
      "Manager created — share the email and password with them to sign in",
    );
    if (ok) { setInviting(false); setF({ full_name: "", email: "", mobile: "", password: "" }); setPicked([]); }
  }

  const [resetFor, setResetFor] = useState<Manager | null>(null);
  const resetPassword = (m: Manager) => setResetFor(m);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Managers run only the outlets assigned to them. Only active outlets can be assigned.</p>
        <Button onClick={() => setInviting(true)} disabled={active.length === 0}><UserPlus className="mr-1 h-4 w-4" />Add manager</Button>
      </div>
      {active.length === 0 && <p className="text-xs text-muted-foreground">Activate an outlet first to invite managers.</p>}
      <Card className="overflow-x-auto">
        {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error} onRetry={q.reload} />
          : !q.data?.length ? <Empty>No managers yet.</Empty> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Manager</TableHead><TableHead>Status</TableHead><TableHead>Outlets</TableHead><TableHead className="w-10" /></TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell>
                    <div className="font-medium">{m.full_name || m.email}</div>
                    <div className="text-xs text-muted-foreground">{m.email}{m.mobile ? ` · ${m.mobile}` : ""}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.status === "active" ? "default" : "secondary"}>
                      {m.status === "invited" ? "Invited" : m.status === "active" ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {m.outlet_ids.length === 0 && <span className="text-muted-foreground">None</span>}
                      {m.outlet_ids.map((id) => <Badge key={id} variant="outline">{outletName(id)}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="Actions" disabled={busy}><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setAssign({ m, ids: m.outlet_ids })}>Change outlets</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resetPassword(m)}>Reset password</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => run({ action: "set_active", user_id: m.user_id, is_active: !m.is_active }, m.is_active ? "Manager disabled" : "Manager enabled")}>
                          {m.is_active ? "Disable" : "Enable"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setConfirm({
                          title: `Remove ${m.full_name || m.email}?`, description: "Their login will be deleted.",
                          confirmLabel: "Remove", destructive: true,
                          run: async () => { await postJson("/api/outlet-users", { action: "remove", organization_id: orgId, user_id: m.user_id }); toast.success("Manager removed"); q.reload(); },
                        })}>Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ResetPasswordDialog
        open={!!resetFor}
        name={resetFor?.full_name || resetFor?.email || "this manager"}
        onClose={() => setResetFor(null)}
        onSubmit={async (password) => {
          await postJson("/api/outlet-users", { action: "update_password", organization_id: orgId, user_id: resetFor!.user_id, password });
          toast.success("Password updated — share it with the manager");
        }}
      />

      <Dialog open={inviting} onOpenChange={(v) => { if (!v && !busy) setInviting(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create manager login</DialogTitle>
            <DialogDescription>Set the login email and an initial password, then share them with the manager.</DialogDescription>
          </DialogHeader>
          <form onSubmit={invite} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Full name</Label><Input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
              <div><Label>Mobile</Label><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Login email</Label><Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
              <div><Label>Password</Label><PasswordInput required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="At least 6 characters" /></div>
            </div>
            <div>
              <Label>Outlets they manage</Label>
              <div className="mt-1 space-y-1.5">
                {active.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={picked.includes(o.id)} onCheckedChange={() => setPicked(toggle(picked, o.id))} />{o.name}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviting(false)} disabled={busy}>Cancel</Button>
              <Button disabled={busy || picked.length === 0}>{busy ? "Creating…" : "Create login"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assign} onOpenChange={(v) => { if (!v && !busy) setAssign(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change outlets</DialogTitle>
            <DialogDescription>{assign?.m.full_name || assign?.m.email}. At least one outlet must stay assigned.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {active.map((o) => {
              const on = !!assign?.ids.includes(o.id);
              return (
                <label key={o.id} className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Checkbox checked={on} onCheckedChange={() => assign && setAssign({ ...assign, ids: toggle(assign.ids, o.id) })} />{o.name}
                  </span>
                  <Badge variant={on ? "default" : "secondary"}>{on ? "Assigned" : "Not assigned"}</Badge>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssign(null)} disabled={busy}>Cancel</Button>
            <Button disabled={busy || !assign || assign.ids.length === 0} onClick={async () => {
              if (!assign) return;
              if (await run({ action: "set_outlets", user_id: assign.m.user_id, outlet_ids: assign.ids }, "Access updated")) setAssign(null);
            }}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

// ---------- Invoices --------------------------------------------------------------------------------
const INVOICE_STATUSES = ["draft", "issued", "pending", "pending_approval", "partially_paid", "paid", "overdue", "cancelled", "rejected"];

function OutletFilter({ outlets, value, onChange }: { outlets: Outlet[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-48"><SelectValue placeholder="All outlets" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All outlets</SelectItem>
        {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function InvoicesTab({ orgId, outlets }: { orgId: string; outlets: Outlet[] }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [outlet, setOutlet] = useState("all");
  const outletName = (id: string | null) => outlets.find((o) => o.id === id)?.name ?? "—";
  const q = useAsync(async () => {
    const from = (page - 1) * ADMIN_PAGE_SIZE;
    let query = sb.from("invoices")
      .select("id, invoice_number, tenant_id, issued_at, due_date, amount, amount_paid, status", { count: "exact" })
      .eq("organization_id", orgId);
    if (status !== "all") query = query.eq("status", status);
    if (outlet !== "all") query = query.eq("tenant_id", outlet);
    const { data, count, error } = await query.order("issued_at", { ascending: false, nullsFirst: false }).range(from, from + ADMIN_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return { rows: data as any[], total: count ?? 0 };
  }, [orgId, page, status, outlet]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INVOICE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <OutletFilter outlets={outlets} value={outlet} onChange={(v) => { setOutlet(v); setPage(1); }} />
        <a href="/admin/invoices" className="ml-auto text-sm text-primary hover:underline">Open Invoices</a>
      </div>
      <Card className="overflow-x-auto">
        {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error} onRetry={q.reload} />
          : !q.data?.rows.length ? <Empty>No invoices found.</Empty> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead><TableHead>Outlet</TableHead><TableHead>Issued</TableHead><TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.invoice_number || "—"}</TableCell>
                  <TableCell>{outletName(r.tenant_id)}</TableCell>
                  <TableCell>{fmtDate(r.issued_at)}</TableCell>
                  <TableCell>{fmtDate(r.due_date)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.amount)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.amount_paid)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {q.data && <Pager page={page} total={q.data.total} onPage={setPage} />}
    </div>
  );
}

// ---------- Payments --------------------------------------------------------------------------------
function PaymentsTab({ orgId, outlets }: { orgId: string; outlets: Outlet[] }) {
  const [page, setPage] = useState(1);
  const outletName = (id: string | null) => outlets.find((o) => o.id === id)?.name ?? "—";
  const q = useAsync(async () => {
    const from = (page - 1) * ADMIN_PAGE_SIZE;
    const { data, count, error } = await sb.from("payments")
      .select("id, tenant_id, amount, method, status, reference, paid_at, invoices(invoice_number)", { count: "exact" })
      .eq("organization_id", orgId).order("paid_at", { ascending: false }).range(from, from + ADMIN_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return { rows: data as any[], total: count ?? 0 };
  }, [orgId, page]);
  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto">
        {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error} onRetry={q.reload} />
          : !q.data?.rows.length ? <Empty>No payments recorded.</Empty> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Method</TableHead>
                <TableHead>Reference</TableHead><TableHead>Invoice</TableHead><TableHead>Outlet</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDate(r.paid_at)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.amount)}</TableCell>
                  <TableCell className="capitalize">{String(r.method ?? "").replace(/_/g, " ") || "—"}</TableCell>
                  <TableCell>{r.reference || "—"}</TableCell>
                  <TableCell>{r.invoices?.invoice_number || "—"}</TableCell>
                  <TableCell>{outletName(r.tenant_id)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {q.data && <Pager page={page} total={q.data.total} onPage={setPage} />}
    </div>
  );
}
