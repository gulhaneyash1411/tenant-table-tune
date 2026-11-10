import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { format } from "date-fns";
import {
  CalendarClock, Check, CheckCircle2, Clock, CreditCard, Download, History, ShieldCheck, X, XCircle,
} from "lucide-react";
import {
  PAYMENT_METHOD_UPI,
  PAYMENT_METHOD_CASHFREE,
  INVOICE_STATUS,
  invoiceExpiry,
} from "@/lib/payment-config";
import { createCashfreeOrder, openCashfreeModal, verifyCashfreeOrder } from "@/lib/cashfree-checkout";
import { useTrialDays } from "@/lib/site-settings";
import { downloadInvoiceById } from "@/lib/invoice-download";
import { BILLING_CYCLES, addBillingCycle, type BillingCycle } from "@/lib/payment-config";
import { FEATURE_GROUPS, planAllows } from "@/config/plan-features";
import { PlanIconGlyph } from "@/config/plan-icons";

export const Route = createFileRoute("/_authenticated/app/subscription")({ component: SubscriptionPage });

type Cycle = BillingCycle;
// Label shown after the price on each plan card
const CYCLE_SUFFIX: Record<Cycle, string> = { monthly: "mo", half_yearly: "6 mo", yearly: "yr" };
const CYCLE_NAME: Record<Cycle, string> = { monthly: "monthly", half_yearly: "half-yearly", yearly: "yearly" };
const CYCLE_OPTIONS: { value: Cycle; label: string; months: number }[] = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "half_yearly", label: "Half-yearly", months: 6 },
  { value: "yearly", label: "Yearly", months: 12 },
];
type Checkout = { plan: any; cycle: Cycle; amount: number; startsAfter: Date | null; isRenewal?: boolean };

// Compact, rounded, scrollable modal shell shared by both dialogs
const MODAL_CLASS =
  "w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto rounded-2xl sm:rounded-2xl p-5";

// ---- invoice constants (same as admin billing page) ----
const FREE_TRIAL_LABEL = "Free trial";
const FREE_TRIAL_STATUS = INVOICE_STATUS.FREE_TRIAL;
const PENDING_APPROVAL = INVOICE_STATUS.PENDING_APPROVAL;
const REJECTED = INVOICE_STATUS.REJECTED;
const PLATFORM_NAME = "DineEatz";
// sessionStorage key: set just before the post-payment reload, read (and cleared) after it.
const PAID_RELOAD_FLAG = "cf_paid_reload";
const DAY_MS = 1000 * 60 * 60 * 24;

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



// Invoices can be downloaded only once settled
function canDownload(r: any) {
  return r.status === "paid" || r.status === FREE_TRIAL_STATUS;
}

// Same invoice as the admin Payments page: one shared PDF generator.
async function downloadInvoice(r: any) {
  try {
    toast.loading("Generating PDF...");
    await downloadInvoiceById(r.id);
    toast.dismiss();
  } catch (e: any) {
    toast.dismiss();
    toast.error(`Failed to download: ${e?.message ?? "Unknown error"}`);
  }
}

function priceOf(plan: any, cycle: Cycle) {
  const field = cycle === "yearly" ? "yearly_price" : cycle === "half_yearly" ? "half_yearly_price" : "monthly_price";
  return Number(plan?.[field]) || 0;
}

