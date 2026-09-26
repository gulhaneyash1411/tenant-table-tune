import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  AlertTriangle, MessageCircle, ShoppingCart, LockKeyhole, Eye, EyeOff, Loader2,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignOutButton } from "@/components/sign-out-button";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/app")({ component: AppLayout });

// Single source for the lock icon. Change it here to swap it everywhere.
const LockIcon = LockKeyhole;

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  secure?: boolean; // needs owner password
};

// Fifteen destinations in one list is unscannable. The groups follow how a
// restaurant actually runs: service first, then the menu, then everything
// that can wait until the shift is over.
const SECTIONS: { label: string; items: NavItem[] }[] = [
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
      { to: "/app/revenue", label: "Revenue", icon: TrendingUp, secure: true },
      { to: "/app/expenses", label: "Expenses", icon: Wallet, secure: true },
      { to: "/app/analytics", label: "Analytics", icon: LineChart, secure: true },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/app/staff", label: "Staff", icon: UsersRound, secure: true },
      { to: "/app/products", label: "Shop", icon: ShoppingCart },
      { to: "/app/subscription", label: "Subscription", icon: CreditCard },
      { to: "/app/settings", label: "Settings", icon: Settings, secure: true },
    ],
  },
];

const SECURE_ROUTES = SECTIONS.flatMap((s) => s.items).filter((i) => i.secure).map((i) => i.to);

// Lock again when the user switches tab/app (like banking apps)
const RELOCK_ON_TAB_HIDE = true;

const isActive = (
  pathname: string,
  it: { to: string; exact?: boolean },
) => (it.exact ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/"));

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
  const { isSuperAdmin, tenant, loading, setTenant, isKitchenUser, isSalesUser } = useUserContext(user);
  const [sub, setSub] = useState<any>(null);

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

  const status =
    loading || isSuperAdmin || ((isKitchenUser || isSalesUser) && !tenant)
      ? "loading"
      : (tenant?.status ?? "none");

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
  const passwordLocked = !locked && onSecurePage && !secureUnlocked;

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
              <h1 className="truncate text-sm font-medium">
                <span className="md:hidden">{tenant?.name}</span>
                <span className="hidden md:inline">{current?.label ?? "Dashboard"}</span>
              </h1>
              <div className="ml-auto flex items-center gap-2">
                {onSecurePage && secureUnlocked && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUnlockedRoute(null)}
                    aria-label="Lock this section"
                  >
                    <LockIcon className="mr-1 h-3.5 w-3.5" />Lock
                  </Button>
                )}
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
              ) : passwordLocked ? (
                <PasswordGate
                  key={pathname}
                  tenantId={tenant?.id ?? ""}
                  email={user?.email ?? ""}
                  title={`${current?.label ?? "This section"} is locked`}
                  onUnlock={() => setUnlockedRoute(secureRoute)}
                />
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
};

type VerifyResult = { ok: boolean; attempts_left?: number; retry_after?: number; not_set?: boolean };

/**
 * Asks for the 4-digit section PIN set in Settings (checked server-side, hashed,
 * with its own attempt limit that grows on repeated lockouts). Until a PIN is set,
 * the account login password is accepted instead.
 */
function PasswordGate({ tenantId, email, onUnlock, title = "This section is locked" }: Props) {
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