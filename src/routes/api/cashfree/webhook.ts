import { createFileRoute } from "@tanstack/react-router";

// Cashfree server-to-server payment notification. Activates the plan even if
// the owner closes the browser before returning to the app.
async function handlePost(request: Request) {
  const { verifyWebhookSignature, settleOrder } = await import("@/lib/cashfree.server");
  const raw = await request.text();
  const ok = await verifyWebhookSignature(
    raw,
    request.headers.get("x-webhook-timestamp"),
    request.headers.get("x-webhook-signature"),
  );
  if (!ok) return Response.json({ error: "Invalid signature" }, { status: 401 });

  const orderId = JSON.parse(raw)?.data?.order?.order_id;
  if (!orderId) return Response.json({ ok: true });
  try {
    // settleOrder re-fetches the order from Cashfree; the payload is only a hint.
    await settleOrder(orderId);
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("Cashfree webhook failed:", error);
    // A non-2xx makes Cashfree retry later.
    return Response.json({ error: error?.message || "Webhook failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cashfree/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePost(request),
    },
  },
});
