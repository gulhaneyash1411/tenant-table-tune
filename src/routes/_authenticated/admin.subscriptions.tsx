import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronsUpDown, CreditCard, Download, MoreHorizontal, Plus, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ADMIN_PAGE_SIZE, Pager, StatusBadge, adminRpc, fmtDate, fmtMoney, likeTerm, useDebounced,
} from "@/components/admin/admin-ui";
import { downloadSubscriptionInvoicePdf } from "@/lib/invoice-pdf";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({ component: AdminSubscriptions });

// The generated Supabase types predate the multi-outlet tables, so this page talks to the client untyped.
const sb = supabase as any;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 400; // cap on id lists pushed into a URL filter
const DAY = 86_400_000;

type Plan = { id: string; name: string; monthly_price: number | null; yearly_price: number | null };
type SubRow = {
  id: string; tenant_id: string; plan_id: string | null; status: string;
  current_period_start: string | null; current_period_end: string | null; created_at: string;
  tenants: {
    id: string; name: string; city: string | null; state: string | null; outlet_status: string;
    organization_id: string | null; organizations: { name: string } | null;
  };
  subscription_plans: { name: string; monthly_price: number | null; yearly_price: number | null } | null;
};
type Opt = { id: string; label: string };

const STATUS_OPTIONS: [string, string][] = [
  ["active", "Active"], ["exp7", "Expiring ≤ 7 days"], ["exp15", "Expiring ≤ 15 days"], ["expiring", "Expiring ≤ 30 days"],
  ["expired", "Expired"], ["paused", "Suspended"], ["canceled", "Cancelled"], ["trialing", "Trial"], ["scheduled", "Scheduled"],
];
const SORTS: Record<string, { label: string; col: string; asc: boolean; tenant?: boolean }> = {
  expiry_asc: { label: "Expiry (soonest)", col: "current_period_end", asc: true },
  expiry_desc: { label: "Expiry (latest)", col: "current_period_end", asc: false },
  start_desc: { label: "Start (newest)", col: "current_period_start", asc: false },
  start_asc: { label: "Start (oldest)", col: "current_period_start", asc: true },
  status_asc: { label: "Status", col: "status", asc: true },
  outlet_asc: { label: "Outlet A–Z", col: "name", asc: true, tenant: true },
};
const UNPAID_INVOICE = ["issued", "pending", "pending_approval", "partially_paid", "overdue"];

// Invoice amount helper functions
const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function invoiceFigures(r: any) {
  const total = n(r.amount);

  // For subscription invoices: ALWAYS use total as subtotal (no tax breakdowns)
  // Ignore any tax or old subtotal values in the database
  const subtotal = total;

  const paid = r.status === "paid" && !n(r.amount_paid) ? total : n(r.amount_paid);
  const balance = Math.max(0, r2(total - paid));

  return {
    total,
    subtotal,
    discount: 0,  // No discounts for subscription invoices
    cgst: 0,      // No tax for subscription invoices
    sgst: 0,      // No tax for subscription invoices
    igst: 0,      // No tax for subscription invoices
    paid,
    balance
  };
}

function formatInvoiceForPdf(invoiceData: any): any {
  const f = invoiceFigures(invoiceData);
  const addr = invoiceData.billing_address ||
    [invoiceData.tenants?.address, invoiceData.tenants?.city, invoiceData.tenants?.state]
      .filter(Boolean).join(", ");
  return {
    invoice_number: invoiceData.invoice_number,
    status: invoiceData.status,
    issued_at: invoiceData.issued_at,
    due_date: invoiceData.due_date,
    organization_name: invoiceData.tenants?.organizations?.name ?? null,
    outlet_name: invoiceData.tenants?.name ?? null,
    billing_address: addr || null,
    gst_number: invoiceData.gst_number || invoiceData.tenants?.gst_number || null,
    description: invoiceData.description,
    notes: invoiceData.notes,
    plan: invoiceData.plan,
    billing_cycle: invoiceData.billing_cycle,
    period_start: invoiceData.period_start,
    period_end: invoiceData.period_end,
    line_items: Array.isArray(invoiceData.line_items) ? invoiceData.line_items : [],
    subtotal: f.subtotal,
    discount: f.discount,
    cgst: f.cgst,
    sgst: f.sgst,
    igst: f.igst,
    total: f.total,
    amount_paid: f.paid,
    balance: f.balance,
  };
}

