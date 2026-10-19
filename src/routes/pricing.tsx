import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/format";
import { FEATURE_GROUPS, planAllows } from "@/config/plan-features";
import { PlanIconGlyph } from "@/config/plan-icons";
import { useTrialDays } from "@/lib/site-settings";
import { Check, X, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { absoluteUrl, DEFAULT_DESCRIPTION, jsonLdScript, SITE_NAME, SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: `Pricing — ${SITE_NAME}` },
      { name: "description", content: "Transparent pricing plans for every restaurant. No commission on orders." },
      { property: "og:title", content: `Pricing — ${SITE_NAME}` },
      { property: "og:description", content: "Transparent pricing plans for every restaurant. No commission on orders." },
      { property: "og:url", content: absoluteUrl("/pricing") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/pricing") }],
    scripts: [
      jsonLdScript({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `Pricing — ${SITE_NAME}`,
        url: `${SITE_URL}/pricing`,
        description: "Transparent pricing plans for every restaurant. No commission on orders.",
      }),
    ],
  }),
  component: PricingPage,
});

const BRAND = { name: "DineEatz", primary: "#0B7BFF", dark: "#0B1B3F", soft: "#EAF3FF" };

type Cycle = "monthly" | "half_yearly" | "yearly";
const CYCLE_OPTIONS: { value: Cycle; label: string; months: number }[] = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "half_yearly", label: "Half-yearly", months: 6 },
  { value: "yearly", label: "Yearly", months: 12 },
];
const CYCLE_SUFFIX: Record<Cycle, string> = { monthly: "mo", half_yearly: "6 mo", yearly: "yr" };

function priceOf(plan: any, cycle: Cycle) {
  const field = cycle === "yearly" ? "yearly_price" : cycle === "half_yearly" ? "half_yearly_price" : "monthly_price";
  return Number(plan?.[field]) || 0;
}

