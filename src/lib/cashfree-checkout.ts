// Browser side of Cashfree checkout: starts an order on our server, then hands
// the owner to Cashfree's hosted payment page. Cashfree redirects back to
// /app/subscription?cf_order=<id>, where verifyCashfreeOrder() settles it.
import { supabase } from "@/integrations/supabase/client";

const SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";
const MODE = import.meta.env.VITE_CASHFREE_MODE === "production" ? "production" : "sandbox";

let sdk: Promise<any> | null = null;
function loadSdk() {
  if ((window as any).Cashfree) return Promise.resolve((window as any).Cashfree);
  sdk ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.onload = () => resolve((window as any).Cashfree);
    s.onerror = () => { sdk = null; reject(new Error("Could not load the payment page. Check your connection.")); };
    document.head.appendChild(s);
  });
  return sdk;
}

async function post(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Payment request failed");
  return json;
}

/** Creates the order. Call before opening the payment popup so errors show in our own dialog. */
export async function createCashfreeOrder(input: { tenantId: string; planId: string; cycle: string }) {
  const [, order] = await Promise.all([
    loadSdk(),
    post("/api/cashfree/create-order", { tenant_id: input.tenantId, plan_id: input.planId, cycle: input.cycle }),
  ]);
  return order as { order_id: string; payment_session_id: string };
}

/**
 * Opens Cashfree's payment page as a popup over the app and resolves when the
 * owner finishes or closes it. Some banks still need a full-page redirect; then
 * Cashfree returns to /app/subscription?cf_order=<id> and the page verifies it there.
 */
export async function openCashfreeModal(paymentSessionId: string) {
  const Cashfree = await loadSdk();
  const result = await Cashfree({ mode: MODE }).checkout({ paymentSessionId, redirectTarget: "_modal" });
  return { closed: !!result?.error, redirecting: !!result?.redirect };
}

export async function verifyCashfreeOrder(orderId: string): Promise<"paid" | "pending" | "failed"> {
  const { status } = await post("/api/cashfree/verify", { order_id: orderId });
  return status;
}
