import { Link } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Utensils, Zap, ChevronLeft, ChevronRight, ShoppingCart, QrCode, LayoutDashboard, ChefHat, BarChart3, Menu } from "lucide-react";
import { EMPTY_SITE_SETTINGS, parseTrialDays, safeUrl, whatsappHref, whatsappNumber, type SiteSettings } from "@/lib/site-settings";

// ====================
// DINEEATZ CONFIG
// ====================
export const BRAND = { name: "DineEatz", primary: "#0B7BFF", dark: "#0B1B3F", soft: "#EAF3FF" };

export const contactHours = "Mon – Fri, 9:00 AM – 6:00 PM";

// Default text for the floating WhatsApp chat
export const whatsappChatMessage = "Hi DineEatz! \nI'd like to know more about your restaurant management platform.";

export type Site = SiteSettings & {
  /** WhatsApp chat link carrying `msg`, or null when WhatsApp isn't configured. */
  waLink: (msg: string) => string | null;
  /** Free-trial length in days (settings value, or the default). */
  trialDayCount: number;
};

export const buildSite = (s: SiteSettings): Site => {
  const n = whatsappNumber(s.whatsapp);
  const fallback = whatsappHref(s.whatsapp); // e.g. a group invite link — can't carry text
  return {
    ...s,
    waLink: (msg) => (n ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : fallback),
    trialDayCount: parseTrialDays(s.trialDays),
  };
};

export const SiteCtx = createContext<Site>(buildSite(EMPTY_SITE_SETTINGS));
export const useSite = () => useContext(SiteCtx);

// Copy can carry {email} / {phone} / {location} / {days} placeholders so it
// always quotes the saved settings. Placeholders go in the English source and
// the translations alike, and are filled after translating. FAQ answers whose
// contact placeholder has no value are hidden ({days} always has one).
export const CONTACT_TOKENS = { email: "{email}", phone: "{phone}", location: "{location}" } as const;
export const faqMissing = (text: string, site: Site) =>
  (Object.keys(CONTACT_TOKENS) as (keyof typeof CONTACT_TOKENS)[]).some((k) => text.includes(CONTACT_TOKENS[k]) && !site[k]);
export const fillTokens = (text: string, site: Site) =>
  text
    .replaceAll(CONTACT_TOKENS.email, site.email)
    .replaceAll(CONTACT_TOKENS.phone, site.phone)
    .replaceAll(CONTACT_TOKENS.location, site.location)
    .replaceAll("{days}", String(site.trialDayCount));

export type AgentStyle = "card" | "chat" | "peek" | "pill" | "guided";
export const AGENT_STYLE: AgentStyle = "guided";

// Quick replies (used by the "chat" style)
export const agentQuickReplies = [
  { label: "💰 Pricing", message: "Hi DineEatz! Can you share your pricing plans?" },
  { label: "📅 Book a demo", message: "Hi DineEatz! I'd like to book a demo." },
  { label: "📱 QR ordering", message: "Hi DineEatz! Tell me more about QR table ordering." },
];

// Demo video: a YouTube link or a file path (e.g. "/videos/platesos-demo.mp4" in /public)
export const DEMO_VIDEO_URL = "/videos/platesos_teaser.mp4";

export const NAV = [
  { id: "home", label: "Home" },
  { id: "features", label: "Features" },
  { id: "products", label: "Products" },
  { id: "about", label: "About" },
  { id: "pricing", label: "Pricing" },
  { id: "contact", label: "Contact" },
];

export const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

// ====================
// LANGUAGE / i18n
// ====================
export type Lang = "en" | "hi" | "mr" | "kn";
export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "hi", label: "हिंदी", short: "हि" },
  { id: "mr", label: "मराठी", short: "मर" },
  { id: "kn", label: "ಕನ್ನಡ", short: "ಕನ" },
];

