import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

// Same reasoning as src/routes/api/kitchen-account.ts: the Super Admin is
// already signed in when creating a Sales User, and the client-side
// auth.signUp() flow used for self-registration (src/routes/auth.tsx) would
// replace the admin's own session with the new account's if called from
// the browser. So this runs server-side with the service-role admin API
// instead, authenticated by the caller's own access token.
//
// Unlike Kitchen Users (capped at one per tenant), there's no cap here and
// no tenant to scope by — a Sales User is platform-side staff, same as
// super_admin.

type Body =
  | { action: "create"; full_name: string; email: string; password: string }
  | { action: "list" }
  | { action: "update_password"; user_id: string; password: string }
  | { action: "set_active"; user_id: string; is_active: boolean }
  | { action: "delete"; user_id: string };

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

  const { data: callerRoles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerData.user.id)
    .eq("role", "super_admin");
  if (!callerRoles || callerRoles.length === 0) return bad("Super admin access required", 403);

  // `sales_accounts` predates the generated Database types (see the same
  // comment in kitchen-account.ts), so it's queried untyped here.
  const salesAccounts = (supabaseAdmin as SupabaseClient).from("sales_accounts");

  if (body.action === "list") {
    type SalesAccountRow = { id: string; user_id: string; is_active: boolean; created_at: string };
    const { data, error } = await salesAccounts
      .select("id,user_id,is_active,created_at")
      .order("created_at", { ascending: false });
    if (error) return bad(error.message);
    const accounts = (data ?? []) as SalesAccountRow[];

    const ids = accounts.map((a) => a.user_id);
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,full_name,email").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

    const merged = accounts.map((a) => ({
      ...a,
      full_name: byId.get(a.user_id)?.full_name ?? null,
      email: byId.get(a.user_id)?.email ?? null,
    }));
    return Response.json({ ok: true, accounts: merged });
  }

  if (body.action === "create") {
    const fullName = body.full_name?.trim();
    const email = body.email?.trim();
    const password = body.password ?? "";
    if (!fullName) return bad("A name is required");
    if (!email) return bad("An email is required");
    if (password.length < 6) return bad("Password must be at least 6 characters");

    // No pre-check for an existing account needed — auth.users.email is
    // already globally unique, so createUser itself rejects a duplicate
    // with a clear error. That's the app's existing duplicate-account rule.
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "sales_user" },
    });
    if (createErr || !created.user)
      return bad(createErr?.message || "Could not create the sales account");

    const salesUserId = created.user.id;
    // "sales_user" predates the generated Database types — added to the
    // app_role enum by a migration not yet reflected in types.ts (same
    // reason kitchen_accounts/sales_accounts are queried untyped below).
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: salesUserId, role: "sales_user" as never, tenant_id: null });
    const { error: acctErr } = roleErr
      ? { error: roleErr }
      : await salesAccounts.insert({
          user_id: salesUserId,
          is_active: true,
          created_by: callerData.user.id,
        });

    if (roleErr || acctErr) {
      // Best-effort cleanup so a half-created account doesn't linger.
      await supabaseAdmin.auth.admin.deleteUser(salesUserId).catch(() => {});
      return bad((roleErr || acctErr)?.message || "Could not finish creating the sales account");
    }

    return Response.json({
      ok: true,
      user_id: salesUserId,
      full_name: fullName,
      email,
      is_active: true,
    });
  }

  // Every remaining action targets one existing account by user_id.
  const { data: account } = await salesAccounts
    .select("id,user_id,is_active")
    .eq("user_id", body.user_id)
    .maybeSingle();
  if (!account) return bad("No sales account found", 404);

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
    const { error } = await salesAccounts
      .update({ is_active: body.is_active })
      .eq("id", account.id);
    if (error) return bad(error.message);
    return Response.json({ ok: true, is_active: body.is_active });
  }

  if (body.action === "delete") {
    // Deleting the auth user cascades to its user_roles and sales_accounts
    // rows (both FK auth.users with ON DELETE CASCADE).
    const { error } = await supabaseAdmin.auth.admin.deleteUser(account.user_id);
    if (error) return bad(error.message);
    return Response.json({ ok: true });
  }

  return bad("Unknown action");
}

export const Route = createFileRoute("/api/sales-account")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
