import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const placeOrderSchema = z.object({
  tenant_id: z.string().uuid(),
  table_id: z.string().uuid().optional().nullable(),
  order_type: z.enum(["dine_in", "takeaway", "home_delivery"]),
  customer_name: z.string().trim().min(1).max(120),
  // Phone is optional: an empty string means the guest didn't give one.
  customer_phone: z.string().trim().max(30).refine((v) => v === "" || v.length >= 4, "Phone number is too short"),
  notes: z.string().trim().max(1000).optional().nullable(),
  delivery_address: z.string().trim().max(500).optional().nullable(),
  delivery_landmark: z.string().trim().max(200).optional().nullable(),
  delivery_pincode: z.string().trim().max(10).optional().nullable(),
  session_token: z.string().max(100).optional().nullable(),
  items: z.array(z.object({
    menu_item_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
  })).min(1).max(100),
}).superRefine((v, ctx) => {
  if (v.order_type !== "home_delivery") return;
  if (!v.delivery_address?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery_address"], message: "A delivery address is required" });
  }
  if (!/^\d{6}$/.test(v.delivery_pincode?.trim() ?? "")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery_pincode"], message: "Enter a valid 6-digit pincode" });
  }
});

export const placePublicOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => placeOrderSchema.parse(d))
  .handler(async ({ data }) => {
    const { createPublicOrder } = await import("./public-orders.server");
    return createPublicOrder(data);
  });

const appendOrderSchema = z.object({
  order_id: z.string().uuid(),
  // Phone is optional: an empty string means the guest didn't give one.
  customer_phone: z.string().trim().max(30).refine((v) => v === "" || v.length >= 4, "Phone number is too short"),
  session_token: z.string().max(100).optional().nullable(),
  items: z.array(z.object({
    menu_item_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
  })).min(1).max(100),
});

// Adding a round to an order that is already open. Deliberately separate from
// placePublicOrder: there is no tenant, table or order type to choose here —
// all of that is already fixed by the order being appended to.
export const appendPublicOrderItems = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => appendOrderSchema.parse(d))
  .handler(async ({ data }) => {
    const { appendPublicOrderItems: append } = await import("./public-orders.server");
    return append(data);
  });

export const clearRoundMarkers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("order_items")
      .update({ notes: null })
      .eq("order_id", data.order_id)
      .eq("notes", "__nr__");
  });

export const getOrdersByPhone = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    phone: z.string().trim().min(3).max(30).optional(),
    order_id: z.string().uuid().optional(),
  }).refine((v) => !!v.phone || !!v.order_id, "phone or order_id is required").parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Guest lookup has no account/OTP behind it, so a phone number alone proves
    // nothing. Scoping to a short recent window limits this to "check on the
    // order I just placed" instead of exposing someone's full order history.
    const recentCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const columns =
      "id,order_number,status,payment_status,total,subtotal,discount_type,discount_value,discount_amount,service_charge,tax,delivery_fee,delivery_address,delivery_landmark,delivery_pincode,created_at,tenant_id,table_id,order_type,customer_name,customer_phone";
    // An order placed without a phone is only reachable by its ID. The empty-phone
    // filter means a phone-based order can never be returned this way.
    const { data: orders } = data.order_id
      ? await supabaseAdmin
          .from("orders")
          .select(columns)
          .eq("id", data.order_id)
          .eq("customer_phone", "")
          .gte("created_at", recentCutoff)
          .limit(1)
      : await supabaseAdmin
          .from("orders")
          .select(columns)
          .eq("customer_phone", data.phone!)
          .gte("created_at", recentCutoff)
          .order("created_at", { ascending: false })
          .limit(15);
    const rows = orders ?? [];
    const tableIds = [...new Set(rows.map((o: any) => o.table_id).filter(Boolean))];
    let tableMap: Record<string, string> = {};
    // "Order more" re-opens the table menu, which is addressed by the table's
    // QR token — newer tables have no id-based URL.
    const tokenMap: Record<string, string> = {};
    if (tableIds.length) {
      const { data: qrs } = await (supabaseAdmin as any)
        .from("qr_codes").select("table_id,token").in("table_id", tableIds).eq("status", "ACTIVE");
      for (const q of (qrs ?? []) as any[]) tokenMap[q.table_id] = q.token;
    }
    if (tableIds.length) {
      const { data: tables } = await supabaseAdmin
        .from("restaurant_tables")
        .select("id,label")
        .in("id", tableIds);
      for (const t of (tables ?? []) as any[]) {
        if (t.label != null && t.label !== "") tableMap[t.id] = String(t.label);
      }
    }
    return rows.map((o: any) => ({
      ...o,
      table_label: o.table_id ? (tableMap[o.table_id] ?? null) : null,
      table_qr_token: o.table_id ? (tokenMap[o.table_id] ?? null) : null,
    }));
  });

