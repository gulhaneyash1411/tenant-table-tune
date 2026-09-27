import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/format";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Trash2, Download, MoreHorizontal, Pencil, Check, Bell, X, ShieldCheck, Ban,
  Search, SlidersHorizontal, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
} from "lucide-react";
import { INVOICE_STATUS, PAYMENT_METHOD_UPI, addBillingCycle } from "@/lib/payment-config";

type BillingCycle = "monthly" | "yearly" | "14_days";
type DialogMode = "create" | "edit";
type ExpiryState = "all" | "active" | "expiring" | "expired" | "none";
type SortKey = "newest" | "oldest" | "amount_desc" | "amount_asc" | "expiry_asc";

// Fallback label used whenever an invoice has no plan attached.
const FREE_TRIAL_LABEL = "Free trial";

// Sentinel id for the free trial option in the "Plan purchased" select.
const FREE_TRIAL_PLAN_ID = "free_trial";
const FREE_TRIAL_STATUS = INVOICE_STATUS.FREE_TRIAL;
const PENDING_APPROVAL = INVOICE_STATUS.PENDING_APPROVAL;
const REJECTED = INVOICE_STATUS.REJECTED;

// Sentinel id used when editing an invoice whose stored `plan` text
// doesn't match any currently active plan.
const CUSTOM_PLAN_ID = "__custom__";

const PLATFORM_NAME = "PlatesOS";
const FREE_TRIAL_DAYS = 14;

// List view
const PAGE_SIZE = 10;
const EXPIRING_DAYS = 7;
const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: PENDING_APPROVAL, label: "Awaiting approval" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: FREE_TRIAL_STATUS, label: "Free Trial" },
  { value: REJECTED, label: "Rejected" },
];

const STATUS_META: Record<string, { label: string; className: string; printClass: string }> = {
  paid: { label: "Paid", className: "bg-success/15 text-success", printClass: "paid" },
  pending: { label: "Pending", className: "bg-warning/15 text-warning", printClass: "pending" },
  free_trial: { label: "Free Trial", className: "bg-blue-500/15 text-blue-600", printClass: "free_trial" },
  pending_approval: { label: "Awaiting approval", className: "bg-orange-500/15 text-orange-600", printClass: "pending" },
  rejected: { label: "Rejected", className: "bg-destructive/15 text-destructive", printClass: "rejected" },
};
function statusMeta(status: string) {
  return STATUS_META[status] || { label: status, className: "bg-muted", printClass: "pending" };
}

const INVOICE_LOGO_SVG = `
  <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
    <circle cx="15" cy="15" r="15" fill="#1E6FF2"/>
    <path d="M11 8.5V14.2C11 15.4 11.8 16.4 12.9 16.7V22.2H14.1V16.7C15.2 16.4 16 15.4 16 14.2V8.5H14.9V13.6H14.1V8.5H13V13.6H12.1V8.5H11Z" fill="#ffffff"/>
    <path d="M19.4 8.5C17.9 8.5 16.9 10.1 16.9 12.1C16.9 13.8 17.6 15.2 18.7 15.7V22.2H19.9V15.7C21 15.2 21.7 13.8 21.7 12.1C21.7 10.1 20.8 8.5 19.4 8.5Z" fill="#ffffff"/>
  </svg>
`;

const emptyForm = {
  tenantId: "",
  planId: "",
  billingCycle: "monthly" as BillingCycle,
  amount: "",
  invoiceNumber: "",
  issuedAt: format(new Date(), "yyyy-MM-dd"),
  status: "pending",
};

// ---- date helpers (local-time safe) ----
function startOfLocalDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}
function endOfLocalDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
}

