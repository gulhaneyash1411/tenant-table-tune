import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "@/components/ui/sidebar";
import { LayoutDashboard, ListOrdered, Utensils, QrCode, Users, Star, UsersRound, LineChart, Settings, CreditCard, Receipt, Package, Gift, Bot, Store, Puzzle, Webhook, Contact, Megaphone, Cpu, Rocket, Printer, Wifi, LogOut } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app")({ component: AppLayout });

const MAIN = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/orders", label: "Live orders", icon: ListOrdered },
  { to: "/app/menu", label: "Menu", icon: Utensils },
  { to: "/app/tables", label: "Tables & QR", icon: QrCode },
  { to: "/app/customers", label: "Customers", icon: Users },
  { to: "/app/reviews", label: "Reviews", icon: Star },
  { to: "/app/staff", label: "Staff", icon: UsersRound },
  { to: "/app/analytics", label: "Analytics", icon: LineChart },
];
const BILLING = [
  { to: "/app/subscription", label: "Subscription", icon: CreditCard },
  { to: "/app/billing", label: "Billing", icon: Receipt },
  { to: "/app/settings", label: "Settings", icon: Settings },
];
const COMING = [
  { to: "/app/inventory", label: "Inventory", icon: Package },
  { to: "/app/loyalty", label: "Loyalty", icon: Gift },
  { to: "/app/marketing", label: "Marketing", icon: Megaphone },
  { to: "/app/crm", label: "CRM", icon: Contact },
  { to: "/app/kds", label: "Kitchen Display", icon: Cpu },
  { to: "/app/pos", label: "POS", icon: Store },
  { to: "/app/printers", label: "Printers", icon: Printer },
  { to: "/app/franchise", label: "Franchise", icon: Rocket },
  { to: "/app/plugins", label: "Plugins", icon: Puzzle },
  { to: "/app/api", label: "API access", icon: Webhook },
  { to: "/app/offline", label: "Offline mode", icon: Wifi },
  { to: "/app/ai", label: "AI insights", icon: Bot },
];

function AppLayout() {
  const [tenant, setTenant] = useState<any>(null);
  const [status, setStatus] = useState<string>("loading");
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      // block super admin from app portal
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      if (roles?.some((r: any) => r.role === "super_admin")) { navigate({ to: "/admin" }); return; }
      const { data: t } = await supabase.from("tenants").select("*").eq("owner_id", u.user.id).maybeSingle();
      setTenant(t);
      setStatus(t?.status ?? "none");
    })();
  }, [navigate]);

  if (status === "loading") return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (status === "none") return <NoTenant />;
  if (status !== "approved") return <AwaitingApproval status={status} tenant={tenant} />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <div className="px-4 py-4 border-b">
              <div className="font-semibold truncate">{tenant?.name}</div>
              <div className="text-xs text-muted-foreground truncate">{tenant?.city}</div>
            </div>
            <NavGroup label="Operations" items={MAIN} />
            <NavGroup label="Billing" items={BILLING} />
            <NavGroup label="Coming soon" items={COMING} />
          </SidebarContent>
        </Sidebar>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-4 gap-2 bg-background sticky top-0 z-10">
            <div className="flex items-center gap-2"><SidebarTrigger /></div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}><LogOut className="h-4 w-4 mr-1"/>Sign out</Button>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
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

function AwaitingApproval({ status, tenant }: { status: string; tenant: any }) {
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