import { Utensils } from "lucide-react";

/**
 * Single shared full-screen loader used everywhere a branded loading state is
 * needed: the public QR/takeaway ordering flow, the hotel dashboard, and the
 * admin console. Pass `tenant` when the caller knows which restaurant this is
 * for (shows its logo/name); omit it for the generic PlateOS spinner.
 */
export function BrandedLoader({ tenant, label }: { tenant?: { name?: string | null; logo_url?: string | null; slogan?: string | null } | null; label?: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {tenant?.logo_url ? (
          <img src={tenant.logo_url} alt={tenant?.name || ""} className="h-20 w-20 rounded-2xl object-cover shadow-lg animate-spin [animation-duration:1.6s]" />
        ) : (
          <div className="h-20 w-20 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-lg animate-spin [animation-duration:1.6s]">
            <Utensils className="h-8 w-8" />
          </div>
        )}
        {tenant?.name && <div className="font-semibold">{tenant.name}</div>}
        {tenant?.slogan && <div className="text-sm text-muted-foreground italic">"{tenant.slogan}"</div>}
        {label && <div className="text-xs text-muted-foreground mt-1">{label}</div>}
      </div>
    </div>
  );
}