export type LangCtxValue = { lang: Lang; setLang: (l: Lang) => void; dict: Record<string, string> };
export const LangCtx = createContext<LangCtxValue>({ lang: "en", setLang: () => {}, dict: {} });
// Translate by English source string; falls back to English when a phrase isn't in the table.
export const useT = () => {
  const { lang, dict } = useContext(LangCtx);
  return (en: string) => (lang === "en" ? en : dict[en] ?? en);
};
export const DICT_LOADERS: Record<Exclude<Lang, "en">, () => Promise<{ default: Record<string, string> }>> = {
  hi: () => import("@/components/landing/i18n/hi"),
  mr: () => import("@/components/landing/i18n/mr"),
  kn: () => import("@/components/landing/i18n/kn"),
};
export const loadDict = (lang: Exclude<Lang, "en">) => DICT_LOADERS[lang]().then((m) => m.default);
export const Pill = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
    style={{ background: BRAND.soft, color: BRAND.primary }}>
    <Zap className="h-3 w-3" /> {children}
  </span>
);

export const Reveal = ({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) => (
  <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay }}>
    {children}
  </motion.div>
);

export const PrimaryBtn = ({ children, onClick, to }: { children: ReactNode; onClick?: () => void; to?: string }) => {
  const cls = "inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:brightness-110 transition";
  return to ? (
    <Link to={to} className={cls} style={{ background: BRAND.primary }}>{children}</Link>
  ) : (
    <button onClick={onClick} className={cls} style={{ background: BRAND.primary }}>{children}</button>
  );
};

export const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FEDA75"/><stop offset=".35" stopColor="#FA7E1E"/><stop offset=".6" stopColor="#D62976"/><stop offset="1" stopColor="#4F5BD5"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#ig)"/><rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" strokeWidth="1.8"/><circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.8"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/></svg>
);
export const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full"><rect width="24" height="24" rx="6" fill="#1877F2"/><path d="M13.3 20v-6.2h2.1l.3-2.4h-2.4V9.9c0-.7.2-1.2 1.2-1.2h1.3V6.6c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3v1.8H8.6v2.4h2.1V20h2.6z" fill="#fff"/></svg>
);
export const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full"><rect width="24" height="24" rx="6" fill="#25D366"/><path d="M12 5.2a6.8 6.8 0 0 0-5.9 10.2L5.2 18.8l3.5-.9A6.8 6.8 0 1 0 12 5.2zm0 12.3c-1 0-2-.3-2.8-.8l-.2-.1-2 .5.5-2-.1-.2a5.6 5.6 0 1 1 4.6 2.6zm3.1-4.2c-.2-.1-1-.5-1.2-.5-.2-.1-.3-.1-.4.1l-.5.7c-.1.1-.2.1-.4 0-.2-.1-.7-.3-1.4-.9-.5-.4-.9-1-1-1.2-.1-.2 0-.3.1-.4l.3-.3.2-.3v-.3l-.5-1.3c-.1-.3-.3-.3-.4-.3h-.4c-.1 0-.3.1-.5.2-.2.2-.7.7-.7 1.6s.7 1.9.8 2c.1.1 1.4 2.1 3.3 2.9 1.6.6 1.9.5 2.3.5.4-.1 1-.4 1.2-.8.1-.4.1-.8.1-.8-.1-.1-.2-.1-.4-.2z" fill="#fff"/></svg>
);
export const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full"><rect width="24" height="24" rx="6" fill="#0A66C2"/><path d="M8.3 18H5.8v-7.8h2.5V18zM7 9.1a1.4 1.4 0 1 1 0-2.9 1.4 1.4 0 0 1 0 2.9zM18.2 18h-2.5v-3.8c0-.9 0-2.1-1.3-2.1s-1.5 1-1.5 2V18h-2.5v-7.8h2.4v1.1c.3-.6 1.1-1.3 2.3-1.3 2.5 0 3 1.6 3 3.8V18z" fill="#fff"/></svg>
);

