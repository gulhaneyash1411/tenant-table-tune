import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

// Super Admin → Restaurants → Delete. This is a COMPLETE hard delete: the
// tenant row, its parent organization (when no other outlets remain), every
// tenant-scoped child table (via ON DELETE CASCADE), the owner's auth.users
// row, and any tenant-scoped logins (kitchen / sales accounts) are all removed
// so there is zero trace left in the application.
//
// Because the owner's auth account is deleted, they can sign up again from
// scratch as a brand-new restaurant — the register_tenant function will see no
// existing tenant for their (new) user id and allow the registration.

type Body = {
  action: "delete";
  tenant_id: string;
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

  const { data: tenant, error: tenantErr } = await (supabaseAdmin as SupabaseClient)
    .from("tenants")
    .select("id,name,slug,owner_id,owner_name,owner_email,owner_phone,city,status,organization_id,created_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantErr) return bad(tenantErr.message, 500);
  if (!tenant) return bad("That restaurant no longer exists", 404);

  const organizationId = (tenant as any).organization_id as string | null;
  const ownerId = tenant.owner_id as string | null;

  // Collect tenant-scoped logins before the cascade deletes them.
  const { data: kitchenAccounts } = await (supabaseAdmin as SupabaseClient)
    .from("kitchen_accounts")
    .select("user_id")
    .eq("tenant_id", tenant.id);
  const kitchenUserIds = ((kitchenAccounts ?? []) as { user_id: string }[])
    .map((a) => a.user_id)
    .filter(Boolean);

  const { data: salesAccounts } = await (supabaseAdmin as SupabaseClient)
    .from("sales_accounts")
    .select("user_id")
    .eq("tenant_id", tenant.id);
  const salesUserIds = ((salesAccounts ?? []) as { user_id: string }[])
    .map((a) => a.user_id)
    .filter(Boolean);

  // Check if the owner has other tenants (multi-outlet) so we know whether
  // to delete the organization and owner account.
  let ownerHasOtherTenants = false;
  if (ownerId) {
    const { data: otherTenants } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("owner_id", ownerId)
      .neq("id", tenant.id)
      .limit(1);
    ownerHasOtherTenants = (otherTenants ?? []).length > 0;
  }

  // --- Delete the tenant row (cascades to all child tables) ---
  const { error: deleteErr } = await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
  if (deleteErr) return bad(deleteErr.message, 500);

  // Past this point the restaurant is gone. Cleanup failures are warnings.
  const warnings: string[] = [];

  // --- Delete the organization if it has no remaining outlets ---
  let organizationDeleted = false;
  if (organizationId && !ownerHasOtherTenants) {
    const { data: remainingOutlets } = await (supabaseAdmin as SupabaseClient)
      .from("tenants")
      .select("id")
      .eq("organization_id", organizationId)
      .limit(1);
    if (!remainingOutlets || remainingOutlets.length === 0) {
      const { error } = await (supabaseAdmin as SupabaseClient)
        .from("organizations")
        .delete()
        .eq("id", organizationId);
      if (error) warnings.push(`Organization cleanup failed: ${error.message}`);
      else organizationDeleted = true;
    }
  }

  // --- Remove tenant-scoped auth accounts (kitchen + sales) ---
  for (const userId of kitchenUserIds) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) warnings.push(`Kitchen login cleanup failed: ${error.message}`);
  }
  for (const userId of salesUserIds) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) warnings.push(`Sales login cleanup failed: ${error.message}`);
  }

  // --- Remove the owner's auth account (and cascaded user_roles / profile) ---
  let ownerDeleted = false;
  if (ownerId && !ownerHasOtherTenants) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(ownerId);
    if (error) warnings.push(`Owner login cleanup failed: ${error.message}`);
    else ownerDeleted = true;
  }

  // Audit log with tenant_id null (the tenant row is already gone).
  const { error: auditErr } = await supabaseAdmin.from("audit_logs").insert({
    actor_id: caller.id,
    tenant_id: null,
    action: "tenant.deleted",
    entity: "tenant",
    entity_id: tenant.id,
    old_value: {
      ...tenant,
      owner_account_deleted: ownerDeleted,
      organization_deleted: organizationDeleted,
    },
    ip: request.headers.get("x-forwarded-for"),
    user_agent: request.headers.get("user-agent"),
  });
  if (auditErr) warnings.push(`Audit log entry failed: ${auditErr.message}`);

  return Response.json({
    ok: true,
    name: tenant.name,
    owner_deleted: ownerDeleted,
    organization_deleted: organizationDeleted,
    warnings,
  });
}

export const Route = createFileRoute("/api/admin-delete-restaurant")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
