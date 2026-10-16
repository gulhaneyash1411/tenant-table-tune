// UPI payment settings used to build the checkout QR.
// Replace with your real business UPI ID and name (or set them in .env).
export const UPI_ID = import.meta.env.VITE_UPI_ID || "dineeatz@okaxis";
export const UPI_PAYEE_NAME = import.meta.env.VITE_UPI_PAYEE_NAME || "DineEatz";

export const PAYMENT_METHOD_UPI = "upi_qr";
// Subscription payments made online through the Cashfree gateway.
export const PAYMENT_METHOD_CASHFREE = "cashfree";

export const INVOICE_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FREE_TRIAL: "free_trial",
  PENDING_APPROVAL: "pending_approval",
  REJECTED: "rejected",
} as const;

// UPI transaction reference (UTR): usually 12 digits; accept 8–30 letters/digits.
export const UTR_PATTERN = /^[A-Za-z0-9]{8,30}$/;

// Standard UPI deep link, readable by any UPI app with the amount pre-filled.
export function buildUpiUrl(amount: number, note: string) {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_PAYEE_NAME,
    am: amount.toFixed(2),
    cu: "INR",
    tn: note.slice(0, 50),
  });
  return `upi://pay?${params.toString()}`;
}

// Free-trial invoices store their length as "<N> days" (older rows: "14 days"
// / "14_days"). Returns N, or null for any other cycle.
export function cycleDays(cycle: string | null | undefined): number | null {
  const m = /^(\d+)[ _]days?$/.exec((cycle ?? "").trim());
  return m ? Number(m[1]) : null;
}

export const trialCycleLabel = (days: number) => `${days} days`;

// Billing cycles a paid plan can be bought on.
export const BILLING_CYCLES = ["monthly", "half_yearly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

// Adds one billing period to a date. Cycles that aren't monthly/half-yearly/yearly
// or "<N> days" fall back to `fallbackDays` (the current free-trial length).
export function addBillingCycle(start: Date, cycle: string | null | undefined, fallbackDays: number): Date {
  const d = new Date(start);
  if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else if (cycle === "half_yearly") d.setMonth(d.getMonth() + 6);
  else if (cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + (cycleDays(cycle) ?? fallbackDays));
  return d;
}

// When an invoice's plan period ends. Shared by admin billing and the owner's
// subscription page so both always agree.
//  - Approved QR payments and new free trials store period_end.
//  - Older free trials: their stored "<N> days" from paid_at / issued_at.
//  - Manual invoices: one billing cycle from issued_at.
export function invoiceExpiry(r: any, trialDays: number): Date | null {
  if (r.status === INVOICE_STATUS.PENDING_APPROVAL || r.status === INVOICE_STATUS.REJECTED) return null;
  if (r.period_end) return new Date(r.period_end);
  if (r.status === INVOICE_STATUS.FREE_TRIAL) {
    const base = r.paid_at || r.issued_at;
    if (!base) return null;
    const d = new Date(base);
    d.setDate(d.getDate() + (cycleDays(r.billing_cycle) ?? trialDays));
    return d;
  }
  const base = r.payment_method === PAYMENT_METHOD_UPI ? r.paid_at || r.issued_at : r.issued_at;
  if (!base) return null;
  const cycle = r.billing_cycle;
  if (cycle === "yearly" || cycle === "half_yearly" || cycle === "monthly" || cycleDays(cycle) !== null) {
    return addBillingCycle(new Date(base), cycle, trialDays);
  }
  return null;
}