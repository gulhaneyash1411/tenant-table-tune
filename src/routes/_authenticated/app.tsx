import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext, TenantContextProvider, type Tenant } from "@/hooks/use-session";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  CreditCard, Rocket, AlertTriangle, LockKeyhole, Eye, EyeOff, Loader2,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { OutletSwitcher } from "@/components/outlet-switcher";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/sign-out-button";
import { DashboardLoader } from "@/components/dashboard-loader";
import { format } from "date-fns";
import {
  ALL_ITEMS, MOBILE_TAB_KEYS, findItemByPath, isActivePath, sectionOfItem,
  type NavItem, type NavSection,
} from "@/config/nav-registry";
import { useNavConfig } from "@/hooks/use-nav-config";
import { planAllows } from "@/config/plan-features";
import { useTrialDays } from "@/lib/site-settings";

export const Route = createFileRoute("/_authenticated/app")({ component: AppLayout });

// Single source for the lock icon. Change it here to swap it everywhere.
const LockIcon = LockKeyhole;

// Billing-cycle names shown after the plan name in the top bar, e.g. "Growth.Monthly".
const CYCLE_LABEL: Record<string, string> = { monthly: "Monthly", half_yearly: "Half Yearly", yearly: "Yearly" };

// The nav itself now lives in src/config/nav-registry.ts, because the super
// admin console needs the same list to decide what each owner may see.
const SECURE_ROUTES = ALL_ITEMS.filter((i) => i.secure).map((i) => i.to);

// Lock again when the user switches tab/app (like banking apps)
const RELOCK_ON_TAB_HIDE = true;

const isActive = isActivePath;

// Outlet managers see only: Dashboard, Live orders, Kitchen Display, Order history,
// Menu, Tables & QR, Customers, WhatsApp, Reviews, and Subscription.
// They cannot see: Money (revenue/expenses/analytics), Business (staff/settings/subscription),
// or the Outlets management page.
const MANAGER_HIDDEN_KEYS = ["revenue", "expenses", "analytics", "staff", "settings"];
const MANAGER_BLOCKED_PATHS = ["/app/franchise"];

