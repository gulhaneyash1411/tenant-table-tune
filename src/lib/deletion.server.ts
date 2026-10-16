import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const getAdminClient = async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch (error) {
    console.error("[ADMIN CLIENT] Failed to load admin client:", error);
    throw new Error("Failed to initialize admin client");
  }
};

type DeleteResult = {
  success: boolean;
  message: string;
  deletedCounts?: {
    orders: number;
    customers: number;
    subscriptions: number;
    invoices: number;
    tables: number;
    reviews: number;
    staffMembers: number;
    menuCategories: number;
    menuItems: number;
  };
  error?: string;
};

/** Get deletion impact summary before deletion */
export async function getOrganizationDeletionImpact(
  organizationId: string
): Promise<{
  outletsCount: number;
  totalOrders: number;
  totalCustomers: number;
  totalSubscriptions: number;
}> {
  try {
    const { data: outlets, error: outletsError } = await (supabase as any)
      .from("tenants")
      .select("id")
      .eq("organization_id", organizationId);

    if (outletsError) throw outletsError;

    const outletIds = ((outlets ?? []) as { id: string }[]).map((o) => o.id);

    if (outletIds.length === 0) {
      return { outletsCount: 0, totalOrders: 0, totalCustomers: 0, totalSubscriptions: 0 };
    }

    const [
      { count: ordersCount },
      { count: customersCount },
      { count: subscriptionsCount },
    ] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).in("tenant_id", outletIds),
      supabase.from("customers").select("id", { count: "exact", head: true }).in("tenant_id", outletIds),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).in("tenant_id", outletIds),
    ]);

    return {
      outletsCount: outletIds.length,
      totalOrders: ordersCount ?? 0,
      totalCustomers: customersCount ?? 0,
      totalSubscriptions: subscriptionsCount ?? 0,
    };
  } catch (error) {
    console.error("Error getting deletion impact:", error);
    throw error;
  }
}

/** Get deletion impact summary for a single outlet */
export async function getOutletDeletionImpact(outletId: string): Promise<{
  ordersCount: number;
  customersCount: number;
  subscriptionsCount: number;
  invoicesCount: number;
}> {
  try {
    const [
      { count: ordersCount },
      { count: customersCount },
      { count: subscriptionsCount },
      { count: invoicesCount },
    ] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", outletId),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", outletId),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", outletId),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", outletId),
    ]);

    return {
      ordersCount: ordersCount ?? 0,
      customersCount: customersCount ?? 0,
      subscriptionsCount: subscriptionsCount ?? 0,
      invoicesCount: invoicesCount ?? 0,
    };
  } catch (error) {
    console.error("Error getting outlet deletion impact:", error);
    throw error;
  }
}

async function collectTenantAuthIds(adminClient: SupabaseClient, tenantId: string) {
  const [{ data: kitchen }, { data: sales }] = await Promise.all([
    (adminClient as SupabaseClient).from("kitchen_accounts").select("user_id").eq("tenant_id", tenantId),
    (adminClient as SupabaseClient).from("sales_accounts").select("user_id").eq("tenant_id", tenantId),
  ]);
  return [
    ...((kitchen ?? []) as { user_id: string }[]).map((a) => a.user_id),
    ...((sales ?? []) as { user_id: string }[]).map((a) => a.user_id),
  ].filter(Boolean);
}

async function deleteAuthUsers(adminClient: any, userIds: string[]) {
  for (const uid of userIds) {
    await adminClient.auth.admin.deleteUser(uid).catch(() => {});
  }
}

