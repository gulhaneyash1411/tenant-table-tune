import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { session, user: session?.user ?? null, loading };
}

type UserContextState = {
  isSuperAdmin: boolean;
  tenant: Tenant | null;
  approvalStatus: string | null;
  /** Signed in as a hotel's Kitchen User rather than its owner. */
  isKitchenUser: boolean;
  /** The hotel this Kitchen User is scoped to — set only when isKitchenUser is true. */
  kitchenTenantId: string | null;
  /** Signed in as platform Sales staff (created by a Super Admin), not a hotel account. */
  isSalesUser: boolean;
};

/**
 * Fetches the signed-in user's role + owned tenant in a single pass.
 * Shared by every layout that needs to know "is this a super admin, and if
 * not, what tenant do they own" — previously each layout re-implemented this
 * query independently.
 */
export function useUserContext(user: User | null) {
  const [ctx, setCtx] = useState<UserContextState | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) { setCtx(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: roles }, { data: tenants }] = await Promise.all([
        supabase.from("user_roles").select("role,tenant_id").eq("user_id", user.id),
        supabase.from("tenants").select("*").eq("owner_id", user.id).limit(1),
      ]);
      if (cancelled) return;
      const isSuperAdmin = (roles ?? []).some((r) => r.role === "super_admin");
      const kitchenRole = (roles ?? []).find((r) => r.role === "kitchen");
      // "sales_user" predates the generated Database types (see the comment
      // in src/routes/api/sales-account.ts) — compared as a string.
      const isSalesUser = (roles ?? []).some((r) => (r.role as string) === "sales_user");
      const tenant = tenants?.[0] ?? null;
      setCtx({
        isSuperAdmin,
        tenant,
        approvalStatus: tenant?.status ?? null,
        isKitchenUser: !!kitchenRole,
        kitchenTenantId: kitchenRole?.tenant_id ?? null,
        isSalesUser,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Lets a caller that just persisted tenant changes (e.g. the Settings page)
  // push the new row straight into this cached copy, so anything reading
  // `tenant` from this hook re-renders immediately — no refetch, no reload.
  const setTenant = useCallback((tenant: Tenant) => {
    setCtx((prev) => (prev ? { ...prev, tenant, approvalStatus: tenant.status ?? null } : prev));
  }, []);

  return {
    loading,
    setTenant,
    ...(ctx ?? {
      isSuperAdmin: false,
      tenant: null,
      approvalStatus: null,
      isKitchenUser: false,
      kitchenTenantId: null,
      isSalesUser: false,
    }),
  };
}

type TenantContextValue = { tenant: Tenant | null; setTenant: (tenant: Tenant) => void };
const TenantContext = createContext<TenantContextValue | null>(null);

/** Provided by the `/app` layout so nested routes can update the shared tenant. */
export const TenantContextProvider = TenantContext.Provider;

/** Read/update the tenant owned by `AppLayout`, from any route nested under it. */
export function useTenantContext() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenantContext must be used within the /app layout");
  return ctx;
}