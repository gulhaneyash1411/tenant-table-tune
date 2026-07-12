import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/bootstrap")({
  server: {
    handlers: {
      GET: async () => runBootstrap(),
      POST: async () => runBootstrap(),
    },
  },
});

async function runBootstrap() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const results: any = { steps: [] };

  // 1. Super admin
  const superEmail = "admin@platform.dev";
  const superPass = "Admin123!";
  let superId: string | null = null;
  const { data: existSuper } = await supabaseAdmin.auth.admin.listUsers();
  const foundSuper = existSuper?.users.find((u) => u.email === superEmail);
  if (foundSuper) { superId = foundSuper.id; results.steps.push("super_exists"); }
  else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: superEmail, password: superPass, email_confirm: true,
      user_metadata: { full_name: "Platform Owner" },
    });
    if (error) return { ok: false, error: error.message };
    superId = data.user.id;
    results.steps.push("super_created");
  }
  await supabaseAdmin.from("user_roles").upsert({ user_id: superId!, role: "super_admin" }, { onConflict: "user_id,role,tenant_id" });

  // 2. Owner + tenant
  const ownerEmail = "owner@bellacucina.dev";
  const ownerPass = "Owner123!";
  let ownerId: string | null = null;
  const foundOwner = existSuper?.users.find((u) => u.email === ownerEmail);
  if (foundOwner) { ownerId = foundOwner.id; results.steps.push("owner_exists"); }
  else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: ownerEmail, password: ownerPass, email_confirm: true,
      user_metadata: { full_name: "Isabella Rossi", phone: "+91 90000 00001" },
    });
    if (error) return { ok: false, error: error.message };
    ownerId = data.user.id;
    results.steps.push("owner_created");
  }

  // 3. Tenant
  const { data: existTenant } = await supabaseAdmin.from("tenants").select("*").eq("owner_id", ownerId!).maybeSingle();
  let tenant = existTenant;
  if (!tenant) {
    const { data, error } = await supabaseAdmin.from("tenants").insert({
      name: "Bella Cucina", slug: "bella-cucina",
      owner_id: ownerId, owner_name: "Isabella Rossi",
      owner_email: ownerEmail, owner_phone: "+91 90000 00001",
      business_type: "Fine Dining", gst_number: "27ABCDE1234F1Z5",
      address: "12 Marine Drive", city: "Mumbai", state: "Maharashtra",
      country: "India", pincode: "400001", number_of_tables: 12,
      expected_orders_per_day: 120, status: "approved",
      brand_color: "#0ea5e9",
    }).select().single();
    if (error) return { ok: false, error: error.message };
    tenant = data;
    results.steps.push("tenant_created");
  }
  await supabaseAdmin.from("user_roles").upsert({ user_id: ownerId!, role: "restaurant_admin", tenant_id: tenant!.id }, { onConflict: "user_id,role,tenant_id" });

  // 4. Subscription
  const { data: plan } = await supabaseAdmin.from("subscription_plans").select("*").eq("name", "Professional").single();
  const { data: existSub } = await supabaseAdmin.from("subscriptions").select("id").eq("tenant_id", tenant!.id).maybeSingle();
  if (!existSub && plan) {
    await supabaseAdmin.from("subscriptions").insert({
      tenant_id: tenant!.id, plan_id: plan.id, status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
    });
  }

  // 5. Tables
  const { count: tblCount } = await supabaseAdmin.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("tenant_id", tenant!.id);
  if ((tblCount ?? 0) === 0) {
    const tables = Array.from({ length: 12 }).map((_, i) => ({
      tenant_id: tenant!.id, label: `T${i + 1}`, seats: (i % 3 === 0 ? 6 : 4),
    }));
    await supabaseAdmin.from("restaurant_tables").insert(tables);
  }

  // 6. Menu categories + items
  const { count: catCount } = await supabaseAdmin.from("menu_categories").select("id", { count: "exact", head: true }).eq("tenant_id", tenant!.id);
  if ((catCount ?? 0) === 0) {
    const catSeed = [
      { name: "Starters", items: [
        ["Bruschetta al Pomodoro", 240, true],
        ["Arancini", 320, true],
        ["Calamari Fritti", 420, false],
      ]},
      { name: "Pizza", items: [
        ["Margherita", 380, true],
        ["Diavola", 520, false],
        ["Quattro Formaggi", 560, true],
        ["Prosciutto e Funghi", 590, false],
      ]},
      { name: "Pasta", items: [
        ["Spaghetti Carbonara", 480, false],
        ["Penne Arrabbiata", 380, true],
        ["Fettuccine Alfredo", 460, true],
        ["Lasagna della Casa", 540, false],
      ]},
      { name: "Mains", items: [
        ["Osso Buco", 890, false],
        ["Chicken Parmigiana", 720, false],
        ["Grilled Sea Bass", 950, false],
      ]},
      { name: "Desserts", items: [
        ["Tiramisu", 260, true],
        ["Panna Cotta", 240, true],
        ["Gelato Trio", 220, true],
      ]},
      { name: "Beverages", items: [
        ["Espresso", 120, true],
        ["Cappuccino", 180, true],
        ["Fresh Lime Soda", 140, true],
        ["Iced Tea", 160, true],
      ]},
    ];
    for (const [idx, c] of catSeed.entries()) {
      const { data: cat } = await supabaseAdmin.from("menu_categories").insert({
        tenant_id: tenant!.id, name: c.name, sort_order: idx,
      }).select().single();
      if (!cat) continue;
      const items = c.items.map(([name, price, veg], i) => ({
        tenant_id: tenant!.id, category_id: cat.id, name,
        price, is_veg: veg, sort_order: i,
        description: `Chef's selection — ${name}`,
      }));
      await supabaseAdmin.from("menu_items").insert(items);
    }
    results.steps.push("menu_seeded");
  }

  // 7. Sample notifications for owner
  const { count: nCount } = await supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", ownerId!);
  if ((nCount ?? 0) === 0) {
    await supabaseAdmin.from("notifications").insert([
      { recipient_id: ownerId, tenant_id: tenant!.id, title: "Welcome to PlateOS", body: "Your restaurant is approved. Print your table QRs to start receiving orders.", kind: "welcome" },
      { recipient_id: ownerId, tenant_id: tenant!.id, title: "Professional plan active", body: "Your subscription is active for 30 days.", kind: "billing" },
    ]);
  }

  results.superAdmin = { email: superEmail, password: superPass };
  results.owner = { email: ownerEmail, password: ownerPass };
  results.tenant = { id: tenant!.id, name: tenant!.name };
  return new Response(JSON.stringify({ ok: true, ...results }, null, 2), { headers: { "content-type": "application/json" } });
}