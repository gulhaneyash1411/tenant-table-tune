import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { BRAND, useSite, fillTokens, useT, Pill, Reveal } from "@/components/landing/shared";
import { supabase } from "@/integrations/supabase/client";
import { PlanIconGlyph } from "@/config/plan-icons";

export const Pricing = () => {
  const t = useT();
  const site = useSite();
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("subscription_plans")
      .select("id,name,description,tag,icon,monthly_price")
      .eq("is_active", true)
      .eq("is_free", false)
      .order("sort_order")
      .limit(3)
      .then(({ data }) => {
        const sorted = (data || []).slice().sort(
          (a, b) => (Number(a.monthly_price) || 0) - (Number(b.monthly_price) || 0),
        );
        setPlans(sorted);
      });
  }, []);

  const showDb = plans.length > 0;
  const items = showDb ? plans : FALLBACK_PLANS;

  return (
    <section id="pricing" className="py-14 sm:py-20 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="text-center">
            <Pill>{t("Simple pricing")}</Pill>
            <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>
              {t("Plans that grow")} <span style={{ color: BRAND.primary }}>{t("with you")}</span>
            </h2>
            <p className="mt-3 text-slate-600">
              {fillTokens(t("No commission on orders. {days}-day free trial on every plan."), site)}
            </p>
          </div>
        </Reveal>

        <div className="mt-10 sm:mt-12 grid gap-5 sm:gap-6 md:grid-cols-3">
          {items.map((p, i) => {
            const isPopular = showDb
              ? p.tag?.toLowerCase().includes("popular") || p.tag?.toLowerCase().includes("recommended")
              : (p as any).popular;
            const name = p.name;
            const desc = showDb ? p.description : (p as any).desc;

            return (
              <Reveal key={showDb ? p.id : name} delay={i * 0.08}>
                <Link
                  to="/pricing"
                  className={`group relative rounded-2xl p-6 sm:p-7 h-full flex flex-col border transition-all hover:shadow-xl hover:-translate-y-1 ${isPopular ? "shadow-xl shadow-blue-500/15" : "bg-white"}`}
                  style={isPopular ? { borderColor: BRAND.primary, background: "#fff" } : { borderColor: "#e2e8f0" }}
                >
                  {isPopular && (
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white"
                      style={{ background: BRAND.primary }}
                    >
                      {showDb ? p.tag : t("Most popular")}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    {showDb ? (
                      <PlanIconGlyph name={p.icon} className="h-5 w-5 shrink-0 text-blue-500" />
                    ) : (
                      <Sparkles className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} />
                    )}
                    <span className="text-lg font-semibold" style={{ color: BRAND.dark }}>{t(name)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500 flex-1">{t(desc || "")}</p>

                  <div className="mt-6 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors"
                    style={isPopular ? { background: BRAND.primary, color: "#fff" } : { background: BRAND.soft, color: BRAND.primary }}
                  >
                    {t("Explore plan")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={0.2}>
          <div className="mt-8 text-center">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors"
              style={{ background: BRAND.primary }}
            >
              {t("Compare all plans")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

const FALLBACK_PLANS = [
  { name: "Starter", desc: "For single-outlet cafés", popular: false },
  { name: "Growth", desc: "For busy restaurants", popular: true },
  { name: "Enterprise", desc: "For chains & multi-branch", popular: false },
];
