import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

// Outlet manager management for a multi-outlet owner. Runs server-side with the
// service role for the same reason kitchen-account.ts does: creating or
// inviting another auth user must not touch the owner's own browser session,
// and the owner must never see or set the manager's password — the manager is
// emailed an invitation and chooses their own.
//
// Every action is scoped to the caller's own organization; the caller must own
// an outlet in it. Managers cannot call this (they own nothing).

type Body = (
  | { action: "list" }
  | {
      action: "invite";
      full_name: string;
      email: string;
      mobile?: string;
      outlet_ids: string[];
      /** Initial password, chosen by whoever creates the login (min 6 characters). */
      password: string;
    }
  | { action: "update_password"; user_id: string; password: string }
  | { action: "set_outlets"; user_id: string; outlet_ids: string[] }
  | { action: "set_active"; user_id: string; is_active: boolean }
  | { action: "remove"; user_id: string }
) & { organization_id?: string };

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
  const admin = supabaseAdmin as SupabaseClient;

  const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  if (callerErr || !callerData.user) return bad("Invalid or expired session", 401);
  const caller = callerData.user;

  // The caller's organization = the one their owned outlets belong to. A super
  // admin (Admin Panel) instead names the organization explicitly.
  const { data: superRow } = await admin
    .from("user_roles").select("id").eq("user_id", caller.id).eq("role", "super_admin").limit(1).maybeSingle();
  const isSuper = !!superRow;
  const { data: owned } = isSuper && body.organization_id
    ? await admin.from("tenants").select("id,organization_id,outlet_status").eq("organization_id", body.organization_id)
    : await admin.from("tenants").select("id,organization_id,outlet_status").eq("owner_id", caller.id);
  const orgId = owned?.find((t) => t.organization_id)?.organization_id as string | undefined;
  if (!owned?.length || !orgId) return bad("Only the business owner can manage outlet managers", 403);

  // Admin-panel changes are recorded in the audit log (owner-made ones are not admin actions).
  const audit = async (action: string, entityId: string, detail: Record<string, unknown>) => {
    if (!isSuper) return;
    await admin.from("audit_logs").insert({
      actor_id: caller.id, organization_id: orgId, action, entity: "outlet_manager", entity_id: entityId, new_value: detail,
    });
  };
  const orgOutlets = new Map<string, string>(owned.map((t) => [t.id as string, t.outlet_status as string]));

  // Outlet ids must belong to this organization, and be paid/active: a manager
  // is only ever given operational access to an outlet that is operational.
  const validateOutlets = (ids: unknown): string | null => {
    if (!Array.isArray(ids) || ids.length === 0) return "Assign at least one outlet";
    for (const id of ids) {
      const status = orgOutlets.get(id as string);
      if (!status) return "One of the selected outlets is not part of your business";
      if (status !== "ACTIVE") return "Managers can only be assigned to active outlets";
    }
    return null;
  };

  // One manager per outlet: none of these outlets may already belong to someone else.
  const takenByOther = async (ids: string[], exceptUserId: string | null): Promise<string | null> => {
    const { data } = await admin
      .from("user_roles")
      .select("tenant_id,user_id")
      .eq("role", "manager")
      .in("tenant_id", ids);
    const clash = (data ?? []).find((r) => r.user_id !== exceptUserId);
    if (!clash) return null;
    const { data: t } = await admin.from("tenants").select("name").eq("id", clash.tenant_id).maybeSingle();
    return `${t?.name ?? "That outlet"} already has a manager. An outlet can have only one manager — remove or reassign them first.`;
  };

  const roleRows = async (userId: string) => {
    const { data } = await admin
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("role", "manager")
      .in("tenant_id", [...orgOutlets.keys()]);
    return (data ?? []).map((r) => r.tenant_id as string);
  };

  if (body.action === "list") {
    const { data: members } = await admin
      .from("organization_users")
      .select("user_id,full_name,email,mobile,role,is_active,created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });
    const out = await Promise.all(
      (members ?? []).map(async (m) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id as string);
        return {
          ...m,
          outlet_ids: await roleRows(m.user_id as string),
          // "invited" until the manager has signed in once.
          status: !m.is_active ? "disabled" : u?.user?.last_sign_in_at ? "active" : "invited",
        };
      }),
    );
    return Response.json({ ok: true, users: out });
  }

  if (body.action === "invite") {
    const email = body.email?.trim().toLowerCase();
    const fullName = body.full_name?.trim();
    if (!fullName) return bad("Full name is required");
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return bad("A valid email is required");
    const outletErr = validateOutlets(body.outlet_ids);
    if (outletErr) return bad(outletErr);
    const taken = await takenByOther(body.outlet_ids, null);
    if (taken) return bad(taken, 409);

    // Same approach as the kitchen / sales accounts: the owner (or admin) sets the
    // login (the manager's email) and an initial password, and shares them with the
    // manager directly — no email link involved.
    const password = body.password ?? "";
    if (password.length < 6) return bad("Password must be at least 6 characters");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone: body.mobile ?? "", role: "outlet_manager" },
    });
    if (createErr || !created.user) {
      return bad(createErr?.message || "Could not create the manager login", 409);
    }
    const userId = created.user.id;

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert(body.outlet_ids.map((tenant_id) => ({ user_id: userId, role: "manager", tenant_id })));
    const { error: memberErr } = roleErr
      ? { error: roleErr }
      : await admin.from("organization_users").insert({
          organization_id: orgId,
          user_id: userId,
          full_name: fullName,
          email,
          mobile: body.mobile?.trim() || null,
          role: "manager",
          invited_by: caller.id,
        });
    if (roleErr || memberErr) {
      // Don't leave a half-created, emailed account behind.
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return bad((roleErr || memberErr)?.message || "Could not finish creating the manager");
    }
    await audit("manager.created", userId, { email, outlet_ids: body.outlet_ids });
    return Response.json({ ok: true });
  }

  // The remaining actions target an existing manager of THIS organization.
  const { data: member } = await admin
    .from("organization_users")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("user_id", (body as { user_id: string }).user_id)
    .maybeSingle();
  if (!member) return bad("Manager not found", 404);
  const targetId = member.user_id as string;

  if (body.action === "set_outlets") {
    const outletErr = validateOutlets(body.outlet_ids);
    if (outletErr) return bad(outletErr);
    const taken = await takenByOther(body.outlet_ids, targetId);
    if (taken) return bad(taken, 409);
    const current = await roleRows(targetId);
    const toAdd = body.outlet_ids.filter((id) => !current.includes(id));
    const toRemove = current.filter((id) => !body.outlet_ids.includes(id));
    if (toRemove.length) {
      const { error } = await admin
        .from("user_roles").delete().eq("user_id", targetId).eq("role", "manager").in("tenant_id", toRemove);
      if (error) return bad(error.message);
    }
    if (toAdd.length) {
      const { error } = await admin
        .from("user_roles").insert(toAdd.map((tenant_id) => ({ user_id: targetId, role: "manager", tenant_id })));
      if (error) return bad(error.message);
    }
    await audit("manager.outlets_changed", targetId, { outlet_ids: body.outlet_ids });
    return Response.json({ ok: true });
  }

  if (body.action === "update_password") {
    if ((body.password ?? "").length < 6) return bad("Password must be at least 6 characters");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(targetId, { password: body.password });
    if (error) return bad(error.message);
    await audit("manager.password_reset", targetId, {});
    return Response.json({ ok: true });
  }

  if (body.action === "set_active") {
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
      ban_duration: body.is_active ? "none" : "876000h",
    });
    if (banErr) return bad(banErr.message);
    const { error } = await admin
      .from("organization_users").update({ is_active: body.is_active })
      .eq("organization_id", orgId).eq("user_id", targetId);
    if (error) return bad(error.message);
    await audit(body.is_active ? "manager.enabled" : "manager.disabled", targetId, {});
    return Response.json({ ok: true });
  }

  if (body.action === "remove") {
    // Deleting the auth user cascades to user_roles and organization_users.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (error) return bad(error.message);
    await audit("manager.removed", targetId, {});
    return Response.json({ ok: true });
  }

  return bad("Unknown action");
}

export const Route = createFileRoute("/api/outlet-users")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
