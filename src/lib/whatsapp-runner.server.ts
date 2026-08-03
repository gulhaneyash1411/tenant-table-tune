import type { Recipient } from "./whatsapp-segments.server";
import { resolveCreds, sendWhatsApp, renderBody, brandedBody, pooled } from "./whatsapp.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Campaign = any;

export async function runCampaign(args: {
  tenantId: string;
  tenantName: string;
  campaign: Campaign;
  recipients: Recipient[];
  origin?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { tenantId, tenantName, campaign, recipients, origin } = args;

  const { data: settings } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const creds = resolveCreds(settings);
  if (!creds) {
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "failed", error: "No WhatsApp sender configured" })
      .eq("id", campaign.id);
    return {
      sent: 0,
      failed: recipients.length,
      error: "No WhatsApp sender configured",
      errors: [{ message: "The PlateOS WhatsApp sender is not configured", count: recipients.length }],
    };
  }

  const statusCallback = origin ? `${origin}/api/public/whatsapp-status` : null;
  let sent = 0;
  let failed = 0;
  const failureReasons = new Map<string, number>();

  await pooled(recipients, 5, async (r) => {
    const personalized = renderBody(campaign.body, {
      name: r.name || "there",
      restaurant: tenantName,
      visits: String(r.visits ?? 0),
    });
    const body = brandedBody(personalized, tenantName);
    const res = await sendWhatsApp(creds, {
      to: r.phone,
      body,
      mediaUrl: campaign.media_url,
      statusCallback,
    });
    if (res.ok) sent++;
    else {
      failed++;
      failureReasons.set(res.error, (failureReasons.get(res.error) ?? 0) + 1);
    }
    await supabaseAdmin.from("whatsapp_messages").insert({
      tenant_id: tenantId,
      campaign_id: campaign.id,
      customer_id: r.id,
      to_phone: r.phone,
      to_name: r.name,
      body,
      media_url: campaign.media_url,
      status: res.ok ? res.status : "failed",
      provider_sid: res.ok ? res.sid : null,
      error: res.ok ? null : res.error,
      sent_at: res.ok ? new Date().toISOString() : null,
    });
  });

  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update({
      status: failed > 0 && sent === 0 ? "failed" : "sent",
      sent_count: sent,
      failed_count: failed,
      recipient_count: recipients.length,
      error: failed > 0
        ? [...failureReasons.entries()].map(([message, count]) => `${count}× ${message}`).join("; ").slice(0, 2000)
        : null,
    })
    .eq("id", campaign.id);

  return {
    sent,
    failed,
    errors: [...failureReasons.entries()].map(([message, count]) => ({ message, count })),
  };
}