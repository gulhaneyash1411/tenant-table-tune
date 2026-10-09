// Downloads an invoice as a PDF from its id. Same figures and layout as the admin Subscriptions page.
import { supabase } from "@/integrations/supabase/client";
import { downloadSubscriptionInvoicePdf } from "@/lib/invoice-pdf";
import { invoiceExpiry } from "@/lib/payment-config";
import { SITE_KEYS, parseTrialDays, readSettingValue } from "@/lib/site-settings";

const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function invoiceFigures(r: any) {
  const total = n(r.amount);
  // Subscription invoices: the total is the subtotal, with no tax or discount breakdown.
  const subtotal = total;
  const paid = r.status === "paid" && !n(r.amount_paid) ? total : n(r.amount_paid);
  const balance = Math.max(0, r2(total - paid));
  return { total, subtotal, discount: 0, cgst: 0, sgst: 0, igst: 0, paid, balance };
}

// Trial length from Platform settings (the same value the owner page uses).
async function loadTrialDays(): Promise<number> {
  try {
    const { data } = await (supabase as any)
      .from("platform_settings").select("key,value").eq("key", SITE_KEYS.trialDays).maybeSingle();
    return data ? parseTrialDays(readSettingValue(data.key, data.value)) : parseTrialDays(null);
  } catch {
    return parseTrialDays(null);
  }
}

export function formatInvoiceForPdf(invoiceData: any, trialDays = 14): any {
  const f = invoiceFigures(invoiceData);
  const addr = invoiceData.billing_address ||
    [invoiceData.tenants?.address, invoiceData.tenants?.city, invoiceData.tenants?.state]
      .filter(Boolean).join(", ");
  return {
    invoice_number: invoiceData.invoice_number,
    status: invoiceData.status,
    issued_at: invoiceData.issued_at,
    // Subscription invoices have no due date; show when the subscription period ends.
    due_date: invoiceExpiry(invoiceData, trialDays)?.toISOString() ?? invoiceData.due_date ?? null,
    organization_name: invoiceData.tenants?.organizations?.name ?? null,
    outlet_name: invoiceData.tenants?.name ?? null,
    billing_address: addr || null,
    gst_number: invoiceData.gst_number || invoiceData.tenants?.gst_number || null,
    description: invoiceData.description,
    notes: invoiceData.notes,
    plan: invoiceData.plan,
    billing_cycle: invoiceData.billing_cycle,
    period_start: invoiceData.period_start,
    period_end: invoiceData.period_end,
    line_items: Array.isArray(invoiceData.line_items) ? invoiceData.line_items : [],
    subtotal: f.subtotal,
    discount: f.discount,
    cgst: f.cgst,
    sgst: f.sgst,
    igst: f.igst,
    total: f.total,
    amount_paid: f.paid,
    balance: f.balance,
    // Same logo, at the top, on every invoice (admin and owner).
    logo_url: typeof window !== "undefined" ? `${window.location.origin}/brand/dineeatz-logo.png` : null,
  };
}

/** Fetches the invoice and saves it as a PDF. Throws with a readable message on failure. */
export async function downloadInvoiceById(invoiceId: string) {
  const { data, error } = await (supabase as any)
    .from("invoices")
    .select("*,tenants(name,address,city,state,gst_number,organizations(name))")
    .eq("id", invoiceId)
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invoice not found");
  const trialDays = await loadTrialDays();
  await downloadSubscriptionInvoicePdf(formatInvoiceForPdf(data, trialDays));
}