export const getOrderDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    order_id: z.string().uuid(),
    // Empty for an order placed without a phone; the query then only matches such orders.
    phone: z.string().trim().max(30),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", data.order_id)
      .eq("customer_phone", data.phone)
      .maybeSingle();
    if (!order) return { order: null, items: [], tenant: null };
    const [{ data: items }, { data: tenant }] = await Promise.all([
      supabaseAdmin.from("order_items").select("*").eq("order_id", order.id),
      supabaseAdmin
        .from("tenants")
        .select("id,name,address,city,gst_number,slogan,logo_url")
        .eq("id", order.tenant_id)
        .maybeSingle(),
    ]);
    return { order, items: items ?? [], tenant };
  });

export const createOrderingSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    table_id: z.string().uuid(),
    tenant_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any).rpc("create_ordering_session", {
      p_table_id: data.table_id,
      p_tenant_id: data.tenant_id,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("Failed to create ordering session");
    return row as { session_id: string; session_token: string; expires_at: string };
  });

export const getActiveSession = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    table_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await (supabaseAdmin as any).rpc("get_active_table_session", {
      p_table_id: data.table_id,
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row as { session_id: string; session_token: string; expires_at: string } | null;
  });

export const closeSessionOnPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    order_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).rpc("close_session_on_payment", { p_order_id: data.order_id });
  });

// Create a session for takeaway ordering. Unlike dine-in, this doesn't expire
// other sessions — multiple customers can order takeaway simultaneously.
export const createTakeawaySession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any).rpc("create_takeaway_session", {
      p_tenant_id: data.tenant_id,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("Failed to create session");
    return row as { session_id: string; session_token: string; expires_at: string };
  });

// Resolve QR → create a fresh ordering session → return the session token.
// Called from /order/{token} before redirecting to /t/{token}?s={sessionToken}.
export const scanQrAndCreateSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    qr_key: z.string().min(1),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: resolved } = await (supabaseAdmin as any)
      .rpc("resolve_table_qr", { p_key: data.qr_key }).maybeSingle();
    if (!resolved?.table_id) return { session_token: null as string | null };
    const { data: table } = await supabaseAdmin
      .from("restaurant_tables")
      .select("id,tenant_id")
      .eq("id", resolved.table_id)
      .single();
    if (!table) return { session_token: null as string | null };
    const { data: rows, error } = await (supabaseAdmin as any).rpc("create_ordering_session", {
      p_table_id: table.id,
      p_tenant_id: table.tenant_id,
    });
    if (error) return { session_token: null as string | null };
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { session_token: null as string | null };
    return { session_token: row.session_token as string };
  });

// Validate a session token from the URL. Returns the session if active and
// unexpired, null otherwise (lazy-expires past-deadline sessions on the spot).
export const validateSessionToken = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    session_token: z.string().min(1),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await (supabaseAdmin as any).rpc("validate_ordering_session", {
      p_session_token: data.session_token,
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;
    return {
      session_id: row.session_id as string,
      session_token: data.session_token,
      expires_at: String(row.expires_at),
    };
  });

export const getReviewTarget = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tenant } = await (supabaseAdmin as any)
      .from("tenants")
      .select("name,google_review_url")
      .eq("id", data.tenant_id)
      .maybeSingle();
    return { name: tenant?.name ?? null, google_review_url: tenant?.google_review_url ?? null };
  });

export const getActiveTableOrder = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ table_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // A table is occupied until the bill is settled. "Served but unpaid"
    // means the party is still eating — they can keep ordering on the same
    // bill.  Only a cancelled order or a paid one frees the table.
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,order_number,status,payment_status,total,created_at,table_id,customer_phone")
      .eq("table_id", data.table_id)
      .eq("payment_status", "unpaid")
      .neq("status", "cancelled")
      .maybeSingle();
    return order ?? null;
  });

// Guest check for a table that already has an open order. The name is compared
// here on the server so the guest's name is never sent to the page. The phone is
// optional: blank means name only, and if a phone is entered it must match too.
export const verifyTableOrderAccess = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    table_id: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(30),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,customer_name,customer_phone")
      .eq("table_id", data.table_id)
      .eq("payment_status", "unpaid")
      .neq("status", "cancelled")
      .maybeSingle();
    if (!order) return { ok: false, order_id: null, customer_phone: null };
    const nameMatches = (order.customer_name ?? "").trim().toLowerCase() === data.name.toLowerCase();
    const phoneMatches = data.phone === "" || data.phone === order.customer_phone;
    return nameMatches && phoneMatches
      ? { ok: true, order_id: order.id as string, customer_phone: order.customer_phone ?? "" }
      : { ok: false, order_id: null, customer_phone: null };
  });