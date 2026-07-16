import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PhoneSchema = z.object({ phone: z.string().trim().min(3).max(30) });
const OrderDetailSchema = z.object({
  order_id: z.string().uuid(),
  phone: z.string().trim().min(3).max(30),
});
const TableSchema = z.object({ table_id: z.string().uuid() });

export const getOrdersByPhone = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => PhoneSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select(
        "id,order_number,status,payment_status,total,subtotal,tax,created_at,tenant_id,table_id,order_type,customer_name,customer_phone",
      )
      .eq("customer_phone", data.phone)
      .order("created_at", { ascending: false })
      .limit(15);
    return orders ?? [];
  });

export const getOrderDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => OrderDetailSchema.parse(d))
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
        .select("id,name,address,city,gst_number,slogan")
        .eq("id", order.tenant_id)
        .maybeSingle(),
    ]);
    return { order, items: items ?? [], tenant };
  });

export const getActiveTableOrder = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => TableSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,order_number,status,payment_status,total,created_at,table_id,customer_phone")
      .eq("table_id", data.table_id)
      .not("status", "in", "(served,cancelled)")
      .maybeSingle();
    return order ?? null;
  });