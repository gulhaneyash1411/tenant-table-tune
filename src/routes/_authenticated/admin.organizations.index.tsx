import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search, X, SlidersHorizontal, ChevronDown, ChevronUp, Plus, Copy, Loader2, AlertTriangle,
  Building2, Store, Check, Trash2,
} from "lucide-react";
import {
  ADMIN_PAGE_SIZE, useDebounced, likeTerm, Pager, BUSINESS_TYPE_LABEL, fmtDate,
} from "@/components/admin/admin-ui";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";

export const Route = createFileRoute("/_authenticated/admin/organizations/")({ component: Organizations });

type BusinessType = "SINGLE_OUTLET" | "MULTI_OUTLET";
type SortKey = "newest" | "oldest" | "name_asc" | "name_desc";
type OrgRow = { id: string; name: string; business_type: BusinessType; status: string | null; owner_id: string | null; created_at: string };
type OrgStats = { owner_name: string; owner_email: string; total: number; active: number; pending: number; suspended: number };

const OUTLET_STATUSES = [
  { v: "ACTIVE", l: "Active" },
  { v: "PENDING_PAYMENT", l: "Pending payment" },
  { v: "SUSPENDED", l: "Suspended" },
  { v: "CANCELLED", l: "Cancelled" },
];

// Cap on ids resolved from a tenants lookup before filtering organizations.
const ID_LOOKUP_LIMIT = 1000;

const db = supabase as any;

