type PublicOrderInput = {
  tenant_id: string;
  table_id?: string | null;
  order_type: "dine_in" | "takeaway" | "home_delivery";
  customer_name: string;
  customer_phone: string;
  notes?: string | null;
  delivery_address?: string | null;
  delivery_landmark?: string | null;
  delivery_pincode?: string | null;
  items: { menu_item_id: string; quantity: number }[];
};

export async function createPublicOrder(input: PublicOrderInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id,settings,status")
    .eq("id", input.tenant_id)
    .eq("status", "approved")
    .maybeSingle();
  if (!tenant) throw new Error("This restaurant is not accepting orders");

  const settings = tenant.settings && typeof tenant.settings === "object" && !Array.isArray(tenant.settings)
    ? tenant.settings as Record<string, unknown>
    : {};

  if (input.order_type === "dine_in") {
    if (!input.table_id) throw new Error("A table is required for dine-in orders");
    const { data: table } = await supabaseAdmin
      .from("restaurant_tables")
      .select("id")
      .eq("id", input.table_id)
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!table) throw new Error("This table is not available");
  }

  // Delivery config is read from the tenant, never from the request — the
  // client can propose an address, not a price.
  const deliveryEnabled = settings["delivery_enabled"] !== false;
  const configuredFee = Number(settings["delivery_fee"] ?? 0);
  const deliveryFee = input.order_type === "home_delivery" && Number.isFinite(configuredFee)
    ? Math.max(0, Math.round(configuredFee * 100) / 100)
    : 0;
  const minOrder = Number(settings["delivery_min_order"] ?? 0);
  const servicePincodes = Array.isArray(settings["delivery_pincodes"])
    ? (settings["delivery_pincodes"] as unknown[]).map(p => String(p).trim()).filter(Boolean)
    : [];

  const address = input.delivery_address?.trim() ?? "";
  const pincode = input.delivery_pincode?.trim() ?? "";

  if (input.order_type === "home_delivery") {
    if (!deliveryEnabled) throw new Error("This restaurant is not taking home delivery orders right now");
    if (!address) throw new Error("A delivery address is required");
    if (!/^\d{6}$/.test(pincode)) throw new Error("Enter a valid 6-digit pincode");
    if (servicePincodes.length && !servicePincodes.includes(pincode)) {
      throw new Error("Sorry, we don't deliver to this pincode yet");
    }
  }

  const requestedIds = [...new Set(input.items.map((item) => item.menu_item_id))];
  const { data: menuItems, error: menuError } = await supabaseAdmin
    .from("menu_items")
    .select("id,name,price")
    .eq("tenant_id", tenant.id)
    .eq("is_available", true)
    .in("id", requestedIds);
  if (menuError) throw new Error(menuError.message);
  if (!menuItems || menuItems.length !== requestedIds.length) {
    throw new Error("One or more menu items are no longer available");
  }

  const byId = new Map(menuItems.map((item) => [item.id, item]));
  const orderItems = input.items.map((item) => {
    const menuItem = byId.get(item.menu_item_id);
    if (!menuItem) throw new Error("A menu item is no longer available");
    return { ...item, name: menuItem.name, price: Number(menuItem.price) };
  });
  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (input.order_type === "home_delivery" && Number.isFinite(minOrder) && subtotal < minOrder) {
    throw new Error(`Minimum order for delivery is ${minOrder}`);
  }

  const configuredTax = Number(settings["tax_rate"] ?? 5);
  const taxRate = Number.isFinite(configuredTax) ? Math.max(0, Math.min(configuredTax, 100)) : 5;
  const tax = Math.round(subtotal * taxRate) / 100;

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .insert({
      tenant_id: tenant.id,
      table_id: input.order_type === "dine_in" ? input.table_id : null,
      customer_name: input.customer_name.trim(),
      customer_phone: input.customer_phone.trim(),
      order_type: input.order_type,
      status: "new",
      payment_status: "unpaid",
      subtotal,
      tax,
      delivery_fee: deliveryFee,
      total: subtotal + tax + deliveryFee,
      delivery_address: input.order_type === "home_delivery" ? address : null,
      delivery_landmark: input.order_type === "home_delivery" ? (input.delivery_landmark?.trim() || null) : null,
      delivery_pincode: input.order_type === "home_delivery" ? pincode : null,
      notes: input.notes?.trim() || null,
    })
    .select(
      "id,order_number,status,payment_status,total,created_at,table_id,customer_phone,order_type,delivery_fee,delivery_address,delivery_landmark,delivery_pincode",
    )
    .single();
  if (orderError || !order) throw new Error(orderError?.message ?? "Failed to place order");

  const { error: itemError } = await supabaseAdmin.from("order_items").insert(
    orderItems.map((item) => ({
      order_id: order.id,
      tenant_id: tenant.id,
      menu_item_id: item.menu_item_id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  );
  if (itemError) {
    await supabaseAdmin.from("orders").delete().eq("id", order.id);
    throw new Error(itemError.message);
  }
  return order;
}