function SubscriptionPage() {
  const trialDays = useTrialDays();
  // An Outlet Manager can see the plan, its status and the payment history, but
  // only the owner can buy or change a plan (invoice writes are owner-only in the DB too).
  const { tenant, isOutletManager } = useTenantContext();
  const canBuy = !isOutletManager;
  const [plans, setPlans] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [cycle, setCycle] = useState<Cycle>("monthly");
  // Billing cycle chosen on each plan card (keyed by plan id).
  const [cycleByPlan, setCycleByPlan] = useState<Record<string, Cycle>>({});
  function setCardCycle(id: string, c: Cycle) { setCycleByPlan((prev) => ({ ...prev, [id]: c })); }

  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [paying, setPaying] = useState(false);
  // Outcome of a Cashfree payment, shown after Cashfree redirects back here.
  const [payResult, setPayResult] = useState<"checking" | "paid" | "pending" | "failed" | null>(null);  const [historyOpen, setHistoryOpen] = useState(false);
  const [extendedDays, setExtendedDays] = useState<Record<string, number>>({});

  const load = useCallback(async (currentTenant = tenant) => {
    if (!currentTenant) return;

    // Switch to the next plan if its start time has passed (cron also does this)
    try { await (supabase as any).rpc("activate_scheduled_subscriptions"); } catch { /* ignore */ }

    const [{ data: pl }, { data: sb }, { data: inv }] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("is_active", true).eq("is_free", false).order("sort_order"),
      (supabase as any)
        .from("subscriptions")
        .select("*, plan:subscription_plans(*)")
        .eq("tenant_id", currentTenant.id)
        .neq("status", "canceled")
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("invoices")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("issued_at", { ascending: false }),
    ]);
    setPlans(pl || []);
    setSubs(sb || []);
    // An online order that was never paid (abandoned or failed) isn't a real invoice for the owner.
    setHistory((inv || []).filter((r: any) => r.payment_method !== PAYMENT_METHOD_CASHFREE || r.status === "paid"));

    // Sum up admin-granted extension days per subscription from audit logs.
    const { data: extLogs } = await supabase
      .from("audit_logs")
      .select("entity_id, new_value")
      .eq("tenant_id", currentTenant.id)
      .eq("action", "subscription.extended");
    const bySubId: Record<string, number> = {};
    for (const log of extLogs || []) {
      const days = Number((log.new_value as any)?.days) || 0;
      if (days > 0 && log.entity_id) bySubId[log.entity_id] = (bySubId[log.entity_id] || 0) + days;
    }
    setExtendedDays(bySubId);
  }, [tenant]);
  useEffect(() => { load(); }, [load]);

  // A verified payment hard-reloads the page so every part of the app picks up the
  // new plan. The flag re-shows the success dialog after the reload, once.
  const reloadingRef = useRef(false);
  function reloadAfterPaid() {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    try { sessionStorage.setItem(PAID_RELOAD_FLAG, "1"); } catch {}
    window.location.reload();
  }

  // Back from Cashfree: confirm the order on the server (it activates the plan if paid).
  useEffect(() => {
    let reloadedAfterPaid = false;
    try {
      reloadedAfterPaid = sessionStorage.getItem(PAID_RELOAD_FLAG) === "1";
      sessionStorage.removeItem(PAID_RELOAD_FLAG);
    } catch {}
    if (reloadedAfterPaid) setPayResult("paid");

    const orderId = new URLSearchParams(window.location.search).get("cf_order");
    if (!orderId) return;
    window.history.replaceState(null, "", window.location.pathname);
    setPayResult("checking");
    verifyCashfreeOrder(orderId)
      .then((status) => (status === "paid" ? reloadAfterPaid() : setPayResult(status)))
      .catch((e) => { setPayResult(null); toast.error(e.message); })
      .finally(load);
  }, [load]);

  // ---- derived plan state ----
  const now = new Date();
  const scheduledSub =
    subs
      .filter((s) => s.status === "scheduled")
      .sort((a, b) => +new Date(a.current_period_start) - +new Date(b.current_period_start))[0] || null;
  const current = subs.find((s) => s.status === "active") || subs.find((s) => s.status !== "scheduled") || null;
  const currentEnd = current ? new Date(current.current_period_end) : null;
  const activeNow = !!current && current.status === "active" && !!currentEnd && currentEnd > now;
  const completed = !!current && current.status === "completed";
  const completedEarly = completed && !!currentEnd && currentEnd > now;
  const expired = !!current && !activeNow;
  const daysLeft = activeNow && currentEnd ? Math.max(0, Math.ceil((currentEnd.getTime() - now.getTime()) / DAY_MS)) : 0;
  const currentPlanId = current?.plan_id;
  // Billing cycle of the current subscription: from its paid invoice, else from the period length.
  const cycleFromLength = (s: any): Cycle => {
    const days = (new Date(s.current_period_end).getTime() - new Date(s.current_period_start).getTime()) / DAY_MS;
    return days > 320 ? "yearly" : days > 120 ? "half_yearly" : "monthly";
  };
  const invoiceCycle = history.find((i) => i.status === "paid" && i.plan_id === currentPlanId && (BILLING_CYCLES as readonly string[]).includes(i.billing_cycle))?.billing_cycle as Cycle | undefined;
  const currentCycle: Cycle | null = current ? (invoiceCycle ?? cycleFromLength(current)) : null;
  const onCurrentCycle = currentCycle === cycle;
  // "Current" means this plan on this billing cycle. Other cycles of the same plan are not current.
  const isCurrentCard = (p: any, c: Cycle = cycle) => p.id === currentPlanId && currentCycle === c;
  const currentPlan = plans.find((x) => x.id === currentPlanId) || current?.plan;

  const latestRequest = history.find((r) => r.payment_method === PAYMENT_METHOD_UPI) || null;
  const pending = latestRequest?.status === PENDING_APPROVAL;
  const rejected = latestRequest?.status === REJECTED;
  const queuedPending = pending && activeNow; // will start after the current plan
  const immediatePending = pending && !activeNow; // will start on approval

  const hasNextPlan = !!scheduledSub || queuedPending;
  const requestedPlanId = scheduledSub?.plan_id ?? (pending ? latestRequest?.plan_id : null);
  const locked = pending || !!scheduledSub;

  const scheduledInvoice = scheduledSub ? history.find((i) => i.subscription_id === scheduledSub.id) : null;
  const nextPlanName = scheduledSub?.plan?.name || latestRequest?.plan;
  const nextPlanCycle = scheduledInvoice?.billing_cycle || (queuedPending ? latestRequest?.billing_cycle : null);
  const nextStart = scheduledSub ? new Date(scheduledSub.current_period_start) : currentEnd;
  // A scheduled plan has a stored end date; a queued one runs one cycle from its start.
  const nextEnd = scheduledSub
    ? new Date(scheduledSub.current_period_end)
    : nextStart && nextPlanCycle ? addBillingCycle(nextStart, nextPlanCycle, trialDays) : null;
  // Every scheduled plan, in the order they will start (the first is the immediate next plan).
  const scheduledSubs = subs
    .filter((x) => x.status === "scheduled")
    .sort((a, b) => +new Date(a.current_period_start) - +new Date(b.current_period_start));

  // Arrived from "Buy now" on the outlet form: open checkout for that plan once.
  useEffect(() => {
    const planId = new URLSearchParams(window.location.search).get("plan");
    if (!planId || plans.length === 0) return;
    const p = plans.find((x) => x.id === planId);
    if (!p) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (canBuy) openCheckout(p);
  }, [plans]);

  // Billing cycle of a scheduled subscription (from its invoice, else its period length).
  const cycleOfSub = (x: any): Cycle => {
    const c = history.find((h) => h.subscription_id === x.id)?.billing_cycle;
    return (BILLING_CYCLES as readonly string[]).includes(c) ? (c as Cycle) : cycleFromLength(x);
  };
  // A card is "scheduled" only for the plan AND cycle that is scheduled, not for every cycle of that plan.
  const isScheduledCard = (p: any, c: Cycle = cycle) => scheduledSubs.some((x) => x.plan_id === p.id && cycleOfSub(x) === c);
  const isPendingCard = (p: any, c: Cycle = cycle) => pending && latestRequest?.plan_id === p.id && latestRequest?.billing_cycle === c;
  const isRequestedCard = (p: any, c: Cycle = cycle) => isScheduledCard(p, c) || isPendingCard(p, c);

  function planButton(p: any, c: Cycle = cycle): { label: string; disabled: boolean } {
    const isCurrent = p.id === currentPlanId;
    if (!canBuy) return { label: isCurrent && activeNow ? "Current plan" : "Owner only", disabled: true };
    if (isScheduledCard(p, c)) return { label: "Scheduled", disabled: true };
    if (isPendingCard(p, c)) return queuedPending
      ? { label: "Next plan", disabled: true }
      : { label: "Awaiting approval", disabled: true };
    if (isCurrent && activeNow && currentCycle !== c) return { label: "Switch plan", disabled: locked };
    if (isCurrent && activeNow) return { label: "Buy again", disabled: locked };
    if (isCurrent) return { label: "Renew", disabled: locked };
    if (!activeNow) return { label: "Buy plan", disabled: locked };
    const label = priceOf(p, c) > priceOf(currentPlan, c) ? "Upgrade" : "Switch plan";
    return { label, disabled: locked };
  }

  function openCheckout(plan: any, c: Cycle = cycle) {
    if (!canBuy) return toast.error("Only the owner can buy or change the subscription");
    if (locked) return toast.error("You already have a next plan selected");
    const amount = priceOf(plan, c);
    if (amount <= 0) return toast.error("This plan has no price set. Contact support.");
    const isRenewal = plan.id === currentPlanId && activeNow && currentCycle === c;
    setCheckout({
      plan,
      cycle: c,
      amount,
      startsAfter: activeNow && !isRenewal ? currentEnd : null,
      isRenewal,
    });
  }

  function closeCheckout() {
    setCheckout(null);
  }

  // Opens Cashfree's payment popup over this page. The plan is activated on the
  // server only after it confirms the payment with Cashfree (or via the webhook).
  async function payNow() {
    if (!checkout || !tenant) return;
    setPaying(true);
    let order;
    try {
      order = await createCashfreeOrder({ tenantId: tenant.id, planId: checkout.plan.id, cycle: checkout.cycle });
    } catch (e: any) {
      toast.error(e.message);
      setPaying(false);
      return;
    }
    // Our dialog traps focus and clicks, so close it before Cashfree's popup opens.
    closeCheckout();
    setPaying(false);
    try {
      const { redirecting } = await openCashfreeModal(order.payment_session_id);
      if (redirecting) return; // the bank page takes over; we verify on return
    } catch (e: any) {
      toast.error(e.message);
    }
    // Paid, failed or closed: the server asks Cashfree which one it was.
    setPayResult("checking");
    try {
      const status = await verifyCashfreeOrder(order.order_id);
      // Popup closed before Cashfree saw a payment. A UPI payment can still be in flight,
      // so the order stays open and the webhook activates the plan if it goes through.
      if (status === "pending") {
        setPayResult(null);
        toast.info("Payment not completed. If money was debited, your plan will start automatically once the bank confirms it.");
      } else if (status === "paid") {
        return reloadAfterPaid();
      } else {
        setPayResult(status);
      }
    } catch (e: any) {
      setPayResult(null);
      toast.error(e.message);
    }
    load();
  }

  function paymentLabel(r: any) {
    if (r.payment_method === PAYMENT_METHOD_CASHFREE) return "Online";
    if (r.payment_method === PAYMENT_METHOD_UPI) return "UPI";
    if (r.payment_method === "manual") return "Manual";
    return "—";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="h-4 w-4 mr-1" />
          Payment history
          {history.length > 0 && (
            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">{history.length}</span>
          )}
        </Button>
      </div>

      {!canBuy && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          View only. Only the owner can buy, renew or change the subscription.
        </div>
      )}

      {/* No active plan: request starts as soon as it is approved */}
      {immediatePending && (
        <Card className="p-4 flex gap-3 items-start border-warning/40 bg-warning/5">
          <Clock className="h-5 w-5 text-warning mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-medium">Payment received, waiting for approval</div>
            <div className="text-muted-foreground">
              {latestRequest.plan} ({latestRequest.billing_cycle}) · {money(Number(latestRequest.amount))} · UTR{" "}
              <span className="font-mono">{latestRequest.utr}</span>. Your plan starts as soon as the admin approves it.
            </div>
          </div>
        </Card>
      )}

      {rejected && (
        <Card className="p-4 flex gap-3 items-start border-destructive/40 bg-destructive/5">
          <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-medium">Payment for {latestRequest.plan} was not approved</div>
            <div className="text-muted-foreground">
              {latestRequest.rejection_reason || "The payment could not be verified."} If money was debited, contact
              support with UTR <span className="font-mono">{latestRequest.utr}</span>, or buy the plan again.
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {current && (
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Current plan</div>
            <div className="text-xl font-semibold flex items-center gap-2 mt-0.5">
              {current.plan?.name}{currentCycle && <span className="text-sm font-normal text-muted-foreground">({CYCLE_NAME[currentCycle]})</span>}
              {activeNow ? (
                <Badge className="bg-success/15 text-success hover:bg-success/15">Active</Badge>
              ) : completed ? (
                <Badge className="bg-blue-500/15 text-blue-600 hover:bg-blue-500/15">Completed</Badge>
              ) : (
                <Badge variant="destructive">Expired</Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {activeNow ? (
                <>
                  Active from {format(new Date(current.current_period_start), "PP")} to{" "}
                  {format(currentEnd!, "PP")}
                </>
              ) : completedEarly ? (
                <>
                  Completed early · was valid from {format(new Date(current.current_period_start), "PP")} to{" "}
                  {format(currentEnd!, "PP")}
                </>
              ) : completed ? (
                <>
                  Completed · ran from {format(new Date(current.current_period_start), "PP")} to{" "}
                  {format(currentEnd!, "PP")}
                </>
              ) : (
                <>Expired on {format(currentEnd!, "PP")}</>
              )}
            </div>
            {activeNow && (
              <div className="text-xs text-muted-foreground mt-1">
                {daysLeft} day{daysLeft === 1 ? "" : "s"} left
              </div>
            )}
            {current && extendedDays[current.id] > 0 && (
              <div className="text-xs text-green-600 mt-1">
                +{extendedDays[current.id]} day{extendedDays[current.id] === 1 ? "" : "s"} extended
              </div>
            )}
          </Card>
        )}
        {scheduledSubs.map((x, i) => {
          const inv = history.find((h) => h.subscription_id === x.id);
          const cycleName = inv?.billing_cycle ? CYCLE_NAME[inv.billing_cycle as Cycle] ?? inv.billing_cycle : null;
          const start = new Date(x.current_period_start);
          const end = new Date(x.current_period_end);
          return (
            <Card key={x.id} className="p-4 border-dashed border-primary/40 bg-primary/5">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                {i === 0 ? "Next plan" : `Plan ${i + 2}`}
              </div>
              <div className="text-xl font-semibold flex flex-wrap items-center gap-2 mt-0.5">
                {x.plan?.name ?? "Plan"}
                {cycleName && <span className="text-sm font-normal text-muted-foreground">({cycleName})</span>}
                <Badge variant="outline" className="border-primary text-primary">Scheduled</Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                This plan will become active after the {i === 0 ? "current plan" : "previous plan"} ends on {format(start, "PP")}.
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Active from {format(start, "PP")} to {format(end, "PP")}
              </div>
            </Card>
          );
        })}
        {queuedPending && (
          <Card className="p-4 border-dashed border-orange-500/50 bg-orange-500/5">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Next plan
            </div>
            <div className="text-xl font-semibold flex flex-wrap items-center gap-2 mt-0.5">
              {latestRequest?.plan}
              {latestRequest?.billing_cycle && (
                <span className="text-sm font-normal text-muted-foreground">({CYCLE_NAME[latestRequest.billing_cycle as Cycle] ?? latestRequest.billing_cycle})</span>
              )}
              <Badge variant="outline" className="border-orange-500 text-orange-600">Payment under review</Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              This plan will become active after the current plan ends on {nextStart ? format(nextStart, "PP") : "—"}.
            </div>
            {nextStart && nextEnd && (
              <div className="text-sm text-muted-foreground mt-1">
                Active from {format(nextStart, "PP")} to {format(nextEnd, "PP")}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              Payment of {money(Number(latestRequest.amount))} (UTR <span className="font-mono">{latestRequest.utr}</span>) is being verified.
            </div>
          </Card>
        )}

      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {locked && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {hasNextPlan
              ? "Your next plan is already selected. You can choose another plan after it starts."
              : "You can choose another plan after your current request is reviewed."}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Cheapest first, for the billing cycle on screen */}
        {[...plans].sort((a, b) => priceOf(a, "monthly") - priceOf(b, "monthly")).map((p) => {
          // This card's own billing cycle: the one it's on, else monthly.
          const cardCycle: Cycle = cycleByPlan[p.id] ?? (p.id === currentPlanId && currentCycle ? currentCycle : "monthly");
          const price = priceOf(p, cardCycle);
          const isCurrent = isCurrentCard(p, cardCycle);
          const isRequested = isRequestedCard(p, cardCycle);
          const btn = planButton(p, cardCycle);
          // Each billing cycle for this plan, with the saving against paying monthly.
          const cycleRows = CYCLE_OPTIONS.map((o) => {
            const total = priceOf(p, o.value);
            const monthlyTotal = priceOf(p, "monthly") * o.months;
            return { ...o, monthlyEquiv: total / o.months, saved: Math.max(0, monthlyTotal - total) };
          });
          // What this plan includes, read from its feature switches and limits.
          const cap = (v: number | null | undefined) => (v == null ? "Unlimited" : v);
          const included = FEATURE_GROUPS.map((g) => ({
            title: g.title,
            items: g.items.filter((i) => planAllows(p.features, i.key)).map((i) => i.label),
          })).filter((g) => g.items.length > 0);
          const limitItems = [`${cap(p.max_tables)} tables`, `${cap(p.max_orders_month)} orders/mo`, `${cap(p.max_menu_items)} menu items`, `${cap(p.max_staff)} staff`];
          const groups = [
            ...included,
            { title: "Limits", items: limitItems },
          ];
          // Lists the admin wrote on the plan take over from the switches when there are any.
          const writtenMode = (p.included_features?.length ?? 0) + (p.not_included_features?.length ?? 0) > 0;
          const writtenIncluded = [...(p.included_features ?? []), ...limitItems];
          const notIncluded: string[] = writtenMode
            ? (p.not_included_features ?? [])
            : FEATURE_GROUPS.flatMap((g) => g.items.filter((i) => !planAllows(p.features, i.key)).map((i) => i.label));
          return (
            <Card
              key={p.id}
              onClick={() => { if (!btn.disabled) openCheckout(p, cardCycle); }}
              className={`p-5 flex flex-col transition-transform duration-200 ${
                btn.disabled ? "" : "cursor-pointer hover:scale-[1.03] hover:shadow-lg"
              } ${
                isCurrent && activeNow ? "border-primary ring-1 ring-primary" : isRequested ? "border-dashed border-primary/60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 font-semibold text-lg"><PlanIconGlyph name={p.icon} className="h-5 w-5 shrink-0 text-primary" />{p.name}</div>
                <div className="flex flex-wrap justify-end gap-1">
                  {p.tag && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">{p.tag}</span>}
                  {planAllows(p.features, "settings_outlets") && (
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Multi-outlet</span>
                  )}
                  {isCurrent && <Badge>{activeNow ? "Current" : completed ? "Completed" : "Expired"}</Badge>}
                  {isRequested && <Badge variant="outline">{hasNextPlan ? "Next plan" : "Requested"}</Badge>}
                </div>
              </div>
              <div className="text-sm text-muted-foreground mt-1 min-h-[40px]">{p.description}</div>
              <div className="text-2xl font-semibold mt-3">
                {money(price)}
                <span className="text-xs text-muted-foreground font-normal">/{CYCLE_SUFFIX[cardCycle]}</span>
              </div>
              <div className="mt-3 grid gap-1.5">
                {cycleRows.map((r) => {
                  const on = cardCycle === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      aria-pressed={on}
                      onClick={(e) => { e.stopPropagation(); setCardCycle(p.id, r.value); }}
                      className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${on ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      <span className="flex items-center gap-1 font-medium">
                        {activeNow && p.id === currentPlanId && currentCycle === r.value && <Check className="h-4 w-4 text-success" strokeWidth={3} />}
                        {r.label}
                      </span>
                      <span className="text-right">
                        <span className="font-semibold">{money(Math.round(r.monthlyEquiv))}/mo</span>
                        {r.saved > 0 && <span className="ml-2 font-semibold text-success">Save {money(Math.round(r.saved))}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 border-t pt-4 flex-1">
                <div className="text-sm font-semibold">Included features</div>
                {writtenMode ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {writtenIncluded.map((n) => (
                      <li key={n} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={3} />
                        <span className="min-w-0">{n}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {groups.map((g) => (
                      <div key={g.title} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{g.title}</div>
                          <div className="text-xs text-muted-foreground">{g.items.join(", ")}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {notIncluded.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <div className="text-sm font-semibold">Not included</div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {notIncluded.map((n) => (
                      <span key={n} className="flex items-center gap-1.5">
                        <X className="h-3.5 w-3.5 shrink-0 text-destructive" strokeWidth={3} />
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <Button
                className="mt-4 w-full"
                variant={btn.disabled ? "outline" : "default"}
                disabled={btn.disabled}
                onClick={(e) => { e.stopPropagation(); openCheckout(p, cardCycle); }}
              >
                {btn.label}
              </Button>
            </Card>
          );
        })}
      </div>

      {/* Checkout dialog — compact, rounded, scrolls on small screens */}
      <Dialog open={!!checkout} onOpenChange={(o) => !o && !paying && closeCheckout()}>
        <DialogContent className={`${MODAL_CLASS} sm:max-w-sm`}>
          {checkout && (
            <>
              <DialogHeader className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Pay for {checkout.plan.name}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Pay securely with UPI, card, net banking or wallet. Your plan starts as soon as the payment succeeds.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-xl bg-muted/40 px-3 py-2 text-sm flex justify-between">
                  <span className="capitalize">{checkout.plan.name} · {CYCLE_NAME[checkout.cycle]}</span>
                  <span className="font-semibold">{money(checkout.amount)}</span>
                </div>

                {checkout.isRenewal && (
                  <div className="rounded-xl border border-success/30 bg-success/5 px-3 py-2 text-xs">
                    Your current plan will be extended by one {CYCLE_NAME[checkout.cycle]} billing cycle from{" "}
                    <span className="font-medium">{currentEnd ? format(currentEnd, "PP") : "now"}</span>.
                  </div>
                )}
                {checkout.startsAfter && !checkout.isRenewal && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                    Your current plan continues as normal. This plan will become active after it ends on{" "}
                    <span className="font-medium">{format(checkout.startsAfter, "PP")}</span>.
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                  Payments are processed securely by Cashfree.
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" className="rounded-lg" onClick={closeCheckout} disabled={paying}>
                  Cancel
                </Button>
                <Button className="rounded-lg" onClick={payNow} disabled={paying}>
                  {paying ? "Opening payment…" : `Pay ${money(checkout.amount)}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Result of a Cashfree payment, after Cashfree redirects back */}
      <Dialog open={!!payResult} onOpenChange={(o) => !o && payResult !== "checking" && setPayResult(null)}>
        <DialogContent className={`${MODAL_CLASS} sm:max-w-sm`}>
          <div className="flex flex-col items-center text-center gap-2 py-2">
            {payResult === "paid" ? (
              <CheckCircle2 className="h-11 w-11 text-success" />
            ) : payResult === "failed" ? (
              <XCircle className="h-11 w-11 text-destructive" />
            ) : (
              <Clock className="h-11 w-11 text-warning" />
            )}
            <DialogHeader className="items-center space-y-1">
              <DialogTitle className="text-base">
                {payResult === "checking" ? "Confirming your payment…"
                  : payResult === "paid" ? "Payment successful"
                  : payResult === "failed" ? "Payment not completed"
                  : "Payment is processing"}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {payResult === "checking" ? "Please wait while we confirm your payment with the bank."
                  : payResult === "paid" ? "Your plan is active. If you already had a plan running, the new one starts after it ends."
                  : payResult === "failed" ? "No money was taken for this order. You can choose a plan and try again."
                  : "Your bank hasn't confirmed the payment yet. Your plan will start automatically once it does."}
              </DialogDescription>
            </DialogHeader>
            {payResult !== "checking" && (
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => { setPayResult(null); setHistoryOpen(true); }}
                >
                  View history
                </Button>
                <Button className="rounded-lg" onClick={() => setPayResult(null)}>Done</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment history dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className={`${MODAL_CLASS} sm:max-w-2xl`}>
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              Payment history
            </DialogTitle>
            <DialogDescription className="text-xs">
              Invoices can be downloaded once a payment is approved.
            </DialogDescription>
          </DialogHeader>

          {history.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No payments yet. Choose a plan to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((r) => {
                const meta = statusMeta(r.status);
                const expiry = invoiceExpiry(r, trialDays);
                const downloadable = canDownload(r);
                const periodStart = r.period_start ? new Date(r.period_start) : null;
                const upcoming = r.status === "paid" && !!periodStart && periodStart > now;
                return (
                  <div key={r.id} className="rounded-xl border p-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.plan || FREE_TRIAL_LABEL}</span>
                        {r.billing_cycle && (
                          <span className="text-xs text-muted-foreground capitalize">({r.billing_cycle})</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${meta.className}`}>
                          {meta.label}
                        </span>
                        {upcoming && (
                          <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-primary/10 text-primary">
                            Scheduled
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{r.invoice_number || String(r.id).slice(0, 8)}</span>
                        {" · "}
                        {format(new Date(r.issued_at), "PP")}
                        {" · "}
                        {paymentLabel(r)}
                        {r.utr && <> · UTR <span className="font-mono">{r.utr}</span></>}
                      </div>
                      {r.paid_at && (
                        <div className="text-xs text-muted-foreground">
                          Paid {format(new Date(r.paid_at), "PP")}
                          {periodStart && expiry ? (
                            <> · Valid {format(periodStart, "PP")} to {format(expiry, "PP")}</>
                          ) : expiry ? (
                            <> · Valid until {format(expiry, "PP")}</>
                          ) : null}
                        </div>
                      )}
                      {r.status === PENDING_APPROVAL && (
                        <div className="text-xs text-orange-600">Waiting for admin approval</div>
                      )}
                      {r.status === REJECTED && r.rejection_reason && (
                        <div className="text-xs text-destructive">Reason: {r.rejection_reason}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold">{money(Number(r.amount))}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg"
                        disabled={!downloadable}
                        title={downloadable ? "Download invoice" : "Available after approval"}
                        onClick={() => downloadInvoice(r)}
                      >
                        <Download className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Invoice</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}