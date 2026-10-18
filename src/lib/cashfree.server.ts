// Cashfree Payment Gateway (PG) client. Server only: it uses the secret key.
// Uses fetch + Web Crypto (no Node SDK) so it runs on the Cloudflare build too.
// Env: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV ("sandbox" | "production").
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API_VERSION = "2023-08-01";

export const CASHFREE_METHOD = "cashfree";

function getEnv(key: string): string | undefined {
  return process.env[key] ?? (globalThis as any).__env__?.[key];
}

function config() {
  const appId = getEnv("CASHFREE_APP_ID");
  const secret = getEnv("CASHFREE_SECRET_KEY");
  if (!appId || !secret) throw new Error("Cashfree is not configured (CASHFREE_APP_ID / CASHFREE_SECRET_KEY)");
  const base = getEnv("CASHFREE_ENV") === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  return { appId, secret, base };
}

async function cf<T>(path: string, init?: RequestInit): Promise<T> {
  const { appId, secret, base } = config();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": appId,
      "x-client-secret": secret,
      ...init?.headers,
    },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `Cashfree request failed (${res.status})`);
  return body as T;
}

export type CashfreeOrder = {
  order_id: string;
  order_status: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "TERMINATION_REQUESTED";
  order_amount: number;
  payment_session_id: string;
};

export function createOrder(input: {
  orderId: string;
  amount: number;
  customer: { id: string; name?: string | null; email?: string | null; phone: string };
  returnUrl: string;
  notifyUrl?: string;
  note?: string;
}) {
  return cf<CashfreeOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.orderId,
      order_amount: input.amount,
      order_currency: "INR",
      order_note: input.note?.slice(0, 200),
      customer_details: {
        customer_id: input.customer.id,
        customer_name: input.customer.name || undefined,
        customer_email: input.customer.email || undefined,
        customer_phone: input.customer.phone,
      },
      order_meta: { return_url: input.returnUrl, notify_url: input.notifyUrl },
    }),
  });
}

export const getOrder = (orderId: string) => cf<CashfreeOrder>(`/orders/${encodeURIComponent(orderId)}`);

const getPayments = (orderId: string) =>
  cf<{ cf_payment_id: string | number; payment_status: string }[]>(`/orders/${encodeURIComponent(orderId)}/payments`);

/** Checks a webhook's x-webhook-signature: base64(HMAC-SHA256(timestamp + rawBody, secret)). */
export async function verifyWebhookSignature(rawBody: string, timestamp: string | null, signature: string | null) {
  if (!timestamp || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(config().secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export type SettleResult = { status: "paid" | "pending" | "failed" };

/**
 * Asks Cashfree for the order's real status and, if paid, records the payment
 * on its invoice (which starts or schedules the plan). Safe to call more than
 * once: the return redirect and the webhook both call it.
 */
export async function settleOrder(orderId: string): Promise<SettleResult> {
  const db = supabaseAdmin as any;
  const { data: inv } = await db.from("invoices").select("*").eq("id", orderId).maybeSingle();
  if (!inv || inv.payment_method !== CASHFREE_METHOD) throw new Error("Order not found");
  if (inv.status === "paid") return { status: "paid" };

  const order = await getOrder(orderId);
  if (order.order_status === "ACTIVE") return { status: "pending" };
  if (order.order_status !== "PAID") {
    await db.from("invoices").update({ status: "cancelled" }).eq("id", orderId).eq("status", "pending");
    return { status: "failed" };
  }
  if (Math.abs(Number(order.order_amount) - Number(inv.amount)) > 0.005) {
    throw new Error(`Paid amount ${order.order_amount} does not match invoice ${inv.amount}`);
  }

  const payments = await getPayments(orderId).catch(() => []);
  const ref = String(payments.find((p) => p.payment_status === "SUCCESS")?.cf_payment_id ?? orderId);

  const { error } = await db.rpc("admin_record_payment", {
    p_invoice_id: orderId,
    p_amount: Number(inv.amount) - Number(inv.amount_paid || 0),
    p_method: "online",
    p_reference: ref,
    p_paid_at: new Date().toISOString(),
    p_notes: "Cashfree online payment",
    p_proof_url: null,
  });
  if (error) {
    // The other caller (webhook vs. return page) may have recorded it first.
    const { data: again } = await db.from("invoices").select("status").eq("id", orderId).maybeSingle();
    if (again?.status === "paid") return { status: "paid" };
    throw new Error(error.message);
  }
  await db.from("invoices").update({ utr: ref }).eq("id", orderId);
  return { status: "paid" };
}
