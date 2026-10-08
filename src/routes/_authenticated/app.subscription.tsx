import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentOutlet } from "@/lib/outlet-context";
import { useTenantContext } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { format } from "date-fns";
import {
  CalendarClock, Check, CheckCircle2, Clock, CreditCard, Download, History, QrCode, Smartphone, XCircle,
} from "lucide-react";
import {
  UPI_ID,
  UPI_PAYEE_NAME,
  PAYMENT_METHOD_UPI,
  INVOICE_STATUS,
  UTR_PATTERN,
  buildUpiUrl,
  invoiceExpiry,
} from "@/lib/payment-config";
import { useTrialDays } from "@/lib/site-settings";

export const Route = createFileRoute("/_authenticated/app/subscription")({ component: SubscriptionPage });

type Cycle = "monthly" | "yearly";
type Checkout = { plan: any; cycle: Cycle; amount: number; invoiceNumber: string; startsAfter: Date | null };

// Compact, rounded, scrollable modal shell shared by both dialogs
const MODAL_CLASS =
  "w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto rounded-2xl sm:rounded-2xl p-5";

// ---- invoice constants (same as admin billing page) ----
const FREE_TRIAL_LABEL = "Free trial";
const FREE_TRIAL_STATUS = INVOICE_STATUS.FREE_TRIAL;
const PENDING_APPROVAL = INVOICE_STATUS.PENDING_APPROVAL;
const REJECTED = INVOICE_STATUS.REJECTED;
const PLATFORM_NAME = "DineEatz";
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

const INVOICE_LOGO_SVG = `
  <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
    <circle cx="15" cy="15" r="15" fill="#1E6FF2"/>
    <path d="M11 8.5V14.2C11 15.4 11.8 16.4 12.9 16.7V22.2H14.1V16.7C15.2 16.4 16 15.4 16 14.2V8.5H14.9V13.6H14.1V8.5H13V13.6H12.1V8.5H11Z" fill="#ffffff"/>
    <path d="M19.4 8.5C17.9 8.5 16.9 10.1 16.9 12.1C16.9 13.8 17.6 15.2 18.7 15.7V22.2H19.9V15.7C21 15.2 21.7 13.8 21.7 12.1C21.7 10.1 20.8 8.5 19.4 8.5Z" fill="#ffffff"/>
  </svg>
`;


// Invoices can be downloaded only once settled
function canDownload(r: any) {
  return r.status === "paid" || r.status === FREE_TRIAL_STATUS;
}

