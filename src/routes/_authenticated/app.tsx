import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext, type Tenant } from "@/hooks/use-session";
import { BrandedLoader } from "@/components/branded-loader";
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "@/components/ui/sidebar";
import { LayoutDashboard, ListOrdered, Utensils, QrCode, Users, Star, UsersRound, LineChart, Settings, CreditCard, Cpu, Rocket, TrendingUp, History, Wallet, AlertTriangle, MessageCircle } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/app")({ component: AppLayout });

const MAIN = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/orders", label: "Live orders", icon: ListOrdered },
  { to: "/app/history", label: "Order history", icon: History },
  { to: "/app/kds", label: "Kitchen Display", icon: Cpu },
  { to: "/app/menu", label: "Menu", icon: Utensils },
  { to: "/app/tables", label: "Tables & QR", icon: QrCode },
  { to: "/app/expenses", label: "Expenses", icon: Wallet },
  { to: "/app/customers", label: "Customers", icon: Users },
  { to: "/app/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/app/reviews", label: "Reviews", icon: Star },
  { to: "/app/staff", label: "Staff", icon: UsersRound },
  { to: "/app/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/app/analytics", label: "Analytics", icon: LineChart },
];
const BILLING = [
  { to: "/app/subscription", label: "Subscription", icon: CreditCard },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

function AppLayout() {
  // `user` comes from the `_authenticated` layout's beforeLoad guard, so it's
  // already known to be signed in — no need to re-verify with getUser() here.
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { isSuperAdmin, tenant, loading } = useUserContext(user);
  const [sub, setSub] = useState<any>(null);

  // Super admins operate from /admin, not the tenant portal.
  useEffect(() => {
    if (!loading && isSuperAdmin) navigate({ to: "/admin" });
  }, [loading, isSuperAdmin, navigate]);

  useEffect(() => {
    if (!tenant) { setSub(null); return; }
    let cancelled = false;
    (async () => {
      const { data: s } = await supabase.from("subscriptions").select("*, plan:subscription_plans(name)").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!cancelled) setSub(s);
    })();
    return () => { cancelled = true; };
  }, [tenant?.id]);

  const status = loading || isSuperAdmin ? "loading" : (tenant?.status ?? "none");

  if (status === "loading") return <BrandedLoader label="Loading your dashboard…" />;
  if (status === "none") return <NoTenant />;
  if (status !== "approved") return <AwaitingApproval status={status} tenant={tenant} />;

  const missing: string[] = [];
  if (!tenant?.address) missing.push("address");
  if (!tenant?.city) missing.push("city");
  if (!tenant?.owner_phone) missing.push("owner phone");
  if (!tenant?.opening_time || !tenant?.closing_time) missing.push("opening hours");
  const profileIncomplete = missing.length > 0;
  const onSettings = pathname === "/app/settings";
  const locked = profileIncomplete && !onSettings;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <div className="px-4 py-4 border-b flex items-center gap-2 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:justify-center">
              {tenant?.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} className="h-8 w-8 rounded object-cover shrink-0" />
              ) : (
                <div className="h-8 w-8 rounded bg-primary/10 text-primary grid place-items-center text-sm font-semibold shrink-0">
                  {(tenant?.name || "R").slice(0,1)}
                </div>
              )}
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <div className="font-semibold truncate text-sm">{tenant?.name}</div>
                <div className="text-xs text-muted-foreground truncate">{tenant?.city}</div>
              </div>
            </div>
            <NavGroup label="Operations" items={MAIN} />
            <NavGroup label="Billing" items={BILLING} />
          </SidebarContent>
        </Sidebar>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-3 md:px-4 gap-2 bg-background sticky top-0 z-20">
            <div className="flex items-center gap-2 min-w-0">
              <SidebarTrigger />
              <span className="md:hidden font-semibold text-sm truncate">{tenant?.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/app/subscription" className="hidden md:flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border hover:bg-accent/40">
                <CreditCard className="h-3 w-3 text-primary"/>
                <span className="font-medium">{sub?.plan?.name || "Free trial"}</span>
                {sub?.current_period_end && <span className="text-muted-foreground">· renews {format(new Date(sub.current_period_end), "MMM d")}</span>}
              </Link>
              <NotificationBell />
              <SignOutButton />
            </div>
          </header>
          <main className="flex-1 p-3 md:p-6 overflow-auto pb-20 md:pb-6">
            {profileIncomplete && (
              <div className="mb-4 p-3 rounded-lg border border-warning/50 bg-warning/5 flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning"/><span>Complete your restaurant profile to unlock all features. Missing: <b>{missing.join(", ")}</b>.</span></div>
                <Link to="/app/settings"><Button size="sm">Complete profile</Button></Link>
              </div>
            )}
            {locked ? (
              <div className="min-h-[50vh] grid place-items-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto h-14 w-14 rounded-full bg-warning/10 text-warning grid place-items-center mb-4"><AlertTriangle className="h-6 w-6" /></div>
                  <h1 className="text-xl font-semibold">Please fill your restaurant profile first</h1>
                  <p className="text-muted-foreground mt-2">
                    This page is locked until your restaurant profile is complete. Missing: <b>{missing.join(", ")}</b>.
                  </p>
                  <Link to="/app/settings"><Button className="mt-6">Go to Settings</Button></Link>
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </main>
          {!locked && <MobileNav />}
        </div>
      </div>
    </SidebarProvider>
  );
}

const MOBILE_TABS = [
  { to: "/app", label: "Home", icon: LayoutDashboard, exact: true },
  { to: "/app/orders", label: "Orders", icon: ListOrdered },
  { to: "/app/kds", label: "Kitchen", icon: Cpu },
  { to: "/app/menu", label: "Menu", icon: Utensils },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

function MobileNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {MOBILE_TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${active ? "text-primary font-medium" : "text-muted-foreground"}`}
            >
              <t.icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function NavGroup({ label, items }: { label: string; items: any[] }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((it) => {
            const active = it.exact ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/");
            return (
              <SidebarMenuItem key={it.to}>
                <SidebarMenuButton asChild isActive={active}>
                  <Link to={it.to} className="flex items-center gap-2"><it.icon className="h-4 w-4" /><span>{it.label}</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AwaitingApproval({ status, tenant }: { status: string; tenant: Tenant | null }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-background">
      <div className="max-w-md text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 text-primary grid place-items-center mb-4"><Rocket className="h-6 w-6" /></div>
        <h1 className="text-2xl font-semibold">Awaiting super-admin approval</h1>
        <p className="text-muted-foreground mt-2">
          Your restaurant <b>{tenant?.name}</b> is currently <b>{status}</b>. You'll be able to explore your dashboard once a platform administrator verifies your account.
        </p>
        <p className="text-sm text-muted-foreground mt-4">This usually takes less than one business day.</p>
        <Button className="mt-6" variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>Sign out</Button>
      </div>
    </div>
  );
}

function NoTenant() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-background">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">No restaurant on this account</h1>
        <p className="text-muted-foreground mt-2">Register a restaurant to get started. The super admin will verify it before you can operate.</p>
        <Button className="mt-6" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>Sign out & register</Button>
      </div>
    </div>
  );
}