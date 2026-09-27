import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext } from "@/hooks/use-session";
import { BrandedLoader } from "@/components/branded-loader";
import { KitchenDisplay } from "@/components/kitchen-display";
import { SignOutButton } from "@/components/sign-out-button";
import { ChefHat } from "lucide-react";

export const Route = createFileRoute("/_authenticated/kitchen")({ component: KitchenPortal });

// Deliberately its own minimal layout — no sidebar, no SECTIONS nav from
// AppLayout — a Kitchen User has exactly one page to see. Anyone else who
// lands here (owner, super admin, or a plain authenticated user with no
// kitchen role) is bounced back to their own portal's home, the same way
// AppLayout/AdminLayout already bounce the wrong role away from each other.
function KitchenPortal() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { isSuperAdmin, tenant, isKitchenUser, kitchenTenantId, loading } = useUserContext(user);
  const [hotelName, setHotelName] = useState<string | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (isSuperAdmin) {
      navigate({ to: "/admin" });
      return;
    }
    if (tenant) {
      navigate({ to: "/app" });
      return;
    }
    if (!isKitchenUser) {
      navigate({ to: "/auth" });
      return;
    }
  }, [loading, isSuperAdmin, tenant, isKitchenUser, navigate]);

  // The owner can disable this account at any time; if that happened while
  // this device still had a live session, close it out here rather than
  // letting a disabled account keep watching orders.
  useEffect(() => {
    if (!isKitchenUser || !kitchenTenantId) return;
    let cancelled = false;
    (async () => {
      const [{ data: t }, { data: acct }] = await Promise.all([
        supabase.from("tenants").select("name").eq("id", kitchenTenantId).maybeSingle(),
        // kitchen_accounts predates the generated Database types — see the
        // comment in src/routes/api/kitchen-account.ts for why it's queried
        // untyped here rather than through the generated `supabase` client.
        (supabase as unknown as SupabaseClient)
          .from("kitchen_accounts")
          .select("is_active")
          .eq("tenant_id", kitchenTenantId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setHotelName(t?.name ?? null);
      if (acct && acct.is_active === false) {
        await supabase.auth.signOut();
        navigate({ to: "/kitchen/login" });
        return;
      }
      setCheckingAccount(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isKitchenUser, kitchenTenantId, navigate]);

  if (loading || !isKitchenUser || checkingAccount)
    return <BrandedLoader label="Loading kitchen display…" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
        <ChefHat className="h-5 w-5 text-primary" />
        <div className="text-sm font-medium truncate">{hotelName ?? "Kitchen"}</div>
        <div className="ml-auto">
          <SignOutButton redirectTo="/kitchen/login" />
        </div>
      </header>
      <main className="p-3 md:p-6">
        <KitchenDisplay />
      </main>
    </div>
  );
}
