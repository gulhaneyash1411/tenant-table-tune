import { createFileRoute } from "@tanstack/react-router";

type CreateBody = {
  action: "create";
  restaurant_name: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  city?: string;
  state?: string;
  pincode?: string;
  gst_number?: string;
};

type ResetPasswordBody = {
  action: "reset_password";
  tenant_id: string;
};

type Body = CreateBody | ResetPasswordBody;

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$!";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${rand}`;
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

  if (body.action === "create") {
    const name = body.restaurant_name?.trim();
    const ownerName = body.owner_name?.trim();
    const email = body.owner_email?.trim().toLowerCase();
    const phone = body.owner_phone?.trim();

    if (!name) return bad("Restaurant name is required");
    if (!ownerName) return bad("Owner name is required");
    if (!email) return bad("Owner email is required");
    if (!phone) return bad("Owner phone is required");

    const tempPassword = generatePassword();
    const slug = slugify(name);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: ownerName, phone },
    });
    if (createErr || !created.user) {
      return bad(createErr?.message || "Could not create the user account");
    }

    const userId = created.user.id;

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        name,
        slug,
        owner_id: userId,
        owner_name: ownerName,
        owner_email: email,
        owner_phone: phone,
        city: body.city?.trim() || null,
        state: body.state?.trim() || null,
        pincode: body.pincode?.trim() || null,
        gst_number: body.gst_number?.trim() || null,
        status: "approved" as const,
        must_reset_password: true,
      } as any)
      .select("id,name,slug")
      .single();

    if (tenantErr || !tenant) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return bad(tenantErr?.message || "Could not create the restaurant");
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "restaurant_admin" as any, tenant_id: tenant.id });

    if (roleErr) {
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return bad(roleErr.message || "Could not assign the restaurant role");
    }

    return Response.json({
      ok: true,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      user_id: userId,
      email,
      temp_password: tempPassword,
    });
  }

  if (body.action === "reset_password") {
    const tenantId = body.tenant_id?.trim();
    if (!tenantId) return bad("Tenant ID is required");

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id,owner_id,name")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenant || !tenant.owner_id) return bad("Restaurant not found", 404);

    const tempPassword = generatePassword();

    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(tenant.owner_id, {
      password: tempPassword,
    });
    if (pwErr) return bad(pwErr.message);

    const { error: flagErr } = await (supabaseAdmin as any)
      .from("tenants")
      .update({ must_reset_password: true })
      .eq("id", tenant.id);
    if (flagErr) return bad(flagErr.message);

    return Response.json({
      ok: true,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      temp_password: tempPassword,
    });
  }

  return bad("Unknown action");
}

export const Route = createFileRoute("/api/admin-create-restaurant")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