const periodDays = (s: SubRow) =>
  s.current_period_start && s.current_period_end
    ? (new Date(s.current_period_end).getTime() - new Date(s.current_period_start).getTime()) / DAY
    : 0;
const cycleOf = (s: SubRow) => (periodDays(s) > 200 ? "yearly" : "monthly");
const amountOf = (s: SubRow) =>
  cycleOf(s) === "yearly" ? s.subscription_plans?.yearly_price : s.subscription_plans?.monthly_price;
/** Stored status, but an "active" subscription is shown as EXPIRING (<= 30 days left) or expired (lapsed). */
function displayStatus(s: SubRow) {
  if (s.status !== "active" || !s.current_period_end) return s.status;
  const left = new Date(s.current_period_end).getTime() - Date.now();
  if (left < 0) return "expired";
  return left <= 30 * DAY ? "EXPIRING" : "active";
}

function SearchSelect({
  value, valueLabel, onChange, load, placeholder, allLabel,
}: {
  value: string; valueLabel?: string; onChange: (id: string, label: string) => void;
  load: (search: string) => Promise<Opt[]>; placeholder: string; allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dq = useDebounced(search, 250);
  const [opts, setOpts] = useState<Opt[]>([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    load(dq).then((o) => alive && setOpts(o)).catch(() => alive && setOpts([]));
    return () => { alive = false; };
  }, [open, dq, load]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{value ? valueLabel || "Selected" : allLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No matches</CommandEmpty>
            {allLabel && (
              <CommandItem value="__all" onSelect={() => { onChange("", ""); setOpen(false); }}>{allLabel}</CommandItem>
            )}
            {opts.map((o) => (
              <CommandItem key={o.id} value={o.id} onSelect={() => { onChange(o.id, o.label); setOpen(false); }}>
                <Check className={`mr-2 h-4 w-4 ${o.id === value ? "opacity-100" : "opacity-0"}`} />
                {o.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const loadOrgs = async (s: string): Promise<Opt[]> => {
  let q = sb.from("organizations").select("id,name").order("name").limit(200);
  const t = likeTerm(s);
  if (t) q = q.ilike("name", `%${t}%`);
  const { data } = await q;
  return (data ?? []).map((o: any) => ({ id: o.id, label: o.name }));
};
const loadOutlets = async (s: string): Promise<Opt[]> => {
  let q = sb.from("tenants").select("id,name,city,organizations(name)").order("name").limit(30);
  const t = likeTerm(s);
  if (t) q = q.ilike("name", `%${t}%`);
  const { data } = await q;
  return (data ?? []).map((o: any) => ({
    id: o.id,
    label: `${o.name}${o.organizations?.name ? ` · ${o.organizations.name}` : ""}${o.city ? ` (${o.city})` : ""}`,
  }));
};

type Action = { type: "activate" | "suspend" | "cancel" | "extend" | "renew" | "payments" | "invoices"; sub: SubRow };

function AdminSubscriptions() {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    sb.from("subscription_plans").select("id,name,monthly_price,yearly_price").order("monthly_price").then(({ data }: any) => setPlans(data ?? []));
  }, []);

  // filters
  const [search, setSearch] = useState("");
  const dSearch = useDebounced(search);
  const [org, setOrg] = useState({ id: "", label: "" });
  const [outletQ, setOutletQ] = useState("");
  const dOutlet = useDebounced(outletQ);
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [cycle, setCycle] = useState("all");
  const [payment, setPayment] = useState("all");
  const [startFrom, setStartFrom] = useState("");
  const [startTo, setStartTo] = useState("");
  const [endFrom, setEndFrom] = useState("");
  const [endTo, setEndTo] = useState("");
  const [sort, setSort] = useState("expiry_asc");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<SubRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);
  const [attn, setAttn] = useState<Record<string, number | undefined>>({});

  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sweepOpen, setSweepOpen] = useState(false);

  useEffect(() => { setPage(1); }, [dSearch, org.id, dOutlet, plan, status, cycle, payment, startFrom, startTo, endFrom, endTo, sort]);

  // "requiring attention" counts (head-only queries)
  useEffect(() => {
    (async () => {
      const now = new Date().toISOString();
      const within = (d: number) =>
        sb.from("subscriptions").select("id", { count: "exact", head: true })
          .eq("status", "active").gte("current_period_end", now).lte("current_period_end", new Date(Date.now() + d * DAY).toISOString());
      const [a, b, c, d, e] = await Promise.all([
        within(7), within(15), within(30),
        sb.from("subscriptions").select("id", { count: "exact", head: true })
          .or(`status.eq.expired,and(status.eq.active,current_period_end.lt.${now})`),
        sb.from("tenants").select("id", { count: "exact", head: true }).eq("outlet_status", "PENDING_PAYMENT"),
      ]);
      setAttn({ exp7: a.count ?? 0, exp15: b.count ?? 0, expiring: c.count ?? 0, expired: d.count ?? 0, pending: e.count ?? 0 });
    })();
  }, [reloadKey]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let q = sb
          .from("subscriptions")
          .select(
            "id,tenant_id,plan_id,status,current_period_start,current_period_end,created_at," +
            "tenants!inner(id,name,city,state,outlet_status,organization_id,organizations(name))," +
            "subscription_plans(name,monthly_price,yearly_price)",
            { count: "exact" },
          );
        const now = new Date().toISOString();
        const within = (d: number) =>
          q.eq("status", "active").gte("current_period_end", now).lte("current_period_end", new Date(Date.now() + d * DAY).toISOString());

        if (org.id) q = q.eq("tenants.organization_id", org.id);
        if (dOutlet.trim()) q = q.ilike("tenants.name", `%${likeTerm(dOutlet)}%`);
        if (plan !== "all") q = q.eq("plan_id", plan);
        if (startFrom) q = q.gte("current_period_start", `${startFrom}T00:00:00`);
        if (startTo) q = q.lte("current_period_start", `${startTo}T23:59:59`);
        if (endFrom) q = q.gte("current_period_end", `${endFrom}T00:00:00`);
        if (endTo) q = q.lte("current_period_end", `${endTo}T23:59:59`);

        switch (status) {
          case "active": q = q.eq("status", "active").gte("current_period_end", now); break;
          case "exp7": q = within(7); break;
          case "exp15": q = within(15); break;
          case "expiring": q = within(30); break;
          case "expired": q = q.or(`status.eq.expired,and(status.eq.active,current_period_end.lt.${now})`); break;
          case "all": break;
          default: q = q.eq("status", status);
        }

        // payment status of the outlet's latest invoice -> resolve to outlet ids
        if (payment !== "all") {
          const { data } = await sb.from("invoices").select("tenant_id,status,issued_at")
            .not("tenant_id", "is", null).order("issued_at", { ascending: false }).limit(2000);
          const latest = new Map<string, string>();
          for (const r of data ?? []) {
            if (["draft", "cancelled", "rejected", "free_trial"].includes(r.status)) continue;
            if (!latest.has(r.tenant_id)) latest.set(r.tenant_id, r.status);
          }
          const ids = [...latest].filter(([, s]) => (payment === "paid" ? s === "paid" : UNPAID_INVOICE.includes(s))).map(([id]) => id);
          q = q.in("tenant_id", ids.length ? ids.slice(0, MAX_IDS) : [ZERO_UUID]);
        }

        // search: organization / outlet / owner (resolved to outlet ids) or subscription id
        const t = likeTerm(dSearch);
        if (t) {
          const { data: orgs } = await sb.from("organizations").select("id").ilike("name", `%${t}%`).limit(50);
          const parts = [`name.ilike.%${t}%`, `owner_name.ilike.%${t}%`, `owner_email.ilike.%${t}%`];
          if (orgs?.length) parts.push(`organization_id.in.(${orgs.map((o: any) => o.id).join(",")})`);
          const { data: tn } = await sb.from("tenants").select("id").or(parts.join(",")).limit(MAX_IDS);
          const or: string[] = [];
          if (tn?.length) or.push(`tenant_id.in.(${tn.map((x: any) => x.id).join(",")})`);
          if (UUID_RE.test(t)) or.push(`id.eq.${t}`);
          q = q.or(or.length ? or.join(",") : `id.eq.${ZERO_UUID}`);
        }

        const s = SORTS[sort];
        const f = (page - 1) * ADMIN_PAGE_SIZE;
        q = s.tenant ? q.order(s.col, { ascending: s.asc, referencedTable: "tenants" }) : q.order(s.col, { ascending: s.asc, nullsFirst: false });
        const { data, count, error: err } = await q.range(f, f + ADMIN_PAGE_SIZE - 1);
        if (err) throw err;
        if (!alive) return;
        setRows((data ?? []) as SubRow[]);
        setTotal(count ?? 0);
      } catch (e: any) {
        if (alive) { setError(e?.message || "Failed to load subscriptions"); setRows([]); setTotal(0); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [dSearch, org.id, dOutlet, plan, status, payment, startFrom, startTo, endFrom, endTo, sort, page, reloadKey]);

  // billing cycle is derived from the period length, so it can only be filtered within the loaded page
  const shown = cycle === "all" ? rows : rows.filter((r) => cycleOf(r) === cycle);

  const filtersActive = !!(search || org.id || outletQ || plan !== "all" || status !== "all" || cycle !== "all" || payment !== "all" || startFrom || startTo || endFrom || endTo);
  const clearFilters = () => {
    setSearch(""); setOrg({ id: "", label: "" }); setOutletQ(""); setPlan("all"); setStatus("all"); setCycle("all");
    setPayment("all"); setStartFrom(""); setStartTo(""); setEndFrom(""); setEndTo("");
  };

  const setSubStatus = async (next: "active" | "paused" | "canceled", msg: string) => {
    if (!action) return;
    setBusy(true);
    try {
      await adminRpc(sb, "admin_set_subscription_status", { p_subscription_id: action.sub.id, p_status: next });
      toast.success(msg);
      setAction(null); reload();
    } catch (e: any) {
      toast.error(e.message || "Could not update subscription");
    } finally { setBusy(false); }
  };

  const runSweep = async () => {
    setBusy(true);
    try {
      const n = await adminRpc<number>(sb, "admin_sweep_expired_outlets", {});
      toast.success(`Expiry check done: ${n ?? 0} outlet${n === 1 ? "" : "s"} suspended`);
      setSweepOpen(false); reload();
    } catch (e: any) {
      toast.error(e.message || "Expiry check failed");
    } finally { setBusy(false); }
  };

  const cards: { key: string; label: string; tone: string }[] = [
    { key: "exp7", label: "Expiring in 7 days", tone: "text-red-600" },
    { key: "exp15", label: "Expiring in 15 days", tone: "text-amber-600" },
    { key: "expiring", label: "Expiring in 30 days", tone: "text-amber-600" },
    { key: "expired", label: "Expired", tone: "text-red-600" },
    { key: "pending", label: "Outlets pending payment", tone: "text-sky-600" },
  ];

  const confirmCopy = action && {
    activate: { title: "Activate subscription", text: "The subscription and its outlet become active.", btn: "Activate" },
    suspend: { title: "Suspend subscription", text: "The subscription is paused and the outlet is suspended: customers cannot order until it is reactivated.", btn: "Suspend" },
    cancel: { title: "Cancel subscription", text: "The subscription is cancelled and the outlet is marked cancelled.", btn: "Cancel subscription" },
  }[action.type as "activate" | "suspend" | "cancel"];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">Outlet-wise subscriptions across all organizations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSweepOpen(true)}><RefreshCw className="mr-1 h-4 w-4" /> Run expiry check</Button>
          <Button onClick={() => setAddOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add subscription</Button>
        </div>
      </div>

      {/* requiring attention */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-amber-600" /> Subscriptions requiring attention</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {cards.map((c) => {
            const body = (
              <>
                <div className={`text-2xl font-semibold ${c.tone}`}>{attn[c.key] ?? "…"}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </>
            );
            const cls = `rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted ${status === c.key ? "border-primary ring-1 ring-primary" : ""}`;
            // Pending-payment outlets have no subscription yet, so that card opens the outlets list instead.
            return c.key === "pending"
              ? <a key={c.key} href="/admin/outlets?status=PENDING_PAYMENT" className={cls}>{body}</a>
              : <button key={c.key} className={cls} onClick={() => setStatus(status === c.key ? "all" : c.key)}>{body}</button>;
          })}
        </div>
      </div>

      <Card className="space-y-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search organization, outlet, owner or subscription id…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchSelect value={org.id} valueLabel={org.label} onChange={(id, label) => setOrg({ id, label })} load={loadOrgs} placeholder="Search organization…" allLabel="All organizations" />
          <Input placeholder="Outlet name" value={outletQ} onChange={(e) => setOutletQ(e.target.value)} />
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any plan</SelectItem>
              {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {STATUS_OPTIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cycle} onValueChange={setCycle}>
            <SelectTrigger><SelectValue placeholder="Billing cycle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any billing cycle</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
          <Select value={payment} onValueChange={setPayment}>
            <SelectTrigger><SelectValue placeholder="Payment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any payment status</SelectItem>
              <SelectItem value="paid">Latest invoice paid</SelectItem>
              <SelectItem value="unpaid">Latest invoice unpaid</SelectItem>
            </SelectContent>
          </Select>
          {/* Each range spans two columns so both date pickers have room to render in full. */}
          <div className="min-w-0 space-y-1 sm:col-span-2">
            <div className="text-xs text-muted-foreground">Start date</div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Input type="date" aria-label="Start from" className="min-w-0" value={startFrom} onChange={(e) => setStartFrom(e.target.value)} />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" aria-label="Start to" className="min-w-0" value={startTo} onChange={(e) => setStartTo(e.target.value)} />
            </div>
          </div>
          <div className="min-w-0 space-y-1 sm:col-span-2">
            <div className="text-xs text-muted-foreground">Expiry date</div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Input type="date" aria-label="Expiry from" className="min-w-0" value={endFrom} onChange={(e) => setEndFrom(e.target.value)} />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" aria-label="Expiry to" className="min-w-0" value={endTo} onChange={(e) => setEndTo(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SORTS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="mr-1 h-4 w-4" /> Clear filters</Button>}
        </div>
      </Card>

      <Card className="p-2 sm:p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start date</TableHead>
              <TableHead>Next billing / expiry</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 9 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            ))}
            {!loading && error && (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-destructive">
                {error} <Button variant="link" onClick={reload}>Retry</Button>
              </TableCell></TableRow>
            )}
            {!loading && !error && shown.length === 0 && (
              <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                <CreditCard className="mx-auto mb-2 h-8 w-8 opacity-40" />
                {filtersActive ? "No subscriptions match these filters." : "No subscriptions yet."}
              </TableCell></TableRow>
            )}
            {!loading && !error && shown.map((s) => {
              const amt = amountOf(s);
              return (
                <TableRow key={s.id}>
                  <TableCell>{s.tenants.organizations?.name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="font-medium">{s.tenants.name}</div>
                    <div className="text-xs text-muted-foreground">{[s.tenants.city, s.tenants.state].filter(Boolean).join(", ")}</div>
                  </TableCell>
                  <TableCell>{s.subscription_plans?.name ?? "—"}</TableCell>
                  <TableCell>{amt == null ? "—" : fmtMoney(amt)}</TableCell>
                  <TableCell className="capitalize">{s.current_period_end ? cycleOf(s) : "—"}</TableCell>
                  <TableCell><StatusBadge status={displayStatus(s)} /></TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(s.current_period_start)}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(s.current_period_end)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Row actions"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {s.status !== "active" && <DropdownMenuItem onClick={() => setAction({ type: "activate", sub: s })}>Activate</DropdownMenuItem>}
                        {s.status !== "paused" && <DropdownMenuItem onClick={() => setAction({ type: "suspend", sub: s })}>Suspend</DropdownMenuItem>}
                        {s.status !== "canceled" && <DropdownMenuItem className="text-destructive" onClick={() => setAction({ type: "cancel", sub: s })}>Cancel</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setAction({ type: "extend", sub: s })}>Extend…</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAction({ type: "renew", sub: s })}>Renew / change plan…</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setAction({ type: "payments", sub: s })}>View payments</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAction({ type: "invoices", sub: s })}>View invoices</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {cycle !== "all" && <p className="px-1 pt-2 text-xs text-muted-foreground">Billing-cycle filter applies to the rows on this page only.</p>}
        <Pager page={page} total={total} onPage={setPage} />
      </Card>

      {/* activate / suspend / cancel confirm */}
      <AlertDialog open={!!confirmCopy} onOpenChange={(o) => !o && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{action?.sub.tenants.name}</b>. {confirmCopy?.text}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (action?.type === "activate") setSubStatus("active", "Subscription activated");
                else if (action?.type === "suspend") setSubStatus("paused", "Subscription suspended");
                else setSubStatus("canceled", "Subscription cancelled");
              }}
            >
              {busy ? "Working…" : confirmCopy?.btn}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* expiry sweep confirm */}
      <AlertDialog open={sweepOpen} onOpenChange={setSweepOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run expiry check</AlertDialogTitle>
            <AlertDialogDescription>
              This suspends every outlet whose subscription has lapsed, for multi-outlet organizations. Single-restaurant accounts are not touched. Suspended outlets stop taking orders until renewed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); runSweep(); }}>{busy ? "Running…" : "Run check"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExtendDialog sub={action?.type === "extend" ? action.sub : null} onClose={() => setAction(null)} onDone={reload} />
      <PlanDialog
        key={action?.type === "renew" ? action.sub.id : "none"}
        title="Renew / change plan" plans={plans}
        outlet={action?.type === "renew" ? { id: action.sub.tenant_id, label: action.sub.tenants.name } : null}
        defaultPlan={action?.sub.plan_id ?? ""} onClose={() => setAction(null)} onDone={reload}
      />
      <AddSubscriptionDialog open={addOpen} plans={plans} onClose={() => setAddOpen(false)} onDone={reload} />
      <HistorySheet action={action?.type === "payments" || action?.type === "invoices" ? (action as Action) : null} onClose={() => setAction(null)} />
    </div>
  );
}

