import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { QrCode, ShieldCheck, Utensils, LineChart, Building2, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center"><Utensils className="h-4 w-4"/></div>
            PlateOS
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
            <Link to="/auth"><Button>Get started</Button></Link>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-20">
        <section className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-6">
            <Zap className="h-3 w-3 text-primary" /> Multi-tenant Restaurant SaaS
          </div>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-tight">
            Run every restaurant on <span className="text-primary">one platform</span>.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            QR-based ordering, live kitchen operations, isolated tenant workspaces,
            and subscription billing — everything you need to sell hospitality software.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/auth"><Button size="lg">Start free trial</Button></Link>
            <Link to="/admin/auth"><Button variant="outline" size="lg">Super admin</Button></Link>
          </div>
        </section>
        <section className="mt-24 grid md:grid-cols-3 gap-6">
          {[
            { icon: QrCode, title: "QR ordering", body: "Table, takeaway and feedback QRs — printed once, generating orders forever." },
            { icon: Building2, title: "True multi-tenant", body: "Every restaurant is isolated by row-level security. Zero data leaks." },
            { icon: ShieldCheck, title: "Super admin control", body: "Approve, suspend, upgrade, notify — every tenant, one console." },
            { icon: LineChart, title: "Realtime dashboards", body: "MRR, ARR, order volume and platform health at a glance." },
            { icon: Utensils, title: "Made for kitchens", body: "Live orders, KDS, printer routing, drag & drop workflows." },
            { icon: Zap, title: "Plans & billing", body: "Starter to Enterprise — feature flags baked into every plan." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="h-9 w-9 rounded-lg bg-accent text-accent-foreground grid place-items-center mb-4">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="font-medium">{f.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{f.body}</div>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} PlateOS
      </footer>
    </div>
  );
}