import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext } from "@/hooks/use-session";
import { BrandedLoader } from "@/components/branded-loader";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Building2, CreditCard, Receipt, LifeBuoy, Megaphone, Settings, Activity, FileText, Package, Briefcase, SlidersHorizontal, Inbox } from "lucide-react";import { NotificationBell } from "@/components/notification-bell";
import { SignOutButton } from "@/components/sign-out-button";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminLayout });

// Nine destinations is too many for one flat list — the grouping carries
// information, it isn't decoration. Each group answers "what am I here to do".
const SECTIONS = [
  {
    label: "Operations",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/admin/restaurants", label: "Restaurants", icon: Building2 },
      { to: "/admin/sales", label: "Sales Team", icon: Briefcase },
    ],
  },
  {
    label: "Revenue",
    items: [
      { to: "/admin/plans", label: "Plans", icon: CreditCard },
      { to: "/admin/billing", label: "Billing", icon: Receipt },
      { to: "/admin/products", label: "Products", icon: Package },
    ],
  },
  {
    label: "Customers",
    items: [
      { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { to: "/admin/tickets", label: "Support tickets", icon: LifeBuoy },
      { to: "/admin/contacts", label: "Contact messages", icon: Inbox },
    ],
  },
  {
    label: "System",
    items: [

      { to: "/admin/navigation", label: "Owner navigation", icon: SlidersHorizontal }, // Controls what restaurant owners see in /app — see admin.navigation.tsx.
      { to: "/admin/audit", label: "Audit logs", icon: Activity },
      { to: "/admin/reports", label: "Reports", icon: FileText },
      { to: "/admin/settings", label: "Platform settings", icon: Settings },
    ],
  },
];

const isActive = (
  pathname: string,
  it: { to: string; exact?: boolean },
) => (it.exact ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/"));

function AdminBrand() {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("platform_settings").select("*").eq("key", "brand_logo_url").maybeSingle();
      setLogo((data?.value as any)?.url || null);
    })();
  }, []);

  return (
    // h-10, not h-14: the floating panel already starts 1rem down (0.5rem
    // container padding + 0.5rem auto margin), so 3.5rem-1rem puts this bottom
    // border level with the main header's.
    <SidebarHeader className="h-10 shrink-0 flex-row items-center gap-2.5 border-b border-sidebar-border p-0 px-4
      group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
      {logo ? (
        <img src={logo} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sidebar-primary
          text-sm font-semibold text-sidebar-primary-foreground">
          P
        </div>
      )}
      <div className="flex min-w-0 items-baseline gap-1.5 group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">PlateOS</span>
        <span className="shrink-0 text-xs text-sidebar-foreground/70">· Super admin</span>
      </div>
    </SidebarHeader>
  );
}

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

function AdminLayout() {
  // `user` comes from the `_authenticated` layout's beforeLoad guard, so it's
  // already known to be signed in — no need to re-verify with getUser() here.
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { isSuperAdmin, loading, isKitchenUser, isSalesUser } = useUserContext(user);
  useEffect(() => {
    if (loading || isSuperAdmin) return;
    // A Kitchen User or Sales User landing here (e.g. by typing the URL)
    // goes to their own portal, not the admin console — same "bounce to
    // your own home" rule AppLayout uses for a super admin who lands on /app.
    if (isKitchenUser) { navigate({ to: "/kitchen" }); return; }
    if (isSalesUser) { navigate({ to: "/sales" }); return; }
    navigate({ to: "/app" });
  }, [loading, isSuperAdmin, isKitchenUser, isSalesUser, navigate]);

  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (loading || !isSuperAdmin) return <BrandedLoader label="Loading admin console…" />;

  const current = SECTIONS.flatMap((s) => s.items).find((it) => isActive(pathname, it));

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar
          collapsible="icon"
          variant="floating"
          // Sits a little short of the full window height, centred.
          className="[&>[data-sidebar=sidebar]]:rounded-2xl [&>[data-sidebar=sidebar]]:h-[calc(100%-1rem)] [&>[data-sidebar=sidebar]]:my-auto"
        >
          {/* Outside SidebarContent so it stays put while the nav scrolls. */}
          <AdminBrand />

          {/* Still scrolls; the scrollbar itself is hidden. */}
          {/* overflow-auto in icon mode too: the component's default turns
              scrolling off when collapsed, which strands items out of reach.
              Safe here because the scrollbar itself is hidden. */}
          <SidebarContent className="gap-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden group-data-[collapsible=icon]:overflow-auto">
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
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <h1 className="truncate text-sm font-medium">{current?.label ?? "Admin"}</h1>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
              <SignOutButton redirectTo="/admin/auth" />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}