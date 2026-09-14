import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Download, MoreHorizontal, Pencil, Check, Bell, Filter, X } from "lucide-react";

type BillingCycle = "monthly" | "yearly" | "14_days";
type DialogMode = "create" | "edit";

// Fallback label used whenever an invoice has no plan attached
// (e.g. invoices created before plans existed, or manual invoices
// created without selecting a plan).
const FREE_TRIAL_LABEL = "Free trial";

// Sentinel id used in the "Plan purchased" select to represent the
// free trial option, since it isn't a row in subscription_plans.
const FREE_TRIAL_PLAN_ID = "free_trial";
const FREE_TRIAL_STATUS = "free_trial";

// Sentinel id used when editing an invoice whose stored `plan` text
// doesn't match any currently active plan (e.g. the plan was renamed
// or deactivated since the invoice was created). Keeps the original
// plan label intact unless the admin explicitly switches plans.
const CUSTOM_PLAN_ID = "__custom__";

const PLATFORM_NAME = "PlatesOS";
const FREE_TRIAL_DAYS = 14;

// Inline replica of the PlatesOS wordmark (blue circle + fork/spoon mark,
// "Plates" in dark ink, "OS" in brand blue) so the invoice doesn't depend
// on an externally hosted image.
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
// `new Date("yyyy-mm-dd")` parses as UTC midnight, while `new Date(isoTimestamp)`
// parses as local time. Comparing the two directly shifts the boundary by your
// UTC offset (e.g. in IST rows near the edges of the range silently drop out,
// which is what makes the filter look "broken"). These helpers normalize
// everything to local-time calendar-day boundaries before comparing.
function startOfLocalDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}
function endOfLocalDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
}

