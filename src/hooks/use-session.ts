import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  applyOutletHeader, getSelectedOutletId, setSelectedOutletId,
  type BusinessType, type OutletFields,
} from "@/lib/outlet-context";

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

export type Organization = {
  id: string;
  name: string;
  business_type: BusinessType;
  owner_id: string | null;
  status: string;
};

type UserContextState = {
  isSuperAdmin: boolean;
  /** The outlet the user is currently working in. */
  tenant: Tenant | null;
  /** Every outlet this user owns (one entry for single-outlet businesses). */
  outlets: Tenant[];
  organization: Organization | null;
  /** Signed in as an Outlet Manager: runs assigned outlets, but owns none (no billing/settings). */
  isOutletManager: boolean;
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
      // Make sure every request in this session carries the remembered outlet.
      applyOutletHeader(getSelectedOutletId());
      const [{ data: roles }, { data: tenants }] = await Promise.all([
        supabase.from("user_roles").select("role,tenant_id").eq("user_id", user.id),
        supabase.from("tenants").select("*").eq("owner_id", user.id).order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      const ownedOnly = (tenants ?? []) as Tenant[];
      // Outlets an Outlet Manager was assigned to (the owner invited them). Only
      // meaningful for users who own nothing themselves.
      const managedIds = (roles ?? [])
        .filter((r) => (r.role as string) === "manager" && r.tenant_id)
        .map((r) => r.tenant_id as string);
      let managed: Tenant[] = [];
      if (ownedOnly.length === 0 && managedIds.length > 0) {
        const { data: m } = await supabase
          .from("tenants").select("*").in("id", managedIds).order("created_at", { ascending: true });
        managed = (m ?? []) as Tenant[];
      }
      if (cancelled) return;
      const isOutletManager = ownedOnly.length === 0 && managed.length > 0;
      const owned = isOutletManager ? managed : ownedOnly;
      const selectedId = getSelectedOutletId();
      // A stale/foreign remembered id falls back to the oldest outlet, matching the DB.
      // Draft (unpaid) outlets are never auto-selected, but the owner can pick one
      // on purpose to pay for it (the layout then only allows the payment pages).
      const isActive = (t: Tenant) => ((t as Tenant & Partial<OutletFields>).outlet_status ?? "ACTIVE") === "ACTIVE";
      const selected = owned.find((t) => t.id === selectedId) ?? owned.find(isActive) ?? owned[0] ?? null;
      if (selected && selectedId && selected.id !== selectedId) setSelectedOutletId(selected.id);
      let organization: Organization | null = null;
      const orgId = (selected as (Tenant & Partial<OutletFields>) | null)?.organization_id;
      if (orgId) {
        const { data: org } = await (supabase as any).from("organizations").select("*").eq("id", orgId).maybeSingle();
        organization = (org as Organization | null) ?? null;
      }
      if (cancelled) return;
      const isSuperAdmin = (roles ?? []).some((r) => r.role === "super_admin");
      const kitchenRole = (roles ?? []).find((r) => r.role === "kitchen");
      // "sales_user" predates the generated Database types (see the comment
      // in src/routes/api/sales-account.ts) — compared as a string.
      const isSalesUser = (roles ?? []).some((r) => (r.role as string) === "sales_user");
      const tenant = selected;
      setCtx({
        isSuperAdmin,
        tenant,
        outlets: owned,
        organization,
        isOutletManager,
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
    // Merged, not replaced: the cached row may carry fields the caller's copy lacks.
    // The outlet list is kept in step so the switcher shows the new name too.
    setCtx((prev) => {
      if (!prev) return prev;
      const merged = prev.tenant && prev.tenant.id === tenant.id ? { ...prev.tenant, ...tenant } : tenant;
      return {
        ...prev,
        tenant: merged,
        outlets: prev.outlets.map((o) => (o.id === merged.id ? { ...o, ...merged } : o)),
        approvalStatus: merged.status ?? null,
      };
    });
  }, []);

  return {
    loading,
    setTenant,
    ...(ctx ?? {
      isSuperAdmin: false,
      tenant: null,
      outlets: [] as Tenant[],
      organization: null as Organization | null,
      isOutletManager: false,
      approvalStatus: null,
      isKitchenUser: false,
      kitchenTenantId: null,
      isSalesUser: false,
    }),
  };
}

type TenantContextValue = {
  tenant: Tenant | null;
  setTenant: (tenant: Tenant) => void;
  outlets?: Tenant[];
  organization?: Organization | null;
  /** Signed in as an Outlet Manager: can view settings/subscription but never change them. */
  isOutletManager?: boolean;
  /** The owner's current plan (features + limits). Null until a plan is active. */
  plan?: { name?: string; features?: Record<string, boolean> | null; max_tables?: number | null; max_orders_month?: number | null; max_menu_items?: number | null; max_staff?: number | null } | null;
};
const TenantContext = createContext<TenantContextValue | null>(null);

/** Provided by the `/app` layout so nested routes can update the shared tenant. */
export const TenantContextProvider = TenantContext.Provider;

/** The current outlet plus every outlet and the organization, from the /app layout. */
export function useOutletContext() {
  const { tenant, outlets, organization, isOutletManager } = useTenantContext();
  return {
    tenant, outlets: outlets ?? (tenant ? [tenant] : []), organization: organization ?? null,
    isOutletManager: !!isOutletManager,
  };
}

/** Read/update the tenant owned by `AppLayout`, from any route nested under it. */
export function useTenantContext() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenantContext must be used within the /app layout");
  return ctx;
}