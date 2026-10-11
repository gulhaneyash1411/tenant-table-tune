import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import { Download, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtMoney } from "@/components/admin/admin-ui";

const db = supabase as any;

// Aggregation is done in the browser over a capped slice of rows (no SQL views
// exist for this); the page says so when a cap is hit.
const CAP = 5000;
const OPEN = ["issued", "pending", "pending_approval", "partially_paid", "overdue"];
const todayStr = () => format(new Date(), "yyyy-MM-dd");
const dayStartIso = (s: string) => new Date(`${s}T00:00:00`).toISOString();
const dayEndIso = (s: string) => new Date(`${s}T23:59:59.999`).toISOString();
const num = (v: unknown) => Number(v) || 0;

type Org = { id: string; name: string };
type Outlet = { id: string; name: string };
type Plan = { id: string; name: string };
type Entry = { month: string; tenant: string | null; amount: number; subscription: boolean; online: boolean };

type Data = {
  entries: Entry[];
  totalRevenue: number;
  subscriptionRevenue: number;
  manual: { count: number; sum: number };
  online: { count: number; sum: number };
  paidInvoices: { count: number; sum: number };
  pending: { count: number; sum: number };
  overdue: { count: number; sum: number };
  capped: boolean;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function RevenuePage() {
  const [from, setFrom] = useState(format(startOfMonth(subMonths(new Date(), 5)), "yyyy-MM-dd"));
  const [to, setTo] = useState(todayStr());
  const [orgId, setOrgId] = useState("all");
  const [outletId, setOutletId] = useState("all");
  const [planId, setPlanId] = useState("all");
  const [method, setMethod] = useState("all");
  const [payStatus, setPayStatus] = useState("completed");

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [data, setData] = useState<Data | null>(null);
  const [names, setNames] = useState<Record<string, { outlet: string; org: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [o, p] = await Promise.all([
        db.from("organizations").select("id, name").order("name").limit(1000),
        db.from("subscription_plans").select("id, name").order("name"),
      ]);
      setOrgs(o.data ?? []);
      setPlans(p.data ?? []);
    })();
  }, []);

  useEffect(() => {
    setOutletId("all");
    if (orgId === "all") { setOutlets([]); return; }
    db.from("tenants").select("id, name").eq("organization_id", orgId).order("name").limit(500)
      .then(({ data: d }: any) => setOutlets(d ?? []));
  }, [orgId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) payments in range -------------------------------------------------
      let pq = db
        .from("payments")
        .select(`amount, paid_at, method, status, tenant_id, invoice_id, ${planId !== "all" ? "invoices!inner" : "invoices"}(invoice_kind, plan, plan_id)`)
        .gte("paid_at", dayStartIso(from))
        .lte("paid_at", dayEndIso(to));
      if (payStatus !== "all") pq = pq.eq("status", payStatus);
      if (method !== "all") pq = pq.eq("method", method);
      if (orgId !== "all") pq = pq.eq("organization_id", orgId);
      if (outletId !== "all") pq = pq.eq("tenant_id", outletId);
      if (planId !== "all") pq = pq.eq("invoices.plan_id", planId);
      const payRes = await pq.order("paid_at", { ascending: false }).range(0, CAP - 1);
      if (payRes.error) throw new Error(payRes.error.message);
      const pays: any[] = payRes.data ?? [];

      // 2) paid invoices in range (also catches UPI-checkout invoices, which
      //    have no payments row) -------------------------------------------
      let iq = db
        .from("invoices")
        .select("id, amount, paid_at, tenant_id, payment_method, invoice_kind, plan, plan_id, organization_id")
        .eq("status", "paid")
        .gte("paid_at", dayStartIso(from))
        .lte("paid_at", dayEndIso(to));
      if (orgId !== "all") iq = iq.eq("organization_id", orgId);
      if (outletId !== "all") iq = iq.eq("tenant_id", outletId);
      if (planId !== "all") iq = iq.eq("plan_id", planId);
      const invRes = await iq.range(0, CAP - 1);
      if (invRes.error) throw new Error(invRes.error.message);
      const paidInv: any[] = invRes.data ?? [];

      // 3) open invoices (outstanding is "as of now", not date filtered) ---
      let oq = db
        .from("invoices")
        .select("amount, amount_paid, due_date, status, tenant_id")
        .in("status", OPEN);
      if (orgId !== "all") oq = oq.eq("organization_id", orgId);
      if (outletId !== "all") oq = oq.eq("tenant_id", outletId);
      if (planId !== "all") oq = oq.eq("plan_id", planId);
      const openRes = await oq.range(0, CAP - 1);
      if (openRes.error) throw new Error(openRes.error.message);
      const open: any[] = openRes.data ?? [];

      // Rule: a paid invoice with payment_method 'upi_qr' that has no payments
      // row in the range counts as an online (UPI checkout) payment, using the
      // invoice amount. The payment-status filter 'completed'/'all' and method
      // filter 'all'/'online' admit them.
      const covered = new Set(pays.map((p) => p.invoice_id).filter(Boolean));
      const includeUpi = (payStatus === "completed" || payStatus === "all") && (method === "all" || method === "online");
      const upi = includeUpi ? paidInv.filter((i) => i.payment_method === "upi_qr" && !covered.has(i.id)) : [];

      const entries: Entry[] = [];
      let manual = { count: 0, sum: 0 };
      let online = { count: 0, sum: 0 };
      for (const p of pays) {
        if (p.status !== "completed") continue;
        const inv = p.invoices;
        const sub = !!inv && (inv.invoice_kind === "subscription" || inv.invoice_kind === "renewal" || !!inv.plan);
        const isOnline = p.method === "online";
        const amt = num(p.amount);
        entries.push({ month: (p.paid_at ?? "").slice(0, 7), tenant: p.tenant_id, amount: amt, subscription: sub, online: isOnline });
        if (isOnline) { online.count++; online.sum += amt; } else { manual.count++; manual.sum += amt; }
      }
      for (const i of upi) {
        const amt = num(i.amount);
        entries.push({ month: (i.paid_at ?? "").slice(0, 7), tenant: i.tenant_id, amount: amt, subscription: true, online: true });
        online.count++; online.sum += amt;
      }

      const today = todayStr();
      const pending = { count: open.length, sum: 0 };
      const overdue = { count: 0, sum: 0 };
      for (const i of open) {
        const bal = Math.max(0, num(i.amount) - num(i.amount_paid));
        pending.sum += bal;
        if (i.status === "overdue" || (i.due_date && i.due_date < today)) { overdue.count++; overdue.sum += bal; }
      }

      setData({
        entries,
        totalRevenue: entries.reduce((s, e) => s + e.amount, 0),
        subscriptionRevenue: entries.filter((e) => e.subscription).reduce((s, e) => s + e.amount, 0),
        manual, online,
        paidInvoices: { count: paidInv.length, sum: paidInv.reduce((s, i) => s + num(i.amount), 0) },
        pending, overdue,
        capped: pays.length >= CAP || paidInv.length >= CAP || open.length >= CAP,
      });
    } catch (e: any) {
      setError(e.message ?? "Could not load revenue");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, orgId, outletId, planId, method, payStatus]);

  useEffect(() => { load(); }, [load]);

  const monthly = useMemo(() => {
    const m = new Map<string, number>();
    // include empty months so the chart has no gaps
    const cur = new Date(`${from}T00:00:00`); cur.setDate(1);
    const end = new Date(`${to}T00:00:00`);
    for (let d = cur; d <= end && m.size < 60; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) m.set(format(d, "yyyy-MM"), 0);
    (data?.entries ?? []).forEach((e) => m.set(e.month, (m.get(e.month) ?? 0) + e.amount));
    return Array.from(m.entries()).sort().map(([k, v]) => ({ month: format(new Date(`${k}-01T00:00:00`), "MMM yy"), revenue: Math.round(v * 100) / 100 }));
  }, [data, from, to]);

  const byOutlet = useMemo(() => {
    const m = new Map<string, { sum: number; count: number }>();
    (data?.entries ?? []).forEach((e) => {
      if (!e.tenant) return;
      const x = m.get(e.tenant) ?? { sum: 0, count: 0 };
      x.sum += e.amount; x.count++;
      m.set(e.tenant, x);
    });
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.sum - a.sum).slice(0, 20);
  }, [data]);

  // Resolve names for just the top outlets.
  useEffect(() => {
    const ids = byOutlet.map((o) => o.id).filter((id) => !names[id]);
    if (!ids.length) return;
    db.from("tenants").select("id, name, organizations(name)").in("id", ids).then(({ data: d }: any) => {
      setNames((prev) => ({
        ...prev,
        ...Object.fromEntries((d ?? []).map((t: any) => [t.id, { outlet: t.name, org: t.organizations?.name ?? "" }])),
      }));
    });
  }, [byOutlet]); // eslint-disable-line react-hooks/exhaustive-deps

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [
      ["Rank", "Outlet", "Organization", "Payments", "Revenue"].join(","),
      ...byOutlet.map((o, i) =>
        [i + 1, esc(names[o.id]?.outlet ?? o.id), esc(names[o.id]?.org ?? ""), o.count, o.sum.toFixed(2)].join(",")),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `outlet-revenue-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const reset = () => {
    setFrom(format(startOfMonth(subMonths(new Date(), 5)), "yyyy-MM-dd")); setTo(todayStr());
    setOrgId("all"); setOutletId("all"); setPlanId("all"); setMethod("all"); setPayStatus("completed");
  };

  const cards: [string, string, string?][] = data ? [
    ["Total revenue", fmtMoney(data.totalRevenue), "Completed payments in range"],
    ["Subscription revenue", fmtMoney(data.subscriptionRevenue), "Subscription / renewal / plan invoices"],
    ["Paid invoices", fmtMoney(data.paidInvoices.sum), `${data.paidInvoices.count} invoices paid in range`],
    ["Pending invoices", fmtMoney(data.pending.sum), `${data.pending.count} open · outstanding balance`],
    ["Overdue amount", fmtMoney(data.overdue.sum), `${data.overdue.count} invoices past due date`],
    ["Manual payments", fmtMoney(data.manual.sum), `${data.manual.count} payments recorded by admin`],
    ["Online / UPI checkout", fmtMoney(data.online.sum), `${data.online.count} payments`],
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button size="sm" variant="ghost" onClick={reset}><X className="mr-1 h-4 w-4" /> Reset filters</Button>
      </div>

      <Card className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></Field>
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
              {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Plan">
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Payment method">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              <SelectItem value="bank_transfer">Bank transfer</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="other">Other</SelectItem>
              <SelectItem value="online">Online / UPI checkout</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Payment status">
          <Select value={payStatus} onValueChange={setPayStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Card>

      {error && (
        <Card className="flex items-center justify-between p-4 text-sm text-destructive">
          {error} <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </Card>
      )}
      {data?.capped && (
        <Card className="border-amber-500/50 p-3 text-sm text-amber-700 dark:text-amber-400">
          Showing the first {CAP} records only. Narrow the date range or filters for exact totals.
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 7 }).map((_, i) => <Card key={i} className="h-24 animate-pulse bg-muted/40" />)
          : cards.map(([k, v, sub]) => (
              <Card key={k} className="p-4">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="text-2xl font-semibold">{v}</div>
                {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
              </Card>
            ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-medium">Monthly revenue</h2>
        {loading ? (
          <div className="h-64 animate-pulse rounded bg-muted/40" />
        ) : monthly.every((m) => m.revenue === 0) ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No revenue in this range.</div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={56}
                  tickFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Outlet-wise revenue (top 20)</h2>
          <Button size="sm" variant="outline" disabled={byOutlet.length === 0} onClick={exportCsv}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead className="text-right">Payments</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && byOutlet.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No revenue in this range.</TableCell></TableRow>
            )}
            {!loading && byOutlet.map((o, i) => (
              <TableRow key={o.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{names[o.id]?.outlet ?? "…"}</TableCell>
                <TableCell>{names[o.id]?.org || "—"}</TableCell>
                <TableCell className="text-right">{o.count}</TableCell>
                <TableCell className="text-right">{fmtMoney(o.sum)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/revenue")({ component: RevenuePage });
