// src/lib/billing.ts
//
// The one place a bill is worked out. The staff order dialog, the guest
// checkout server, the takeaway / delivery carts and every invoice view read
// their figures from here, so a preview can't disagree with what was charged.
//
// Kept free of imports on purpose: it runs on the server, in the browser and
// under `node --test` (see billing.test.ts) without any bundler in between.
//
// Order of operations:
//   1. items subtotal        sum of price × quantity
//   2. invoice discount      flat ₹ or % of the items subtotal, never more than it
//   3. taxable amount        subtotal − discount (+ service charge if taxable)
//   4. tax                   taxable × Settings → Tax rate (%), exclusive
//   5. total                 subtotal − discount + tax + service charge + delivery

export type DiscountType = "rupees" | "percentage";

/** Older orders and untouched settings have no type; a flat ₹0 discount changes nothing. */
export const DEFAULT_DISCOUNT_TYPE: DiscountType = "rupees";

/**
 * Whether the service charge is added before tax (and so taxed) or after it.
 * Delivery has always gone on after tax untaxed, and the service charge
 * follows the same rule so turning it on can't change anyone's tax figure.
 * Flip this if the restaurant's GST treatment says otherwise.
 */
export const SERVICE_CHARGE_TAXABLE = false;

export type BillCharges = {
  discountType: DiscountType;
  /** What was entered: rupees for a flat discount, 0–100 for a percentage. */
  discountValue: number;
  /** Flat amount in rupees. */
  serviceCharge: number;
};

export type BillInput = Partial<BillCharges> & {
  itemsSubtotal: number;
  /** Percent, 0–100. */
  taxRate?: number;
  deliveryFee?: number;
  /** Menu prices already include tax: tax is backed out rather than added. */
  taxInclusive?: boolean;
};

export type Bill = BillCharges & {
  itemsSubtotal: number;
  discountAmount: number;
  subtotalAfterDiscount: number;
  taxableAmount: number;
  taxRate: number;
  tax: number;
  deliveryFee: number;
  total: number;
};

