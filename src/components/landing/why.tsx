import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CheckCircle2, ShoppingCart, CalendarDays, LineChart, FileText, Phone, Bell } from "lucide-react";
import { BRAND, useT, Pill, Reveal, FitScale, Tablet, Phone_, Sidebar, OnlineSlide, KitchenSlide, AnalyticsSlide } from "@/components/landing/shared";

const TablesSlide = () => {
  const st = ["busy", "free", "busy", "reserved", "busy", "busy", "free", "busy", "reserved", "busy", "free", "busy"];
  const style: Record<string, string> = { busy: "bg-blue-50 border-blue-300 text-blue-700", free: "bg-white border-slate-200 text-slate-400", reserved: "bg-amber-50 border-amber-300 text-amber-700" };
  return (
    <Tablet>
      <Sidebar active="Tables" />
      <div className="flex-1 p-3">
        <div className="flex justify-between mb-2"><span className="font-bold text-sm">Floor Plan</span><span className="text-slate-400">8 of 12 occupied</span></div>
        <div className="grid grid-cols-4 gap-2">
          {st.map((s, i) => (
            <div key={i} className={`rounded-lg border p-2 text-center ${style[s]}`}>
              <div className="font-bold">T{i + 1}</div><div className="capitalize">{s}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-3 text-slate-500">
          <span>● Busy</span><span className="text-amber-600">● Reserved</span><span className="text-slate-400">● Free</span>
        </div>
      </div>
    </Tablet>
  );
};

const PhoneCenter = ({ children }: { children: ReactNode }) => (
  <Phone_><div className="h-full grid place-items-center text-center p-3"><div className="w-full">{children}</div></div></Phone_>
);
const PhoneBadge = ({ icon: I }: { icon: typeof Check }) => (
  <div className="h-12 w-12 mx-auto rounded-full grid place-items-center text-white" style={{ background: BRAND.primary }}><I className="h-6 w-6" /></div>
);
const PhoneBtn = ({ t }: { t: string }) => (
  <div className="mt-3 rounded-md text-white py-1 px-3" style={{ background: BRAND.primary }}>{t}</div>
);

const PaymentPhone = () => (
  <PhoneCenter><PhoneBadge icon={Check} /><div className="mt-2 font-medium">Payment Successful</div><div className="text-sm font-bold">₹520</div><div className="text-slate-400">Paid via UPI</div><PhoneBtn t="View Order" /></PhoneCenter>
);
const BookingPhone = () => (
  <PhoneCenter><PhoneBadge icon={CalendarDays} /><div className="mt-2 font-medium">Table Booked</div><div className="text-sm font-bold">Sat, 8:00 PM</div><div className="text-slate-400">4 guests · Table 4</div><PhoneBtn t="Add to calendar" /></PhoneCenter>
);
const TrackPhone = () => (
  <PhoneCenter>
    <PhoneBadge icon={ShoppingCart} /><div className="mt-2 font-medium">Order #1042</div>
    <div className="mt-2 space-y-1 text-left">
      {[["Order placed", true], ["Preparing", true], ["Out for delivery", false]].map(([t, d]) => (
        <div key={t as string} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: d ? BRAND.primary : "#cbd5e1" }} /><span className={d ? "" : "text-slate-400"}>{t}</span></div>
      ))}
    </div>
    <PhoneBtn t="Track order" />
  </PhoneCenter>
);
const InvoicePhone = () => (
  <PhoneCenter>
    <PhoneBadge icon={FileText} /><div className="mt-2 font-medium">Invoice #INV-2291</div>
    <div className="mt-2 space-y-0.5 text-left">
      <div className="flex justify-between"><span>Subtotal</span><span>₹1,240</span></div>
      <div className="flex justify-between"><span>GST 5%</span><span>₹62</span></div>
      <div className="flex justify-between font-bold border-t pt-0.5"><span>Total</span><span>₹1,302</span></div>
    </div>
    <PhoneBtn t="Download PDF" />
  </PhoneCenter>
);

const WHY_SCENES = [
  { Screen: KitchenSlide, Phone: PaymentPhone, icon: Bell, title: "New Order", sub: "Table 3 · ₹520 · 3 items" },
  { Screen: TablesSlide, Phone: BookingPhone, icon: CalendarDays, title: "New Booking", sub: "4 guests · Sat 8:00 PM" },
  { Screen: OnlineSlide, Phone: TrackPhone, icon: ShoppingCart, title: "Online Order", sub: "#1042 · ₹640 · Delivery" },
  { Screen: AnalyticsSlide, Phone: InvoicePhone, icon: LineChart, title: "Daily Report Ready", sub: "Revenue up 12% today" },
];

const WhyShowcase = () => {
  const t = useT();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((n) => (n + 1) % WHY_SCENES.length), 4000);
    return () => clearInterval(t);
  }, [paused]);
  const { Screen, Phone, icon: Icon, title, sub } = WHY_SCENES[i];
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <FitScale w={560} h={400}>
        <div className="relative h-full w-full flex justify-center items-end">
          <AnimatePresence mode="wait">
            <motion.div key={i} className="relative flex items-end pt-14">
              <motion.div initial={{ opacity: 0, x: -30, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, scale: 0.97 }} transition={{ duration: 0.5, ease }}>
                <Screen />
              </motion.div>
              <motion.div className="-ml-12 relative z-10"
                initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 24 }} exit={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.5, delay: 0.15, ease }}>
                <Phone />
              </motion.div>
              <motion.div className="absolute top-0 right-0 z-20 rounded-xl bg-white shadow-xl p-3 flex items-center gap-3 text-sm"
                initial={{ opacity: 0, y: -12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.9 }} transition={{ duration: 0.4, delay: 0.3, ease }}>
                <span className="h-9 w-9 rounded-full grid place-items-center text-white" style={{ background: BRAND.primary }}><Icon className="h-4 w-4" /></span>
                <div><div className="font-semibold">{t(title)}</div><div className="text-slate-500 text-xs">{sub}</div></div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </FitScale>
      <div className="mt-6 sm:mt-10 flex justify-center gap-1.5">
        {WHY_SCENES.map((s, n) => (
          <button key={s.title} aria-label={`Show ${s.title}`} onClick={() => setI(n)}
            className="h-2 rounded-full transition-all" style={{ width: n === i ? 22 : 8, background: n === i ? BRAND.primary : "#cbd5e1" }} />
        ))}
      </div>
    </div>
  );
};

// ====================
// WHY DINEEATZ (ABOUT)
// ====================
export const WhyDineEatz = () => {
  const t = useT();
  return (
    <section id="about" className="py-14 sm:py-20 scroll-mt-16" style={{ background: "#F4F8FF" }}>
      <div className="max-w-7xl mx-auto px-5 sm:px-6 grid grid-cols-1 gap-8 sm:gap-10 lg:grid-cols-2 lg:gap-12 items-center">
        <Reveal>
          <Pill>{t("Why choose DineEatz")}</Pill>
          <h2 className="mt-4 text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight" style={{ color: BRAND.dark }}>{t("Built for modern")}<br />
            {t("restaurants")}
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 max-w-md leading-relaxed">{t("Simple to use, powerful behind the scenes, and designed to help you serve better, manage easier, and grow faster.")}</p>
          <ul className="mt-5 sm:mt-6 space-y-3">
            {["Easy setup & onboarding", "Dedicated support", "Scalable for single or multi-branch restaurants", "Trusted by modern food businesses"].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm sm:text-base text-slate-700 leading-relaxed"><CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: BRAND.primary }} /> <span>{t(item)}</span></li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <WhyShowcase />
        </Reveal>
      </div>
    </section>
  );
};
