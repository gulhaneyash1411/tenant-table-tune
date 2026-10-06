import { Link } from "@tanstack/react-router";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setSelectedOutletId, type OutletFields } from "@/lib/outlet-context";
import type { Organization, Tenant } from "@/hooks/use-session";

/**
 * Outlet picker for multi-outlet owners. Renders nothing for a single-outlet
 * business, so those users never see organizations or outlets.
 */
export function OutletSwitcher({
  tenant, outlets, organization, canManage = true,
}: { tenant: Tenant | null; outlets: Tenant[]; organization: Organization | null; canManage?: boolean }) {
  if (!tenant || outlets.length < 2) return null;

  const status = (t: Tenant) => (t as Tenant & Partial<OutletFields>).outlet_status ?? "ACTIVE";

  function pick(o: Tenant) {
    if (o.id === tenant?.id) return;
    setSelectedOutletId(o.id);
    // Every page loads its data for the selected outlet on mount, so a reload is
    // the simplest way to guarantee nothing from the previous outlet lingers.
    // An unpaid outlet goes straight to its payment page.
    window.location.assign(status(o) === "ACTIVE" ? "/app" : "/app/subscription");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-sidebar-border px-2 py-1 text-left text-xs
            hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{tenant.name}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {organization && <DropdownMenuLabel className="truncate">{organization.name}</DropdownMenuLabel>}
        {outlets.map((o) => {
          const active = status(o) === "ACTIVE";
          return (
            <DropdownMenuItem key={o.id} onSelect={() => pick(o)} className="justify-between">
              <span className="truncate">{o.name}</span>
              {o.id === tenant.id ? <Check className="h-4 w-4" /> : !active ? <span className="text-[10px] text-muted-foreground">Pay to activate</span> : null}
            </DropdownMenuItem>
          );
        })}
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/app/franchise">Manage outlets</Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
