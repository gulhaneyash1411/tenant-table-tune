import { createFileRoute } from "@tanstack/react-router";

const CYCLES = ["monthly", "half_yearly", "yearly"] as const;
type Cycle = (typeof CYCLES)[number];

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

const PRICE_FIELD: Record<Cycle, string> = {
  monthly: "monthly_price",
  half_yearly: "half_yearly_price",
  yearly: "yearly_price",
};

// Owner starts a plan purchase: creates a pending invoice (its id is the
// Cashfree order id) and a Cashfree order, and returns the checkout session.
// The price always comes from the plan in the database, never from the browser.
async function handlePost(request: Request) {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return errorResponse("Unauthorized", 401);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createOrder, CASHFREE_METHOD } = await import("@/lib/cashfree.server");
    const db = supabaseAdmin as any;

    const { data: u, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !u.user) return errorResponse("Unauthorized", 401);

    const { tenant_id, plan_id, cycle } = await request.json();
    if (!tenant_id || !plan_id || !CYCLES.includes(cycle)) return errorResponse("Invalid plan or billing cycle");

    // Only the outlet's owner can buy a plan for it.
    const { data: tenant } = await db.from("tenants").select("*").eq("id", tenant_id).maybeSingle();
    if (!tenant || tenant.owner_id !== u.user.id) return errorResponse("Only the owner can buy a plan", 403);

    const { data: plan } = await db.from("subscription_plans").select("*").eq("id", plan_id).maybeSingle();
    if (!plan || !plan.is_active || plan.is_free) return errorResponse("This plan is not available");
    const amount = Number(plan[PRICE_FIELD[cycle as Cycle]]) || 0;
    if (amount <= 0) return errorResponse("This plan has no price set. Contact support.");

    const { data: inv, error: invError } = await db.from("invoices").insert({
      tenant_id: tenant.id,
      organization_id: tenant.organization_id ?? null,
      plan_id: plan.id,
      plan: plan.name,
      billing_cycle: cycle,
      amount,
      tax: Math.round(amount * 0.18),
      status: "pending",
      payment_method: CASHFREE_METHOD,
      issued_at: new Date().toISOString(),
      invoice_number: "INV-" + Date.now().toString().slice(-8),
    }).select("id, invoice_number").single();
    if (invError) return errorResponse(invError.message, 500);

    const origin = new URL(request.url).origin;
    const phone = String(tenant.owner_phone ?? "").replace(/\D/g, "").slice(-10);
    const order = await createOrder({
      orderId: inv.id,
      amount,
      customer: {
        id: String(tenant.id).replace(/-/g, "_"),
        name: tenant.owner_name,
        email: tenant.owner_email ?? u.user.email,
        phone: phone.length === 10 ? phone : "9999999999",
      },
      returnUrl: `${origin}/app/subscription?cf_order={order_id}`,
      // Cashfree only calls https URLs, so local dev relies on the return page check.
      notifyUrl: origin.startsWith("https://") ? `${origin}/api/cashfree/webhook` : undefined,
      note: `${inv.invoice_number} ${plan.name} ${cycle}`,
    }).catch(async (e) => {
      await db.from("invoices").update({ status: "cancelled" }).eq("id", inv.id);
      throw e;
    });

    return Response.json({ order_id: order.order_id, payment_session_id: order.payment_session_id });
  } catch (error: any) {
    console.error("Cashfree create order failed:", error);
    return errorResponse(error?.message || "Could not start the payment", 500);
  }
}

export const Route = createFileRoute("/api/cashfree/create-order")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePost(request),
    },
  },
});