// Same invoice as admin billing page's downloadInvoice
function downloadInvoice(r: any, tenantName: string, trialDays: number) {
  const invoiceNo = r.invoice_number || r.id.slice(0, 8);
  const issuedDate = format(new Date(r.issued_at), "PP");
  const paidDate = r.paid_at ? format(new Date(r.paid_at), "PP") : "—";
  const planLabel = r.plan || FREE_TRIAL_LABEL;
  const expiry = invoiceExpiry(r, trialDays);
  const expiryLabel = expiry ? format(expiry, "PP") : "—";
  const meta = statusMeta(r.status);
  const paymentLabel = r.payment_method === PAYMENT_METHOD_UPI ? `UPI${r.utr ? ` (UTR ${r.utr})` : ""}` : "—";
  const fileTitle = `Invoice_DineEatz_${invoiceNo}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${fileTitle}</title>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Arial, sans-serif; padding: 40px; color: #111; }
          .header { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 16px; }
          .header img { height: 40px; width: auto; }
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
          <img src="${window.location.origin}/brand/dineeatz-logo.png?v=3" alt="${PLATFORM_NAME}" />
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

function priceOf(plan: any, cycle: Cycle) {
  return Number(cycle === "yearly" ? plan?.yearly_price : plan?.monthly_price) || 0;
}

function SubscriptionPage() {
  const trialDays = useTrialDays();
  // An Outlet Manager can see the plan, its status and the payment history, but
  // only the owner can buy or change a plan (invoice writes are owner-only in the DB too).
  const { isOutletManager } = useTenantContext();
  const canBuy = !isOutletManager;
  const [tenant, setTenant] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [cycle, setCycle] = useState<Cycle>("monthly");

  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [step, setStep] = useState<"pay" | "done">("pay");
  const [utr, setUtr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const t = await fetchCurrentOutlet(u.user.id);
    setTenant(t);
    if (!t) return;

    // Switch to the next plan if its start time has passed (cron also does this)
    try { await (supabase as any).rpc("activate_scheduled_subscriptions"); } catch { /* ignore */ }

    const [{ data: pl }, { data: sb }, { data: inv }] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("is_active", true).order("sort_order"),
      (supabase as any)
        .from("subscriptions")
        .select("*, plan:subscription_plans(*)")
        .eq("tenant_id", t.id)
        .neq("status", "canceled")
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("invoices")
        .select("*")
        .eq("tenant_id", t.id)
        .order("issued_at", { ascending: false }),
    ]);
    setPlans(pl || []);
    setSubs(sb || []);
    setHistory(inv || []);
  }
  useEffect(() => { load(); }, []);

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

  function planButton(p: any): { label: string; disabled: boolean } {
    const isCurrent = p.id === currentPlanId;
    if (!canBuy) return { label: isCurrent && activeNow ? "Current plan" : "Owner only", disabled: true };
    if (p.id === requestedPlanId) {
      if (scheduledSub) return { label: "Scheduled", disabled: true };
      if (queuedPending) return { label: "Next plan", disabled: true };
      return { label: "Awaiting approval", disabled: true };
    }
    if (isCurrent && activeNow) return { label: "Current plan", disabled: true };
    if (isCurrent) return { label: "Renew", disabled: locked };
    if (!activeNow) return { label: "Buy plan", disabled: locked };
    const label = priceOf(p, cycle) > priceOf(currentPlan, cycle) ? "Upgrade" : "Switch plan";
    return { label, disabled: locked };
  }

  function openCheckout(plan: any) {
    if (!canBuy) return toast.error("Only the owner can buy or change the subscription");
    if (locked) return toast.error("You already have a next plan selected");
    const amount = priceOf(plan, cycle);
    if (amount <= 0) return toast.error("This plan has no price set. Contact support.");
    setCheckout({
      plan,
      cycle,
      amount,
      invoiceNumber: "INV-" + Date.now().toString().slice(-8),
      startsAfter: activeNow ? currentEnd : null,
    });
    setUtr("");
    setStep("pay");
  }

  function closeCheckout() {
    setCheckout(null);
    setUtr("");
    setStep("pay");
  }

  async function submitPayment() {
    if (!checkout || !tenant) return;
    const ref = utr.trim().toUpperCase();
    if (!UTR_PATTERN.test(ref)) {
      return toast.error("Enter the UPI transaction ID (UTR) shown in your payment app");
    }

    setSubmitting(true);
    // Not activated here. The admin verifies the payment; approval either
    // activates it now or schedules it after the current plan ends.
    const { error } = await (supabase as any).from("invoices").insert({
      tenant_id: tenant.id,
      plan_id: checkout.plan.id,
      plan: checkout.plan.name,
      billing_cycle: checkout.cycle,
      amount: checkout.amount,
      tax: Math.round(checkout.amount * 0.18),
      status: PENDING_APPROVAL,
      payment_method: PAYMENT_METHOD_UPI,
      utr: ref,
      issued_at: new Date().toISOString(),
      paid_at: null,
      invoice_number: checkout.invoiceNumber,
    });
    setSubmitting(false);

    if (error) {
      if (error.code === "23505") return toast.error("This transaction ID has already been submitted");
      return toast.error(error.message);
    }
    setStep("done");
    load();
  }

  function paymentLabel(r: any) {
    if (r.payment_method === PAYMENT_METHOD_UPI) return "UPI";
    if (r.payment_method === "manual") return "Manual";
    return "—";
  }

  const upiUrl = checkout
    ? buildUpiUrl(checkout.amount, `${checkout.invoiceNumber} ${checkout.plan.name} ${checkout.cycle}`)
    : "";

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

      <div className={`grid gap-4 ${hasNextPlan ? "md:grid-cols-2" : ""}`}>
        {current && (
          <Card className="p-5">
            <div className="text-xs text-muted-foreground">Current plan</div>
            <div className="text-xl font-semibold flex items-center gap-2 mt-0.5">
              {current.plan?.name}
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
          </Card>
        )}

        {hasNextPlan && (
          <Card className="p-5 border-dashed border-primary/40 bg-primary/5">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Next plan
            </div>
            <div className="text-xl font-semibold flex flex-wrap items-center gap-2 mt-0.5">
              {nextPlanName}
              {nextPlanCycle && (
                <span className="text-sm font-normal text-muted-foreground capitalize">({nextPlanCycle})</span>
              )}
              <Badge variant="outline" className={scheduledSub ? "border-primary text-primary" : "border-orange-500 text-orange-600"}>
                {scheduledSub ? "Scheduled" : "Payment under review"}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              This plan will become active after the current plan ends on {nextStart ? format(nextStart, "PP") : "—"}.
            </div>
            {scheduledSub && (
              <div className="text-xs text-muted-foreground mt-1">
                Runs from {format(new Date(scheduledSub.current_period_start), "PP")} to{" "}
                {format(new Date(scheduledSub.current_period_end), "PP")}
              </div>
            )}
            {queuedPending && (
              <div className="text-xs text-muted-foreground mt-1">
                Payment of {money(Number(latestRequest.amount))} (UTR <span className="font-mono">{latestRequest.utr}</span>) is being verified.
              </div>
            )}
          </Card>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border p-1 bg-muted/40">
          <button onClick={() => setCycle("monthly")} className={`px-3 py-1 text-sm rounded ${cycle === "monthly" ? "bg-background shadow" : ""}`}>Monthly</button>
          <button onClick={() => setCycle("yearly")} className={`px-3 py-1 text-sm rounded ${cycle === "yearly" ? "bg-background shadow" : ""}`}>
            Yearly <span className="text-xs text-success">−17%</span>
          </button>
        </div>
        {locked && (
          <div className="text-xs text-muted-foreground">
            {hasNextPlan
              ? "Your next plan is already selected. You can choose another plan after it starts."
              : "You can choose another plan after your current request is reviewed."}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {plans.map((p) => {
          const price = priceOf(p, cycle);
          const isCurrent = p.id === currentPlanId;
          const isRequested = p.id === requestedPlanId;
          const btn = planButton(p);
          return (
            <Card
              key={p.id}
              className={`p-5 flex flex-col ${
                isCurrent && activeNow ? "border-primary ring-1 ring-primary" : isRequested ? "border-dashed border-primary/60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-lg">{p.name}</div>
                <div className="flex flex-wrap justify-end gap-1">
                  {isCurrent && <Badge>{activeNow ? "Current" : completed ? "Completed" : "Expired"}</Badge>}
                  {isRequested && <Badge variant="outline">{hasNextPlan ? "Next plan" : "Requested"}</Badge>}
                </div>
              </div>
              <div className="text-xs text-muted-foreground min-h-[32px]">{p.description}</div>
              <div className="text-2xl font-semibold mt-3">
                {money(price)}
                <span className="text-xs text-muted-foreground font-normal">/{cycle === "yearly" ? "yr" : "mo"}</span>
              </div>
              <ul className="text-xs space-y-1 mt-3 flex-1">
                {p.max_tables && <li className="flex gap-1"><Check className="h-3 w-3 text-success" />{p.max_tables} tables</li>}
                {p.max_orders_month && <li className="flex gap-1"><Check className="h-3 w-3 text-success" />{p.max_orders_month} orders/mo</li>}
                {p.max_menu_items && <li className="flex gap-1"><Check className="h-3 w-3 text-success" />{p.max_menu_items} menu items</li>}
                {p.max_staff && <li className="flex gap-1"><Check className="h-3 w-3 text-success" />{p.max_staff} staff</li>}
              </ul>
              <Button
                className="mt-4 w-full"
                variant={btn.disabled ? "outline" : "default"}
                disabled={btn.disabled}
                onClick={() => openCheckout(p)}
              >
                {btn.label}
              </Button>
            </Card>
          );
        })}
      </div>

      {/* Checkout dialog — compact, rounded, scrolls on small screens */}
      <Dialog open={!!checkout} onOpenChange={(o) => !o && !submitting && closeCheckout()}>
        <DialogContent className={`${MODAL_CLASS} sm:max-w-sm`}>
          {checkout && step === "pay" && (
            <>
              <DialogHeader className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <QrCode className="h-4 w-4 text-primary" />
                  Pay for {checkout.plan.name}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Scan with any UPI app and pay the exact amount.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-xl bg-muted/40 px-3 py-2 text-sm flex justify-between">
                  <span className="capitalize">{checkout.plan.name} · {checkout.cycle}</span>
                  <span className="font-semibold">{money(checkout.amount)}</span>
                </div>

                {checkout.startsAfter && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                    Your current plan continues as normal. This plan will become active after it ends on{" "}
                    <span className="font-medium">{format(checkout.startsAfter, "PP")}</span>.
                  </div>
                )}

                <div className="flex flex-col items-center gap-2">
                  {/* White background keeps the QR scannable in dark mode */}
                  <div className="rounded-xl bg-white p-2.5 border">
                    <QRCodeSVG value={upiUrl} size={168} level="M" />

                    {/* here below replace the Qr  */}
              {/* <img src="\public\upi-qr.png" alt="UPI QR code" width={168} height={168} /> */}

                  </div>
                  <div className="text-xs text-muted-foreground text-center leading-relaxed">
                    Paying <span className="font-medium text-foreground">{UPI_PAYEE_NAME}</span>
                    <br />
                    <span className="break-all">{UPI_ID}</span> · Ref {checkout.invoiceNumber}
                  </div>
                  <Button asChild variant="outline" size="sm" className="md:hidden rounded-full">
                    <a href={upiUrl}>
                      <Smartphone className="h-4 w-4 mr-1" />
                      Open UPI app
                    </a>
                  </Button>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="utr" className="text-xs">UPI transaction ID (UTR)</Label>
                  <Input
                    id="utr"
                    placeholder="e.g. 412345678901"
                    value={utr}
                    autoComplete="off"
                    className="rounded-lg"
                    onChange={(e) => setUtr(e.target.value.replace(/\s+/g, ""))}
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Copy the 12-digit transaction ID from your UPI app after paying.
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" className="rounded-lg" onClick={closeCheckout} disabled={submitting}>
                  Cancel
                </Button>
                <Button className="rounded-lg" onClick={submitPayment} disabled={submitting || !utr}>
                  {submitting ? "Submitting…" : "I've paid"}
                </Button>
              </DialogFooter>
            </>
          )}

          {checkout && step === "done" && (
            <div className="flex flex-col items-center text-center gap-2 py-2">
              <CheckCircle2 className="h-11 w-11 text-success" />
              <DialogHeader className="items-center space-y-1">
                <DialogTitle className="text-base">Payment successful</DialogTitle>
                <DialogDescription className="text-sm">
                  {checkout.startsAfter ? (
                    <>
                      We've received {money(checkout.amount)} for {checkout.plan.name} ({checkout.cycle}). Once the
                      admin approves it, this plan will become active after your current plan ends on{" "}
                      {format(checkout.startsAfter, "PP")}.
                    </>
                  ) : (
                    <>
                      We've received {money(checkout.amount)} for {checkout.plan.name} ({checkout.cycle}). Your plan
                      starts once the admin approves it.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="text-xs text-muted-foreground">
                {checkout.invoiceNumber} · UTR <span className="font-mono">{utr.toUpperCase()}</span>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => { closeCheckout(); setHistoryOpen(true); }}
                >
                  View history
                </Button>
                <Button className="rounded-lg" onClick={closeCheckout}>Done</Button>
              </div>
            </div>
          )}
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
                        onClick={() => downloadInvoice(r, tenant?.name || "—", trialDays)}
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