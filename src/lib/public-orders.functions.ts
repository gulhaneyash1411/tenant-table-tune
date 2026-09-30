import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const placeOrderSchema = z.object({
  tenant_id: z.string().uuid(),
  table_id: z.string().uuid().optional().nullable(),
  order_type: z.enum(["dine_in", "takeaway", "home_delivery"]),
  customer_name: z.string().trim().min(1).max(120),
  customer_phone: z.string().trim().min(4).max(30),
  notes: z.string().trim().max(1000).optional().nullable(),
  delivery_address: z.string().trim().max(500).optional().nullable(),
  delivery_landmark: z.string().trim().max(200).optional().nullable(),
  delivery_pincode: z.string().trim().max(10).optional().nullable(),
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
  customer_phone: z.string().trim().min(4).max(30),
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
  .inputValidator((d: unknown) => z.object({ phone: z.string().trim().min(3).max(30) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Guest lookup has no account/OTP behind it, so a phone number alone proves
    // nothing. Scoping to a short recent window limits this to "check on the
    // order I just placed" instead of exposing someone's full order history.
    const recentCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select(
        "id,order_number,status,payment_status,total,subtotal,tax,delivery_fee,delivery_address,delivery_landmark,delivery_pincode,created_at,tenant_id,table_id,order_type,customer_name,customer_phone",
      )
      .eq("customer_phone", data.phone)
      .gte("created_at", recentCutoff)
      .order("created_at", { ascending: false })
      .limit(15);
    const rows = orders ?? [];
    const tableIds = [...new Set(rows.map((o: any) => o.table_id).filter(Boolean))];
    let tableMap: Record<string, string> = {};
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
    }));
  });

export const getOrderDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    order_id: z.string().uuid(),
    phone: z.string().trim().min(3).max(30),
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