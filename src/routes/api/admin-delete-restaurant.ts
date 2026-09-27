import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

// Super Admin → Restaurants → Delete. This is a hard delete, not a status
// change: the tenant row goes away and every tenant-scoped table cascades
// with it (see supabase/migrations/20260926140000_delete_restaurant_cascade.sql,
// which guarantees ON DELETE CASCADE on every FK pointing at
// public.tenants), so there is no partial "deleted but still listed" state.
//
// It runs server-side with the service-role client for the same reasons as
// kitchen-account.ts / sales-account.ts: `authenticated` has no DELETE grant
// on public.tenants at all (so a compromised browser session can't drop a
// hotel), and removing the owner's auth.users row needs the admin API.

type Body = {
  action: "delete";
  tenant_id: string;
  // Also remove the owner's login (auth.users row + their profile). Off means
  // the person keeps their account and can register a new restaurant with it.
  delete_owner_account?: boolean;
};

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

  if (body.action !== "delete") return bad("Unknown action");
  const tenantId = body.tenant_id?.trim();
  if (!tenantId) return bad("A restaurant id is required");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  if (callerErr || !callerData.user) return bad("Invalid or expired session", 401);
  const caller = callerData.user;

  const { data: callerRoles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .eq("role", "super_admin");
  if (!callerRoles || callerRoles.length === 0) return bad("Super admin access required", 403);

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from("tenants")
    .select("id,name,slug,owner_id,owner_name,owner_email,owner_phone,city,status,created_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantErr) return bad(tenantErr.message, 500);
  if (!tenant) return bad("That restaurant no longer exists", 404);

  // Tenant-scoped logins have to be collected before the tenant row goes:
  // kitchen_accounts cascades away with it, taking the auth user id with it.
  // (`kitchen_accounts` predates the generated Database types, same as in
  // kitchen-account.ts, so it's queried untyped.)
  const { data: kitchenAccounts } = await (supabaseAdmin as SupabaseClient)
    .from("kitchen_accounts")
    .select("user_id")
    .eq("tenant_id", tenant.id);
  const kitchenUserIds = ((kitchenAccounts ?? []) as { user_id: string }[])
    .map((a) => a.user_id)
    .filter(Boolean);

  const { error: deleteErr } = await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
  if (deleteErr) return bad(deleteErr.message, 500);

  // Past this point the restaurant is gone. Anything that still fails is
  // leftover-account cleanup, reported as a warning rather than an error so
  // the admin isn't told the delete failed when it didn't.
  const warnings: string[] = [];

  for (const userId of kitchenUserIds) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) warnings.push(`Kitchen login could not be removed: ${error.message}`);
  }

  let ownerDeleted = false;
  if (body.delete_owner_account && tenant.owner_id) {
    // Cascades to public.profiles and any remaining user_roles rows.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(tenant.owner_id);
    if (error) warnings.push(`Owner login could not be removed: ${error.message}`);
    else ownerDeleted = true;
  }

  // tenant_id is deliberately null: audit_logs is itself tenant-scoped and
  // cascades, so a row tagged with the deleted tenant would delete itself.
  // The snapshot in old_value is the only remaining record of the hotel.
  const { error: auditErr } = await supabaseAdmin.from("audit_logs").insert({
    actor_id: caller.id,
    tenant_id: null,
    action: "tenant.deleted",
    entity: "tenant",
    entity_id: tenant.id,
    old_value: { ...tenant, owner_account_deleted: ownerDeleted },
    ip: request.headers.get("x-forwarded-for"),
    user_agent: request.headers.get("user-agent"),
  });
  if (auditErr) warnings.push(`Audit log entry failed: ${auditErr.message}`);

  return Response.json({ ok: true, name: tenant.name, owner_deleted: ownerDeleted, warnings });
}

export const Route = createFileRoute("/api/admin-delete-restaurant")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
