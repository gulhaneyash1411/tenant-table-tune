import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Search, X, SlidersHorizontal, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from "lucide-react";
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
        <Card className="p-4"><div className="text-xs text-muted-foreground">Rows on this page</div><div className="text-2xl font-semibold">{rows.length}</div></Card>
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
              <TableHead>Recorded by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
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
                <TableCell className="text-xs">{p.recorded_by ? people[p.recorded_by] ?? "…" : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="px-3 pb-3"><Pager page={page} total={total} onPage={setPage} /></div>
      </Card>

      <ManualPaymentDialog open={formOpen} onOpenChange={setFormOpen} orgs={orgs} onSaved={load} />
    </div>
  );
}

type PayableInvoice = { id: string; invoice_number: string | null; amount: number; amount_paid: number | null; status: string };
const balanceOf = (i: PayableInvoice) => Math.max(0, Math.round((Number(i.amount) - Number(i.amount_paid || 0)) * 100) / 100);

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
