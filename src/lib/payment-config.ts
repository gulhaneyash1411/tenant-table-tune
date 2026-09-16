// UPI payment settings used to build the checkout QR.
// Replace with your real business UPI ID and name (or set them in .env).
export const UPI_ID = import.meta.env.VITE_UPI_ID || "platesos@okaxis";
export const UPI_PAYEE_NAME = import.meta.env.VITE_UPI_PAYEE_NAME || "PlatesOS";

export const PAYMENT_METHOD_UPI = "upi_qr";

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

// Adds one billing period to a date.
export function addBillingCycle(start: Date, cycle: string | null | undefined): Date {
  const d = new Date(start);
  if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else if (cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 14);
  return d;
}