// Only the networks with a valid saved link are rendered.
export const socialsFor = (site: Site) => [
  { key: "instagram", name: "Instagram", href: safeUrl(site.instagram), Icon: InstagramIcon },
  { key: "facebook", name: "Facebook", href: safeUrl(site.facebook), Icon: FacebookIcon },
  { key: "whatsapp", name: "WhatsApp", href: whatsappHref(site.whatsapp), Icon: WhatsAppIcon },
  { key: "linkedin", name: "LinkedIn", href: safeUrl(site.linkedin), Icon: LinkedInIcon },
].filter((s): s is typeof s & { href: string } => !!s.href);

// ====================
// NAVBAR
// ====================
export const FitScale = ({ w, h, children }: { w: number; h: number; children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / w));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={ref} className="w-full flex justify-center">
      <div style={{ width: w * scale, height: h * scale }}>
        <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
};

// ====================
// PRODUCT CAROUSEL — slide mockups
// ====================
export const Tablet = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[28px] bg-slate-900 p-3 shadow-2xl shadow-slate-900/30 w-[440px] shrink-0">
    <div className="rounded-[18px] bg-white overflow-hidden h-[280px] flex text-[10px]">{children}</div>
  </div>
);

export const Phone_ = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[26px] bg-slate-900 p-2 shadow-2xl shadow-slate-900/40 w-[150px]">
    <div className="rounded-[20px] bg-white overflow-hidden h-[290px] text-[9px]">{children}</div>
  </div>
);

export const Sidebar = ({ active }: { active: string }) => (
  <div className="w-24 border-r border-slate-100 p-2 space-y-1">
    <div className="flex items-center gap-1 font-bold mb-2" style={{ color: BRAND.dark }}>
      <span className="h-4 w-4 rounded grid place-items-center text-white" style={{ background: BRAND.primary }}><Utensils className="h-2.5 w-2.5"/></span>DineEatz
    </div>
    {["Dashboard", "Orders", "Menu", "Tables", "Kitchen", "Reports", "Settings"].map((i) => (
      <div key={i} className="rounded px-1.5 py-1"
        style={i === active ? { background: BRAND.soft, color: BRAND.primary, fontWeight: 600 } : { color: "#64748b" }}>{i}</div>
    ))}
  </div>
);

export const Status = ({ s }: { s: string }) => {
  const map: Record<string, string> = { Preparing: "bg-amber-100 text-amber-700", Delivered: "bg-emerald-100 text-emerald-700", Ready: "bg-blue-100 text-blue-700", New: "bg-rose-100 text-rose-700" };
  return <span className={`rounded px-1.5 py-0.5 text-[8px] font-medium ${map[s]}`}>{s}</span>;
};

export const DashboardSlide = () => (
  <div className="relative flex items-end">
    <div className="relative z-10 -mr-16 mb-[-10px]">
      <Phone_>
        <div className="p-2">
          <div className="font-bold mb-1" style={{ color: BRAND.primary }}>DineEatz</div>
          <div className="h-24 rounded-lg bg-gradient-to-br from-orange-200 via-amber-300 to-red-300 grid place-items-center text-2xl">🍛</div>
          <div className="font-semibold mt-2">Paneer Butter Masala</div>
          <div className="text-slate-400">Rich & creamy, served with naan</div>
          <div className="font-semibold mt-1">₹290</div>
          <div className="mt-2 rounded-md text-white text-center py-1" style={{ background: BRAND.primary }}>Add to cart</div>
        </div>
      </Phone_>
    </div>
    <Tablet>
      <Sidebar active="Dashboard" />
      <div className="flex-1 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-2"><div className="text-slate-400">Total Orders</div><div className="text-sm font-bold">142</div><div className="text-emerald-600">↑ 10%</div></div>
          <div className="rounded-lg border p-2"><div className="text-slate-400">Today's Revenue</div><div className="text-sm font-bold">₹28,450</div><div className="text-emerald-600">↑ 10%</div></div>
        </div>
        <div className="rounded-lg border p-2">
          <div className="font-semibold">Sales Overview</div>
          <svg viewBox="0 0 200 50" className="w-full h-12"><polyline fill="none" stroke={BRAND.primary} strokeWidth="2" points="0,40 20,32 40,36 60,24 80,28 100,18 120,22 140,12 160,16 180,6 200,10"/></svg>
        </div>
        <div className="rounded-lg border p-2 space-y-1">
          <div className="font-semibold">Recent Orders</div>
          {[["Paneer Butter Masala", "Preparing"], ["Margherita Pizza", "Delivered"], ["Cold Coffee", "Delivered"]].map(([n, s]) => (
            <div key={n} className="flex justify-between items-center"><span>{n}</span><Status s={s} /></div>
          ))}
        </div>
      </div>
    </Tablet>
  </div>
);

