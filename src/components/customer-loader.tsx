export function CustomerLoader({ tenant, label }: { tenant?: any; label?: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {tenant?.logo_url ? (
          <img src={tenant.logo_url} alt={tenant?.name || ""} className="h-20 w-20 rounded-2xl object-cover shadow-lg animate-pulse" />
        ) : (
          <div className="h-20 w-20 rounded-2xl bg-primary/10 grid place-items-center text-2xl font-semibold text-primary animate-pulse">
            {(tenant?.name || "R").slice(0, 1)}
          </div>
        )}
        {tenant?.name && <div className="font-semibold">{tenant.name}</div>}
        {tenant?.slogan && <div className="text-sm text-muted-foreground italic">"{tenant.slogan}"</div>}
        {label && <div className="text-xs text-muted-foreground mt-1">{label}</div>}
      </div>
    </div>
  );
}