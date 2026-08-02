import { resolveCreds } from "./whatsapp.server";

const CODE_HINTS: Record<string, string> = {
  "63015": "Recipient has not joined your WhatsApp sandbox. Ask them to send the join code to your sandbox number.",
  "63016": "Outside the 24-hour window — you must use an approved WhatsApp template for this recipient.",
  "63024": "Invalid WhatsApp sender or recipient number.",
  "21211": "Invalid phone number format (needs country code, e.g. +91…).",
  "63003": "Recipient's WhatsApp number could not be found.",
};

type Row = { id: string; provider_sid: string | null; tenant_id: string; campaign_id: string | null };

export async function syncStatuses(tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const creds = resolveCreds(settings);
  if (!creds) return { checked: 0, updated: 0 };

  const { data: pending } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id,provider_sid,tenant_id,campaign_id")
    .eq("tenant_id", tenantId)
    .not("provider_sid", "is", null)
    .in("status", ["queued", "accepted", "sending", "sent"])
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (pending ?? []) as Row[];
  const auth = `Basic ${btoa(`${creds.accountSid}:${creds.authToken}`)}`;
  const campaigns = new Set<string>();
  let updated = 0;

  for (const r of rows) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages/${r.provider_sid}.json`,
        { headers: { Authorization: auth } },
      );
      if (!res.ok) continue;
      const m = (await res.json()) as {
        status?: string;
        error_code?: number | null;
        error_message?: string | null;
      };
      const status = m.status ?? "queued";
      const now = new Date().toISOString();
      const patch: Record<string, string | null> = { status };
      if (status === "delivered") patch["delivered_at"] = now;
      if (status === "read") {
        patch["read_at"] = now;
        patch["delivered_at"] = now;
      }
      if (status === "failed" || status === "undelivered") {
        const code = m.error_code ? String(m.error_code) : "";
        patch["error"] = m.error_message || CODE_HINTS[code] || (code ? `Twilio error ${code}` : "Delivery failed");
      }
      await supabaseAdmin.from("whatsapp_messages").update(patch).eq("id", r.id);
      updated++;
      if (r.campaign_id) campaigns.add(r.campaign_id);
    } catch {
      // keep going; a single lookup failure shouldn't stop the sync
    }
  }

  for (const cid of campaigns) {
    const { data: all } = await supabaseAdmin.from("whatsapp_messages").select("status").eq("campaign_id", cid);
    const list = all ?? [];
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({
        delivered_count: list.filter((x) => x.status === "delivered" || x.status === "read").length,
        read_count: list.filter((x) => x.status === "read").length,
        failed_count: list.filter((x) => x.status === "failed" || x.status === "undelivered").length,
      })
      .eq("id", cid);
  }

  return { checked: rows.length, updated };
}