// Realistic QR mock: 25×25 grid with finder, timing & alignment patterns + centre logo
export const QR_N = 25;
export const inBox = (r: number, c: number, r0: number, c0: number, s: number) =>
  r >= r0 && r < r0 + s && c >= c0 && c < c0 + s;
export const ring = (r: number, c: number, r0: number, c0: number, s: number) => {
  const y = r - r0, x = c - c0;
  return y === 0 || x === 0 || y === s - 1 || x === s - 1 || (y >= 2 && y <= s - 3 && x >= 2 && x <= s - 3);
};
export const QR_CELLS: [number, number][] = (() => {
  const out: [number, number][] = [];
  const finders = [[0, 0], [0, QR_N - 7], [QR_N - 7, 0]];
  for (let r = 0; r < QR_N; r++) {
    for (let c = 0; c < QR_N; c++) {
      let dark: boolean;
      const f = finders.find(([fr, fc]) => inBox(r, c, fr - 1, fc - 1, 9));
      if (f) dark = inBox(r, c, f[0], f[1], 7) && ring(r, c, f[0], f[1], 7);
      else if (inBox(r, c, 16, 16, 5)) dark = ring(r, c, 16, 16, 5);
      else if (r === 6 || c === 6) dark = (r + c) % 2 === 0;
      else if (inBox(r, c, 9, 9, 7)) dark = false; // logo space
      else {
        const n = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453;
        dark = n - Math.floor(n) > 0.5;
      }
      if (dark) out.push([r, c]);
    }
  }
  return out;
})();

export const QRCodeMock = () => (
  <div className="relative mx-auto w-32 h-32">
    <svg viewBox={`-1 -1 ${QR_N + 2} ${QR_N + 2}`} className="w-full h-full" shapeRendering="crispEdges" aria-label="QR code for Table 5">
      <rect x={-1} y={-1} width={QR_N + 2} height={QR_N + 2} fill="#fff" />
      {QR_CELLS.map(([r, c]) => <rect key={`${r}-${c}`} x={c} y={r} width={1.02} height={1.02} fill={BRAND.dark} />)}
    </svg>
    <span className="absolute inset-0 m-auto h-7 w-7 rounded-md grid place-items-center text-white ring-2 ring-white"
      style={{ background: BRAND.primary }}>
      <Utensils className="h-4 w-4" />
    </span>
  </div>
);

