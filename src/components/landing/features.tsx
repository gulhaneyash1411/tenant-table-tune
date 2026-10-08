import { motion } from "framer-motion";
import { ShoppingCart, QrCode, CalendarDays, LineChart, FileText, Percent } from "lucide-react";
import { BRAND, useT, Pill, Reveal } from "@/components/landing/shared";

const FEATURES = [
  { icon: ShoppingCart, title: "Online Ordering", body: "Let customers order from anywhere.", tag: "Delivery & takeaway" },
  { icon: QrCode, title: "QR Table Ordering", body: "Unique QR codes for every table.", tag: "Scan · Order · Pay" },
  { icon: CalendarDays, title: "Table & Booking Management", body: "Manage reservations and table allocation.", tag: "Live floor plan" },
  { icon: LineChart, title: "Restaurant Dashboard", body: "Track orders, sales, and performance in real-time.", tag: "Real-time" },
  { icon: FileText, title: "Orders, Reports & Invoices", body: "Stay organized with detailed reports.", tag: "GST-ready invoices" },
  { icon: Percent, title: "No Commission", body: "Keep 100% of your earnings.", tag: "0% per order" },
];

const FeatureCard = ({ f }: { f: (typeof FEATURES)[number] }) => {
  const t = useT();
  return (
    <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group relative h-full min-h-[210px] sm:min-h-[240px] overflow-hidden rounded-3xl p-6 sm:p-7 bg-white border border-slate-200 hover:border-transparent hover:shadow-xl hover:shadow-blue-500/25 transition-[box-shadow,border-color] duration-300">
      {/* blue fill on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(135deg, #3D9BFF, ${BRAND.primary})` }} />

      <div className="relative">
        <div className="h-12 w-12 rounded-2xl grid place-items-center text-white shadow-lg shadow-blue-500/30 bg-gradient-to-br from-[#0B7BFF] to-[#4DA3FF] transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6 group-hover:from-white/15 group-hover:to-white/15 group-hover:shadow-none">
          <f.icon className="h-6 w-6" />
        </div>
        <span className="mt-5 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[#EAF3FF] text-[#0B7BFF] group-hover:bg-white/15 group-hover:text-white transition-colors duration-300">
          {t(f.tag)}
        </span>
        <h3 className="mt-3 text-lg font-bold text-[#0B1B3F] group-hover:text-white transition-colors duration-300">{t(f.title)}</h3>
        <p className="mt-1.5 text-sm text-slate-500 group-hover:text-white transition-colors duration-300">{t(f.body)}</p>
      </div>
    </motion.div>
  );
};

export const Features = () => {
  const t = useT();
  return (
    <section id="features" className="py-14 sm:py-20 scroll-mt-16">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto">
            <Pill>{t("Everything you need")}</Pill>
            <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>
              {t("Powerful features for")} <span style={{ color: BRAND.primary }}>{t("your restaurant")}</span>
            </h2>
            <p className="mt-4 text-slate-600">{t("From online orders to detailed reports, DineEatz gives you the tools to run your restaurant smoothly and efficiently.")}</p>
          </div>
        </Reveal>
        <div className="mt-10 sm:mt-14 grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} className="h-full" delay={(i % 3) * 0.08}><FeatureCard f={f} /></Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};