function Billing() {
  const [rows, setRows] = useState<any[]>([]);
  const [tenants, setTenants] = useState<Record<string, any>>({});
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);

  // date filter (filters by issued_at) — lives behind a single compact
  // filter button (top-right of the table) that opens a small popover.
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);
  // draft values edited inside the popover; only committed to
  // dateFrom/dateTo on "Apply" so opening/closing the popover doesn't
  // change the active filter until the admin confirms it.
  const [draftFrom, setDraftFrom] = useState<string>("");
  const [draftTo, setDraftTo] = useState<string>("");

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

  // notify state
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  async function load() {
    const [{ data: inv }, { data: t }, { data: p }] = await Promise.all([
      supabase.from("invoices").select("*").order("issued_at", { ascending: false }),
      supabase.from("tenants").select("id,name,owner_id").order("name", { ascending: true }),
      supabase.from("subscription_plans").select("*").order("sort_order", { ascending: true }),
    ]);
    setRows(inv || []);
    const m: Record<string, any> = {};
    (t || []).forEach((x) => { m[x.id] = x; });
    setTenants(m);
    setTenantList(t || []);
    setPlans((p || []).filter((pl: any) => pl.is_active !== false));
  }
  useEffect(() => { load(); }, []);

  // ---- date filter ----
  const filteredRows = rows.filter((r) => {
    if (!dateFrom && !dateTo) return true;
    if (!r.issued_at) return false;
    const issued = new Date(r.issued_at);
    if (dateFrom) {
      const from = startOfLocalDay(dateFrom);
      if (issued < from) return false;
    }
    if (dateTo) {
      const to = endOfLocalDay(dateTo);
      if (issued > to) return false;
    }
    return true;
  });

  const dateFilterActive = !!(dateFrom || dateTo);

  // Draft range fed to/from the Calendar picker. react-day-picker's range
  // mode already keeps from <= to for us (picking an earlier date after a
  // later one starts a fresh range), so we no longer need a manual
  // "to before from" guard like the old two-input version did.
  const draftRange: DateRange | undefined =
    draftFrom || draftTo
      ? {
          from: draftFrom ? startOfLocalDay(draftFrom) : undefined,
          to: draftTo ? startOfLocalDay(draftTo) : undefined,
        }
      : undefined;

  function onDraftRangeSelect(range: DateRange | undefined) {
    setDraftFrom(range?.from ? format(range.from, "yyyy-MM-dd") : "");
    setDraftTo(range?.to ? format(range.to, "yyyy-MM-dd") : "");
  }

  function openFilter() {
    setDraftFrom(dateFrom);
    setDraftTo(dateTo);
    setFilterOpen(true);
  }

  function applyFilter() {
    setDateFrom(draftFrom);
    setDateTo(draftTo);
    setFilterOpen(false);
  }

  function clearFilter() {
    setDraftFrom("");
    setDraftTo("");
    setDateFrom("");
    setDateTo("");
    setFilterOpen(false);
  }

  const revenue = filteredRows.filter(r=>r.status==="paid").reduce((a,b)=>a+Number(b.amount||0),0);
  const outstanding = filteredRows.filter(r=>r.status!=="paid").reduce((a,b)=>a+Number(b.amount||0),0);

  // ---- expiry helpers ----
  // Free trial invoices expire 14 days after they were marked paid
  // (or, if never marked paid, 14 days after the issued date as a
  // fallback). Paid plans expire based on issued_at + billing_cycle.
  function computeExpiry(r: any): Date | null {
    if (r.status === FREE_TRIAL_STATUS) {
      const base = r.paid_at || r.issued_at;
      if (!base) return null;
      const d = new Date(base);
      d.setDate(d.getDate() + FREE_TRIAL_DAYS);
      return d;
    }
    if (!r.issued_at) return null;
    const cycle = r.billing_cycle;
    const start = new Date(r.issued_at);
    if (cycle === "yearly") {
      const d = new Date(start);
      d.setFullYear(d.getFullYear() + 1);
      return d;
    }
    if (cycle === "monthly") {
      const d = new Date(start);
      d.setMonth(d.getMonth() + 1);
      return d;
    }
    if (cycle === "14_days" || cycle === "14 days") {
      const d = new Date(start);
      d.setDate(d.getDate() + FREE_TRIAL_DAYS);
      return d;
    }
    return null;
  }

  function daysRemaining(r: any): number | null {
    const expiry = computeExpiry(r);
    if (!expiry) return null;
    const diffMs = expiry.getTime() - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  async function markPaid(id: string) {
    const { error } = await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked paid"); load();
  }

  // Sends an expiry-reminder notification to the hotel/restaurant owner.
  //
  // FIX: this previously inserted { tenant_id, message, type } — but
  // NotificationBell reads rows filtered by `recipient_id` and renders
  // `n.title` / `n.body`. That column mismatch is why notifications never
  // showed up (and, if `recipient_id` is NOT NULL in the schema, why the
  // insert may have been failing outright). We now resolve the tenant's
  // owner user id and write to the columns the bell actually reads.
  async function notifyExpiry(r: any) {
    const days = daysRemaining(r);
    if (days === null) {
      return toast.error("No expiry date available for this invoice");
    }
    const tenant = tenants[r.tenant_id];
    const tenantName = tenant?.name || "this restaurant";
    const recipientId = tenant?.owner_id;

    if (!recipientId) {
      return toast.error(`${tenantName} has no owner account to notify`);
    }

    const body =
      days >= 0
        ? `Your subscription will expire in ${days} day${days === 1 ? "" : "s"}. Please renew to avoid interruption.`
        : `Your subscription expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago. Please renew as soon as possible.`;

    setNotifyingId(r.id);
    const { error } = await supabase.from("notifications").insert({
      recipient_id: recipientId,
      tenant_id: r.tenant_id,
      title: "Subscription expiry reminder",
      body,
      // type: "subscription_expiry",
      is_read: false,
    });
    setNotifyingId(null);

    if (error) return toast.error(error.message);
    toast.success(
      days >= 0
        ? `Notified ${tenantName} — ${days} day${days === 1 ? "" : "s"} left`
        : `Notified ${tenantName} — subscription expired`
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
      status: r.status === FREE_TRIAL_STATUS ? FREE_TRIAL_STATUS : r.status,
    });
    setMode("edit");
    setFormOpen(true);
  }

  // recompute amount from a plan id + billing cycle
  function priceFor(planId: string, cycle: BillingCycle) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return "";
    const price = cycle === "monthly" ? plan.monthly_price : plan.yearly_price;
    return price != null ? String(price) : "";
  }

  function onPlanChange(planId: string) {
    if (planId === FREE_TRIAL_PLAN_ID) {
      setForm((f) => ({
        ...f,
        planId,
        billingCycle: "14_days",
        amount: "0",
        status: FREE_TRIAL_STATUS,
      }));
      return;
    }
    setForm((f) => ({
      ...f,
      planId,
      // moving off the free trial: restore a sane default cycle/status
      billingCycle: f.billingCycle === "14_days" ? "monthly" : f.billingCycle,
      status: f.status === FREE_TRIAL_STATUS ? "pending" : f.status,
      amount: priceFor(planId, f.billingCycle === "14_days" ? "monthly" : f.billingCycle) || f.amount,
    }));
  }

  function onCycleChange(cycle: BillingCycle) {
    setForm((f) => ({
      ...f,
      billingCycle: cycle,
      amount: f.planId && f.planId !== FREE_TRIAL_PLAN_ID && f.planId !== CUSTOM_PLAN_ID
        ? priceFor(f.planId, cycle) || f.amount
        : f.amount,
    }));
  }

  async function submitForm() {
    if (!form.tenantId) return toast.error("Select a restaurant");
    const isFreeTrial = form.planId === FREE_TRIAL_PLAN_ID;
    const isCustomPlan = form.planId === CUSTOM_PLAN_ID;
    const amountNum = Number(form.amount);
    if (!isFreeTrial && (!form.amount || isNaN(amountNum) || amountNum <= 0)) {
      return toast.error("Enter a valid amount");
    }

    const selectedPlan = plans.find((p) => p.id === form.planId);
    const planName = isFreeTrial
      ? "Free Trial"
      : isCustomPlan
        ? customPlanLabel || null
        : selectedPlan?.name || null;

    const billingCycleValue = isFreeTrial
      ? "14 days"
      : isCustomPlan
        ? customBillingCycleRaw
        : form.planId
          ? form.billingCycle
          : null;

    // NOTE: `plan` and `billing_cycle` were added to the `invoices` table
    // after the Supabase types were last generated, so the generated
    // Insert/Update types don't know about them (hence the `never` errors).
    // The real fix is to regenerate types, e.g.:
    //   npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts
    // Until that's done, we build the payload as `any` so TS doesn't block
    // columns that do exist in the database.
    const payload: any = {
      tenant_id: form.tenantId,
      amount: isFreeTrial ? 0 : amountNum,
      invoice_number: form.invoiceNumber || null,
      issued_at: new Date(form.issuedAt).toISOString(),
      status: form.status,
      plan: planName,
      billing_cycle: billingCycleValue,
    };

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
            <tr><td class="label">Status</td><td><span class="status ${r.status === "paid" ? "paid" : r.status === "free_trial" ? "free_trial" : "pending"}">${r.status === "free_trial" ? "Free Trial" : r.status}</span></td></tr>
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
    // Browsers typically suggest the document title as the "Save as PDF"
    // filename, so this lines up the saved file with Invoice_PlateOs_{no}.
    win.document.title = fileTitle;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Create invoice
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Collected</div><div className="text-2xl font-semibold">{money(revenue)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-2xl font-semibold">{money(outstanding)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Invoices</div><div className="text-2xl font-semibold">{filteredRows.length}</div></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="text-sm font-medium">Invoices</div>
          <Popover open={filterOpen} onOpenChange={(o) => { if (o) openFilter(); else setFilterOpen(false); }}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={dateFilterActive ? "secondary" : "outline"}
                className="h-8 gap-1.5"
              >
                <Filter className="h-3.5 w-3.5" />
                {dateFilterActive
                  ? `${dateFrom ? format(startOfLocalDay(dateFrom), "MMM d") : "…"} – ${dateTo ? format(startOfLocalDay(dateTo), "MMM d") : "…"}`
                  : "Filter"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="!w-[248px] p-2">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground px-1 pt-0.5">Filter by issued date</div>
                <Calendar
                  mode="range"
                  selected={draftRange}
                  onSelect={onDraftRangeSelect}
                  defaultMonth={draftRange?.from}
                  numberOfMonths={1}
                  initialFocus
                  className="p-0"
                  classNames={{
                    months: "flex flex-col",
                    month: "space-y-1.5",
                    caption: "flex justify-center pt-0.5 relative items-center h-7",
                    caption_label: "text-xs font-medium",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-6 w-6 bg-transparent p-0 opacity-60 hover:opacity-100 inline-flex items-center justify-center rounded-md border",
                    nav_button_previous: "absolute left-0",
                    nav_button_next: "absolute right-0",
                    table: "w-full border-collapse",
                    head_row: "flex",
                    head_cell: "text-muted-foreground w-8 font-normal text-[0.7rem]",
                    row: "flex w-full mt-0.5",
                    cell: "h-8 w-8 text-center text-xs p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 hover:bg-accent rounded-md",
                    day_range_start: "day-range-start rounded-r-none",
                    day_range_end: "day-range-end rounded-l-none",
                    day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground",
                    day_outside: "text-muted-foreground opacity-40",
                    day_disabled: "text-muted-foreground opacity-40",
                    day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground rounded-none",
                    day_hidden: "invisible",
                  }}
                />
                <div className="text-xs text-muted-foreground px-1">
                  {draftFrom
                    ? `${format(startOfLocalDay(draftFrom), "MMM d")} – ${draftTo ? format(startOfLocalDay(draftTo), "MMM d, yyyy") : "…"}`
                    : "No dates selected"}
                </div>
                <div className="flex justify-end gap-1.5 pt-0.5">
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearFilter}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    Clear
                  </Button>
                  <Button size="sm" className="h-7 px-3" onClick={applyFilter} disabled={!draftFrom}>Apply</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Restaurant</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map(r => {
              const expiry = computeExpiry(r);
              const days = daysRemaining(r);
              const expired = days !== null && days < 0;
              const soon = days !== null && days >= 0 && days <= 7;
              return (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.invoice_number || r.id.slice(0,8)}</TableCell>
                <TableCell>{tenants[r.tenant_id]?.name || "—"}</TableCell>
                <TableCell>
                  {r.plan || FREE_TRIAL_LABEL}
                  {r.billing_cycle && <span className="text-xs text-muted-foreground"> ({r.billing_cycle})</span>}
                </TableCell>
                <TableCell>{money(Number(r.amount))}</TableCell>
                <TableCell className="text-xs">{format(new Date(r.issued_at), "PP")}</TableCell>
                <TableCell className="text-xs">
                  {expiry ? (
                    <span className={expired ? "text-destructive font-medium" : soon ? "text-warning font-medium" : ""}>
                      {format(expiry, "PP")}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    r.status === "paid"
                      ? "bg-success/15 text-success"
                      : r.status === FREE_TRIAL_STATUS
                        ? "bg-blue-500/15 text-blue-600"
                        : "bg-warning/15 text-warning"
                  }`}>
                    {r.status === FREE_TRIAL_STATUS ? "Free Trial" : r.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {r.status !== "paid" && (
                          <DropdownMenuItem onClick={() => markPaid(r.id)}>
                            <Check className="h-3.5 w-3.5 mr-2" />
                            Mark paid
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => notifyExpiry(r)}
                          disabled={notifyingId === r.id}
                        >
                          <Bell className="h-3.5 w-3.5 mr-2" />
                          {notifyingId === r.id
                            ? "Notifying..."
                            : days === null
                              ? "Notify (no expiry)"
                              : days >= 0
                                ? `Notify — ${days}d left`
                                : "Notify — expired"}
                        </DropdownMenuItem>
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
            );})}
            {filteredRows.length===0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No invoices found.</TableCell></TableRow>}
          </TableBody>
        </Table>
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
              <Select
                value={form.tenantId}
                onValueChange={(v) => setForm(f => ({ ...f, tenantId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a registered restaurant" />
                </SelectTrigger>
                <SelectContent>
                  {tenantList.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No restaurants found
                    </div>
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
                <Select
                  value={form.planId}
                  onValueChange={onPlanChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FREE_TRIAL_PLAN_ID}>Free Trial</SelectItem>
                    {form.planId === CUSTOM_PLAN_ID && (
                      <SelectItem value={CUSTOM_PLAN_ID}>
                        {customPlanLabel || "Current plan"}
                      </SelectItem>
                    )}
                    {plans.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No plans found
                      </div>
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
                  <Select
                    value={form.billingCycle}
                    onValueChange={(v) => onCycleChange(v as BillingCycle)}
                  >
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
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
              />
              {form.planId === FREE_TRIAL_PLAN_ID ? (
                <div className="text-xs text-muted-foreground">
                  Free trial invoices are always ₹0.
                </div>
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
                onChange={(e) => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issued date</Label>
                <Input
                  type="date"
                  value={form.issuedAt}
                  onChange={(e) => setForm(f => ({ ...f, issuedAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                {form.planId === FREE_TRIAL_PLAN_ID ? (
                  <Input value="Free Trial" disabled readOnly />
                ) : (
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm(f => ({ ...f, status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting ? (mode === "edit" ? "Saving..." : "Creating...") : (mode === "edit" ? "Save changes" : "Create invoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — controlled independently so it isn't nested
          inside the dropdown menu's trigger (that combination is flaky with
          Radix, since the menu closing can race with the alert opening). */}
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