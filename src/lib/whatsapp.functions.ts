import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getWhatsAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: tenant } = await supabase.from("tenants").select("id,name").eq("owner_id", context.userId).maybeSingle();
    if (!tenant) return { tenant: null, settings: null, platformAvailable: false };
    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    const { platformCreds } = await import("./whatsapp.server");
    const safe = settings
      ? { id: settings.id, tenant_id: settings.tenant_id, use_platform_sender: true, is_active: settings.is_active }
      : null;
    return { tenant, settings: safe, platformAvailable: !!platformCreds() };
  });

export const saveWhatsAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        is_active: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tenant } = await supabase.from("tenants").select("id").eq("owner_id", context.userId).maybeSingle();
    if (!tenant) throw new Error("No restaurant on this account");
    const { data: existing } = await supabase
      .from("whatsapp_settings")
      .select("id")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    const payload = {
      tenant_id: tenant.id,
      use_platform_sender: true,
      is_active: data.is_active,
      account_sid: null,
      auth_token: null,
      sender_number: null,
    };
    const { error } = existing
      ? await supabase.from("whatsapp_settings").update(payload).eq("id", existing.id)
      : await supabase.from("whatsapp_settings").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ segment: z.object({
    type: z.enum(["all", "frequent", "inactive", "range", "birthday", "anniversary", "manual"]),
    min_visits: z.number().int().min(1).max(999).optional(),
    inactive_days: z.number().int().min(1).max(3650).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    ids: z.array(z.string().uuid()).max(5000).optional(),
  }) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tenant } = await supabase.from("tenants").select("id").eq("owner_id", context.userId).maybeSingle();
    if (!tenant) return { count: 0, sample: [] };
    const { resolveSegment } = await import("./whatsapp-segments.server");
    const rows = await resolveSegment(supabase, tenant.id, data.segment);
    return { count: rows.length, sample: rows.slice(0, 8) };
  });

export const sendCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        kind: z.string().trim().max(40).default("promo"),
        body: z.string().trim().min(1).max(1500),
        media_url: z.string().trim().url().max(1000).optional().nullable(),
        template_id: z.string().uuid().optional().nullable(),
        segment: z.object({
          type: z.enum(["all", "frequent", "inactive", "range", "birthday", "anniversary", "manual"]),
          min_visits: z.number().int().min(1).max(999).optional(),
          inactive_days: z.number().int().min(1).max(3650).optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          ids: z.array(z.string().uuid()).max(5000).optional(),
        }),
        scheduled_at: z.string().datetime().optional().nullable(),
        origin: z.string().url().max(300).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id,name")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!tenant) throw new Error("No restaurant on this account");

    const { resolveSegment } = await import("./whatsapp-segments.server");
    const recipients = await resolveSegment(supabase, tenant.id, data.segment);

    const { data: campaign, error: cErr } = await supabase
      .from("whatsapp_campaigns")
      .insert({
        tenant_id: tenant.id,
        name: data.name,
        kind: data.kind,
        body: data.body,
        media_url: data.media_url ?? null,
        template_id: data.template_id ?? null,
        segment: data.segment,
        recipient_count: recipients.length,
        scheduled_at: data.scheduled_at ?? null,
        status: data.scheduled_at ? "scheduled" : "sending",
      })
      .select("*")
      .single();
    if (cErr || !campaign) throw new Error(cErr?.message ?? "Could not create campaign");

    if (data.scheduled_at) return { campaign_id: campaign.id, scheduled: true, recipients: recipients.length };

    const { runCampaign } = await import("./whatsapp-runner.server");
    const result = await runCampaign({
      tenantId: tenant.id,
      tenantName: tenant.name,
      campaign,
      recipients,
      origin: data.origin ?? null,
    });
    return { campaign_id: campaign.id, scheduled: false, ...result };
  });

export const syncCampaignStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!tenant) return { checked: 0, updated: 0 };
    const { syncStatuses } = await import("./whatsapp-sync.server");
    return syncStatuses(tenant.id);
  });

export const sendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ phone: z.string().trim().min(8).max(30), body: z.string().trim().min(1).max(1500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tenant } = await supabase.from("tenants").select("id,name").eq("owner_id", context.userId).maybeSingle();
    if (!tenant) throw new Error("No restaurant on this account");
    const { resolveCreds, sendWhatsApp, renderBody, brandedBody } = await import("./whatsapp.server");
    const creds = resolveCreds();
    if (!creds) return { ok: false as const, error: "No WhatsApp sender configured yet." };
    const res = await sendWhatsApp(creds, {
      to: data.phone,
      body: brandedBody(renderBody(data.body, { name: "there", restaurant: tenant.name }), tenant.name),
    });
    return res.ok ? { ok: true as const, sid: res.sid, sender: creds.source } : { ok: false as const, error: res.error };
  });