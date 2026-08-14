import { createFileRoute } from "@tanstack/react-router";

// Called by the scheduler to send campaigns whose scheduled time has arrived.
// Gated by a dedicated server-only secret, NOT the Supabase publishable key —
// that key ships in the client bundle, so checking against it authenticates nobody.
async function dispatch(request: Request) {
  const secret = process.env["WHATSAPP_DISPATCH_SECRET"];
  const key = request.headers.get("x-dispatch-secret");
  if (!secret || key !== secret) return new Response("Unauthorized", { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveSegment } = await import("@/lib/whatsapp-segments.server");
  const { runCampaign } = await import("@/lib/whatsapp-runner.server");

  const { data: due } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(10);

  const origin = new URL(request.url).origin;
  const results: { id: string; sent: number; failed: number }[] = [];

  for (const campaign of due ?? []) {
    await supabaseAdmin.from("whatsapp_campaigns").update({ status: "sending" }).eq("id", campaign.id);
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id,name")
      .eq("id", campaign.tenant_id)
      .maybeSingle();
    if (!tenant) continue;
    try {
      const recipients = await resolveSegment(
        supabaseAdmin,
        tenant.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (campaign.segment ?? { type: "all" }) as any,
      );
      const r = await runCampaign({
        tenantId: tenant.id,
        tenantName: tenant.name,
        campaign,
        recipients,
        origin,
      });
      results.push({ id: campaign.id, sent: r.sent, failed: r.failed });
    } catch (e) {
      await supabaseAdmin
        .from("whatsapp_campaigns")
        .update({ status: "failed", error: e instanceof Error ? e.message : "Dispatch failed" })
        .eq("id", campaign.id);
    }
  }

  return Response.json({ processed: results.length, results });
}

export const Route = createFileRoute("/api/public/whatsapp-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => dispatch(request),
      GET: async ({ request }) => dispatch(request),
    },
  },
});