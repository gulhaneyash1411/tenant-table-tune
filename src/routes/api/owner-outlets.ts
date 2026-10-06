import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

// Owner → Outlets → Delete outlet.
//
// A hard delete of ONE outlet of the caller's own business: the tenant row goes
// and every tenant-scoped table cascades with it (see
// 20260926140000_delete_restaurant_cascade.sql), exactly like the admin delete in
// admin-delete-restaurant.ts. It runs server-side with the service role because
// `authenticated` has no DELETE grant on public.tenants.
//
// Guard rails: only the owner of that outlet can do it, and the last remaining
// outlet of a business cannot be deleted here (that would delete the whole
// business — a Super Admin does that from the Admin Panel).

type Body = { action: "delete_outlet"; tenant_id: string; confirm_name: string };

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
  if (body.action !== "delete_outlet") return bad("Unknown action");
  const tenantId = body.tenant_id?.trim();
  if (!tenantId) return bad("An outlet id is required");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as SupabaseClient;

  const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  if (callerErr || !callerData.user) return bad("Invalid or expired session", 401);
  const caller = callerData.user;

  const { data: tenant } = await admin
    .from("tenants")
    .select("id,name,slug,owner_id,organization_id,city,status,outlet_status,created_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return bad("That outlet no longer exists", 404);
  if (tenant.owner_id !== caller.id) return bad("Only the business owner can delete an outlet", 403);

  // Typing the name guards against deleting the wrong outlet by mistake.
  if ((body.confirm_name ?? "").trim() !== String(tenant.name).trim()) {
    return bad("Type the outlet name exactly to confirm");
  }

  const { count } = await admin
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", caller.id)
    .eq("organization_id", tenant.organization_id);
  if ((count ?? 0) <= 1) {
    return bad("This is your only outlet. To close the whole business, contact PlateOS support.", 409);
  }

  // Collect tenant-scoped logins and managers before the row goes.
  const { data: kitchen } = await admin.from("kitchen_accounts").select("user_id").eq("tenant_id", tenant.id);
  const kitchenUserIds = ((kitchen ?? []) as { user_id: string }[]).map((k) => k.user_id).filter(Boolean);

  const { data: managers } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("tenant_id", tenant.id)
    .eq("role", "manager");
  const managerUserIds = ((managers ?? []) as { user_id: string }[]).map((m) => m.user_id).filter(Boolean);

  const { error: delErr } = await admin.from("tenants").delete().eq("id", tenant.id);
  if (delErr) return bad(delErr.message, 500);

  const warnings: string[] = [];

  // For each manager, check if they have other outlets left.
  // If not, delete their auth user and organization_users record.
  for (const managerId of managerUserIds) {
    const { count: outletCount } = await admin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", managerId)
      .eq("role", "manager");

    if ((outletCount ?? 0) === 0) {
      // Manager has no other outlets — delete their account
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(managerId);
      if (authErr) {
        warnings.push(`Manager login could not be removed: ${authErr.message}`);
      } else {
        // Also delete their organization_users record (cascades from auth deletion)
        const { error: orgErr } = await admin.from("organization_users").delete().eq("user_id", managerId);
        if (orgErr) warnings.push(`Manager org record cleanup failed: ${orgErr.message}`);
      }
    }
  }

  for (const userId of kitchenUserIds) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) warnings.push(`Kitchen login could not be removed: ${error.message}`);
  }

  // tenant_id null on purpose: audit rows tagged with the deleted tenant would cascade away with it.
  await admin.from("audit_logs").insert({
    actor_id: caller.id,
    tenant_id: null,
    organization_id: tenant.organization_id,
    action: "outlet.deleted",
    entity: "outlet",
    entity_id: tenant.id,
    old_value: tenant,
    ip: request.headers.get("x-forwarded-for"),
    user_agent: request.headers.get("user-agent"),
  });

  return Response.json({ ok: true, name: tenant.name, warnings });
}

export const Route = createFileRoute("/api/owner-outlets")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
