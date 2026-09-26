import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useUserContext } from "@/hooks/use-session";
import { BrandedLoader } from "@/components/branded-loader";
import { SignOutButton } from "@/components/sign-out-button";
import { Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales")({ component: SalesPortal });

// Foundation only: account creation + auth + role identification. The
// actual Sales dashboard, screens and permissions are a separate, later
// task — this page is deliberately just a placeholder landing spot so a
// Sales User has somewhere to go after signing in. No sidebar, no nav,
// nothing sales-specific yet.
function SalesPortal() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { isSuperAdmin, tenant, isKitchenUser, isSalesUser, loading } = useUserContext(user);

  // Anyone who isn't a Sales User bounces to their own portal's home — same
  // "bounce to your own home" rule AppLayout/AdminLayout/KitchenPortal
  // already use for each other.
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
    if (isKitchenUser) {
      navigate({ to: "/kitchen" });
      return;
    }
    if (!isSalesUser) navigate({ to: "/auth" });
  }, [loading, isSuperAdmin, tenant, isKitchenUser, isSalesUser, navigate]);

  if (loading || !isSalesUser) return <BrandedLoader label="Loading…" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
        <Briefcase className="h-5 w-5 text-primary" />
        <div className="text-sm font-medium">Sales</div>
        <div className="ml-auto">
          <SignOutButton redirectTo="/sales/login" />
        </div>
      </header>
      <main className="grid min-h-[calc(100vh-3.5rem)] place-items-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Briefcase className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Welcome to the Sales portal</h1>
          <p className="mt-2 text-muted-foreground">
            Your account is set up and signed in. Sales tools and screens are coming soon.
          </p>
        </div>
      </main>
    </div>
  );
}