/** Money to the paisa. EPSILON keeps 1.005 from rounding down to 1.00. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A non-negative finite number, or 0 for anything else (null, "", "abc", -5, NaN). */
const amount = (v: unknown) => {
  const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const clampPercent = (v: unknown) => Math.min(amount(v), 100);

export const isDiscountType = (v: unknown): v is DiscountType =>
  v === "rupees" || v === "percentage";

export function itemsSubtotal(rows: { price: unknown; quantity: unknown }[]): number {
  return round2(rows.reduce((sum, r) => sum + amount(r.price) * amount(r.quantity), 0));
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Settings → Tax rate (%), clamped to 0–100. */
export function readTaxRate(settings: unknown): number {
  return clampPercent(asRecord(settings)["tax_rate"]);
}

/** Settings → Discount / Service charges, with safe defaults for a tenant that never set them. */
export function readBillCharges(settings: unknown): BillCharges {
  const s = asRecord(settings);
  return {
    discountType: isDiscountType(s["discount_type"]) ? s["discount_type"] : DEFAULT_DISCOUNT_TYPE,
    discountValue: amount(s["discount_value"]),
    serviceCharge: amount(s["service_charge"]),
  };
}

export function computeBill(input: BillInput): Bill {
  const subtotal = round2(amount(input.itemsSubtotal));
  const discountType = isDiscountType(input.discountType)
    ? input.discountType
    : DEFAULT_DISCOUNT_TYPE;
  const discountValue =
    discountType === "percentage" ? clampPercent(input.discountValue) : amount(input.discountValue);
  const serviceCharge = round2(amount(input.serviceCharge));
  const deliveryFee = round2(amount(input.deliveryFee));
  const taxRate = clampPercent(input.taxRate);

  // A discount reduces the bill; it can take it to zero but never below.
  const rawDiscount =
    discountType === "percentage" ? (subtotal * discountValue) / 100 : discountValue;
  const discountAmount = round2(Math.min(rawDiscount, subtotal));
  const subtotalAfterDiscount = round2(subtotal - discountAmount);

  const taxableAmount = round2(
    subtotalAfterDiscount + (SERVICE_CHARGE_TAXABLE ? serviceCharge : 0),
  );
  // Same rounding the guest checkout has always used: tax to the paisa.
  const tax = input.taxInclusive
    ? round2(taxableAmount - taxableAmount / (1 + taxRate / 100))
    : Math.round(taxableAmount * taxRate) / 100;

  const total = round2(
    subtotalAfterDiscount + (input.taxInclusive ? 0 : tax) + serviceCharge + deliveryFee,
  );

  return {
    itemsSubtotal: subtotal,
    discountType,
    discountValue,
    discountAmount,
    subtotalAfterDiscount,
    taxableAmount,
    taxRate,
    tax,
    serviceCharge,
    deliveryFee,
    total,
  };
}

/** The columns an order row stores for its bill. */
export function orderBillColumns(b: Bill) {
  return {
    subtotal: b.itemsSubtotal,
    discount_type: b.discountType,
    discount_value: b.discountValue,
    discount_amount: b.discountAmount,
    service_charge: b.serviceCharge,
    tax: b.tax,
    total: b.total,
  };
}

export type OrderBillRow = {
  subtotal?: unknown;
  discount_type?: unknown;
  discount_value?: unknown;
  discount_amount?: unknown;
  service_charge?: unknown;
  tax?: unknown;
  delivery_fee?: unknown;
  total?: unknown;
};

/**
 * A saved order's bill, exactly as it was charged. Read back rather than
 * recomputed, so changing Settings later doesn't rewrite old invoices. An
 * order from before discounts existed has none of the new columns and reads
 * as no discount, no service charge.
 */
export function readOrderBill(order: OrderBillRow | null | undefined): Bill {
  const o = order ?? {};
  const itemsSubtotalValue = amount(o.subtotal);
  const discountAmount = amount(o.discount_amount);
  const subtotalAfterDiscount = round2(itemsSubtotalValue - discountAmount);
  const serviceCharge = amount(o.service_charge);
  return {
    itemsSubtotal: itemsSubtotalValue,
    discountType: isDiscountType(o.discount_type) ? o.discount_type : DEFAULT_DISCOUNT_TYPE,
    discountValue: amount(o.discount_value),
    discountAmount,
    subtotalAfterDiscount,
    taxableAmount: round2(subtotalAfterDiscount + (SERVICE_CHARGE_TAXABLE ? serviceCharge : 0)),
    taxRate: 0, // not stored on the order; the tax amount is
    tax: amount(o.tax),
    serviceCharge,
    deliveryFee: amount(o.delivery_fee),
    total: amount(o.total),
  };
}

const trimNumber = (n: number) => String(round2(n));

/** "Discount (10%)" or "Discount (₹100 flat)" — `fmt` is the caller's currency formatter. */
export function discountLabel(
  b: Pick<Bill, "discountType" | "discountValue">,
  fmt: (n: number) => string,
): string {
  return b.discountType === "percentage"
    ? `Discount (${trimNumber(b.discountValue)}%)`
    : `Discount (${fmt(b.discountValue)} flat)`;
}

/**
 * Cleans what's typed into an amount box: digits and one decimal point, at
 * most two decimals, no leading zeros. Returns the previous value when the
 * keystroke would make it invalid, so the box never holds junk.
 */
export function sanitizeAmountInput(raw: string, previous = "", max?: number): string {
  const v = raw.replace(/,/g, "").trim();
  if (v === "") return "";
  if (!/^\d*\.?\d{0,2}$/.test(v)) return previous;
  const cleaned = v.replace(/^0+(?=\d)/, "");
  if (max !== undefined && Number(cleaned) > max) return previous;
  return cleaned;
}

/** Why these settings can't be saved, or null if they can. */
export function validateBillCharges(c: {
  discountType: unknown;
  discountValue: unknown;
  serviceCharge: unknown;
}): string | null {
  const bad = (v: unknown) =>
    v !== "" && v != null && (!Number.isFinite(Number(v)) || Number(v) < 0);
  if (!isDiscountType(c.discountType)) return "Pick a discount type";
  if (bad(c.discountValue)) return "Discount must be a number of 0 or more";
  if (c.discountType === "percentage" && Number(c.discountValue) > 100)
    return "A percentage discount can't be more than 100%";
  if (bad(c.serviceCharge)) return "Service charges must be a number of 0 or more";
  return null;
}
