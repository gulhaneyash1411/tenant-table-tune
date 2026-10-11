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

type OutletInput = {
  name: string;
  outlet_code?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  contact?: string;
  email?: string;
  gst_number?: string;
  opening_time?: string;
  closing_time?: string;
};

// Admin wizard: creates the owner account, the organization and its outlet(s)
// in one go. SINGLE_OUTLET takes exactly one outlet (the "default outlet").
type CreateBusinessBody = {
  action: "create_business";
  business_type: "SINGLE_OUTLET" | "MULTI_OUTLET";
  business_name: string; // organization / restaurant display name
  legal_name?: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  country?: string;
  pan_number?: string;
  logo_url?: string;
  outlets: OutletInput[];
  /** Optional: give every outlet this plan and activate it right away. */
  plan_id?: string;
  billing_cycle?: "monthly" | "half_yearly" | "yearly";
  /** Without a plan: single outlets start ACTIVE (as before), multi outlets PENDING_PAYMENT. */
  activate_outlets?: boolean;
};

type Body = CreateBody | ResetPasswordBody | CreateBusinessBody;

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

  if (body.action === "create_business") {
    const businessType = body.business_type;
    if (businessType !== "SINGLE_OUTLET" && businessType !== "MULTI_OUTLET") return bad("Choose a business type");
    const bizName = body.business_name?.trim();
    const ownerName = body.owner_name?.trim();
    const email = body.owner_email?.trim().toLowerCase();
    const phone = body.owner_phone?.trim();
    if (!bizName) return bad("Business name is required");
    if (!ownerName) return bad("Owner name is required");
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return bad("A valid owner email is required");
    if (!phone) return bad("Owner phone is required");
    const outlets = (body.outlets ?? []).filter((o) => o?.name?.trim());
    if (outlets.length === 0) return bad("Add at least one outlet");
    if (businessType === "SINGLE_OUTLET" && outlets.length !== 1) return bad("A single restaurant has exactly one outlet");
    if (outlets.length > 100) return bad("Too many outlets in one request");

    let planCycle: string | null = null;
    if (body.plan_id) {
      const { data: plan } = await supabaseAdmin.from("subscription_plans").select("id").eq("id", body.plan_id).maybeSingle();
      if (!plan) return bad("Plan not found");
      planCycle = body.billing_cycle === "yearly" || body.billing_cycle === "half_yearly" ? body.billing_cycle : "monthly";
    }
    // Outlets are operational immediately only when a plan is assigned or the
    // admin explicitly activates them; a single restaurant keeps its old behaviour.
    const startActive = !!body.plan_id || body.activate_outlets === true || businessType === "SINGLE_OUTLET";

    const tempPassword = generatePassword();
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email, password: tempPassword, email_confirm: true, user_metadata: { full_name: ownerName, phone },
    });
    if (createErr || !created.user) return bad(createErr?.message || "Could not create the user account");
    const userId = created.user.id;

    const loose = supabaseAdmin as any;
    const rollback = async (orgId: string | null) => {
      if (orgId) {
        await loose.from("tenants").delete().eq("organization_id", orgId);
        await loose.from("organizations").delete().eq("id", orgId);
      }
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    };

    const { data: org, error: orgErr } = await loose
      .from("organizations")
      .insert({ name: bizName, business_type: businessType, owner_id: userId })
      .select("id").single();
    if (orgErr || !org) { await rollback(null); return bad(orgErr?.message || "Could not create the organization"); }

    const tenantIds: string[] = [];
    for (const [i, o] of outlets.entries()) {
      const { data: t, error: tErr } = await loose.from("tenants").insert({
        name: o.name.trim(),
        slug: slugify(o.name),
        owner_id: userId,
        owner_name: ownerName,
        owner_email: o.email?.trim().toLowerCase() || email,
        owner_phone: o.contact?.trim() || phone,
        address: o.address?.trim() || null,
        city: o.city?.trim() || null,
        state: o.state?.trim() || null,
        pincode: o.pincode?.trim() || null,
        country: body.country?.trim() || "India",
        gst_number: o.gst_number?.trim() || null,
        opening_time: o.opening_time || null,
        closing_time: o.closing_time || null,
        logo_url: body.logo_url?.trim() || null,
        status: "approved",
        outlet_status: startActive ? "ACTIVE" : "PENDING_PAYMENT",
        organization_id: org.id,
        // Only the first outlet's account must reset its temporary password.
        must_reset_password: i === 0,
        settings: {
          outlet_code: o.outlet_code?.trim() || null,
          legal_name: body.legal_name?.trim() || null,
          pan_number: body.pan_number?.trim() || null,
        },
      }).select("id").single();
      if (tErr || !t) { await rollback(org.id); return bad(tErr?.message || "Could not create an outlet"); }
      tenantIds.push(t.id);
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert(tenantIds.map((tenant_id) => ({ user_id: userId, role: "restaurant_admin" as any, tenant_id })));
    if (roleErr) { await rollback(org.id); return bad(roleErr.message || "Could not assign the owner role"); }

    if (planCycle && body.plan_id) {
      const end = new Date();
      if (planCycle === "yearly") end.setFullYear(end.getFullYear() + 1);
      else if (planCycle === "half_yearly") end.setMonth(end.getMonth() + 6);
      else end.setMonth(end.getMonth() + 1);
      await loose.from("subscriptions").insert(
        tenantIds.map((tenant_id) => ({
          tenant_id, plan_id: body.plan_id, status: "active",
          current_period_start: new Date().toISOString(), current_period_end: end.toISOString(),
        })),
      );
    }

    await loose.from("audit_logs").insert([
      { actor_id: callerData.user.id, organization_id: org.id, action: "organization.created", entity: "organization", entity_id: org.id,
        new_value: { name: bizName, business_type: businessType, owner_email: email } },
      ...tenantIds.map((id, i) => ({
        actor_id: callerData.user.id, tenant_id: id, organization_id: org.id, action: "outlet.created", entity: "outlet", entity_id: id,
        new_value: { name: outlets[i].name, outlet_status: startActive ? "ACTIVE" : "PENDING_PAYMENT", plan_id: body.plan_id ?? null },
      })),
    ]);

    return Response.json({
      ok: true, organization_id: org.id, tenant_ids: tenantIds, user_id: userId, email, temp_password: tempPassword,
    });
  }

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
