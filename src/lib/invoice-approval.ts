// Approving or rejecting an owner's UPI payment (an invoice in status pending_approval).
// Used by the admin Restaurants page. Both calls need a super admin session.
import { supabase } from "@/integrations/supabase/client";
import { adminRpc } from "@/components/admin/admin-ui";

const db = supabase as any;

export type PendingInvoice = {
  id: string;
  invoice_number: string | null;
  tenant_id: string;
  plan: string | null;
  billing_cycle: string | null;
  amount: number;
  amount_paid: number | null;
  utr: string | null;
  issued_at: string;
};

/** Amount still owed on an invoice, rounded to paise. */
export const invoiceBalance = (i: Pick<PendingInvoice, "amount" | "amount_paid">) =>
  Math.max(0, Math.round((Number(i.amount) - Number(i.amount_paid || 0)) * 100) / 100);

/** Records the full balance as a UPI payment. This marks the invoice paid and starts the plan. */
export async function approvePendingInvoice(inv: PendingInvoice) {
  const amount = invoiceBalance(inv);
  if (!amount) throw new Error("Nothing left to approve on this invoice");
  await adminRpc(db, "admin_record_payment", {
    p_invoice_id: inv.id,
    p_amount: amount,
    p_method: "upi",
    p_reference: inv.utr,
    p_paid_at: new Date().toISOString(),
    p_notes: "Approved from owner UPI payment",
    p_proof_url: null,
  });
}

/** Marks the invoice rejected with a reason the owner sees. Only applies while it is still pending. */
export async function rejectPendingInvoice(invoiceId: string, reason: string) {
  const { error } = await db.from("invoices")
    .update({ status: "rejected", rejection_reason: reason.trim() })
    .eq("id", invoiceId)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);
}
