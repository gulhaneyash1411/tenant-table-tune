import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "@/components/ui/sidebar";
import { LayoutDashboard, Building2, CreditCard, Receipt, LifeBuoy, Megaphone, Settings, Activity, FileText } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { SignOutButton } from "@/components/sign-out-button";
import { useEffect as useE2, useState as useS2 } from "react";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminLayout });

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/restaurants", label: "Restaurants", icon: Building2 },
  { to: "/admin/plans", label: "Plans", icon: CreditCard },
  { to: "/admin/billing", label: "Billing", icon: Receipt },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/tickets", label: "Support tickets", icon: LifeBuoy },
  { to: "/admin/audit", label: "Audit logs", icon: Activity },
  { to: "/admin/reports", label: "Reports", icon: FileText },
  { to: "/admin/settings", label: "Platform settings", icon: Settings },
];

function AdminBrand() {
  const [logo, setLogo] = useS2<string | null>(null);
  useE2(() => { (async () => {
    const { data } = await supabase.from("platform_settings").select("*").eq("key","brand_logo_url").maybeSingle();
    setLogo((data?.value as any)?.url || null);
  })(); }, []);
  return (
    <div className="px-4 py-4 border-b flex items-center gap-2 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:justify-center">
      {logo ? <img src={logo} alt="PlateOS" className="h-8 w-8 rounded object-cover shrink-0"/> : <div className="h-8 w-8 rounded bg-primary/10 text-primary grid place-items-center text-sm font-semibold shrink-0">P</div>}
      <div className="min-w-0 group-data-[collapsible=icon]:hidden">
        <div className="font-semibold text-sm">PlateOS</div>
        <div className="text-xs text-muted-foreground">Super admin console</div>
      </div>
    </div>
  );
}

function AdminLayout() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { navigate({ to: "/admin/auth" }); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "super_admin");
      if (!data || data.length === 0) { navigate({ to: "/app" }); return; }
      setAuthorized(true);
    })();
  }, [navigate]);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (!authorized) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <AdminBrand />
            <SidebarGroup>
              <SidebarGroupLabel>Platform</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.map((it) => {
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
          </SidebarContent>
        </Sidebar>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center justify-between px-4 gap-2 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="flex items-center gap-1">
              <NotificationBell />
              <SignOutButton redirectTo="/admin/auth" />
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}