function PricingPage() {
  const navigate = useNavigate();
  const trialDays = useTrialDays();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [cycleByPlan, setCycleByPlan] = useState<Record<string, Cycle>>({});

  useEffect(() => {
    supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .eq("is_free", false)
      .order("sort_order")
      .then(({ data }) => {
        setPlans(data || []);
        setLoading(false);
      });
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  function handleBuy(planId: string) {
    const target = `/app/subscription?plan=${planId}`;
    if (authed) {
      navigate({ to: "/app/subscription", search: { plan: planId } as any });
    } else {
      navigate({ to: "/auth", search: { redirect: target } as any });
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/brand/dineeatz-logo.png?v=3"
              alt={BRAND.name}
              className="h-10 md:h-12 w-auto object-contain"
            />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> Home
            </Link>
            {authed === false && (
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: BRAND.primary }}
              >
                Sign in <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {authed === true && (
              <Link
                to="/app"
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: BRAND.primary }}
              >
                Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 sm:px-6 py-10 sm:py-16">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto">
          <span
            className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide"
            style={{ background: BRAND.soft, color: BRAND.primary }}
          >
            Simple, transparent pricing
          </span>
          <h1
            className="mt-5 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight"
            style={{ color: BRAND.dark }}
          >
            Plans that grow{" "}
            <span style={{ color: BRAND.primary }}>with you</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-600">
            No commission on orders. {trialDays}-day free trial on every plan. Cancel anytime.
          </p>
        </div>

        {/* Plans */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            No plans available at the moment. Please check back later.
          </div>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...plans]
              .sort((a, b) => priceOf(a, "monthly") - priceOf(b, "monthly"))
              .map((p) => {
                const cardCycle = cycleByPlan[p.id] ?? "monthly";
                const price = priceOf(p, cardCycle);
                const cycleRows = CYCLE_OPTIONS.map((o) => {
                  const total = priceOf(p, o.value);
                  const monthlyTotal = priceOf(p, "monthly") * o.months;
                  return { ...o, monthlyEquiv: total / o.months, saved: Math.max(0, monthlyTotal - total) };
                });

                const cap = (v: number | null | undefined) => (v == null ? "Unlimited" : v);
                const included = FEATURE_GROUPS.map((g) => ({
                  title: g.title,
                  items: g.items.filter((i) => planAllows(p.features, i.key)).map((i) => i.label),
                })).filter((g) => g.items.length > 0);
                const limitItems = [
                  `${cap(p.max_tables)} tables`,
                  `${cap(p.max_orders_month)} orders/mo`,
                  `${cap(p.max_menu_items)} menu items`,
                  `${cap(p.max_staff)} staff`,
                ];
                const writtenMode = (p.included_features?.length ?? 0) + (p.not_included_features?.length ?? 0) > 0;
                const writtenIncluded = [...(p.included_features ?? []), ...limitItems];
                const notIncluded: string[] = writtenMode
                  ? (p.not_included_features ?? [])
                  : FEATURE_GROUPS.flatMap((g) =>
                      g.items.filter((i) => !planAllows(p.features, i.key)).map((i) => i.label),
                    );
                const isPopular = p.tag?.toLowerCase().includes("popular") || p.tag?.toLowerCase().includes("recommended");

                return (
                  <div
                    key={p.id}
                    className={`relative rounded-2xl p-6 sm:p-7 flex flex-col border transition-shadow hover:shadow-xl ${
                      isPopular ? "shadow-xl shadow-blue-500/15" : "bg-white"
                    }`}
                    style={isPopular ? { borderColor: BRAND.primary, background: "#fff" } : { borderColor: "#e2e8f0" }}
                  >
                    {p.tag && (
                      <span
                        className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white whitespace-nowrap"
                        style={{ background: BRAND.primary }}
                      >
                        {p.tag}
                      </span>
                    )}

                    {/* Name + icon */}
                    <div className="flex items-center gap-2">
                      <PlanIconGlyph name={p.icon} className="h-5 w-5 shrink-0 text-blue-500" />
                      <span className="font-semibold text-lg" style={{ color: BRAND.dark }}>
                        {p.name}
                      </span>
                      {planAllows(p.features, "settings_outlets") && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                          Multi-outlet
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-500 mt-1 min-h-[40px]">{p.description}</div>

                    {/* Price */}
                    <div className="mt-4 text-3xl font-extrabold" style={{ color: BRAND.dark }}>
                      {money(price)}
                      <span className="text-sm font-normal text-slate-500">/{CYCLE_SUFFIX[cardCycle]}</span>
                    </div>

                    {/* Billing cycle selector */}
                    <div className="mt-4 grid gap-1.5">
                      {cycleRows.map((r) => {
                        const on = cardCycle === r.value;
                        return (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => setCycleByPlan((prev) => ({ ...prev, [p.id]: r.value }))}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                              on ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <span className="font-medium">{r.label}</span>
                            <span className="text-right">
                              <span className="font-semibold">{money(Math.round(r.monthlyEquiv))}/mo</span>
                              {r.saved > 0 && (
                                <span className="ml-2 font-semibold text-emerald-600">
                                  Save {money(Math.round(r.saved))}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Features */}
                    <div className="mt-5 border-t border-slate-100 pt-5 flex-1">
                      <div className="text-sm font-semibold" style={{ color: BRAND.dark }}>
                        What's included
                      </div>
                      {writtenMode ? (
                        <ul className="mt-3 space-y-2 text-sm">
                          {writtenIncluded.map((n) => (
                            <li key={n} className="flex gap-2">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={3} />
                              <span>{n}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {[...included, { title: "Limits", items: limitItems }].map((g) => (
                            <div key={g.title} className="flex gap-2">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-800">{g.title}</div>
                                <div className="text-xs text-slate-500">{g.items.join(", ")}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {notIncluded.length > 0 && (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <div className="text-xs font-semibold text-slate-500">Not included</div>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
                          {notIncluded.map((n) => (
                            <span key={n} className="flex items-center gap-1.5">
                              <X className="h-3.5 w-3.5 shrink-0 text-red-400" strokeWidth={3} />
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CTA */}
                    <button
                      onClick={() => handleBuy(p.id)}
                      className="mt-6 w-full text-center rounded-lg py-3 text-sm font-semibold transition-colors"
                      style={
                        isPopular
                          ? { background: BRAND.primary, color: "#fff" }
                          : { background: BRAND.soft, color: BRAND.primary }
                      }
                    >
                      {authed ? "Buy now" : "Get started"}
                    </button>
                  </div>
                );
              })}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <p className="text-slate-500 text-sm">
            All plans include a {trialDays}-day free trial. No credit card required to start.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white"
              style={{ background: BRAND.primary }}
            >
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back to home
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-slate-50/60 mt-10">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-6 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
