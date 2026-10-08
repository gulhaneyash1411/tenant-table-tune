import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { BRAND, useSite, fillTokens, useT, Pill, Reveal } from "@/components/landing/shared";

const PLANS = [
  { name: "Starter", price: "₹999", desc: "For single-outlet cafés", perks: ["QR table ordering", "Online menu", "Basic reports", "Email support"] },
  { name: "Growth", price: "₹2,499", desc: "For busy restaurants", perks: ["Everything in Starter", "Online ordering website", "Kitchen display", "Table & booking management"], popular: true },
  { name: "Enterprise", price: "Custom", desc: "For chains & multi-branch", perks: ["Everything in Growth", "Multi-branch control", "Advanced analytics", "Dedicated manager"] },
];

export const Pricing = () => {
  const t = useT();
  const site = useSite();
  return (
    <section id="pricing" className="py-14 sm:py-20 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="text-center">
            <Pill>{t("Simple pricing")}</Pill>
            <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>{t("Plans that grow")} <span style={{ color: BRAND.primary }}>{t("with you")}</span></h2>
            <p className="mt-3 text-slate-600">{fillTokens(t("No commission on orders. {days}-day free trial on every plan."), site)}</p>
          </div>
        </Reveal>
        <div className="mt-10 sm:mt-12 grid gap-5 sm:gap-6 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08}>
              <div className={`relative rounded-2xl p-6 sm:p-7 h-full flex flex-col border ${p.popular ? "shadow-xl shadow-blue-500/15" : "bg-white"}`}
                style={p.popular ? { borderColor: BRAND.primary, background: "#fff" } : { borderColor: "#e2e8f0" }}>
                {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: BRAND.primary }}>{t("Most popular")}</span>}
                <div className="font-semibold" style={{ color: BRAND.dark }}>{t(p.name)}</div>
                <div className="text-sm text-slate-500">{t(p.desc)}</div>
                <div className="mt-4 text-4xl font-extrabold" style={{ color: BRAND.dark }}>{t(p.price)}<span className="text-sm font-normal text-slate-500">{p.price !== "Custom" && t("/month")}</span></div>
                <ul className="mt-6 space-y-2.5 flex-1">
                  {p.perks.map((k) => <li key={k} className="flex gap-2 text-sm text-slate-700"><Check className="h-4 w-4 mt-0.5" style={{ color: BRAND.primary }} />{t(k)}</li>)}
                </ul>
                <Link to="/auth" className="mt-6 text-center rounded-lg py-2.5 text-sm font-semibold transition"
                  style={p.popular ? { background: BRAND.primary, color: "#fff" } : { background: BRAND.soft, color: BRAND.primary }}>
                  {p.price === "Custom" ? t("Talk to sales") : t("Start free trial")}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};