function ExtendDialog({ sub, onClose, onDone }: { sub: SubRow | null; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (sub) setDays("30"); }, [sub]);
  const n = Number(days);
  const submit = async () => {
    if (!sub || !Number.isInteger(n) || n <= 0) return toast.error("Enter a whole number of days");
    setBusy(true);
    try {
      await adminRpc(sb, "admin_extend_subscription", { p_subscription_id: sub.id, p_days: n });
      toast.success(`Extended by ${n} days`);
      onClose(); onDone();
    } catch (e: any) {
      toast.error(e.message || "Could not extend subscription");
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!sub} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend subscription</DialogTitle>
          <DialogDescription>{sub?.tenants.name} — currently runs until {fmtDate(sub?.current_period_end)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="days">Days to add</Label>
          <Input id="days" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Extend"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Plan + cycle dialog for an outlet that is already known (renew / change plan). */
function PlanDialog({
  title, outlet, plans, defaultPlan, onClose, onDone,
}: {
  title: string; outlet: { id: string; label: string } | null; plans: Plan[]; defaultPlan: string;
  onClose: () => void; onDone: () => void;
}) {
  const [planId, setPlanId] = useState(defaultPlan);
  const [cycle, setCycle] = useState("monthly");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!outlet || !planId) return;
    setBusy(true);
    try {
      await adminRpc(sb, "admin_create_subscription", { p_tenant_id: outlet.id, p_plan_id: planId, p_cycle: cycle, p_activate: true });
      toast.success("Subscription updated");
      onClose(); onDone();
    } catch (e: any) {
      toast.error(e.message || "Could not update subscription");
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!outlet} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{outlet?.label} — a running subscription is extended by one cycle of the chosen plan.</DialogDescription>
        </DialogHeader>
        <PlanFields plans={plans} planId={planId} setPlanId={setPlanId} cycle={cycle} setCycle={setCycle} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !planId}>{busy ? "Saving…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanFields({
  plans, planId, setPlanId, cycle, setCycle,
}: { plans: Plan[]; planId: string; setPlanId: (v: string) => void; cycle: string; setCycle: (v: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Plan</Label>
        <Select value={planId} onValueChange={setPlanId}>
          <SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
          <SelectContent>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name} — {fmtMoney(p.monthly_price)}/mo · {fmtMoney(p.yearly_price)}/yr</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Billing cycle</Label>
        <Select value={cycle} onValueChange={setCycle}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AddSubscriptionDialog({ open, plans, onClose, onDone }: { open: boolean; plans: Plan[]; onClose: () => void; onDone: () => void }) {
  const [outlet, setOutlet] = useState({ id: "", label: "" });
  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [activate, setActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setOutlet({ id: "", label: "" }); setPlanId(""); setCycle("monthly"); setActivate(true); } }, [open]);
  const submit = async () => {
    if (!outlet.id || !planId) return toast.error("Choose an outlet and a plan");
    setBusy(true);
    try {
      await adminRpc(sb, "admin_create_subscription", { p_tenant_id: outlet.id, p_plan_id: planId, p_cycle: cycle, p_activate: activate });
      toast.success("Subscription created");
      onClose(); onDone();
    } catch (e: any) {
      toast.error(e.message || "Could not create subscription");
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add subscription</DialogTitle>
          <DialogDescription>Create a subscription for an outlet.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Outlet</Label>
            <SearchSelect value={outlet.id} valueLabel={outlet.label} onChange={(id, label) => setOutlet({ id, label })} load={loadOutlets} placeholder="Search outlet…" />
          </div>
          <PlanFields plans={plans} planId={planId} setPlanId={setPlanId} cycle={cycle} setCycle={setCycle} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={activate} onCheckedChange={(v) => setActivate(v === true)} /> Activate the outlet
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Side sheet listing an outlet's payments or invoices. */
function HistorySheet({ action, onClose }: { action: Action | null; onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tenantId = action?.sub.tenant_id;
  const kind = action?.type;
  useEffect(() => {
    if (!tenantId || !kind) return;
    let alive = true;
    setLoading(true); setError(null); setItems([]);
    const req = kind === "payments"
      ? sb.from("payments").select("id,amount,method,status,reference,paid_at,invoices(invoice_number)").eq("tenant_id", tenantId).order("paid_at", { ascending: false }).limit(50)
      : sb.from("invoices").select("id,invoice_number,status,amount,issued_at,due_date").eq("tenant_id", tenantId).order("issued_at", { ascending: false }).limit(50);
    req.then(({ data, error: err }: any) => {
      if (!alive) return;
      if (err) setError(err.message); else setItems(data ?? []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [tenantId, kind]);

  return (
    <Sheet open={!!action} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{kind === "payments" ? "Payments" : "Invoices"}</SheetTitle>
          <SheetDescription>{action?.sub.tenants.name}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded for this outlet yet.</p>}
          {items.map((it) => kind === "payments" ? (
            <div key={it.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{fmtMoney(it.amount)}</span>
                <StatusBadge status={it.status} />
              </div>
              <div className="text-xs text-muted-foreground">
                {fmtDate(it.paid_at)} · {String(it.method ?? "").replace("_", " ")}
                {it.invoices?.invoice_number ? ` · ${it.invoices.invoice_number}` : ""}
                {it.reference ? ` · ref ${it.reference}` : ""}
              </div>
            </div>
          ) : (
            <div key={it.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium flex-1">{it.invoice_number || "Draft invoice"}</span>
                <StatusBadge status={it.status} />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  title="Download as PDF"
                  onClick={async () => {
                    try {
                      toast.loading("Generating PDF...");
                      const { data } = await sb.from("invoices").select("*,tenants(name,address,city,state,gst_number,organizations(name))").eq("id", it.id).single();
                      if (!data) throw new Error("Invoice not found");
                      const formattedData = formatInvoiceForPdf(data);
                      await downloadSubscriptionInvoicePdf(formattedData);
                      toast.dismiss();
                      toast.success("Invoice downloaded");
                    } catch (e) {
                      toast.dismiss();
                      toast.error(`Failed to download: ${e instanceof Error ? e.message : "Unknown error"}`);
                    }
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {fmtMoney(it.amount)} · issued {fmtDate(it.issued_at)}{it.due_date ? ` · due ${fmtDate(it.due_date)}` : ""}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
