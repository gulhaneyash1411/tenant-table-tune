import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

// Provisioning a Kitchen User account has to happen without touching the
// caller's own browser session: the Hotel Owner is already signed in when
// they do this, and the client-side auth.signUp() flow used for normal
// restaurant registration (src/routes/auth.tsx) would replace the owner's
// session with the new account's the moment it's called, on the same shared
// supabase client. So this runs server-side with the service-role admin API
// instead — same pattern as the WhatsApp dispatch/status routes, just
// authenticated by the caller's own access token rather than a shared secret.

type Body =
  | { action: "create"; login: string; password: string }
  | { action: "update_password"; password: string }
  | { action: "set_active"; is_active: boolean }
  | { action: "delete" };

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function handle(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return bad("Missing session", 401);

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request body");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  if (callerErr || !callerData.user) return bad("Invalid or expired session", 401);
  const caller = callerData.user;

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id,name")
    .eq("owner_id", caller.id)
    .maybeSingle();
  if (!tenant) return bad("No restaurant is associated with this account", 403);

  // `kitchen_accounts` predates the generated Database types (see
  // src/integrations/supabase/types.ts header — it's regenerated from the
  // live schema, not hand-edited), so it's queried untyped here, same as the
  // other tables the type generator hasn't caught up with yet (e.g.
  // whatsapp_campaigns in the WhatsApp routes).
  const kitchenAccounts = (supabaseAdmin as SupabaseClient).from("kitchen_accounts");

  if (body.action === "create") {
    const login = body.login?.trim();
    const password = body.password ?? "";
    if (!login) return bad("A login name is required");
    if (password.length < 6) return bad("Password must be at least 6 characters");

    const { data: existing } = await kitchenAccounts
      .select("id")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (existing) return bad("A kitchen account already exists for this hotel", 409);

    const slugLogin =
      login
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "kitchen";
    const email = `${slugLogin}.${tenant.id.slice(0, 8)}@kitchen.plateos.internal`;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "kitchen_user", tenant_id: tenant.id, login },
    });
    if (createErr || !created.user)
      return bad(createErr?.message || "Could not create the kitchen account");

    const kitchenUserId = created.user.id;
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: kitchenUserId, role: "kitchen", tenant_id: tenant.id });
    const { error: acctErr } = roleErr
      ? { error: roleErr }
      : await kitchenAccounts.insert({
          tenant_id: tenant.id,
          user_id: kitchenUserId,
          login_email: email,
          is_active: true,
        });

    if (roleErr || acctErr) {
      // Best-effort cleanup so a half-created account doesn't linger.
      await supabaseAdmin.auth.admin.deleteUser(kitchenUserId).catch(() => {});
      return bad((roleErr || acctErr)?.message || "Could not finish creating the kitchen account");
    }

    return Response.json({ ok: true, login_email: email, is_active: true });
  }

  const { data: account } = await kitchenAccounts
    .select("id,user_id,login_email,is_active")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!account) return bad("No kitchen account exists for this hotel yet", 404);

  if (body.action === "update_password") {
    const password = body.password ?? "";
    if (password.length < 6) return bad("Password must be at least 6 characters");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(account.user_id, { password });
    if (error) return bad(error.message);
    return Response.json({ ok: true });
  }

  if (body.action === "set_active") {
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(account.user_id, {
      ban_duration: body.is_active ? "none" : "876000h",
    });
    if (banErr) return bad(banErr.message);
    const { error } = await kitchenAccounts
      .update({ is_active: body.is_active })
      .eq("id", account.id);
    if (error) return bad(error.message);
    return Response.json({ ok: true, is_active: body.is_active });
  }

  if (body.action === "delete") {
    // Deleting the auth user cascades to its user_roles and kitchen_accounts
    // rows (both FK auth.users with ON DELETE CASCADE) — that's what frees
    // the tenant back up to create a new kitchen account, same "at most one
    // at a time" rule the create check and the partial unique index enforce.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(account.user_id);
    if (error) return bad(error.message);
    return Response.json({ ok: true });
  }

  return bad("Unknown action");
}

export const Route = createFileRoute("/api/kitchen-account")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