// Page list with ellipses, e.g. 1 … 4 5 6 … 12
function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function Billing() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Record<string, any>>({});
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);       // active plans (for the form)
  const [allPlans, setAllPlans] = useState<any[]>([]); // incl. hidden (for approvals + filter)
  const [adminId, setAdminId] = useState<string | null>(null);
  // tenant_id -> end of their latest active/scheduled plan (only if in the future)
  const [busyUntil, setBusyUntil] = useState<Record<string, string>>({});

  // search & filters
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryState>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  // create/edit invoice dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalStatus, setOriginalStatus] = useState<string>("");
  const [customPlanLabel, setCustomPlanLabel] = useState<string>("");
  const [customBillingCycleRaw, setCustomBillingCycleRaw] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // delete state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // approval state
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  // notify state
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  async function load() {
    // Switch scheduled plans that are due (cron also does this)
    try { await (supabase as any).rpc("activate_scheduled_subscriptions"); } catch { /* ignore */ }

    const [{ data: inv, error: invErr }, { data: t }, { data: p }, { data: u }, { data: subs }] = await Promise.all([
      supabase.from("invoices").select("*").order("issued_at", { ascending: false }),
      supabase.from("tenants").select("id,name,owner_id").order("name", { ascending: true }),
      supabase.from("subscription_plans").select("*").order("sort_order", { ascending: true }),
      supabase.auth.getUser(),
      (supabase as any)
        .from("subscriptions")
        .select("tenant_id,current_period_end")
        .in("status", ["active", "scheduled"])
        .gt("current_period_end", new Date().toISOString()),
    ]);
    if (invErr) toast.error(invErr.message);
    setRows(inv || []);
    const m: Record<string, any> = {};
    (t || []).forEach((x) => { m[x.id] = x; });
    setTenants(m);
    setTenantList(t || []);
    setAllPlans(p || []);
    setPlans((p || []).filter((pl: any) => pl.is_active !== false));
    setAdminId(u.user?.id ?? null);

    const busy: Record<string, string> = {};
    (subs || []).forEach((s: any) => {
      if (!busy[s.tenant_id] || new Date(s.current_period_end) > new Date(busy[s.tenant_id])) {
        busy[s.tenant_id] = s.current_period_end;
      }
    });
    setBusyUntil(busy);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // ---- expiry helpers ----
  // Approved QR payments store their exact period (period_start/period_end).
  // Free trial: 14 days from paid_at (or issued_at).
  // Manual invoices: period starts at issued_at.
  function computeExpiry(r: any): Date | null {
    if (r.status === PENDING_APPROVAL || r.status === REJECTED) return null;
    if (r.period_end) return new Date(r.period_end);
    if (r.status === FREE_TRIAL_STATUS) {
      const base = r.paid_at || r.issued_at;
      if (!base) return null;
      const d = new Date(base);
      d.setDate(d.getDate() + FREE_TRIAL_DAYS);
      return d;
    }
    const base = r.payment_method === PAYMENT_METHOD_UPI ? r.paid_at || r.issued_at : r.issued_at;
    if (!base) return null;
    const cycle = r.billing_cycle;
    if (cycle === "yearly" || cycle === "monthly" || cycle === "14_days" || cycle === "14 days") {
      return addBillingCycle(new Date(base), cycle);
    }
    return null;
  }

  function daysRemaining(r: any): number | null {
    const expiry = computeExpiry(r);
    if (!expiry) return null;
    return Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  function expiryState(r: any): Exclude<ExpiryState, "all"> {
    const d = daysRemaining(r);
    if (d === null) return "none";
    if (d < 0) return "expired";
    if (d <= EXPIRING_DAYS) return "expiring";
    return "active";
  }

  function planMatches(r: any, planId: string) {
    if (planId === FREE_TRIAL_PLAN_ID) return r.status === FREE_TRIAL_STATUS;
    if (r.plan_id) return r.plan_id === planId;
    return r.plan === allPlans.find((p) => p.id === planId)?.name;
  }

  // ---- filters ----
  const filteredRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (term) {
        const hay = [
          r.invoice_number, r.id?.slice(0, 8), tenants[r.tenant_id]?.name,
          r.plan, r.utr, r.amount != null ? String(r.amount) : "",
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (planFilter !== "all" && !planMatches(r, planFilter)) return false;
      if (tenantFilter !== "all" && r.tenant_id !== tenantFilter) return false;
      if (methodFilter !== "all") {
        if (methodFilter === "none" ? !!r.payment_method : r.payment_method !== methodFilter) return false;
      }
      if (expiryFilter !== "all" && expiryState(r) !== expiryFilter) return false;
      if (dateFrom || dateTo) {
        if (!r.issued_at) return false;
        const issued = new Date(r.issued_at);
        if (dateFrom && issued < startOfLocalDay(dateFrom)) return false;
        if (dateTo && issued > endOfLocalDay(dateTo)) return false;
      }
      return true;
    });

    const expiryTime = (r: any) => computeExpiry(r)?.getTime() ?? Infinity;
    const issuedTime = (r: any) => (r.issued_at ? new Date(r.issued_at).getTime() : 0);
    out.sort((a, b) => {
      switch (sort) {
        case "oldest": return issuedTime(a) - issuedTime(b);
        case "amount_desc": return Number(b.amount || 0) - Number(a.amount || 0);
        case "amount_asc": return Number(a.amount || 0) - Number(b.amount || 0);
        case "expiry_asc": return expiryTime(a) - expiryTime(b);
        default: return issuedTime(b) - issuedTime(a);
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tenants, allPlans, q, statusFilter, planFilter, tenantFilter, methodFilter, expiryFilter, dateFrom, dateTo, sort]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    STATUS_TABS.forEach((s) => { if (s.value !== "all") c[s.value] = rows.filter((r) => r.status === s.value).length; });
    return c;
  }, [rows]);

  // Back to page 1 whenever search, filters or sort change
  useEffect(() => { setPage(1); }, [q, statusFilter, planFilter, tenantFilter, methodFilter, expiryFilter, dateFrom, dateTo, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  // Keep page in range if the list shrinks (e.g. after a delete)
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);

  const panelFilters =
    (planFilter !== "all" ? 1 : 0) + (tenantFilter !== "all" ? 1 : 0) + (methodFilter !== "all" ? 1 : 0) +
    (expiryFilter !== "all" ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (sort !== "newest" ? 1 : 0);
  const activeFilters = panelFilters + (q ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

  function clearFilters() {
    setQ(""); setStatusFilter("all"); setPlanFilter("all"); setTenantFilter("all");
    setMethodFilter("all"); setExpiryFilter("all"); setDateFrom(""); setDateTo(""); setSort("newest");
  }

  const revenue = filteredRows.filter((r) => r.status === "paid").reduce((a, b) => a + Number(b.amount || 0), 0);
  const outstanding = filteredRows
    .filter((r) => r.status === "pending" || r.status === PENDING_APPROVAL)
    .reduce((a, b) => a + Number(b.amount || 0), 0);
  const awaitingCount = rows.filter((r) => r.status === PENDING_APPROVAL).length;

  // Where would this payment's plan period fall if approved now?
  // If the restaurant still has a running (or already scheduled) plan,
  // the new plan starts when that one ends.
  function periodFor(r: any, busyIso?: string | null) {
    const now = new Date();
    const busy = busyIso ? new Date(busyIso) : null;
    const scheduled = !!busy && busy > now;
    const start = scheduled ? busy! : now;
    const end = addBillingCycle(start, r.billing_cycle);
    return { start, end, scheduled };
  }

  // Writes to the columns NotificationBell reads (recipient_id, title, body).
  async function sendNotification(tenantId: string, title: string, body: string) {
    const recipientId = tenants[tenantId]?.owner_id;
    if (!recipientId) return { error: { message: "Restaurant has no owner account to notify" } };
    return supabase.from("notifications").insert({
      recipient_id: recipientId,
      tenant_id: tenantId,
      title,
      body,
      is_read: false,
    } as any);
  }

  async function markPaid(id: string) {
    const { error } = await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked paid"); load();
  }

  // ---- approve a QR payment ----
  // 1. Work out the period: now, or after the restaurant's current plan ends
  // 2. Claim the invoice (only if still pending_approval → prevents double approval)
  // 3. Create the subscription (active now, or scheduled for later)
  // 4. Link invoice → subscription; if active now, expire older plans
  // 5. Notify the owner
  async function approvePayment(r: any) {
    const planId = r.plan_id || allPlans.find((p) => p.name === r.plan)?.id;
    if (!planId) return toast.error("Can't find the plan for this invoice");

    setActingId(r.id);
    const nowIso = new Date().toISOString();

    // fresh lookup so we never overlap an existing plan
    const { data: busyRows, error: busyErr } = await (supabase as any)
      .from("subscriptions")
      .select("current_period_end")
      .eq("tenant_id", r.tenant_id)
      .in("status", ["active", "scheduled"])
      .gt("current_period_end", nowIso)
      .order("current_period_end", { ascending: false })
      .limit(1);
    if (busyErr) { setActingId(null); return toast.error(busyErr.message); }

    const { start, end, scheduled } = periodFor(r, busyRows?.[0]?.current_period_end ?? null);

    const { data: claimed, error: claimErr } = await (supabase as any)
      .from("invoices")
      .update({
        status: "paid",
        paid_at: nowIso,
        approved_at: nowIso,
        approved_by: adminId,
        rejection_reason: null,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
      })
      .eq("id", r.id)
      .eq("status", PENDING_APPROVAL)
      .select("id");
    if (claimErr) { setActingId(null); return toast.error(claimErr.message); }
    if (!claimed?.length) { setActingId(null); toast.error("This payment was already processed"); return load(); }

    const { data: sub, error: subErr } = await (supabase as any)
      .from("subscriptions")
      .insert({
        tenant_id: r.tenant_id,
        plan_id: planId,
        status: scheduled ? "scheduled" : "active",
        current_period_start: start.toISOString(),
        current_period_end: end.toISOString(),
      })
      .select()
      .single();

    if (subErr || !sub) {
      // roll the invoice back so it can be approved again
      await (supabase as any)
        .from("invoices")
        .update({
          status: PENDING_APPROVAL, paid_at: null, approved_at: null, approved_by: null,
          period_start: null, period_end: null,
        })
        .eq("id", r.id);
      setActingId(null);
      return toast.error(subErr?.message || "Could not activate the plan");
    }

    const followUps: Promise<any>[] = [
      (supabase as any).from("invoices").update({ subscription_id: sub.id }).eq("id", r.id),
    ];
    if (!scheduled) {
      // no running plan → any older "active" rows have already ended
      followUps.push(
        (supabase as any)
          .from("subscriptions")
          .update({ status: "expired" })
          .eq("tenant_id", r.tenant_id)
          .eq("status", "active")
          .neq("id", sub.id),
      );
    }
    await Promise.all(followUps);

    const { error: nErr } = await sendNotification(
      r.tenant_id,
      scheduled ? "Your next plan is scheduled" : "Your plan is active",
      scheduled
        ? `Your payment of ${money(Number(r.amount))} was approved. ${r.plan} (${r.billing_cycle}) will become active after your current plan ends on ${format(start, "PP")} and run until ${format(end, "PP")}.`
        : `Your payment of ${money(Number(r.amount))} was approved. ${r.plan} (${r.billing_cycle}) is now active until ${format(end, "PP")}.`,
    );

    setActingId(null);
    setApproveTarget(null);
    const tenantName = tenants[r.tenant_id]?.name || "restaurant";
    toast.success(
      (scheduled
        ? `Approved — ${r.plan} scheduled for ${tenantName} from ${format(start, "PP")}`
        : `Approved — ${r.plan} activated for ${tenantName}`) + (nErr ? " (notification not sent)" : ""),
    );
    load();
  }

  async function rejectPayment(r: any, reason: string) {
    setActingId(r.id);
    const { data, error } = await (supabase as any)
      .from("invoices")
      .update({ status: REJECTED, rejection_reason: reason, approved_by: adminId })
      .eq("id", r.id)
      .eq("status", PENDING_APPROVAL)
      .select("id");
    if (error) { setActingId(null); return toast.error(error.message); }
    if (!data?.length) { setActingId(null); toast.error("This payment was already processed"); return load(); }

    await sendNotification(
      r.tenant_id,
      "Payment not approved",
      `We couldn't verify your payment for ${r.plan} (UTR ${r.utr}). Reason: ${reason}`,
    );
    setActingId(null);
    setRejectTarget(null);
    setRejectReason("");
    toast.success("Payment rejected");
    load();
  }

  async function notifyExpiry(r: any) {
    const days = daysRemaining(r);
    if (days === null) return toast.error("No expiry date available for this invoice");
    const tenantName = tenants[r.tenant_id]?.name || "this restaurant";
    const body =
      days >= 0
        ? `Your subscription will expire in ${days} day${days === 1 ? "" : "s"}. Please renew to avoid interruption.`
        : `Your subscription expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago. Please renew as soon as possible.`;

    setNotifyingId(r.id);
    const { error } = await sendNotification(r.tenant_id, "Subscription expiry reminder", body);
    setNotifyingId(null);

    if (error) return toast.error(error.message);
    toast.success(
      days >= 0
        ? `Notified ${tenantName} — ${days} day${days === 1 ? "" : "s"} left`
        : `Notified ${tenantName} — subscription expired`,
    );
  }

  async function deleteInvoice(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    setDeletingId(null);
    if (error) return toast.error(error.message);
    toast.success("Invoice deleted");
    load();
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setOriginalStatus("");
    setCustomPlanLabel("");
    setCustomBillingCycleRaw(null);
  }

  function openCreate() {
    resetForm();
    setMode("create");
    setFormOpen(true);
  }

  function openEdit(r: any) {
    const isFreeTrial = r.status === FREE_TRIAL_STATUS;
    let planId = "";
    if (isFreeTrial) {
      planId = FREE_TRIAL_PLAN_ID;
    } else if (r.plan_id && plans.some((p) => p.id === r.plan_id)) {
      planId = r.plan_id;
    } else if (r.plan) {
      const match = plans.find((p) => p.name === r.plan);
      planId = match ? match.id : CUSTOM_PLAN_ID;
    }

    const billingCycle: BillingCycle =
      r.billing_cycle === "yearly" ? "yearly" : r.billing_cycle === "monthly" ? "monthly" : "14_days";

    setCustomPlanLabel(r.plan || "");
    setCustomBillingCycleRaw(r.billing_cycle ?? null);
    setEditingId(r.id);
    setOriginalStatus(r.status);
    setForm({
      tenantId: r.tenant_id || "",
      planId,
      billingCycle,
      amount: r.amount != null ? String(r.amount) : "",
      invoiceNumber: r.invoice_number || "",
      issuedAt: format(new Date(r.issued_at), "yyyy-MM-dd"),
      status: r.status,
    });
    setMode("edit");
    setFormOpen(true);
  }

  function priceFor(planId: string, cycle: BillingCycle) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return "";
    const price = cycle === "monthly" ? plan.monthly_price : plan.yearly_price;
    return price != null ? String(price) : "";
  }

  function onPlanChange(planId: string) {
    if (planId === FREE_TRIAL_PLAN_ID) {
      setForm((f) => ({ ...f, planId, billingCycle: "14_days", amount: "0", status: FREE_TRIAL_STATUS }));
      return;
    }
    setForm((f) => ({
      ...f,
      planId,
      billingCycle: f.billingCycle === "14_days" ? "monthly" : f.billingCycle,
      status: f.status === FREE_TRIAL_STATUS ? "pending" : f.status,
      amount: priceFor(planId, f.billingCycle === "14_days" ? "monthly" : f.billingCycle) || f.amount,
    }));
  }

  function onCycleChange(cycle: BillingCycle) {
    setForm((f) => ({
      ...f,
      billingCycle: cycle,
      amount:
        f.planId && f.planId !== FREE_TRIAL_PLAN_ID && f.planId !== CUSTOM_PLAN_ID
          ? priceFor(f.planId, cycle) || f.amount
          : f.amount,
    }));
  }

  async function submitForm() {
    if (!form.tenantId) return toast.error("Select a restaurant");
    if (originalStatus === PENDING_APPROVAL && form.status === "paid") {
      return toast.error("Use Approve payment from the actions menu so the plan gets activated");
    }
    const isFreeTrial = form.planId === FREE_TRIAL_PLAN_ID;
    const isCustomPlan = form.planId === CUSTOM_PLAN_ID;
    const amountNum = Number(form.amount);
    if (!isFreeTrial && (!form.amount || isNaN(amountNum) || amountNum <= 0)) {
      return toast.error("Enter a valid amount");
    }

    const selectedPlan = plans.find((p) => p.id === form.planId);
    const planName = isFreeTrial ? "Free Trial" : isCustomPlan ? customPlanLabel || null : selectedPlan?.name || null;
    const billingCycleValue = isFreeTrial
      ? "14 days"
      : isCustomPlan
        ? customBillingCycleRaw
        : form.planId
          ? form.billingCycle
          : null;

    const payload: any = {
      tenant_id: form.tenantId,
      amount: isFreeTrial ? 0 : amountNum,
      invoice_number: form.invoiceNumber || null,
      issued_at: new Date(form.issuedAt).toISOString(),
      status: form.status,
      plan: planName,
      billing_cycle: billingCycleValue,
    };
    // keep plan_id in sync unless the plan is a legacy/custom label
    if (!isCustomPlan) payload.plan_id = isFreeTrial ? null : selectedPlan?.id ?? null;
    if (mode === "create") payload.payment_method = "manual";

    if (form.status === "paid" && (mode === "create" || originalStatus !== "paid")) {
      payload.paid_at = new Date().toISOString();
    } else if (form.status !== "paid") {
      payload.paid_at = null;
    }

    setSubmitting(true);
    const { error } =
      mode === "edit" && editingId
        ? await supabase.from("invoices").update(payload).eq("id", editingId)
        : await supabase.from("invoices").insert(payload);
    setSubmitting(false);

    if (error) return toast.error(error.message);
    toast.success(mode === "edit" ? "Invoice updated" : "Invoice created");
    setFormOpen(false);
    resetForm();
    load();
  }

  function downloadInvoice(r: any) {
    const tenantName = tenants[r.tenant_id]?.name || "—";
    const invoiceNo = r.invoice_number || r.id.slice(0, 8);
    const issuedDate = format(new Date(r.issued_at), "PP");
    const paidDate = r.paid_at ? format(new Date(r.paid_at), "PP") : "—";
    const planLabel = r.plan || FREE_TRIAL_LABEL;
    const expiry = computeExpiry(r);
    const expiryLabel = expiry ? format(expiry, "PP") : "—";
    const meta = statusMeta(r.status);
    const paymentLabel = r.payment_method === PAYMENT_METHOD_UPI ? `UPI${r.utr ? ` (UTR ${r.utr})` : ""}` : "—";
    const fileTitle = `Invoice_PlateOs_${invoiceNo}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${fileTitle}</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, Arial, sans-serif; padding: 40px; color: #111; }
            .header { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 16px; }
            .header .brand-name { font-size: 21px; font-weight: 800; letter-spacing: 0.2px; }
            .header .brand-name .plates { color: #111827; }
            .header .brand-name .os { color: #1E6FF2; }
            h1 { font-size: 18px; margin: 0 0 4px; }
            .muted { color: #666; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-top: 24px; }
            td { padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
            td.label { color: #666; width: 180px; }
            .total { font-size: 18px; font-weight: 600; margin-top: 24px; }
            .status { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 12px; }
            .paid { background: #dcfce7; color: #166534; }
            .pending { background: #fef9c3; color: #854d0e; }
            .free_trial { background: #dbeafe; color: #1d4ed8; }
            .rejected { background: #fee2e2; color: #991b1b; }
            .thanks { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 13px; color: #444; }
            .thanks .signoff { margin-top: 8px; font-weight: 600; color: #111; }
          </style>
        </head>
        <body>
          <div class="header">
            ${INVOICE_LOGO_SVG}
            <div class="brand-name"><span class="plates">Plates</span><span class="os">OS</span></div>
          </div>
          <h1>Invoice ${invoiceNo}</h1>
          <div class="muted">Issued ${issuedDate}</div>
          <table>
            <tr><td class="label">Restaurant</td><td>${tenantName}</td></tr>
            <tr><td class="label">Plan</td><td>${planLabel}${r.billing_cycle ? ` (${r.billing_cycle})` : ""}</td></tr>
            <tr><td class="label">Amount</td><td>${money(Number(r.amount))}</td></tr>
            <tr><td class="label">Payment</td><td>${paymentLabel}</td></tr>
            <tr><td class="label">Status</td><td><span class="status ${meta.printClass}">${meta.label}</span></td></tr>
            <tr><td class="label">Paid on</td><td>${paidDate}</td></tr>
            <tr><td class="label">Subscription expiry</td><td>${expiryLabel}</td></tr>
          </table>
          <div class="total">Total: ${money(Number(r.amount))}</div>
          <div class="thanks">
            Thank you for choosing ${PLATFORM_NAME}. We appreciate having you with us and look forward to growing your business together.
            <div class="signoff">Regards,<br/>${PLATFORM_NAME} Team</div>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `;

    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Please allow pop-ups to download the invoice");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.document.title = fileTitle;
  }

  const approvePeriod = approveTarget ? periodFor(approveTarget, busyUntil[approveTarget.tenant_id]) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-80 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              aria-label="Search invoices"
              placeholder="Search invoice #, restaurant, plan, UTR"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 pr-8"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Create invoice
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Collected</div><div className="text-2xl font-semibold">{money(revenue)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-2xl font-semibold">{money(outstanding)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Invoices</div><div className="text-2xl font-semibold">{filteredRows.length}</div></Card>
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === PENDING_APPROVAL ? "all" : PENDING_APPROVAL)}
          className="text-left"
          aria-pressed={statusFilter === PENDING_APPROVAL}
        >
          <Card className={`p-4 h-full ${awaitingCount > 0 ? "border-orange-500/50" : ""} ${statusFilter === PENDING_APPROVAL ? "ring-1 ring-orange-500" : ""}`}>
            <div className="text-xs text-muted-foreground">Awaiting approval</div>
            <div className="text-2xl font-semibold">{awaitingCount}</div>
          </Card>
        </button>
      </div>

      {/* Status quick filters */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {STATUS_TABS.map((s) => (
          <Button
            key={s.value}
            size="sm"
            variant={statusFilter === s.value ? "default" : "outline"}
            aria-pressed={statusFilter === s.value}
            onClick={() => setStatusFilter(s.value)}
          >
            {s.label} <span className="ml-1.5 text-xs opacity-70">{statusCounts[s.value] ?? 0}</span>
          </Button>
        ))}
      </div>

      {/* Filters section: click header to open / close */}
      <Card>
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="billing-filters-panel"
          className="flex w-full items-center justify-between rounded-t-lg px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 font-medium">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
            {panelFilters > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                {panelFilters} applied
              </span>
            )}
          </span>
          {filtersOpen
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />}
        </button>

        <div
          id="billing-filters-panel"
          className={`${filtersOpen ? "grid" : "hidden"} gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`}
        >
          <div className="space-y-1">
            <Label className="text-xs">Restaurant</Label>
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All restaurants</SelectItem>
                {tenantList.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Plan</Label>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                <SelectItem value={FREE_TRIAL_PLAN_ID}>Free Trial</SelectItem>
                {allPlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.is_active === false ? " (hidden)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payment</Label>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                <SelectItem value={PAYMENT_METHOD_UPI}>UPI QR</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="none">Not recorded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expiry</Label>
            <Select value={expiryFilter} onValueChange={(v) => setExpiryFilter(v as ExpiryState)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expiring">Expiring in {EXPIRING_DAYS} days</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="none">No expiry</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bill-from" className="text-xs">Issued from</Label>
            <Input id="bill-from" type="date" className="w-full min-w-[160px] pr-2" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bill-to" className="text-xs">Issued to</Label>
            <Input id="bill-to" type="date" className="w-full min-w-[160px] pr-2" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sort by</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="amount_desc">Amount high–low</SelectItem>
                <SelectItem value="amount_asc">Amount low–high</SelectItem>
                <SelectItem value="expiry_asc">Expiry soonest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex min-h-10 items-center justify-between border-t px-3 py-1.5 text-sm text-muted-foreground">
          <span aria-live="polite">
            {filteredRows.length === rows.length
              ? `${rows.length} invoices`
              : `${filteredRows.length} of ${rows.length} invoices match`}
          </span>
          {activeFilters > 0 && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="mr-1 h-4 w-4" /> Clear filters ({activeFilters})
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Restaurant</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">Loading invoices…</TableCell>
              </TableRow>
            )}
            {!loading && pagedRows.map((r) => {
              const expiry = computeExpiry(r);
              const days = daysRemaining(r);
              const expired = days !== null && days < 0;
              const soon = days !== null && days >= 0 && days <= EXPIRING_DAYS;
              const meta = statusMeta(r.status);
              const awaiting = r.status === PENDING_APPROVAL;
              const periodStart = r.period_start ? new Date(r.period_start) : null;
              const upcoming = r.status === "paid" && !!periodStart && periodStart > new Date();
              const willQueue = awaiting && !!busyUntil[r.tenant_id];
              return (
                <TableRow key={r.id} className={awaiting ? "bg-orange-500/5" : ""}>
                  <TableCell className="font-mono text-xs">{r.invoice_number || r.id.slice(0, 8)}</TableCell>
                  <TableCell>{tenants[r.tenant_id]?.name || "—"}</TableCell>
                  <TableCell>
                    {r.plan || FREE_TRIAL_LABEL}
                    {r.billing_cycle && <span className="text-xs text-muted-foreground"> ({r.billing_cycle})</span>}
                  </TableCell>
                  <TableCell>{money(Number(r.amount))}</TableCell>
                  <TableCell className="text-xs">
                    {r.payment_method === PAYMENT_METHOD_UPI ? (
                      <div>
                        <div>UPI QR</div>
                        {r.utr && <div className="font-mono text-muted-foreground">{r.utr}</div>}
                      </div>
                    ) : r.payment_method === "manual" ? "Manual" : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{format(new Date(r.issued_at), "PP")}</TableCell>
                  <TableCell className="text-xs">
                    {expiry ? (
                      <div>
                        <span className={upcoming ? "" : expired ? "text-destructive font-medium" : soon ? "text-warning font-medium" : ""}>
                          {format(expiry, "PP")}
                        </span>
                        {upcoming && (
                          <div className="text-muted-foreground">Starts {format(periodStart!, "PP")}</div>
                        )}
                      </div>
                    ) : awaiting ? (
                      <span className="text-muted-foreground">
                        {willQueue
                          ? `Starts after ${format(new Date(busyUntil[r.tenant_id]), "PP")}`
                          : "Starts on approval"}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${meta.className}`}
                        title={r.status === REJECTED && r.rejection_reason ? r.rejection_reason : undefined}
                      >
                        {meta.label}
                      </span>
                      {upcoming && (
                        <span className="text-xs px-2 py-0.5 rounded whitespace-nowrap bg-primary/10 text-primary">
                          Scheduled
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end items-center gap-1">
                      {awaiting && (
                        <Button
                          size="sm"
                          className="h-7 px-2"
                          disabled={actingId === r.id}
                          onClick={() => setApproveTarget(r)}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                          Review
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {awaiting && (
                            <>
                              <DropdownMenuItem onClick={() => setApproveTarget(r)}>
                                <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                                Approve payment
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setRejectReason(""); setRejectTarget(r); }}>
                                <Ban className="h-3.5 w-3.5 mr-2" />
                                Reject payment
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {r.status === "pending" && (
                            <DropdownMenuItem onClick={() => markPaid(r.id)}>
                              <Check className="h-3.5 w-3.5 mr-2" />
                              Mark paid
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => openEdit(r)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {!awaiting && r.status !== REJECTED && !upcoming && (
                            <DropdownMenuItem onClick={() => notifyExpiry(r)} disabled={notifyingId === r.id}>
                              <Bell className="h-3.5 w-3.5 mr-2" />
                              {notifyingId === r.id
                                ? "Notifying..."
                                : days === null
                                  ? "Notify (no expiry)"
                                  : days >= 0
                                    ? `Notify — ${days}d left`
                                    : "Notify — expired"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => downloadInvoice(r)}>
                            <Download className="h-3.5 w-3.5 mr-2" />
                            Download invoice
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!loading && filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {rows.length === 0 ? "No invoices yet." : "No invoices match these filters."}
                  {activeFilters > 0 && (
                    <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {!loading && filteredRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
            <span className="text-muted-foreground" aria-live="polite">
              Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
            </span>
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page === 1} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers(page, totalPages).map((n, i) =>
                n === "…" ? (
                  <span key={`gap-${i}`} className="px-2 text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={n}
                    size="sm"
                    variant={n === page ? "default" : "outline"}
                    aria-current={n === page ? "page" : undefined}
                    aria-label={`Page ${n}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </Button>
                ),
              )}
              <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          </div>
        )}
      </Card>

      {/* Create / Edit invoice dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "edit" ? "Edit invoice" : "Create manual invoice"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Restaurant</Label>
              <Select value={form.tenantId} onValueChange={(v) => setForm((f) => ({ ...f, tenantId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a registered restaurant" />
                </SelectTrigger>
                <SelectContent>
                  {tenantList.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No restaurants found</div>
                  )}
                  {tenantList.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plan purchased</Label>
                <Select value={form.planId} onValueChange={onPlanChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FREE_TRIAL_PLAN_ID}>Free Trial</SelectItem>
                    {form.planId === CUSTOM_PLAN_ID && (
                      <SelectItem value={CUSTOM_PLAN_ID}>{customPlanLabel || "Current plan"}</SelectItem>
                    )}
                    {plans.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No plans found</div>
                    )}
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Billing cycle</Label>
                {form.planId === FREE_TRIAL_PLAN_ID ? (
                  <Input value="14 days" disabled readOnly />
                ) : form.planId === CUSTOM_PLAN_ID ? (
                  <Input value={customBillingCycleRaw || "—"} disabled readOnly />
                ) : (
                  <Select value={form.billingCycle} onValueChange={(v) => onCycleChange(v as BillingCycle)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                disabled={form.planId === FREE_TRIAL_PLAN_ID}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
              {form.planId === FREE_TRIAL_PLAN_ID ? (
                <div className="text-xs text-muted-foreground">Free trial invoices are always ₹0.</div>
              ) : form.planId && form.planId !== CUSTOM_PLAN_ID && (
                <div className="text-xs text-muted-foreground">
                  Auto-filled from the selected plan — edit if you need a custom amount.
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Invoice number (optional)</Label>
              <Input
                placeholder="Auto-generated if left blank"
                value={form.invoiceNumber}
                onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issued date</Label>
                <Input
                  type="date"
                  value={form.issuedAt}
                  onChange={(e) => setForm((f) => ({ ...f, issuedAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                {form.planId === FREE_TRIAL_PLAN_ID ? (
                  <Input value="Free Trial" disabled readOnly />
                ) : (
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      {(originalStatus === PENDING_APPROVAL || originalStatus === REJECTED) && (
                        <>
                          <SelectItem value={PENDING_APPROVAL}>Awaiting approval</SelectItem>
                          <SelectItem value={REJECTED}>Rejected</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            {originalStatus === PENDING_APPROVAL && (
              <div className="text-xs text-muted-foreground">
                This is a QR payment awaiting review. Use Approve payment from the actions menu to activate the plan.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting ? (mode === "edit" ? "Saving..." : "Creating...") : (mode === "edit" ? "Save changes" : "Create invoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve payment dialog */}
      <AlertDialog open={!!approveTarget} onOpenChange={(o) => { if (!o && !actingId) setApproveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              Check your bank or UPI app for this payment before approving.{" "}
              {approvePeriod?.scheduled
                ? "This restaurant has a running plan, so the new plan will be scheduled to start when it ends."
                : "Approving activates the plan immediately."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {approveTarget && approvePeriod && (
            <div className="rounded-lg border divide-y text-sm">
              {[
                ["Restaurant", tenants[approveTarget.tenant_id]?.name || "—"],
                ["Plan", `${approveTarget.plan} (${approveTarget.billing_cycle})`],
                ["Amount", money(Number(approveTarget.amount))],
                ["UTR", approveTarget.utr || "—"],
                ["Submitted", format(new Date(approveTarget.issued_at), "PPp")],
                ["Starts", approvePeriod.scheduled ? format(approvePeriod.start, "PP") : "Immediately"],
                ["Active until", format(approvePeriod.end, "PP")],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className={k === "UTR" ? "font-mono" : "font-medium"}>{v}</span>
                </div>
              ))}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actingId}>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              className="text-destructive"
              disabled={!!actingId}
              onClick={() => {
                const t = approveTarget;
                setApproveTarget(null);
                setRejectReason("");
                setRejectTarget(t);
              }}
            >
              Reject
            </Button>
            <AlertDialogAction
              disabled={!!actingId}
              onClick={(e) => {
                e.preventDefault(); // keep dialog open until the request finishes
                if (approveTarget) approvePayment(approveTarget);
              }}
            >
              {actingId === approveTarget?.id
                ? "Approving..."
                : approvePeriod?.scheduled
                  ? "Approve & schedule"
                  : "Approve & activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject payment dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o && !actingId) { setRejectTarget(null); setRejectReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject payment</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  {tenants[rejectTarget.tenant_id]?.name || "Restaurant"} · {rejectTarget.plan} ·{" "}
                  {money(Number(rejectTarget.amount))} · UTR <span className="font-mono">{rejectTarget.utr}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason (shown to the restaurant)</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              placeholder="e.g. No payment found for this transaction ID"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={!!actingId} onClick={() => { setRejectTarget(null); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!actingId || !rejectReason.trim()}
              onClick={() => rejectTarget && rejectPayment(rejectTarget, rejectReason.trim())}
            >
              {actingId === rejectTarget?.id ? "Rejecting..." : "Reject payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete invoice {deleteTarget?.invoice_number || deleteTarget?.id?.slice(0, 8)} for{" "}
              {deleteTarget ? tenants[deleteTarget.tenant_id]?.name || "this restaurant" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget) {
                  await deleteInvoice(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
              disabled={deletingId === deleteTarget?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId === deleteTarget?.id ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/billing")({ component: Billing });