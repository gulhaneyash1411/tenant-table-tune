import { createFileRoute } from "@tanstack/react-router";

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

// Called by the subscription page when Cashfree redirects back. Checks the
// order with Cashfree (never trusts the redirect) and activates the plan if paid.
async function handlePost(request: Request) {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return errorResponse("Unauthorized", 401);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { settleOrder } = await import("@/lib/cashfree.server");
    const db = supabaseAdmin as any;

    const { data: u, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !u.user) return errorResponse("Unauthorized", 401);

    const { order_id } = await request.json();
    if (!order_id) return errorResponse("Order ID is required");

    const { data: inv } = await db.from("invoices").select("tenant_id").eq("id", order_id).maybeSingle();
    if (!inv) return errorResponse("Order not found", 404);
    const { data: tenant } = await db.from("tenants").select("owner_id").eq("id", inv.tenant_id).maybeSingle();
    if (tenant?.owner_id !== u.user.id) return errorResponse("Order not found", 404);

    return Response.json(await settleOrder(order_id));
  } catch (error: any) {
    console.error("Cashfree verify failed:", error);
    return errorResponse(error?.message || "Could not verify the payment", 500);
  }
}

export const Route = createFileRoute("/api/cashfree/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePost(request),
    },
  },
});