export const QRSlide = () => (
  <div className="flex items-center gap-6">
    <div className="rounded-2xl bg-white shadow-xl p-5 w-44 text-center">
      <div className="font-bold text-lg" style={{ color: BRAND.dark }}>Table 5</div>
      <div className="text-xs text-slate-400 mb-3">Scan to order</div>
      <QRCodeMock />
      <div className="mt-3 text-xs font-medium" style={{ color: BRAND.primary }}>dineeatz.com/t/5</div>
    </div>
    <Phone_>
      <div className="p-2 space-y-1.5">
        <div className="flex justify-between font-semibold"><span>Table 5</span><span style={{ color: BRAND.primary }}>Menu</span></div>
        {[["🍕", "Margherita", "₹340"], ["🍔", "Veg Burger", "₹180"], ["☕", "Cold Coffee", "₹150"], ["🍜", "Hakka Noodles", "₹220"]].map(([e, n, p]) => (
          <div key={n} className="flex items-center gap-1.5 rounded-lg border p-1.5">
            <span className="text-base">{e}</span><div className="flex-1"><div className="font-medium">{n}</div><div className="text-slate-400">{p}</div></div>
            <span className="rounded px-1 text-white" style={{ background: BRAND.primary }}>+</span>
          </div>
        ))}
        <div className="rounded-md text-white text-center py-1.5 font-semibold" style={{ background: BRAND.primary }}>Place order · ₹520</div>
      </div>
    </Phone_>
  </div>
);

export const OnlineSlide = () => (
  <Tablet>
    <div className="flex-1 flex flex-col">
      <div className="h-16 bg-gradient-to-r from-blue-600 to-sky-400 text-white p-3">
        <div className="font-bold text-sm">Spice Garden</div><div>Order online · Delivery in 30 min</div>
      </div>
      <div className="p-3 grid grid-cols-3 gap-2 flex-1">
        {[["🍛", "Butter Chicken", "₹360"], ["🥗", "Greek Salad", "₹240"], ["🍝", "Alfredo Pasta", "₹310"], ["🍰", "Cheesecake", "₹190"], ["🥤", "Mojito", "₹140"], ["🌯", "Paneer Wrap", "₹200"]].map(([e, n, p]) => (
          <div key={n} className="rounded-lg border p-2 flex flex-col">
            <div className="h-10 rounded bg-slate-50 grid place-items-center text-xl">{e}</div>
            <div className="font-medium mt-1">{n}</div>
            <div className="flex justify-between items-center mt-auto"><span className="text-slate-500">{p}</span><span className="rounded px-1.5 text-white" style={{ background: BRAND.primary }}>Add</span></div>
          </div>
        ))}
      </div>
    </div>
    <div className="w-32 border-l border-slate-100 p-2 space-y-1.5">
      <div className="font-semibold">Your cart</div>
      <div className="flex justify-between"><span>Butter Chicken</span><span>₹360</span></div>
      <div className="flex justify-between"><span>Mojito ×2</span><span>₹280</span></div>
      <div className="border-t pt-1 flex justify-between font-bold"><span>Total</span><span>₹640</span></div>
      <div className="text-slate-400">UPI · PhonePe · GPay</div>
      <div className="rounded-md text-white text-center py-1" style={{ background: BRAND.primary }}>Checkout</div>
    </div>
  </Tablet>
);

