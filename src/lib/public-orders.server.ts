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
    .eq("outlet_status" as any, "ACTIVE") // unpaid / suspended outlets take no orders
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
    // A revoked / regenerated QR must stop taking orders even if the page was
    // already open.
    const { data: qrLive } = await (supabaseAdmin as any).rpc("table_qr_is_active", { p_table_id: table.id });
    if (qrLive === false) throw new Error("This QR code is no longer active");
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

  const configuredTax = Number(settings["tax_rate"] ?? 0);
  const taxRate = Number.isFinite(configuredTax) ? Math.max(0, Math.min(configuredTax, 100)) : 0;
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
type AppendOrderInput = {
  order_id: string;
  customer_phone: string;
  items: { menu_item_id: string; quantity: number }[];
};

/**
 * A second round on a table that is still eating.
 *
 * The guest gets one bill, not one bill per round, so this appends rows to the
 * order that is already open rather than inserting a new one — the same thing
 * the staff "Add items" dialog does, reached from the guest's own phone.
 *
 * The phone number is the only thing proving this is the party who ordered, so
 * it's matched in the query itself: an order_id alone can't reach a row. Prices
 * are re-read from the menu here too — the client sends ids and quantities and
 * nothing else that could move money.
 */
export async function appendPublicOrderItems(input: AppendOrderInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,order_number,tenant_id,status,payment_status,delivery_fee,customer_phone")
    .eq("id", input.order_id)
    .eq("customer_phone", input.customer_phone.trim())
    .maybeSingle();
  if (!order) throw new Error("We couldn't find that order");

  // Anything past unpaid has an invoice out against it; adding to it would
  // leave that invoice understating what was actually served.
  if (order.payment_status !== "unpaid") {
    throw new Error("This order is already settled — please start a new one");
  }
  if (order.status === "cancelled") throw new Error("This order was cancelled — please start a new one");

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id,settings,status")
    .eq("id", order.tenant_id)
    .eq("status", "approved")
    .eq("outlet_status" as any, "ACTIVE")
    .maybeSingle();
  if (!tenant) throw new Error("This restaurant is not accepting orders");

  const requestedIds = [...new Set(input.items.map((item) => item.menu_item_id))];
  const { data: menuItems, error: menuError } = await supabaseAdmin
    .from("menu_items")
    .select("id,name,price")
    .eq("tenant_id", order.tenant_id)
    .eq("is_available", true)
    .in("id", requestedIds);
  if (menuError) throw new Error(menuError.message);
  if (!menuItems || menuItems.length !== requestedIds.length) {
    throw new Error("One or more menu items are no longer available");
  }

  const byId = new Map(menuItems.map((item) => [item.id, item]));
  const markNewRound = order.status === "preparing" || order.status === "ready" || order.status === "served";
  const clearOldMarkers = order.status === "ready" || order.status === "served";
  if (clearOldMarkers) {
    await supabaseAdmin
      .from("order_items")
      .update({ notes: null })
      .eq("order_id", order.id)
      .eq("notes", "__nr__");
  }
  const { data: inserted, error: itemError } = await supabaseAdmin
    .from("order_items")
    .insert(input.items.map((item) => {
      const menuItem = byId.get(item.menu_item_id)!;
      return {
        order_id: order.id,
        tenant_id: order.tenant_id,
        menu_item_id: item.menu_item_id,
        name: menuItem.name,
        price: Number(menuItem.price),
        quantity: item.quantity,
        ...(markNewRound ? { notes: "__nr__" } : {}),
      };
    }))
    .select("id");
  if (itemError) throw new Error(itemError.message);

  // Totals are recomputed from every row on the order, not from the round just
  // added — that way this stays correct even if staff added items too.
  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("order_items")
    .select("price,quantity")
    .eq("order_id", order.id);
  if (rowsError || !rows) {
    // The rows went in but the bill can't be brought up to date, which would
    // hand the guest food that nobody is charged for. Undo the round instead.
    await supabaseAdmin.from("order_items").delete().in("id", (inserted ?? []).map(r => r.id));
    throw new Error(rowsError?.message ?? "Failed to update the order total");
  }

  const subtotal = rows.reduce((sum, r) => sum + Number(r.price) * Number(r.quantity), 0);
  const settings = tenant.settings && typeof tenant.settings === "object" && !Array.isArray(tenant.settings)
    ? tenant.settings as Record<string, unknown>
    : {};
  const configuredTax = Number(settings["tax_rate"] ?? 0);
  const taxRate = Number.isFinite(configuredTax) ? Math.max(0, Math.min(configuredTax, 100)) : 0;
  const tax = Math.round(subtotal * taxRate) / 100;
  const deliveryFee = Number((order as any).delivery_fee ?? 0) || 0;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("orders")
    .update({
      subtotal,
      tax,
      total: subtotal + tax + deliveryFee,
      // The kitchen had already finished this order; a new round puts it back
      // in the queue, otherwise the round is never cooked.  served_at is kept
      // (not cleared) so the live board and kitchen display can compare each
      // item's created_at against it: items added after the last serve are the
      // new round, items before it were already served.  If we cleared it,
      // every item from every earlier round would look "new" again.
      ...(order.status === "ready" || order.status === "served"
        ? { status: "preparing" as const }
        : {}),
    })
    .eq("id", order.id)
    .select(
      "id,order_number,status,payment_status,total,created_at,table_id,customer_phone,order_type",
    )
    .single();
  if (updateError || !updated) {
    await supabaseAdmin.from("order_items").delete().in("id", (inserted ?? []).map(r => r.id));
    throw new Error(updateError?.message ?? "Failed to update the order total");
  }
  return updated;
}
