export function DashboardLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6" role="status" aria-label="Loading dashboard">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-8 w-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" style={{ animationDuration: "0.6s" }} />
        <img src="/app-icon-192.png?v=3" alt="DineEatz" className="h-20 w-20 object-contain" />
        <div className="text-sm text-muted-foreground">Loading your dashboard…</div>
      </div>
    </div>
  );
}
