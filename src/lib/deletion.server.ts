import { supabase } from "@/integrations/supabase/client";

// Import admin client for deletion operations (bypasses RLS)
const getAdminClient = async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    console.log("[ADMIN CLIENT] Successfully loaded admin client");
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
    // Get outlets for this organization
    const { data: outlets, error: outletsError } = await supabase
      .from("tenants")
      .select("id")
      .eq("organization_id", organizationId);

    if (outletsError) throw outletsError;

    const outletIds = (outlets || []).map((o) => o.id);

    if (outletIds.length === 0) {
      return {
        outletsCount: 0,
        totalOrders: 0,
        totalCustomers: 0,
        totalSubscriptions: 0,
      };
    }

    // Count related records
    const [
      { count: ordersCount },
      { count: customersCount },
      { count: subscriptionsCount },
    ] = await Promise.all([
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("tenant_id", outletIds),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .in("tenant_id", outletIds),
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .in("tenant_id", outletIds),
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
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", outletId),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", outletId),
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", outletId),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", outletId),
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

/** Delete an organization and all its related data */
export async function deleteOrganization(
  organizationId: string
): Promise<DeleteResult> {
  try {
    console.log(`[DELETE] Starting deletion for organization: ${organizationId}`);

    // Use admin client to check if org exists (bypass RLS for read)
    const adminClient = await getAdminClient();
    const { data: org, error: orgError } = await (adminClient as any)
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .single();

    console.log(`[DELETE] Org lookup result:`, { org, orgError });

    if (orgError || !org) {
      console.error(`[DELETE] Organization not found: ${organizationId}`, orgError);
      return {
        success: false,
        message: "Organization not found",
        error: orgError?.message || "Invalid organization ID",
      };
    }

    // Get impact summary before deletion
    const impact = await getOrganizationDeletionImpact(organizationId);

    // Log the deletion intent
    console.log(`[DELETION] Organization: ${org.name} (${organizationId})`, {
      outletsCount: impact.outletsCount,
      ordersCount: impact.totalOrders,
      customersCount: impact.totalCustomers,
      subscriptionsCount: impact.totalSubscriptions,
    });

    // Perform deletion (cascade will handle all related records)
    // Use admin client to bypass RLS policies
    const { error: deleteError } = await (adminClient as any)
      .from("organizations")
      .delete()
      .eq("id", organizationId);

    if (deleteError) {
      console.error(`[DELETION FAILED] Organization ${organizationId}:`, deleteError);
      return {
        success: false,
        message: "Failed to delete organization",
        error: deleteError.message,
      };
    }

    console.log(`[DELETION SUCCESS] Organization ${organizationId} and all related records deleted`);

    return {
      success: true,
      message: `Organization "${org.name}" and all ${impact.outletsCount} outlet(s) with ${impact.totalOrders} order(s), ${impact.totalCustomers} customer(s), and ${impact.totalSubscriptions} subscription(s) have been permanently deleted.`,
      deletedCounts: {
        orders: impact.totalOrders,
        customers: impact.totalCustomers,
        subscriptions: impact.totalSubscriptions,
        invoices: 0, // Not counted but deleted
        tables: 0,
        reviews: 0,
        staffMembers: 0,
        menuCategories: 0,
        menuItems: 0,
      },
    };
  } catch (error: any) {
    console.error("[DELETION ERROR] Organization deletion failed:", error);
    return {
      success: false,
      message: "An error occurred while deleting the organization",
      error: error?.message || "Unknown error",
    };
  }
}

/** Delete an outlet (restaurant/hotel) and all its related data */
export async function deleteOutlet(outletId: string): Promise<DeleteResult> {
  try {
    // Validation: Check if outlet exists
    const { data: outlet, error: outletError } = await supabase
      .from("tenants")
      .select("id, name, organization_id")
      .eq("id", outletId)
      .single();

    if (outletError || !outlet) {
      return {
        success: false,
        message: "Outlet not found",
        error: "Invalid outlet ID",
      };
    }

    // Get impact summary before deletion
    const impact = await getOutletDeletionImpact(outletId);

    // Log the deletion intent
    console.log(`[DELETION] Outlet: ${outlet.name} (${outletId})`, {
      ordersCount: impact.ordersCount,
      customersCount: impact.customersCount,
      subscriptionsCount: impact.subscriptionsCount,
      invoicesCount: impact.invoicesCount,
    });

    // Perform deletion (cascade will handle all related records)
    // Use admin client to bypass RLS policies
    const adminClient = await getAdminClient();
    const { error: deleteError } = await adminClient
      .from("tenants")
      .delete()
      .eq("id", outletId);

    if (deleteError) {
      console.error(`[DELETION FAILED] Outlet ${outletId}:`, deleteError);
      return {
        success: false,
        message: "Failed to delete outlet",
        error: deleteError.message,
      };
    }

    console.log(`[DELETION SUCCESS] Outlet ${outletId} and all related records deleted`);

    return {
      success: true,
      message: `Outlet "${outlet.name}" with ${impact.ordersCount} order(s), ${impact.customersCount} customer(s), ${impact.subscriptionsCount} subscription(s), and ${impact.invoicesCount} invoice(s) has been permanently deleted.`,
      deletedCounts: {
        orders: impact.ordersCount,
        customers: impact.customersCount,
        subscriptions: impact.subscriptionsCount,
        invoices: impact.invoicesCount,
        tables: 0, // Counted in cascade
        reviews: 0,
        staffMembers: 0,
        menuCategories: 0,
        menuItems: 0,
      },
    };
  } catch (error: any) {
    console.error("[DELETION ERROR] Outlet deletion failed:", error);
    return {
      success: false,
      message: "An error occurred while deleting the outlet",
      error: error?.message || "Unknown error",
    };
  }
}
