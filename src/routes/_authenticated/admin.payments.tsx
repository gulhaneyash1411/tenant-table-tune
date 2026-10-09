import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Search, X, SlidersHorizontal, ChevronDown, ChevronUp, ArrowUp, ArrowDown, MoreHorizontal, Check, Ban, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ADMIN_PAGE_SIZE, Pager, StatusBadge, adminRpc, fmtDate, fmtMoney, likeTerm, useDebounced } from "@/components/admin/admin-ui";
import { approvePendingInvoice, rejectPendingInvoice, type PendingInvoice as ApprovalInvoice } from "@/lib/invoice-approval";
import { downloadInvoiceById } from "@/lib/invoice-download";

const db = supabase as any;

type Org = { id: string; name: string };
type Outlet = { id: string; name: string };
type PaymentRow = {
  id: string;
  tenant_id: string | null;
  organization_id: string | null;
  invoice_id: string | null;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  paid_at: string | null;
  created_at: string;
  recorded_by: string | null;
  invoices?: { invoice_number: string | null } | null;
  tenants?: { name: string; organization_id: string | null; organizations?: { name: string } | null } | null;
};

const METHODS: [string, string][] = [
  ["bank_transfer", "Bank transfer"], ["cash", "Cash"], ["upi", "UPI"], ["cheque", "Cheque"], ["other", "Other"],
];
const METHOD_LABEL: Record<string, string> = { ...Object.fromEntries(METHODS), online: "Online" };
const todayStr = () => format(new Date(), "yyyy-MM-dd");
const dayStartIso = (s: string) => new Date(`${s}T00:00:00`).toISOString();
const dayEndIso = (s: string) => new Date(`${s}T23:59:59.999`).toISOString();

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function PaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [people, setPeople] = useState<Record<string, string>>({});

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [filterOutlets, setFilterOutlets] = useState<Outlet[]>([]);

  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [orgId, setOrgId] = useState("all");
  const [outletId, setOutletId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const dMin = useDebounced(minAmt);
  const dMax = useDebounced(maxAmt);
  const [sortKey, setSortKey] = useState("paid_at");
  const [asc, setAsc] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    db.from("organizations").select("id, name").order("name").limit(1000).then(({ data }: any) => setOrgs(data ?? []));
  }, []);

  useEffect(() => {
    setOutletId("all");
    if (orgId === "all") { setFilterOutlets([]); return; }
    db.from("tenants").select("id, name").eq("organization_id", orgId).order("name").limit(500)
      .then(({ data }: any) => setFilterOutlets(data ?? []));
  }, [orgId]);

  useEffect(() => { setPage(1); }, [dq, method, status, orgId, outletId, from, to, dMin, dMax, sortKey, asc]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const term = likeTerm(dq);
      // Search reference directly; invoice number / outlet / organization are
      // resolved to ids first so one OR can cover them all.
      const conds: string[] = [];
      if (term) {
        conds.push(`reference.ilike.%${term}%`);
        const [inv, ten, org] = await Promise.all([
          db.from("invoices").select("id").ilike("invoice_number", `%${term}%`).limit(100),
          db.from("tenants").select("id").ilike("name", `%${term}%`).limit(200),
          db.from("organizations").select("id").ilike("name", `%${term}%`).limit(100),
        ]);
        const ids = (r: any) => (r.data ?? []).map((x: any) => x.id);
        if (ids(inv).length) conds.push(`invoice_id.in.(${ids(inv).join(",")})`);
        if (ids(ten).length) conds.push(`tenant_id.in.(${ids(ten).join(",")})`);
        if (ids(org).length) conds.push(`organization_id.in.(${ids(org).join(",")})`);
      }

      const embed = orgId !== "all" ? "tenants!inner" : "tenants";
      let query = db
        .from("payments")
        .select(`*, invoices(invoice_number), ${embed}(name, organization_id, organizations(name))`, { count: "exact" });
      if (conds.length) query = query.or(conds.join(","));
      if (method !== "all") query = query.eq("method", method);
      if (status !== "all") query = query.eq("status", status);
      if (orgId !== "all") query = query.eq("tenants.organization_id", orgId);
      if (outletId !== "all") query = query.eq("tenant_id", outletId);
      if (from) query = query.gte("paid_at", dayStartIso(from));
      if (to) query = query.lte("paid_at", dayEndIso(to));
      if (dMin !== "" && !isNaN(Number(dMin))) query = query.gte("amount", Number(dMin));
      if (dMax !== "" && !isNaN(Number(dMax))) query = query.lte("amount", Number(dMax));

      const start = (page - 1) * ADMIN_PAGE_SIZE;
      const { data, error: err, count } = await query
        .order(sortKey, { ascending: asc, nullsFirst: false })
        .range(start, start + ADMIN_PAGE_SIZE - 1);
      if (err) throw new Error(err.message);
      const list: PaymentRow[] = data ?? [];
      setRows(list);
      setTotal(count ?? 0);

      // recorded_by -> profile names for this page only
      const ids = Array.from(new Set(list.map((p) => p.recorded_by).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await db.from("profiles").select("id, full_name, email").in("id", ids);
        setPeople(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name || p.email || p.id.slice(0, 8)])));
      }
    } catch (e: any) {
      setError(e.message ?? "Could not load payments");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dq, method, status, orgId, outletId, from, to, dMin, dMax, sortKey, asc, page]);

  useEffect(() => { load(); }, [load]);

  const activeFilters =
    (method !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0) + (orgId !== "all" ? 1 : 0) + (outletId !== "all" ? 1 : 0) +
    (from ? 1 : 0) + (to ? 1 : 0) + (minAmt ? 1 : 0) + (maxAmt ? 1 : 0);

  function clearFilters() {
    setQ(""); setMethod("all"); setStatus("all"); setOrgId("all"); setOutletId("all");
    setFrom(""); setTo(""); setMinAmt(""); setMaxAmt("");
  }

  const approvals = usePendingApprovals();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingInvoice | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveTarget, setApproveTarget] = useState<PendingInvoice | null>(null);

  // Opens the approve modal. Nothing is recorded until the admin confirms there.
  function approveInvoice(inv: PendingInvoice) {
    if (!balanceOf(inv)) return toast.error("Nothing left to approve on this invoice");
    setApproveTarget(inv);
  }

  async function submitApprove() {
    const inv = approveTarget;
    if (!inv) return;
    setBusyId(inv.id);
    try {
      await approvePendingInvoice(inv as ApprovalInvoice);
      toast.success("Payment approved and plan activated");
      setApproveTarget(null);
      approvals.reload();
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not approve the payment");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadInvoice(invoiceId: string) {
    try {
      toast.loading("Generating PDF...");
      await downloadInvoiceById(invoiceId);
      toast.dismiss();
      toast.success("Invoice downloaded");
    } catch (e: any) {
      toast.dismiss();
      toast.error(`Failed to download: ${e?.message ?? "Unknown error"}`);
    }
  }

  // Opens the reject modal. The reason is written on the invoice and shown to the owner.
  function rejectInvoice(inv: PendingInvoice) {
    setRejectReason("");
    setRejectTarget(inv);
  }

  async function submitReject() {
    const inv = rejectTarget;
    if (!inv) return;
    if (!rejectReason.trim()) return toast.error("Enter a reason so the owner knows what to fix");
    setBusyId(inv.id);
    try {
      await rejectPendingInvoice(inv.id, rejectReason);
      toast.success("Payment rejected");
      setRejectTarget(null);
      approvals.reload();
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not reject the payment");
    } finally {
      setBusyId(null);
    }
  }

  const pageTotal = rows.filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-80 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search payments" placeholder="Reference, invoice #, organization, outlet"
              value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 pr-8" />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Record Manual Payment
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Matching payments</div><div className="text-2xl font-semibold">{total}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Completed on this page</div><div className="text-2xl font-semibold">{fmtMoney(pageTotal)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Awaiting approval</div><div className="text-2xl font-semibold">{approvals.rows.length}</div><div className="text-xs text-muted-foreground">{fmtMoney(approvals.rows.reduce((s, i) => s + balanceOf(i), 0))} to verify</div></Card>
      </div>

      <Card>
        <button type="button" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}
          className="flex w-full items-center justify-between rounded-t-lg px-3 py-2.5 text-left hover:bg-muted/50">
          <span className="flex items-center gap-2 font-medium">
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters &amp; sort
            {activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeFilters} applied</span>}
          </span>
          {filtersOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <div className={`${filtersOpen ? "grid" : "hidden"} gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-4`}>
          <Field label="Method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {[...METHODS, ["online", "Online"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Organization">
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All organizations</SelectItem>
                {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Outlet">
            <Select value={outletId} onValueChange={setOutletId} disabled={orgId === "all"}>
              <SelectTrigger><SelectValue placeholder="Pick an organization first" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outlets</SelectItem>
                {filterOutlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Paid from"><Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Paid to"><Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Min amount"><Input type="number" min="0" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} /></Field>
          <Field label="Max amount"><Input type="number" min="0" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} /></Field>
          <Field label="Sort by">
            <div className="flex gap-2">
              <Select value={sortKey} onValueChange={setSortKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid_at">Date</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setAsc((a) => !a)} aria-label="Toggle sort direction">
                {asc ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
          </Field>
        </div>
        {(activeFilters > 0 || q) && (
          <div className="flex items-center justify-end border-t px-3 py-1.5">
            <Button size="sm" variant="ghost" onClick={clearFilters}><X className="mr-1 h-4 w-4" /> Clear all</Button>
          </div>
        )}
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {status === "all" && approvals.rows.map((inv) => (
              <TableRow key={`pending-${inv.id}`} className="bg-orange-500/5">
                <TableCell className="whitespace-nowrap text-xs">{fmtDate(inv.issued_at)}</TableCell>
                <TableCell>{inv.tenants?.organizations?.name ?? "—"}</TableCell>
                <TableCell>{inv.tenants?.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{inv.invoice_number || inv.id.slice(0, 8)}</TableCell>
                <TableCell className="text-right">{fmtMoney(balanceOf(inv))}</TableCell>
                <TableCell>UPI</TableCell>
                <TableCell className="font-mono text-xs">{inv.utr || "—"}</TableCell>
                <TableCell><span className="rounded bg-orange-500/15 px-2 py-0.5 text-xs text-orange-600">Awaiting approval</span></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Actions for ${inv.tenants?.name ?? "this payment"}`} disabled={busyId === inv.id}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => downloadInvoice(inv.id)}>
                        <Download className="mr-2 h-4 w-4" /> Download invoice
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => approveInvoice(inv)}>
                        <Check className="mr-2 h-4 w-4" /> Approve
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => rejectInvoice(inv)}>
                        <Ban className="mr-2 h-4 w-4" /> Reject
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {loading && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Loading payments…</TableCell></TableRow>}
            {!loading && error && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-destructive">
                  {error} <Button variant="link" size="sm" onClick={load}>Retry</Button>
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  {activeFilters > 0 || q ? "No payments match these filters." : "No payments recorded yet."}
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap text-xs">{fmtDate(p.paid_at ?? p.created_at)}</TableCell>
                <TableCell>{p.tenants?.organizations?.name ?? "—"}</TableCell>
                <TableCell>{p.tenants?.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{p.invoices?.invoice_number ?? (p.invoice_id ? p.invoice_id.slice(0, 8) : "—")}</TableCell>
                <TableCell className="text-right">{fmtMoney(p.amount)}</TableCell>
                <TableCell>{METHOD_LABEL[p.method] ?? p.method}</TableCell>
                <TableCell className="font-mono text-xs">{p.reference || "—"}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                <TableCell className="text-right">
                  {p.invoice_id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Payment actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => downloadInvoice(p.invoice_id as string)}>
                          <Download className="mr-2 h-4 w-4" /> Download invoice
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="px-3 pb-3"><Pager page={page} total={total} onPage={setPage} /></div>
      </Card>

      <Dialog open={!!approveTarget} onOpenChange={o => { if (!o && !busyId) setApproveTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve payment</DialogTitle>
            <DialogDescription>{approveTarget?.tenants?.name ?? "This restaurant"}</DialogDescription>
          </DialogHeader>
          {approveTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">UTR, check this in your bank app</div>
                <div className="mt-0.5 font-mono text-lg tracking-wide">{approveTarget.utr || "—"}</div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div><div className="text-xs text-muted-foreground">Plan</div><div>{approveTarget.plan ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Amount</div><div className="font-medium">{fmtMoney(balanceOf(approveTarget))}</div></div>
              </div>
              <p className="text-muted-foreground">Approving records this payment and activates the plan for the restaurant.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={!!busyId} onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button disabled={!!busyId} onClick={submitApprove}>
              {busyId ? "Approving…" : "Approve payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={o => { if (!o && !busyId) setRejectTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject payment</DialogTitle>
            <DialogDescription>{rejectTarget?.tenants?.name ?? "This restaurant"} · UTR {rejectTarget?.utr ?? "—"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="reject-reason">Reason the owner will see</Label>
            <Textarea id="reject-reason" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. UTR not found in our account" />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={!!busyId} onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!!busyId} onClick={submitReject}>
              {busyId ? "Rejecting…" : "Reject payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManualPaymentDialog open={formOpen} onOpenChange={setFormOpen} orgs={orgs} onSaved={load} />
    </div>
  );
}

type PayableInvoice = { id: string; invoice_number: string | null; amount: number; amount_paid: number | null; status: string };
const balanceOf = (i: PayableInvoice) => Math.max(0, Math.round((Number(i.amount) - Number(i.amount_paid || 0)) * 100) / 100);

type PendingInvoice = {
  id: string; invoice_number: string | null; tenant_id: string; plan: string | null; billing_cycle: string | null;
  amount: number; amount_paid: number | null; status: string; utr: string | null; issued_at: string;
  tenants: { name: string; organizations?: { name: string } | null } | null;
};

// Owner UPI payments waiting for the platform to check the UTR. They appear as rows in the payments table.
function usePendingApprovals() {
  const [rows, setRows] = useState<PendingInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db.from("invoices")
      .select("id, invoice_number, tenant_id, plan, billing_cycle, amount, amount_paid, status, utr, issued_at, tenants(name, organizations(name))")
      .eq("status", "pending_approval")
      .order("issued_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as PendingInvoice[]);
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  return { rows, loading, reload };
}

function ManualPaymentDialog({
  open, onOpenChange, orgs, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; orgs: Org[]; onSaved: () => void }) {
  const [orgId, setOrgId] = useState("");
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [invoices, setInvoices] = useState<PayableInvoice[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [proof, setProof] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrgId(""); setOutlets([]); setOutletId(""); setInvoices([]); setInvoiceId(""); setAmount("");
    setMethod("bank_transfer"); setRef(""); setDate(todayStr()); setNotes(""); setProof("");
  }, [open]);

  useEffect(() => {
    setOutletId(""); setInvoiceId(""); setInvoices([]);
    if (!orgId) { setOutlets([]); return; }
    db.from("tenants").select("id, name").eq("organization_id", orgId).order("name").limit(500)
      .then(({ data }: any) => setOutlets(data ?? []));
  }, [orgId]);

  useEffect(() => {
    setInvoiceId(""); setAmount(""); setInvoices([]);
    if (!outletId) return;
    setInvLoading(true);
    db.from("invoices").select("id, invoice_number, amount, amount_paid, status")
      .eq("tenant_id", outletId).in("status", ["issued", "partially_paid", "pending", "overdue"])
      .order("issued_at", { ascending: false }).limit(100)
      .then(({ data }: any) => {
        setInvoices((data ?? []).filter((i: PayableInvoice) => balanceOf(i) > 0));
        setInvLoading(false);
      });
  }, [outletId]);

  function pickInvoice(id: string) {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv) setAmount(String(balanceOf(inv)));
  }

  async function save() {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return toast.error("Select an invoice");
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (amt > balanceOf(inv) + 0.001) return toast.error(`Amount exceeds the balance of ${fmtMoney(balanceOf(inv))}`);
    setSaving(true);
    try {
      await adminRpc(db, "admin_record_payment", {
        p_invoice_id: inv.id,
        p_amount: amt,
        p_method: method,
        p_reference: ref.trim() || null,
        p_paid_at: new Date(`${date}T12:00:00`).toISOString(),
        p_notes: notes.trim() || null,
        p_proof_url: proof.trim() || null,
      });
      toast.success("Payment recorded");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Could not record the payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record manual payment</DialogTitle>
          <DialogDescription>Payments can't be edited or deleted afterwards. A fully paid invoice activates the outlet's subscription.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Organization">
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                <SelectContent>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Outlet">
              <Select value={outletId} onValueChange={setOutletId} disabled={!orgId}>
                <SelectTrigger><SelectValue placeholder={orgId ? "Select outlet" : "Pick an organization first"} /></SelectTrigger>
                <SelectContent>
                  {outlets.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No outlets</div>}
                  {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Invoice">
            <Select value={invoiceId} onValueChange={pickInvoice} disabled={!outletId || invLoading}>
              <SelectTrigger>
                <SelectValue placeholder={invLoading ? "Loading…" : outletId ? "Select an invoice with a balance" : "Pick an outlet first"} />
              </SelectTrigger>
              <SelectContent>
                {invoices.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No open invoices with a balance</div>}
                {invoices.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.invoice_number || i.id.slice(0, 8)} · balance {fmtMoney(balanceOf(i))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Amount"><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Method">
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Payment date"><Input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <Field label="Reference number"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <Field label="Proof URL (optional)"><Input type="url" placeholder="https://" value={proof} onChange={(e) => setProof(e.target.value)} /></Field>
          <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Record payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_authenticated/admin/payments")({ component: PaymentsPage });