// Which secure page (if any) the current path belongs to
const getSecureRoute = (pathname: string) =>
  SECURE_ROUTES.find((p) => pathname === p || pathname.startsWith(p + "/")) ?? null;

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
  const { isSuperAdmin, tenant, outlets, organization, isOutletManager, loading, setTenant, isKitchenUser, isSalesUser } = useUserContext(user);
  const [sub, setSub] = useState<any>(null);
  // False until the subscription lookup has finished, so a new owner isn't shown the trial-ended screen early.
  const [subLoaded, setSubLoaded] = useState(false);
  const trialDays = useTrialDays();

  // What the super admin has switched on for this restaurant.
  const {
    sections: ownerVisibleSections,
    isVisible,
    loading: navLoading,
  } = useNavConfig(tenant?.id);

  // Outlet Managers run the outlet but never the business: billing and owner
  // settings are hidden here and also blocked by URL below (and by RLS server-side).
  // Pages the owner's plan doesn't include are dropped from the sidebar, and blocked by URL below.
  // Only a paid, current plan restricts features. Without one the owner gets the full
  // app for the trial period (from the date the tenant registered), then needs a plan.
  const plan = sub?.paid ? sub.plan : null;
  const trialEnd = tenant?.created_at ? new Date(tenant.created_at).getTime() + trialDays * 86400000 : 0;
  const trialEnded = subLoaded && !!tenant && !plan && Date.now() >= trialEnd;
  const planSections = ownerVisibleSections
    .map((s) => ({ ...s, items: s.items.filter((i) => planAllows(plan?.features, i.feature)) }))
    .filter((s) => s.items.length > 0);
  const visibleSections = isOutletManager
    ? planSections
        .map((s) => ({ ...s, items: s.items.filter((i) => !MANAGER_HIDDEN_KEYS.includes(i.key)) }))
        .filter((s) => s.items.length > 0)
    : planSections;

  // Password lock for secure pages
  // Only ONE page is unlocked at a time: the page where the password was entered.
  const secureRoute = getSecureRoute(pathname);
  const onSecurePage = secureRoute !== null;
  const [unlockedRoute, setUnlockedRoute] = useState<string | null>(null);
  const secureUnlocked = onSecurePage && unlockedRoute === secureRoute;

  // Leaving the unlocked page locks it again (including moving to another secure page).
  useEffect(() => {
    if (unlockedRoute && unlockedRoute !== secureRoute) setUnlockedRoute(null);
  }, [secureRoute, unlockedRoute]);

  useEffect(() => {
    if (!RELOCK_ON_TAB_HIDE) return;
    const onVisibility = () => { if (document.hidden) setUnlockedRoute(null); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Super admins operate from /admin, not the tenant portal.
  useEffect(() => {
    if (!loading && isSuperAdmin) navigate({ to: "/admin" });
  }, [loading, isSuperAdmin, navigate]);

  // Kitchen Users and Sales Users only ever see their own portal — neither
  // owns a tenant, so without this they'd otherwise fall through to the
  // "No restaurant on this account" screen below.
  useEffect(() => {
    if (loading || isSuperAdmin || tenant) return;
    if (isKitchenUser) { navigate({ to: "/kitchen" }); return; }
    if (isSalesUser) navigate({ to: "/sales" });
  }, [loading, isSuperAdmin, tenant, isKitchenUser, isSalesUser, navigate]);

  useEffect(() => {
    if (!tenant) { setSub(null); return; }
    setSubLoaded(false);
    let cancelled = false;
    const tenantId = tenant.id;

    async function loadSub() {
      // Query subscriptions with all non-canceled statuses
      const [{ data: subs }, { data: invoices }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("*")
          .eq("tenant_id", tenantId)
          .neq("status", "canceled")
          .order("created_at", { ascending: false }),
        supabase
          .from("invoices")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("issued_at", { ascending: false }),
      ]);

      if (cancelled) return;

      // Most recent subscription (any non-canceled status)
      // The active subscription if there is one, otherwise the newest non-canceled one.
      const activeSub = (subs || []).find((s) => s.status === "active") || (subs || [])[0];
      // Most recent paid or pending invoice
      const latestInvoice = (invoices || []).find((inv) =>
        inv.status === "paid" || inv.status === "pending_approval"
      ) || (invoices || [])[0];

      // Prefer subscription if exists; otherwise show pending invoice
      if (activeSub) {
        const { data: plan } = await supabase
          .from("subscription_plans")
          .select("name, features, max_tables, max_orders_month, max_menu_items, max_staff")
          .eq("id", activeSub.plan_id)
          .maybeSingle();
        // "paid" = the subscription is active and not past its end date.
        const paid = activeSub.status === "active" && new Date(activeSub.current_period_end) > new Date();
        // Billing cycle: saved on the subscription, else from its period length.
        const days = (new Date(activeSub.current_period_end).getTime() - new Date(activeSub.current_period_start).getTime()) / 86400000;
        const cycle = (activeSub as any).billing_cycle ??(days > 320 ? "yearly" : days > 120 ? "half_yearly" : "monthly");
        setSub({ plan: plan ?? { name: "Plan" }, paid, cycle });
      } else if (latestInvoice?.status === "pending_approval") {
        setSub({ plan: { name: `${latestInvoice.plan} (pending approval)` }, paid: false });
      } else {
        setSub(null);
      }
      setSubLoaded(true);
    }

    loadSub();

    // Subscribe to real-time changes in subscriptions and invoices
    const subsSub = supabase
      .channel(`subscriptions:${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `tenant_id=eq.${tenantId}` }, () => loadSub())
      .subscribe();

    const invSub = supabase
      .channel(`invoices:${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `tenant_id=eq.${tenantId}` }, () => loadSub())
      .subscribe();

    // Also refresh when window comes back to focus
    const handleFocus = () => loadSub();
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      supabase.removeChannel(subsSub);
      supabase.removeChannel(invSub);
    };
  }, [tenant?.id]);

  const status =
    loading || isSuperAdmin || ((isKitchenUser || isSalesUser) && !tenant)
      ? "loading"
      : (tenant?.status ?? "none");

  useEffect(() => {
    if (!loading && tenant && (tenant as any).must_reset_password) {
      navigate({ to: "/force-reset-password" });
    }
  }, [loading, tenant, navigate]);

  if (status === "loading") return <DashboardLoader />;
  if (status === "none") return <NoTenant />;
  if (status !== "approved") return <AwaitingApproval status={status} tenant={tenant} />;
  if ((tenant as any)?.must_reset_password) return null;
  // Wait for the visibility rules before painting a sidebar we may have to
  // redraw a frame later.
  if (navLoading || !subLoaded) return <DashboardLoader />;
  const missing: string[] = [];
  if (!tenant?.address) missing.push("address");
  if (!tenant?.city) missing.push("city");
  if (!tenant?.owner_phone) missing.push("owner phone");
  if (!tenant?.opening_time || !tenant?.closing_time) missing.push("business hours");
  // The profile belongs to the owner; a manager can't open Settings to fix it.
  const profileIncomplete = missing.length > 0 && !isOutletManager;
  const onSettings = pathname === "/app/settings";
  const locked = profileIncomplete && !onSettings;

  // A page the super admin switched off must not be reachable by URL either —
  // hiding the link is presentation, this is the actual gate.
  const registryItem = findItemByPath(pathname);
  const parentSection = registryItem ? sectionOfItem(registryItem.key) : null;

  // A newly added outlet is a draft until its subscription is paid: only the
  // payment page and the outlet list are reachable.
  const outletStatus = (tenant as (Tenant & { outlet_status?: string }) | null)?.outlet_status ?? "ACTIVE";
  const outletInactive = outletStatus !== "ACTIVE";
  const onPaymentPage = pathname === "/app/subscription" || pathname === "/app/franchise";
  const outletBlocked = (outletInactive || trialEnded) && !onPaymentPage;
  const blockedTitle = trialEnded && !outletInactive
    ? "Your free trial has ended"
    : outletStatus === "PENDING_PAYMENT" ? `Activate ${tenant?.name}` : `${tenant?.name} is not active`;
  const blockedText = trialEnded && !outletInactive
    ? `Your ${trialDays}-day free trial has ended. Choose a plan to keep using your restaurant.`
    : outletStatus === "PENDING_PAYMENT"
      ? "This outlet needs an active subscription before it can take orders. Choose a plan and pay to activate it."
      : "This outlet's subscription is not active. Renew it to continue receiving orders.";

  // Pages the plan doesn't include. The Outlets page stays open while an outlet is
  // awaiting payment, otherwise it could never be activated.
  const onFranchisePage = pathname === "/app/franchise" || pathname.startsWith("/app/franchise/");
  const planLocked =
    (!!registryItem && !planAllows(plan?.features, registryItem.feature)) ||
    (onFranchisePage && !outletInactive && !planAllows(plan?.features, "settings_outlets"));
  const pageDisabled =
    (isOutletManager && MANAGER_BLOCKED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) ||
    (!!registryItem &&
      (!isVisible(registryItem.key) || (parentSection ? !isVisible(parentSection.key) : false))) ||
    planLocked;

  // A manager's Settings page is read-only, so it doesn't need the owner's PIN;
  // the money pages (revenue, expenses, analytics, staff) still do.
  const managerReadOnlySettings = isOutletManager && pathname === "/app/settings";
  const passwordLocked =
    !locked && !pageDisabled && !outletBlocked && onSecurePage && !secureUnlocked && !managerReadOnlySettings;

  const visibleItems = visibleSections.flatMap((s) => s.items);
  const current = visibleItems.find((it) => isActive(pathname, it)) ?? registryItem ?? null;
  const mobileTabs = MOBILE_TAB_KEYS
    .map((k) => visibleItems.find((it) => it.key === k))
    .filter(Boolean) as NavItem[];

  return (
    <TenantContextProvider value={{ tenant, setTenant, outlets, organization, isOutletManager, plan }}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <Sidebar
            collapsible="icon"
            variant="floating"
            // Sits a little short of the full window height, centred.
            className="[&>[data-sidebar=sidebar]]:rounded-2xl [&>[data-sidebar=sidebar]]:h-[calc(100%-1rem)] [&>[data-sidebar=sidebar]]:my-auto"
          >
            {/* Outside SidebarContent so it stays put while the nav scrolls.
                h-10, not h-14: the floating panel already starts 1rem down
                (0.5rem container padding + 0.5rem auto margin), so 3.5rem-1rem
                puts this bottom border level with the main header's. */}
            <SidebarHeader className="h-10 shrink-0 flex-row items-center gap-2.5 border-b border-sidebar-border p-0 px-4
              group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
              {tenant?.logo_url ? (
                <img src={tenant.logo_url} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sidebar-primary
                  text-sm font-semibold text-sidebar-primary-foreground">
                  {(tenant?.name || "R").slice(0, 1)}
                </div>
              )}
              <div className="flex min-w-0 items-baseline gap-1.5 group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">{tenant?.name}</span>
                {tenant?.city && (
                  <span className="shrink-0 text-xs text-sidebar-foreground/70">· {tenant.city}</span>
                )}
              </div>
            </SidebarHeader>
            {outlets.length > 1 && (
              <div className="shrink-0 border-b border-sidebar-border px-3 py-2 group-data-[collapsible=icon]:hidden">
                <OutletSwitcher tenant={tenant} outlets={outlets} organization={organization} canManage={!isOutletManager} />
              </div>
            )}

            {/* Still scrolls; the scrollbar itself is hidden. */}
            {/* overflow-auto in icon mode too: the component's default turns
                scrolling off when collapsed, which strands items out of reach.
                Safe here because the scrollbar itself is hidden. */}
            <SidebarContent className="gap-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden group-data-[collapsible=icon]:overflow-auto">
              {visibleSections.map((section: NavSection) => (
                <SidebarGroup key={section.key} className="px-2 py-2">
                  <SidebarGroupLabel className="px-2 text-[11px] font-medium tracking-wide text-sidebar-foreground/70">
                    {section.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((it) => (
                        <SidebarMenuItem key={it.key}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive(pathname, it)}
                            tooltip={it.secure ? `${it.label} (password protected)` : it.label}
                            className={navCls}
                          >
                            <Link to={it.to}>
                              <it.icon className="h-4 w-4" />
                              <span>{it.label}</span>
                              {it.secure && unlockedRoute !== it.to && (
                                <LockIcon
                                  className="ml-auto h-3 w-3 opacity-60 group-data-[collapsible=icon]:hidden"
                                  aria-label="Password protected"
                                />
                              )}
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
              <div className="flex items-center gap-2 truncate">
                <h1 className="truncate text-sm font-medium">
                  <span className="md:hidden">{tenant?.name}</span>
                  <span className="hidden md:inline">{current?.label ?? "Dashboard"}</span>
                </h1>
                {isOutletManager && (
                  <Badge variant="secondary" className="shrink-0 md:ml-2">Manager</Badge>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {onSecurePage && secureUnlocked && !pageDisabled && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUnlockedRoute(null)}
                    aria-label="Lock this section"
                  >
                    <LockIcon className="mr-1 h-3.5 w-3.5" />Lock
                  </Button>
                )}
                {!isOutletManager && <Link
                  to="/app/subscription"
                  className="hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs hover:bg-accent/40 md:flex"
                >
                  <CreditCard className="h-3 w-3 text-primary" />
                  <span className="font-medium">{sub?.plan?.name ?? "Free trial"}</span>
                  {sub?.paid && sub?.cycle && (
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      {CYCLE_LABEL[sub.cycle as string] ?? sub.cycle}
                    </span>
                  )}
                  {sub?.current_period_end && (
                    <span className="text-muted-foreground">
                      · renews {format(new Date(sub.current_period_end), "MMM d, yyyy")}
                    </span>
                  )}
                </Link>}
                <NotificationBell />
                <SignOutButton />
              </div>
            </header>

            <main className="flex-1 overflow-auto p-3 pb-20 md:p-6 md:pb-6">
              {profileIncomplete && !pageDisabled && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span>Complete your restaurant profile to unlock all features. Missing: <b>{missing.join(", ")}</b>.</span>
                  </div>
                  <Link to="/app/settings"><Button size="sm">Complete profile</Button></Link>
                </div>
              )}
              {pageDisabled ? (
                <PageUnavailable label={registryItem?.label} planLocked={planLocked} />
              ) : outletBlocked ? (
                <div className="grid min-h-[50vh] place-items-center">
                  <div className="max-w-md text-center">
                    <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-warning/10 text-warning">
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <h1 className="text-xl font-semibold">{blockedTitle}</h1>
                    <p className="mt-2 text-muted-foreground">{blockedText}</p>
                    <Link to="/app/subscription"><Button className="mt-6">Go to Subscription</Button></Link>
                  </div>
                </div>
              ) : locked ? (
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
              ) : passwordLocked ? (
                <PasswordGate
                  key={pathname}
                  tenantId={tenant?.id ?? ""}
                  email={user?.email ?? ""}
                  isManager={isOutletManager}
                  title={`${current?.label ?? "This section"} is locked`}
                  onUnlock={() => setUnlockedRoute(secureRoute)}
                />
              ) : (
                <Outlet />
              )}
            </main>

            {!locked && <MobileNav tabs={mobileTabs} />}
          </div>
        </div>
      </SidebarProvider>
    </TenantContextProvider>
  );
}

/** Shown when the page exists but the platform has switched it off. */
function PageUnavailable({ label, planLocked = false }: { label?: string; planLocked?: boolean }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
          <EyeOff className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">
          {planLocked
            ? `${label ?? "This page"} isn't included in your plan`
            : label ? `${label} isn't available` : "This page isn't available"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {planLocked
            ? "Upgrade your subscription to unlock this section."
            : "This section has been turned off for your account. Contact support if you need it enabled."}
        </p>
        <Link to={planLocked ? "/app/subscription" : "/app"}>
          <Button className="mt-6" variant="outline">{planLocked ? "View plans" : "Back to dashboard"}</Button>
        </Link>
      </div>
    </div>
  );
}

function MobileNav({ tabs }: { tabs: NavItem[] }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (tabs.length === 0) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.key}
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

/* ------------------------------------------------------------------ */
/* Password lock screen for secure pages                               */
/* ------------------------------------------------------------------ */
const MAX_ATTEMPTS = 5;       // wrong account-password tries before cooldown
const COOLDOWN_SECONDS = 30;  // wait after too many wrong tries

type Props = {
  tenantId: string;
  email: string;
  onUnlock: () => void;
  title?: string;
  /** Outlet Managers never fall back to their account password: the owner must set the PIN. */
  isManager?: boolean;
};

type VerifyResult = { ok: boolean; attempts_left?: number; retry_after?: number; not_set?: boolean };

/**
 * Asks for the 4-digit section PIN set in Settings (checked server-side, hashed,
 * with its own attempt limit that grows on repeated lockouts). Until a PIN is set,
 * the account login password is accepted instead.
 */
function PasswordGate({ tenantId, email, onUnlock, title = "This section is locked", isManager = false }: Props) {
  const [hasSection, setHasSection] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Account password is used only until a section PIN has been set.
  const accountMode = hasSection === false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("has_section_password", { p_tenant: tenantId });
      // On error, fall back to the account password — still a password, never open.
      if (!cancelled) setHasSection(error ? false : !!data);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => { if (hasSection !== null) inputRef.current?.focus(); }, [hasSection, accountMode]);

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const secondsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const coolingDown = secondsLeft > 0;

  useEffect(() => {
    if (!coolingDown && lockedUntil) {
      setError("");
      inputRef.current?.focus();
    }
  }, [coolingDown, lockedUntil]);

  function startCooldown(seconds: number) {
    setAttempts(0);
    setLockedUntil(Date.now() + seconds * 1000);
    setNow(Date.now());
  }

  // Input is disabled while checking, so focus it again once it's usable.
  useEffect(() => {
    if (!loading && !coolingDown && hasSection !== null) inputRef.current?.focus();
  }, [loading, coolingDown, hasSection]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    check(password);
  }

  async function check(value: string) {
    if (coolingDown || loading) return;
    if (!accountMode && !/^\d{4}$/.test(value)) { setError("Enter your 4-digit PIN"); return; }
    if (!value) { setError("Enter your password"); return; }

    setLoading(true);
    setError("");

    if (accountMode) {
      if (!email) { setLoading(false); setError("Session expired. Please sign in again."); return; }
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password: value });
      setLoading(false);
      setPassword("");
      if (authError) {
        const next = attempts + 1;
        if (next >= MAX_ATTEMPTS) { startCooldown(COOLDOWN_SECONDS); return; }
        setAttempts(next);
        const left = MAX_ATTEMPTS - next;
        setError(`Incorrect password. ${left} attempt${left === 1 ? "" : "s"} left.`);
        inputRef.current?.focus();
        return;
      }
      setAttempts(0);
      onUnlock();
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("verify_section_password", {
      p_tenant: tenantId,
      p_password: value,
    });
    setLoading(false);
    setPassword("");

    if (rpcError) { setError("Couldn't check the PIN. Try again."); return; }
    const res = data as unknown as VerifyResult;
    if (res.ok) { onUnlock(); return; }
    if (res.not_set) {
      setHasSection(false);
      setError("No section PIN is set. Use your account password.");
      return;
    }
    if (res.retry_after) { startCooldown(res.retry_after); return; }
    const left = res.attempts_left ?? 0;
    setError(`Incorrect PIN. ${left} attempt${left === 1 ? "" : "s"} left.`);
    inputRef.current?.focus();
  }

  if (hasSection === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  // No PIN yet: an owner may use their account password and then set a PIN, but a
  // manager can't unlock at all — the 4-digit PIN is created by the owner.
  if (accountMode && isManager) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="w-full max-w-sm space-y-3 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LockIcon className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            The owner hasn't set a 4-digit PIN for this outlet yet. Ask the owner to create it in Settings → Lock PIN,
            then enter it here.
          </p>
        </Card>
      </div>
    );
  }

  const hint = accountMode
    ? "No section PIN is set yet. Enter your account password, then set one in Settings."
    : "Enter your 4-digit PIN and press Enter or Unlock.";

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <form onSubmit={submit} className="space-y-4" aria-labelledby="lock-title">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <LockIcon className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <h1 id="lock-title" className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{hint}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lock-password">{accountMode ? "Account password" : "Section PIN"}</Label>
            <div className="relative">
              <Input
                id="lock-password"
                ref={inputRef}
                type={show ? "text" : "password"}
                autoComplete={accountMode ? "current-password" : "off"}
                inputMode={accountMode ? undefined : "numeric"}
                pattern={accountMode ? undefined : "[0-9]*"}
                maxLength={accountMode ? undefined : 4}
                value={password}
                onChange={(e) => {
                  const v = accountMode ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 4);
                  setPassword(v);
                  if (error) setError("");
                }}
                disabled={coolingDown || loading}
                aria-invalid={!!error}
                aria-describedby="lock-error"
                className={accountMode ? "pr-10" : "pr-10 text-center text-lg tracking-[0.5em]"}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={show ? (accountMode ? "Hide password" : "Hide PIN") : (accountMode ? "Show password" : "Show PIN")}
                aria-pressed={show}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p
              id="lock-error"
              role="alert"
              aria-live="assertive"
              className="text-sm text-destructive"
            >
              {coolingDown ? `Too many wrong attempts. Try again in ${secondsLeft}s.` : error}
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={coolingDown || loading || (!accountMode && password.length !== 4)}
          >
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</> : "Unlock"}
          </Button>

        </form>
      </Card>
    </div>
  );
}