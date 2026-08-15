import { useEffect, useState } from "react";
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

type UserContextState = { isSuperAdmin: boolean; tenant: Tenant | null; approvalStatus: string | null };

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
      const tenant = tenants?.[0] ?? null;
      setCtx({ isSuperAdmin, tenant, approvalStatus: tenant?.status ?? null });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);
  return { loading, ...(ctx ?? { isSuperAdmin: false, tenant: null, approvalStatus: null }) };
}