export const KitchenSlide = () => (
  <Tablet>
    <div className="flex-1 p-3">
      <div className="flex justify-between mb-2"><span className="font-bold text-sm">Kitchen Display</span><span className="text-emerald-600">● Live</span></div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { col: "New", items: [["T3", "Veg Burger ×2"], ["T8", "Masala Dosa"]] },
          { col: "Preparing", items: [["T5", "Paneer Butter Masala"], ["#41", "Hakka Noodles"]] },
          { col: "Ready", items: [["T1", "Cold Coffee ×3"], ["#39", "Margherita"]] },
        ].map((c) => (
          <div key={c.col} className="rounded-lg bg-slate-50 p-2 space-y-1.5">
            <div className="flex justify-between font-semibold"><span>{c.col}</span><Status s={c.col} /></div>
            {c.items.map(([t, i]) => (
              <div key={t} className="rounded-md bg-white border p-1.5">
                <div className="font-bold" style={{ color: BRAND.primary }}>{t}</div><div>{i}</div>
                <div className="text-slate-400">{c.col === "New" ? "just now" : "6 min"}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </Tablet>
);

export const AnalyticsSlide = () => (
  <Tablet>
    <Sidebar active="Reports" />
    <div className="flex-1 p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {[["Revenue", "₹4.2L"], ["Orders", "3,812"], ["Avg ticket", "₹412"]].map(([k, v]) => (
          <div key={k} className="rounded-lg border p-2"><div className="text-slate-400">{k}</div><div className="text-sm font-bold">{v}</div></div>
        ))}
      </div>
      <div className="rounded-lg border p-2">
        <div className="font-semibold mb-1">Weekly revenue</div>
        <div className="flex items-end gap-2 h-20">
          {[40, 65, 50, 80, 70, 95, 85].map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 5 ? BRAND.primary : "#BFDBFE" }} />
          ))}
        </div>
      </div>
      <div className="rounded-lg border p-2 space-y-1">
        <div className="font-semibold">Top items</div>
        {[["Paneer Butter Masala", 82], ["Cold Coffee", 64], ["Veg Burger", 48]].map(([n, v]) => (
          <div key={n as string} className="flex items-center gap-2"><span className="w-28">{n}</span>
            <div className="flex-1 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded" style={{ width: `${v}%`, background: BRAND.primary }} /></div></div>
        ))}
      </div>
    </div>
  </Tablet>
);

export const SLIDES = [
  { label: "Dashboard", icon: LayoutDashboard, Comp: DashboardSlide },
  { label: "QR Table Ordering", icon: QrCode, Comp: QRSlide },
  { label: "Online Ordering", icon: ShoppingCart, Comp: OnlineSlide },
  { label: "Kitchen Operations", icon: ChefHat, Comp: KitchenSlide },
  { label: "Analytics", icon: BarChart3, Comp: AnalyticsSlide },
];

export const ProductCarousel = () => {
  const t = useT();
  const [[index, dir], setState] = useState<[number, number]>([0, 1]);
  const [paused, setPaused] = useState(false);
  const go = (d: number) => setState(([i]) => [(i + d + SLIDES.length) % SLIDES.length, d]);
  const jump = (i: number) => setState(([cur]) => [i, i > cur ? 1 : -1]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => go(1), 3500);
    return () => clearInterval(t);
  }, [paused]);

  const { Comp, icon: Icon, label } = SLIDES[index];
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="relative">
      <div className="flex justify-center mb-4 h-9">
        <motion.div layout transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center rounded-full px-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 overflow-hidden"
          style={{ background: BRAND.primary }} aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={label}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }} className="inline-flex items-center gap-2 whitespace-nowrap">
              <Icon className="h-4 w-4" />{t(label)}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>
      <FitScale w={540} h={340}>
        <div className="relative h-full w-full grid place-items-center overflow-hidden">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={index} custom={dir}
              initial={{ opacity: 0, x: dir * 60, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: dir * -60, scale: 0.96 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
              <Comp />
            </motion.div>
          </AnimatePresence>
        </div>
      </FitScale>
      <div className="mt-4 flex items-center justify-center gap-4">
        <button aria-label="Previous slide" onClick={() => go(-1)} className="h-9 w-9 rounded-full bg-white shadow grid place-items-center hover:bg-slate-50" style={{ color: BRAND.primary }}><ChevronLeft className="h-4 w-4" /></button>
        <div className="flex gap-1.5">
          {SLIDES.map((s, i) => (
            <button key={s.label} aria-label={`Go to ${s.label}`} onClick={() => jump(i)}
              className="h-2 rounded-full transition-all" style={{ width: i === index ? 22 : 8, background: i === index ? BRAND.primary : "#cbd5e1" }} />
          ))}
        </div>
        <button aria-label="Next slide" onClick={() => go(1)} className="h-9 w-9 rounded-full bg-white shadow grid place-items-center hover:bg-slate-50" style={{ color: BRAND.primary }}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
};