/** Delete an organization and all its related data, including auth accounts */
export async function deleteOrganization(organizationId: string): Promise<DeleteResult> {
  try {
    const adminClient = await getAdminClient();
    const { data: org, error: orgError } = await (adminClient as SupabaseClient)
      .from("organizations")
      .select("id, name, owner_id")
      .eq("id", organizationId)
      .single();

    if (orgError || !org) {
      return { success: false, message: "Organization not found", error: orgError?.message || "Invalid organization ID" };
    }

    const impact = await getOrganizationDeletionImpact(organizationId);

    // Collect auth account ids from every outlet before cascade removes them
    const { data: outlets } = await (adminClient as SupabaseClient)
      .from("tenants")
      .select("id")
      .eq("organization_id", organizationId);
    const outletIds = ((outlets ?? []) as { id: string }[]).map((o) => o.id);

    const scopedAuthIds: string[] = [];
    for (const oid of outletIds) {
      scopedAuthIds.push(...(await collectTenantAuthIds(adminClient as SupabaseClient, oid)));
    }

    // Delete the organization (cascades to all tenants and their children)
    const { error: deleteError } = await (adminClient as SupabaseClient)
      .from("organizations")
      .delete()
      .eq("id", organizationId);

    if (deleteError) {
      console.error(`[DELETION FAILED] Organization ${organizationId}:`, deleteError);
      return { success: false, message: "Failed to delete organization", error: deleteError.message };
    }

    // Clean up scoped auth accounts (kitchen/sales)
    await deleteAuthUsers(adminClient, scopedAuthIds);

    // Delete the owner's auth account so they can re-register
    const ownerId = (org as any).owner_id as string | null;
    if (ownerId) {
      await adminClient.auth.admin.deleteUser(ownerId).catch(() => {});
    }

    return {
      success: true,
      message: `Organization "${(org as any).name}" and all ${impact.outletsCount} outlet(s) with ${impact.totalOrders} order(s), ${impact.totalCustomers} customer(s), and ${impact.totalSubscriptions} subscription(s) have been permanently deleted.`,
      deletedCounts: {
        orders: impact.totalOrders,
        customers: impact.totalCustomers,
        subscriptions: impact.totalSubscriptions,
        invoices: 0,
        tables: 0,
        reviews: 0,
        staffMembers: 0,
        menuCategories: 0,
        menuItems: 0,
      },
    };
  } catch (error: any) {
    console.error("[DELETION ERROR] Organization deletion failed:", error);
    return { success: false, message: "An error occurred while deleting the organization", error: error?.message || "Unknown error" };
  }
}

/** Delete an outlet (restaurant/hotel) and all its related data, including auth accounts */
export async function deleteOutlet(outletId: string): Promise<DeleteResult> {
  try {
    const adminClient = await getAdminClient();

    const { data: outlet, error: outletError } = await (adminClient as SupabaseClient)
      .from("tenants")
      .select("id, name, organization_id, owner_id")
      .eq("id", outletId)
      .single();

    if (outletError || !outlet) {
      return { success: false, message: "Outlet not found", error: "Invalid outlet ID" };
    }

    const impact = await getOutletDeletionImpact(outletId);
    const scopedAuthIds = await collectTenantAuthIds(adminClient as SupabaseClient, outletId);

    const ownerId = (outlet as any).owner_id as string | null;
    const orgId = (outlet as any).organization_id as string | null;

    // Check if owner has other outlets
    let ownerHasOtherTenants = false;
    if (ownerId) {
      const { data: others } = await (adminClient as SupabaseClient)
        .from("tenants")
        .select("id")
        .eq("owner_id", ownerId)
        .neq("id", outletId)
        .limit(1);
      ownerHasOtherTenants = (others ?? []).length > 0;
    }

    // Delete the outlet (cascade handles child rows)
    const { error: deleteError } = await (adminClient as SupabaseClient)
      .from("tenants")
      .delete()
      .eq("id", outletId);

    if (deleteError) {
      console.error(`[DELETION FAILED] Outlet ${outletId}:`, deleteError);
      return { success: false, message: "Failed to delete outlet", error: deleteError.message };
    }

    await deleteAuthUsers(adminClient, scopedAuthIds);

    // If this was the owner's last outlet, clean up organization and owner auth
    if (!ownerHasOtherTenants) {
      if (orgId) {
        const { data: remaining } = await (adminClient as SupabaseClient)
          .from("tenants")
          .select("id")
          .eq("organization_id", orgId)
          .limit(1);
        if (!remaining || remaining.length === 0) {
          await (adminClient as SupabaseClient).from("organizations").delete().eq("id", orgId);
        }
      }
      if (ownerId) {
        await adminClient.auth.admin.deleteUser(ownerId).catch(() => {});
      }
    }

    return {
      success: true,
      message: `Outlet "${(outlet as any).name}" with ${impact.ordersCount} order(s), ${impact.customersCount} customer(s), ${impact.subscriptionsCount} subscription(s), and ${impact.invoicesCount} invoice(s) has been permanently deleted.`,
      deletedCounts: {
        orders: impact.ordersCount,
        customers: impact.customersCount,
        subscriptions: impact.subscriptionsCount,
        invoices: impact.invoicesCount,
        tables: 0,
        reviews: 0,
        staffMembers: 0,
        menuCategories: 0,
        menuItems: 0,
      },
    };
  } catch (error: any) {
    console.error("[DELETION ERROR] Outlet deletion failed:", error);
    return { success: false, message: "An error occurred while deleting the outlet", error: error?.message || "Unknown error" };
  }
}
