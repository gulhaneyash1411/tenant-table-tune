import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

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

export function useUserContext() {
  const { user, loading } = useSession();
  const [ctx, setCtx] = useState<{ isSuperAdmin: boolean; tenant: any | null; approvalStatus: string | null } | null>(null);
  useEffect(() => {
    if (!user) { setCtx(null); return; }
    (async () => {
      const [{ data: roles }, { data: tenants }] = await Promise.all([
        supabase.from("user_roles").select("role,tenant_id").eq("user_id", user.id),
        supabase.from("tenants").select("*").eq("owner_id", user.id).limit(1),
      ]);
      const isSuperAdmin = (roles || []).some((r: any) => r.role === "super_admin");
      const tenant = tenants?.[0] ?? null;
      setCtx({ isSuperAdmin, tenant, approvalStatus: tenant?.status ?? null });
    })();
  }, [user?.id]);
  return { user, loading, ...(ctx ?? { isSuperAdmin: false, tenant: null, approvalStatus: null }) };
}