function Organizations() {
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [stats, setStats] = useState<Record<string, OrgStats>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ total: 0, single: 0, multi: 0 });

  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [typeF, setTypeF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [cityF, setCityF] = useState("");
  const [stateF, setStateF] = useState("");
  const dCity = useDebounced(cityF);
  const dState = useDebounced(stateF);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creds, setCreds] = useState<{ email: string; password: string; name: string; outlets: number } | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOrgId, setDeleteOrgId] = useState<string | null>(null);
  const [deleteOrgName, setDeleteOrgName] = useState("");
  const [deleteImpact, setDeleteImpact] = useState<any>(null);
  const [deleteFetching, setDeleteFetching] = useState(false);

  const loadSummary = useCallback(async () => {
    const head = { count: "exact", head: true } as const;
    const [a, s, m] = await Promise.all([
      db.from("organizations").select("id", head),
      db.from("organizations").select("id", head).eq("business_type", "SINGLE_OUTLET"),
      db.from("organizations").select("id", head).eq("business_type", "MULTI_OUTLET"),
    ]);
    setSummary({ total: a.count ?? 0, single: s.count ?? 0, multi: m.count ?? 0 });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Resolve filters that live on tenants (outlets) into organization ids.
      let idSets: string[][] = [];

      const term = likeTerm(dq);
      let ownerOrgIds: string[] = [];
      if (term) {
        const like = `%${term}%`;
        const { data, error } = await db.from("tenants").select("organization_id")
          .or(`owner_name.ilike.${like},owner_email.ilike.${like},owner_phone.ilike.${like}`)
          .not("organization_id", "is", null).limit(ID_LOOKUP_LIMIT);
        if (error) throw error;
        ownerOrgIds = Array.from(new Set((data || []).map((r: any) => r.organization_id as string)));
      }

      if (statusF !== "all" || dCity.trim() || dState.trim()) {
        let tq = db.from("tenants").select("organization_id").not("organization_id", "is", null);
        if (statusF !== "all") tq = tq.eq("outlet_status", statusF);
        if (dCity.trim()) tq = tq.ilike("city", `%${likeTerm(dCity)}%`);
        if (dState.trim()) tq = tq.ilike("state", `%${likeTerm(dState)}%`);
        const { data, error } = await tq.limit(ID_LOOKUP_LIMIT);
        if (error) throw error;
        idSets.push(Array.from(new Set((data || []).map((r: any) => r.organization_id as string))));
      }

      // Any tenant-based filter that matched nothing means an empty result.
      if (idSets.some(s => s.length === 0)) { setRows([]); setStats({}); setTotal(0); return; }

      const from = (page - 1) * ADMIN_PAGE_SIZE;
      let oq = db.from("organizations").select("id,name,business_type,status,owner_id,created_at", { count: "exact" });
      if (term) {
        oq = ownerOrgIds.length
          ? oq.or(`name.ilike.%${term}%,id.in.(${ownerOrgIds.join(",")})`)
          : oq.ilike("name", `%${term}%`);
      }
      if (typeF !== "all") oq = oq.eq("business_type", typeF);
      if (idSets.length) oq = oq.in("id", idSets[0]);
      if (fromDate) oq = oq.gte("created_at", new Date(`${fromDate}T00:00:00`).toISOString());
      if (toDate) oq = oq.lte("created_at", new Date(`${toDate}T23:59:59.999`).toISOString());
      if (sort === "name_asc" || sort === "name_desc") oq = oq.order("name", { ascending: sort === "name_asc" });
      else oq = oq.order("created_at", { ascending: sort === "oldest" });
      oq = oq.range(from, from + ADMIN_PAGE_SIZE - 1);

      const { data: orgs, count, error } = await oq;
      if (error) throw error;
      const list = (orgs || []) as OrgRow[];
      setRows(list);
      setTotal(count ?? 0);

      // Outlet counts + owner for this page only.
      const map: Record<string, OrgStats> = {};
      if (list.length) {
        const { data: ts, error: te } = await db.from("tenants")
          .select("organization_id,outlet_status,owner_name,owner_email,created_at")
          .in("organization_id", list.map(o => o.id))
          .order("created_at", { ascending: true }).limit(5000);
        if (te) throw te;
        (ts || []).forEach((t: any) => {
          const s = map[t.organization_id] ||= { owner_name: t.owner_name || "", owner_email: t.owner_email || "", total: 0, active: 0, pending: 0, suspended: 0 };
          s.total++;
          if (t.outlet_status === "ACTIVE") s.active++;
          else if (t.outlet_status === "PENDING_PAYMENT") s.pending++;
          else if (t.outlet_status === "SUSPENDED") s.suspended++;
        });
      }
      setStats(map);

      // Auto-clean orphaned organizations: no outlets at all.
      const orphans = list.filter(o => !map[o.id]);
      if (orphans.length > 0) {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (token) {
          await Promise.all(orphans.map(o =>
            fetch("/api/delete-organization", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ orgId: o.id, confirmationText: "DELETE" }),
            }).catch(() => {})
          ));
          loadSummary();
          setRows(prev => prev.filter(r => !orphans.some(o => o.id === r.id)));
          setTotal(prev => prev - orphans.length);
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, [dq, typeF, statusF, dCity, dState, fromDate, toDate, sort, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { setPage(1); }, [dq, typeF, statusF, dCity, dState, fromDate, toDate, sort]);

  const panelFilters =
    (typeF !== "all" ? 1 : 0) + (statusF !== "all" ? 1 : 0) + (cityF ? 1 : 0) + (stateF ? 1 : 0) +
    (fromDate ? 1 : 0) + (toDate ? 1 : 0) + (sort !== "newest" ? 1 : 0);
  const activeFilters = panelFilters + (q ? 1 : 0);

  function clearFilters() {
    setQ(""); setTypeF("all"); setStatusF("all"); setCityF(""); setStateF("");
    setFromDate(""); setToDate(""); setSort("newest");
  }

  function onCreated(c: { email: string; password: string; name: string; outlets: number }) {
    setCreateOpen(false);
    setCreds(c);
    load();
    loadSummary();
  }

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const handleDeleteClick = async (orgId: string, orgName: string) => {
    setDeleteOrgId(orgId);
    setDeleteOrgName(orgName);
    setDeleteOpen(true);
    setDeleteFetching(true);

    try {
      const token = await getToken();
      if (!token) { toast.error("Session expired"); setDeleteOpen(false); return; }
      const response = await fetch(`/api/delete-organization?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load impact");
      setDeleteImpact(data.impact);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load deletion impact");
      setDeleteOpen(false);
    } finally {
      setDeleteFetching(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteOrgId) return;

    try {
      const token = await getToken();
      if (!token) throw new Error("Session expired");
      const response = await fetch(`/api/delete-organization`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId: deleteOrgId, confirmationText: "DELETE" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete organization");
      }

      const result = await response.json();
      if (result.success) {
        toast.success(result.message);
        load();
        loadSummary();
        setDeleteOpen(false);
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      throw error;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              aria-label="Search organizations"
              placeholder="Search name, owner, email, phone"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="pl-8 pr-8"
            />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />Create Restaurant
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="px-3 py-1 text-sm">Total organizations <b className="ml-1.5">{summary.total}</b></Badge>
        <Badge variant="secondary" className="px-3 py-1 text-sm">Single restaurant <b className="ml-1.5">{summary.single}</b></Badge>
        <Badge variant="secondary" className="px-3 py-1 text-sm">Multi-outlet <b className="ml-1.5">{summary.multi}</b></Badge>
      </div>

      <Card>
        <button
          type="button"
          onClick={() => setFiltersOpen(o => !o)}
          aria-expanded={filtersOpen}
          className="flex w-full items-center justify-between rounded-t-lg px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 font-medium">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
            {panelFilters > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{panelFilters} applied</span>
            )}
          </span>
          {filtersOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden /> : <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />}
        </button>
        <div className={`${filtersOpen ? "grid" : "hidden"} gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`}>
          <div className="space-y-1">
            <Label className="text-xs">Business type</Label>
            <Select value={typeF} onValueChange={setTypeF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="SINGLE_OUTLET">{BUSINESS_TYPE_LABEL.SINGLE_OUTLET}</SelectItem>
                <SelectItem value="MULTI_OUTLET">{BUSINESS_TYPE_LABEL.MULTI_OUTLET}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Has outlet with status</Label>
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                {OUTLET_STATUSES.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">City</Label>
            <Input value={cityF} onChange={e => setCityF(e.target.value)} placeholder="Any city" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">State</Label>
            <Input value={stateF} onChange={e => setStateF(e.target.value)} placeholder="Any state" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="org-from" className="text-xs">Created from</Label>
            <Input id="org-from" type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="org-to" className="text-xs">Created to</Label>
            <Input id="org-to" type="date" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sort by</Label>
            <Select value={sort} onValueChange={v => setSort(v as SortKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name_asc">Name A–Z</SelectItem>
                <SelectItem value="name_desc">Name Z–A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {activeFilters > 0 && (
          <div className="flex min-h-10 items-center justify-between border-t px-3 py-1.5 text-sm text-muted-foreground">
            <span aria-live="polite">{total} organizations match</span>
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="mr-1 h-4 w-4" /> Clear filters ({activeFilters})
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Organization</TableHead><TableHead>Type</TableHead><TableHead>Owner</TableHead>
            <TableHead className="text-center">Outlets</TableHead><TableHead className="text-center">Active</TableHead>
            <TableHead className="text-center">Pending</TableHead><TableHead className="text-center">Suspended</TableHead>
            <TableHead>Created</TableHead><TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                {activeFilters > 0 ? (
                  <>No organizations match these filters. <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button></>
                ) : (
                  <div className="space-y-2">
                    <Building2 className="mx-auto h-8 w-8 opacity-50" aria-hidden />
                    <div>No organizations yet.</div>
                    <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />Create Restaurant</Button>
                  </div>
                )}
              </TableCell></TableRow>
            ) : rows.map(o => {
              const s = stats[o.id];
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell><Badge variant="outline">{BUSINESS_TYPE_LABEL[o.business_type] ?? o.business_type}</Badge></TableCell>
                  <TableCell>
                    <div className="text-sm">{s?.owner_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{s?.owner_email}</div>
                  </TableCell>
                  <TableCell className="text-center">{s?.total ?? 0}</TableCell>
                  <TableCell className="text-center">{s?.active ?? 0}</TableCell>
                  <TableCell className="text-center">{s?.pending ?? 0}</TableCell>
                  <TableCell className="text-center">{s?.suspended ?? 0}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(o.created_at)}</TableCell>
                  <TableCell className="text-right space-x-2 flex justify-end">
                    <Button asChild size="sm" variant="outline">
                      <a href={`/admin/organizations/${o.id}`}>Manage</a>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteClick(o.id, o.name)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="px-3 pb-3">
          <Pager page={page} total={total} onPage={setPage} />
        </div>
      </Card>

      <CreateWizard open={createOpen} onOpenChange={setCreateOpen} onCreated={onCreated} />

      <Dialog open={!!creds} onOpenChange={o => { if (!o) setCreds(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account Credentials</DialogTitle>
            <DialogDescription>
              <b>{creds?.name}</b> was created with {creds?.outlets} outlet{creds?.outlets === 1 ? "" : "s"}. Share these credentials with the owner. They will be required to change the password on first login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Email</div>
                <div className="font-mono text-sm">{creds?.email}</div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Copy email" onClick={() => { navigator.clipboard.writeText(creds?.email || ""); toast.success("Email copied"); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Temporary password</div>
                <div className="font-mono text-sm">{creds?.password}</div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Copy password" onClick={() => { navigator.clipboard.writeText(creds?.password || ""); toast.success("Password copied"); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This password is shown only once. Copy or note it now.
          </div>
          <DialogFooter>
            <Button onClick={() => {
              navigator.clipboard.writeText(`Email: ${creds?.email}\nPassword: ${creds?.password}`);
              toast.success("Credentials copied");
            }}>
              <Copy className="mr-1 h-4 w-4" />Copy All
            </Button>
            <Button variant="outline" onClick={() => setCreds(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Organization"
        description="This will permanently delete the organization and all its outlets, orders, customers, and related data."
        itemName="organization"
        isLoading={deleteFetching}
        impact={deleteImpact}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

/* ----------------------------- Create wizard ----------------------------- */

type OutletForm = {
  name: string; outlet_code: string; address: string; city: string; state: string; pincode: string;
  contact: string; email: string; gst_number: string; opening_time: string; closing_time: string;
};
const blankOutlet = (): OutletForm => ({
  name: "", outlet_code: "", address: "", city: "", state: "", pincode: "",
  contact: "", email: "", gst_number: "", opening_time: "", closing_time: "",
});
const blankBiz = () => ({
  business_name: "", legal_name: "", owner_name: "", owner_email: "", owner_phone: "",
  country: "India", pan_number: "", gst_number: "", logo_url: "",
});

type Plan = { id: string; name: string; monthly_price: number | null; half_yearly_price: number | null; yearly_price: number | null };
const STEP_LABELS = ["Business type", "Business & owner", "Outlets", "Subscription", "Review"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CreateWizard({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (c: { email: string; password: string; name: string; outlets: number }) => void;
}) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<BusinessType | null>(null);
  const [biz, setBiz] = useState(blankBiz());
  const [single, setSingle] = useState({ address: "", city: "", state: "", pincode: "" });
  const [outlets, setOutlets] = useState<OutletForm[]>([blankOutlet()]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState("none");
  const [cycle, setCycle] = useState<"monthly" | "half_yearly" | "yearly">("monthly");
  const [activateNow, setActivateNow] = useState(false);
  const [creating, setCreating] = useState(false);

  // Fresh form every time the wizard opens; load active plans once.
  useEffect(() => {
    if (!open) return;
    setStep(1); setType(null); setBiz(blankBiz()); setSingle({ address: "", city: "", state: "", pincode: "" });
    setOutlets([blankOutlet()]); setPlanId("none"); setCycle("monthly"); setActivateNow(false);
    db.from("subscription_plans").select("id,name,monthly_price,half_yearly_price,yearly_price").eq("is_active", true).eq("is_free", false).order("monthly_price")
      .then(({ data, error }: any) => { if (error) toast.error(error.message); else setPlans(data || []); });
  }, [open]);

  const isMulti = type === "MULTI_OUTLET";
  // Single skips the Outlets step.
  const steps = useMemo(() => (isMulti ? [1, 2, 3, 4, 5] : [1, 2, 4, 5]), [isMulti]);
  const idx = steps.indexOf(step);
  const setB = (k: keyof ReturnType<typeof blankBiz>, v: string) => setBiz(b => ({ ...b, [k]: v }));
  const setO = (i: number, k: keyof OutletForm, v: string) => setOutlets(os => os.map((o, j) => j === i ? { ...o, [k]: v } : o));

  function validate(s: number): string | null {
    if (s === 1) return type ? null : "Choose a business type";
    if (s === 2) {
      if (!biz.business_name.trim()) return "Business / restaurant name is required";
      if (!biz.owner_name.trim()) return "Owner name is required";
      if (!EMAIL_RE.test(biz.owner_email.trim())) return "Enter a valid owner email";
      if (biz.owner_phone.replace(/\D/g, "").length < 10) return "Enter a 10 digit owner phone number";
      if (biz.pan_number.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(biz.pan_number.trim())) return "PAN looks invalid (e.g. ABCDE1234F)";
      if (!isMulti && !single.city.trim()) return "City is required for the restaurant address";
      return null;
    }
    if (s === 3) {
      for (let i = 0; i < outlets.length; i++) {
        const o = outlets[i];
        if (!o.name.trim()) return `Outlet ${i + 1}: name is required`;
        if (!o.city.trim()) return `Outlet ${i + 1}: city is required`;
        if (o.email.trim() && !EMAIL_RE.test(o.email.trim())) return `Outlet ${i + 1}: invalid email`;
      }
      const codes = outlets.map(o => o.outlet_code.trim().toLowerCase()).filter(Boolean);
      if (new Set(codes).size !== codes.length) return "Outlet codes must be unique";
      return null;
    }
    return null;
  }

  function next() {
    const err = validate(step);
    if (err) return toast.error(err);
    setStep(steps[idx + 1]);
  }

  // Outlets as sent to the API (single: the restaurant itself).
  function buildOutlets() {
    if (!isMulti) {
      return [{ name: biz.business_name.trim(), address: single.address.trim(), city: single.city.trim(), state: single.state.trim(), pincode: single.pincode.trim(), contact: biz.owner_phone.trim(), email: biz.owner_email.trim(), gst_number: biz.gst_number.trim() }];
    }
    return outlets.map(o => ({
      name: o.name.trim(), outlet_code: o.outlet_code.trim(), address: o.address.trim(), city: o.city.trim(),
      state: o.state.trim(), pincode: o.pincode.trim(), contact: o.contact.trim(), email: o.email.trim(),
      gst_number: o.gst_number.trim() || biz.gst_number.trim(),
      opening_time: o.opening_time || undefined, closing_time: o.closing_time || undefined,
    }));
  }

  async function create() {
    for (const s of steps) { const err = validate(s); if (err) { setStep(s); return toast.error(err); } }
    setCreating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) { toast.error("Session expired"); return; }
      const outletsPayload = buildOutlets();
      const hasPlan = planId !== "none";
      const res = await fetch("/api/admin-create-restaurant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "create_business",
          business_type: type,
          business_name: biz.business_name.trim(),
          legal_name: biz.legal_name.trim() || undefined,
          owner_name: biz.owner_name.trim(),
          owner_email: biz.owner_email.trim(),
          owner_phone: biz.owner_phone.trim(),
          country: biz.country.trim() || undefined,
          pan_number: biz.pan_number.trim().toUpperCase() || undefined,
          logo_url: biz.logo_url.trim() || undefined,
          outlets: outletsPayload,
          plan_id: hasPlan ? planId : undefined,
          billing_cycle: hasPlan ? cycle : undefined,
          activate_outlets: hasPlan || activateNow || !isMulti ? true : false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { toast.error(data.error || "Failed to create restaurant"); return; }
      toast.success(`${biz.business_name} created`);
      onCreated({ email: data.email, password: data.temp_password, name: biz.business_name, outlets: data.tenant_ids?.length ?? outletsPayload.length });
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  const planName = plans.find(p => p.id === planId)?.name;
  const activationText = planId !== "none"
    ? `Active with ${planName} (${cycle})`
    : !isMulti ? "Active (existing single-restaurant behaviour)"
    : activateNow ? "Active without a subscription (admin override)" : "Pending payment";

  return (
    <Dialog open={open} onOpenChange={o => { if (!creating) onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Restaurant</DialogTitle>
          <DialogDescription>Set up a new business, its owner account and outlets. A temporary password is generated automatically.</DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-1.5 ${s === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${i < idx ? "bg-primary text-primary-foreground border-primary" : s === step ? "border-primary" : ""}`}>
                {i < idx ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {STEP_LABELS[s - 1]}
            </li>
          ))}
        </ol>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-1">
          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { v: "SINGLE_OUTLET", t: "Single Hotel / Restaurant", d: "One restaurant with one location.", I: Store },
                { v: "MULTI_OUTLET", t: "Multiple Hotels / Restaurants / Outlets", d: "A group or chain with several outlets under one owner.", I: Building2 },
              ] as const).map(c => (
                <button key={c.v} type="button" onClick={() => setType(c.v)} aria-pressed={type === c.v}
                  className={`rounded-lg border p-5 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${type === c.v ? "border-primary ring-2 ring-primary/40 bg-primary/5" : ""}`}>
                  <c.I className="mb-2 h-6 w-6 text-primary" aria-hidden />
                  <div className="font-medium">{c.t}</div>
                  <div className="text-sm text-muted-foreground">{c.d}</div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <Field label="Business / restaurant name" req><Input value={biz.business_name} onChange={e => setB("business_name", e.target.value)} placeholder="e.g. Royal Kitchen" /></Field>
              <Field label="Legal business name"><Input value={biz.legal_name} onChange={e => setB("legal_name", e.target.value)} /></Field>
              <Field label="Owner name" req><Input value={biz.owner_name} onChange={e => setB("owner_name", e.target.value)} /></Field>
              <Field label="Owner email" req><Input type="email" value={biz.owner_email} onChange={e => setB("owner_email", e.target.value)} /></Field>
              <Field label="Owner phone" req><Input type="tel" inputMode="numeric" maxLength={10} value={biz.owner_phone} onChange={e => setB("owner_phone", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10 digit phone number" /></Field>
              <Field label="Country"><Input value={biz.country} onChange={e => setB("country", e.target.value)} /></Field>
              <Field label="PAN"><Input value={biz.pan_number} onChange={e => setB("pan_number", e.target.value.toUpperCase().slice(0, 10))} placeholder="ABCDE1234F" /></Field>
              <Field label="GST number"><Input value={biz.gst_number} onChange={e => setB("gst_number", e.target.value.toUpperCase())} /></Field>
              <div className="sm:col-span-2"><Field label="Logo URL"><Input value={biz.logo_url} onChange={e => setB("logo_url", e.target.value)} placeholder="https://…" /></Field></div>
              {!isMulti && (
                <>
                  <div className="sm:col-span-2 pt-1 text-sm font-medium">Restaurant address</div>
                  <div className="sm:col-span-2"><Field label="Address"><Input value={single.address} onChange={e => setSingle(s => ({ ...s, address: e.target.value }))} /></Field></div>
                  <Field label="City" req><Input value={single.city} onChange={e => setSingle(s => ({ ...s, city: e.target.value }))} /></Field>
                  <Field label="State"><Input value={single.state} onChange={e => setSingle(s => ({ ...s, state: e.target.value }))} /></Field>
                  <Field label="Pincode"><Input value={single.pincode} onChange={e => setSingle(s => ({ ...s, pincode: e.target.value }))} /></Field>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {outlets.map((o, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Outlet {i + 1}</div>
                    {outlets.length > 1 && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setOutlets(os => os.filter((_, j) => j !== i))}>
                        <Trash2 className="mr-1 h-4 w-4" />Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    <Field label="Outlet name" req><Input value={o.name} onChange={e => setO(i, "name", e.target.value)} /></Field>
                    <Field label="Outlet code"><Input value={o.outlet_code} onChange={e => setO(i, "outlet_code", e.target.value)} placeholder="e.g. MUM-01" /></Field>
                    <div className="sm:col-span-2"><Field label="Address"><Input value={o.address} onChange={e => setO(i, "address", e.target.value)} /></Field></div>
                    <Field label="City" req><Input value={o.city} onChange={e => setO(i, "city", e.target.value)} /></Field>
                    <Field label="State"><Input value={o.state} onChange={e => setO(i, "state", e.target.value)} /></Field>
                    <Field label="Pincode"><Input value={o.pincode} onChange={e => setO(i, "pincode", e.target.value)} /></Field>
                    <Field label="Contact number"><Input type="tel" value={o.contact} onChange={e => setO(i, "contact", e.target.value)} /></Field>
                    <Field label="Email"><Input type="email" value={o.email} onChange={e => setO(i, "email", e.target.value)} /></Field>
                    <Field label="GST number"><Input value={o.gst_number} onChange={e => setO(i, "gst_number", e.target.value.toUpperCase())} placeholder={biz.gst_number || "Uses organization GST if blank"} /></Field>
                    <Field label="Opening time"><Input type="time" value={o.opening_time} onChange={e => setO(i, "opening_time", e.target.value)} /></Field>
                    <Field label="Closing time"><Input type="time" value={o.closing_time} onChange={e => setO(i, "closing_time", e.target.value)} /></Field>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setOutlets(os => [...os, blankOutlet()])}>
                <Plus className="mr-1 h-4 w-4" />Add another outlet
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Subscription plan (optional)">
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No plan</SelectItem>
                      {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {planId !== "none" && (
                  <Field label="Billing cycle">
                    <Select value={cycle} onValueChange={v => setCycle(v as "monthly" | "half_yearly" | "yearly")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="half_yearly">Half-yearly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
              {planId !== "none" ? (
                <p className="text-sm text-muted-foreground">Every outlet will be created Active with its own {cycle} subscription to this plan.</p>
              ) : isMulti ? (
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={activateNow} onCheckedChange={v => setActivateNow(v === true)} className="mt-0.5" />
                    <span>Activate outlets now without a subscription (admin override)</span>
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Without a plan, outlets start as Pending payment and stay inactive (customer QR codes will not work) until a subscription is added or payment is recorded.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Single restaurants are created Active, as before. You can add a subscription later from the organization page.</p>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border p-3 space-y-1">
                <div className="font-medium">{biz.business_name} <Badge variant="outline" className="ml-1">{type ? BUSINESS_TYPE_LABEL[type] : ""}</Badge></div>
                {biz.legal_name && <div className="text-muted-foreground">Legal name: {biz.legal_name}</div>}
                <div className="text-muted-foreground">Owner: {biz.owner_name} · {biz.owner_email} · {biz.owner_phone}</div>
                <div className="text-muted-foreground">{biz.country}{biz.pan_number ? ` · PAN ${biz.pan_number}` : ""}{biz.gst_number ? ` · GST ${biz.gst_number}` : ""}</div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="font-medium">{buildOutlets().length} outlet{buildOutlets().length === 1 ? "" : "s"}</div>
                {buildOutlets().map((o, i) => (
                  <div key={i} className="text-muted-foreground">
                    {o.name}{"outlet_code" in o && o.outlet_code ? ` (${o.outlet_code})` : ""} — {[o.city, o.state].filter(Boolean).join(", ") || "no location"}
                  </div>
                ))}
              </div>
              <div className="rounded-lg border p-3">
                <span className="font-medium">Activation: </span>{activationText}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating} className="w-full sm:w-auto">Cancel</Button>
          {idx > 0 && <Button variant="outline" onClick={() => setStep(steps[idx - 1])} disabled={creating} className="w-full sm:w-auto">Back</Button>}
          {step < 5 ? (
            <Button onClick={next} className="w-full sm:w-auto">Next</Button>
          ) : (
            <Button onClick={create} disabled={creating} className="w-full sm:w-auto">
              {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : "Create Restaurant"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}{req && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}
