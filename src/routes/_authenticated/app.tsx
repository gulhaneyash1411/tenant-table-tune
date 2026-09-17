import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext, TenantContextProvider, type Tenant } from "@/hooks/use-session";
import { BrandedLoader } from "@/components/branded-loader";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, ListOrdered, Utensils, QrCode, Users, Star, UsersRound,
  LineChart, Settings, CreditCard, Cpu, Rocket, TrendingUp, History, Wallet,
  AlertTriangle, MessageCircle, ShoppingCart,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/app")({ component: AppLayout });

// Fifteen destinations in one list is unscannable. The groups follow how a
// restaurant actually runs: service first, then the menu, then everything
// that can wait until the shift is over.
const SECTIONS = [
  {
    label: "Service",
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/app/orders", label: "Live orders", icon: ListOrdered },
      { to: "/app/kds", label: "Kitchen Display", icon: Cpu },
      { to: "/app/history", label: "Order history", icon: History },
    ],
  },
  {
    label: "Menu & tables",
    items: [
      { to: "/app/menu", label: "Menu", icon: Utensils },
      { to: "/app/tables", label: "Tables & QR", icon: QrCode },
    ],
  },
  {
    label: "Customers",
    items: [
      { to: "/app/customers", label: "Customers", icon: Users },
      { to: "/app/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { to: "/app/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/app/revenue", label: "Revenue", icon: TrendingUp },
      { to: "/app/expenses", label: "Expenses", icon: Wallet },
      { to: "/app/analytics", label: "Analytics", icon: LineChart },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/app/staff", label: "Staff", icon: UsersRound },
      { to: "/app/products", label: "Shop", icon: ShoppingCart },
      { to: "/app/subscription", label: "Subscription", icon: CreditCard },
      { to: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
];

const isActive = (
  pathname: string,
  it: { to: string; exact?: boolean },
) => (it.exact ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/"));

// The blue marker is the one loud thing in here; everything else stays quiet.
const navCls = [
  "relative h-9 gap-3 text-sidebar-foreground",
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
  "data-[active=true]:before:absolute data-[active=true]:before:left-0",
  "data-[active=true]:before:top-1.5 data-[active=true]:before:bottom-1.5",
  "data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-r-full",
  "data-[active=true]:before:bg-sidebar-primary",
  "data-[active=true]:[&>svg]:text-sidebar-primary",
].join(" ");

function AppLayout() {
  // `user` comes from the `_authenticated` layout's beforeLoad guard, so it's
  // already known to be signed in — no need to re-verify with getUser() here.
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { isSuperAdmin, tenant, loading, setTenant } = useUserContext(user);
  const [sub, setSub] = useState<any>(null);

  // Super admins operate from /admin, not the tenant portal.
  useEffect(() => {
    if (!loading && isSuperAdmin) navigate({ to: "/admin" });
  }, [loading, isSuperAdmin, navigate]);

  useEffect(() => {
    if (!tenant) { setSub(null); return; }
    let cancelled = false;
    (async () => {
      const { data: s } = await supabase
        .from("subscriptions")
        .select("*, plan:subscription_plans(name)")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
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

  const current = SECTIONS.flatMap((s) => s.items).find((it) => isActive(pathname, it));

  return (
    <TenantContextProvider value={{ tenant, setTenant }}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <Sidebar collapsible="icon">
            <SidebarContent className="gap-0">
              <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4
                group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
                {tenant?.logo_url ? (
                  <img src={tenant.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary
                    text-base font-semibold text-sidebar-primary-foreground">
                    {(tenant?.name || "R").slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <div className="truncate text-sm font-semibold text-sidebar-accent-foreground">{tenant?.name}</div>
                  <div className="truncate text-xs text-sidebar-foreground/70">{tenant?.city}</div>
                </div>
              </div>

              {SECTIONS.map((section) => (
                <SidebarGroup key={section.label} className="px-2 py-2">
                  <SidebarGroupLabel className="px-2 text-[11px] font-medium tracking-wide text-sidebar-foreground/70">
                    {section.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((it) => (
                        <SidebarMenuItem key={it.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive(pathname, it)}
                            tooltip={it.label}
                            className={navCls}
                          >
                            <Link to={it.to}>
                              <it.icon className="h-4 w-4" />
                              <span>{it.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
            <SidebarRail />
          </Sidebar>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur md:px-4">
              <SidebarTrigger />
              <h1 className="truncate text-sm font-medium">
                <span className="md:hidden">{tenant?.name}</span>
                <span className="hidden md:inline">{current?.label ?? "Dashboard"}</span>
              </h1>
              <div className="ml-auto flex items-center gap-2">
                <Link
                  to="/app/subscription"
                  className="hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs hover:bg-accent/40 md:flex"
                >
                  <CreditCard className="h-3 w-3 text-primary" />
                  <span className="font-medium">{sub?.plan?.name || "Free trial"}</span>
                  {sub?.current_period_end && (
                    <span className="text-muted-foreground">
                      · renews {format(new Date(sub.current_period_end), "MMM d, yyyy")}
                    </span>
                  )}
                </Link>
                <NotificationBell />
                <SignOutButton />
              </div>
            </header>

            <main className="flex-1 overflow-auto p-3 pb-20 md:p-6 md:pb-6">
              {profileIncomplete && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span>Complete your restaurant profile to unlock all features. Missing: <b>{missing.join(", ")}</b>.</span>
                  </div>
                  <Link to="/app/settings"><Button size="sm">Complete profile</Button></Link>
                </div>
              )}
              {locked ? (
                <div className="grid min-h-[50vh] place-items-center">
                  <div className="max-w-md text-center">
                    <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-warning/10 text-warning">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <h1 className="text-xl font-semibold">Please fill your restaurant profile first</h1>
                    <p className="mt-2 text-muted-foreground">
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
    </TenantContextProvider>
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {MOBILE_TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? "font-medium text-primary" : "text-muted-foreground"
              }`}
            >
              {active && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-primary" />}
              <t.icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function AwaitingApproval({ status, tenant }: { status: string; tenant: Tenant | null }) {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
          <Rocket className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold">Awaiting super-admin approval</h1>
        <p className="mt-2 text-muted-foreground">
          Your restaurant <b>{tenant?.name}</b> is currently <b>{status}</b>. You'll be able to explore your dashboard once a platform administrator verifies your account.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">This usually takes less than one business day.</p>
        <Button className="mt-6" variant="outline"
          onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

function NoTenant() {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">No restaurant on this account</h1>
        <p className="mt-2 text-muted-foreground">
          Register a restaurant to get started. The super admin will verify it before you can operate.
        </p>
        <Button className="mt-6"
          onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>
          Sign out & register
        </Button>
      </div>
    </div>
  );
}