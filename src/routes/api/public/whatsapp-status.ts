import { createFileRoute } from "@tanstack/react-router";

// Twilio signs requests: base64(HMAC-SHA1(authToken, url + sorted key/value pairs))
async function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export const Route = createFileRoute("/api/public/whatsapp-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const params: Record<string, string> = {};
        form.forEach((v, k) => {
          params[k] = String(v);
        });
        const sid = params["MessageSid"] ?? params["SmsSid"];
        const status = params["MessageStatus"] ?? params["SmsStatus"];
        if (!sid || !status) return new Response("ignored", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: msg } = await supabaseAdmin
          .from("whatsapp_messages")
          .select("id,tenant_id,campaign_id")
          .eq("provider_sid", sid)
          .maybeSingle();
        if (!msg) return new Response("unknown message", { status: 404 });

        const { data: settings } = await supabaseAdmin
          .from("whatsapp_settings")
          .select("auth_token,use_platform_sender,is_active")
          .eq("tenant_id", msg.tenant_id)
          .maybeSingle();
        const token =
          settings && settings.is_active && !settings.use_platform_sender && settings.auth_token
            ? settings.auth_token
            : process.env["TWILIO_AUTH_TOKEN"];
        const header = request.headers.get("x-twilio-signature");
        if (token && header) {
          const expected = await twilioSignature(token, request.url, params);
          if (expected !== header) return new Response("Invalid signature", { status: 401 });
        }

        const now = new Date().toISOString();
        const patch: {
          status: string;
          delivered_at?: string;
          read_at?: string;
          error?: string;
        } = { status };
        if (status === "delivered") patch.delivered_at = now;
        if (status === "read") patch.read_at = now;
        if (status === "failed" || status === "undelivered")
          patch.error = params["ErrorMessage"] ?? params["ErrorCode"] ?? "Delivery failed";
        await supabaseAdmin.from("whatsapp_messages").update(patch).eq("id", msg.id);

        if (msg.campaign_id) {
          const { data: rows } = await supabaseAdmin
            .from("whatsapp_messages")
            .select("status")
            .eq("campaign_id", msg.campaign_id);
          const all = rows ?? [];
          await supabaseAdmin
            .from("whatsapp_campaigns")
            .update({
              delivered_count: all.filter((r) => r.status === "delivered" || r.status === "read").length,
              read_count: all.filter((r) => r.status === "read").length,
              failed_count: all.filter((r) => r.status === "failed" || r.status === "undelivered").length,
            })
            .eq("id", msg.campaign_id);
        }
        return new Response("ok");
      },
    },
  },
});