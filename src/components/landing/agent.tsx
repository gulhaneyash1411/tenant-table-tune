import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion, type TargetAndTransition } from "framer-motion";
import { X } from "lucide-react";
import { BRAND, whatsappChatMessage, useSite, faqMissing, fillTokens, AgentStyle, AGENT_STYLE, agentQuickReplies, scrollTo, useT, WhatsAppIcon, ring } from "@/components/landing/shared";

type FaqCategory = "Features" | "Pricing" | "Setup" | "Products" | "Support";

type Faq = { c: FaqCategory; q: string; a: string };

const FAQS: Faq[] = [
  // ---------- Features ----------
  {
    c: "Features",
    q: "What exactly does DineEatz do?",
    a: "DineEatz runs your day-to-day restaurant operations in one place — QR table ordering, online ordering, table bookings, kitchen tickets, billing, reports and invoices.",
  },
  {
    c: "Features",
    q: "How does QR table ordering work?",
    a: "Every table gets its own QR code. Guests scan, browse your live menu, order and pay from their phone, and the order reaches your kitchen with the table number already attached.",
  },
  {
    c: "Features",
    q: "Do my customers need to download an app?",
    a: "No. Guests scan the QR code and your menu opens in their phone's browser — there is nothing to download, install or sign up for.",
  },
  {
    c: "Features",
    q: "Can guests pay from their own phone?",
    a: "Yes. Guests can pay by UPI, card or wallet while ordering, or you can keep pay-at-counter on and collect at billing as usual.",
  },
  {
    c: "Features",
    q: "Which payment modes are supported?",
    a: "UPI, credit and debit cards, popular wallets, and cash at the counter — and every payment is tagged by mode in your reports.",
  },
  {
    c: "Features",
    q: "Can I update my menu and prices myself?",
    a: "Yes. Items, prices, photos, add-ons and out-of-stock toggles update instantly across every table QR code and your online ordering page.",
  },
  {
    c: "Features",
    q: "Can I take table bookings and reservations online?",
    a: "Yes. Guests can request a table from your page, and you confirm, move or cancel bookings on a live floor plan that shows which tables are free.",
  },
  {
    c: "Features",
    q: "Can I see live table status and a floor plan?",
    a: "Yes. The floor plan shows which tables are occupied, which have ordered and which are waiting to pay, updating as orders come in.",
  },
  {
    c: "Features",
    q: "Does DineEatz handle takeaway orders?",
    a: "Yes. Your online ordering page accepts takeaway orders directly, with no commission taken on them.",
  },
  {
    c: "Features",
    q: "Does it print KOT tickets for the kitchen?",
    a: "Yes. Connect any standard thermal printer and each order prints as a KOT — or skip paper entirely and use the kitchen display screen instead.",
  },
  {
    c: "Features",
    q: "Can I run offers, coupons and discounts?",
    a: "Yes. Create percentage or flat-value coupons, happy-hour offers and item-level discounts, and switch them on or off whenever you like.",
  },
  {
    c: "Features",
    q: "Can I manage staff accounts and permissions?",
    a: "Yes. Add managers, cashiers and kitchen staff with role-based access, so each person only sees the screens they need.",
  },
  {
    c: "Features",
    q: "Can I track daily sales and best-selling items?",
    a: "Yes. The dashboard shows today's sales, order count and average bill value, along with your best-selling and slowest-moving items.",
  },
  {
    c: "Features",
    q: "Does it work for multiple outlets or branches?",
    a: "Yes. The Enterprise plan adds multi-branch control from a single login, with branch-level menus and pricing plus consolidated reporting across outlets.",
  },
  {
    c: "Features",
    q: "Do I get GST-ready invoices and reports?",
    a: "Yes. Every order produces a GST-ready invoice, and daily, item-wise and payment-mode reports can be viewed or exported at any time.",
  },
  {
    c: "Features",
    q: "Can I show my menu in more than one language?",
    a: "Yes. Item names and descriptions can be entered in the language your guests read, and this site itself is available in English, Hindi, Marathi and Kannada.",
  },
  {
    c: "Features",
    q: "Do I need special hardware to use DineEatz?",
    a: "No. DineEatz runs in any modern browser — on a phone, tablet, laptop or your existing billing computer. A thermal printer and a kitchen display screen are optional.",
  },
  {
    c: "Features",
    q: "What happens if my internet goes down?",
    a: "DineEatz is cloud-based, so it needs a connection. Guests order over their own mobile data, so table ordering keeps working even when your Wi-Fi drops — keep a backup hotspot for billing.",
  },

  // ---------- Pricing ----------
  {
    c: "Pricing",
    q: "How much does DineEatz cost?",
    a: "Starter is ₹999 a month and Growth is ₹2,499 a month, both billed flat with no commission. Enterprise is priced to your chain — talk to sales for a quote.",
  },
  {
    c: "Pricing",
    q: "Do you charge commission on orders?",
    a: "Never. You keep 100% of every order value and pay only a flat monthly plan fee, no matter how many orders you take.",
  },
  {
    c: "Pricing",
    q: "Is there a free trial?",
    a: "Yes — a {days}-day free trial on every plan. You can explore the full product first and cancel any time before the trial ends.",
  },
  {
    c: "Pricing",
    q: "Which plan should I start with?",
    a: "Starter fits a single-outlet café, Growth fits a busy restaurant that needs online ordering and a kitchen display, and Enterprise fits chains and multi-branch operations.",
  },
  {
    c: "Pricing",
    q: "Are there any setup or hidden fees?",
    a: "No setup fee and no hidden charges — your plan price is what you pay. Printed QR table products are the only separate, optional cost.",
  },
  {
    c: "Pricing",
    q: "How can I pay for my subscription?",
    a: "UPI, credit or debit card, net banking and bank transfer are all accepted, and you get a GST invoice for every payment.",
  },
  {
    c: "Pricing",
    q: "What is your refund and cancellation policy?",
    a: "The {days}-day trial means you only pay once you're sure. After that you can cancel any time and you won't be billed from the next cycle — write to support for anything specific to your account.",
  },
  {
    c: "Pricing",
    q: "Is there a discount for annual billing or multiple outlets?",
    a: "Yes — annual plans and multi-outlet accounts are priced lower per outlet. Tell us your outlet count and we'll share a quote.",
  },
  {
    c: "Pricing",
    q: "Can I change or cancel my plan later?",
    a: "Yes. Upgrade, downgrade or cancel from your dashboard whenever you like — changes take effect from your next billing cycle.",
  },

  // ---------- Setup ----------
  {
    c: "Setup",
    q: "How long does setup take?",
    a: "Most restaurants go live the same day. Once your menu is in, your table QR codes and ordering page are generated straight away.",
  },
  {
    c: "Setup",
    q: "Can I try DineEatz before paying?",
    a: "Yes. Start a {days}-day free trial with no card details, set up your real menu, and decide at the end of it.",
  },
  {
    c: "Setup",
    q: "Can I book a demo with your team?",
    a: "Yes. Pick “Book a demo” in the contact form or message us on WhatsApp, and we'll walk you through the product on a call at a time that suits you.",
  },
  {
    c: "Setup",
    q: "Do you help with menu upload and onboarding?",
    a: "Yes. Share your existing menu in any format — PDF, Excel or even photos — and our team sets it up and walks your staff through the basics.",
  },
  {
    c: "Setup",
    q: "Do you train my staff on the system?",
    a: "Yes. We run a short walkthrough for your managers and kitchen staff, and leave you with simple guides they can refer back to.",
  },
  {
    c: "Setup",
    q: "How do I get my table QR codes printed?",
    a: "Download print-ready QR PDFs from your dashboard and use any local printer, or order our printed table tents, tissue boxes and condiment caddies.",
  },
  {
    c: "Setup",
    q: "Can I keep my current POS or billing software?",
    a: "In most cases yes — DineEatz can run alongside your billing system while orders flow in digitally. Tell us what you use and we'll confirm before you commit.",
  },

  // ---------- Products ----------
  {
    c: "Products",
    q: "What QR table products do you supply?",
    a: "Table tents, tissue-box holders and condiment-caddy wraps, each printed with your branding and a QR code mapped to a specific table.",
  },
  {
    c: "Products",
    q: "Is the printing customised to my brand?",
    a: "Yes. Your logo, colours and a short call-to-action go on every piece, and you approve a digital proof before anything goes to print.",
  },
  {
    c: "Products",
    q: "How do I order QR table products?",
    a: "Pick a product in the Products section above, tell us your table count, and we'll send a quote with pricing and delivery timelines.",
  },

  // ---------- Support ----------
  {
    c: "Support",
    q: "How do I reach your support team?",
    a: "Email {email} and we respond within 24 hours, or call {phone} between Mon – Fri, 9:00 AM – 6:00 PM. WhatsApp works too.",
  },
  {
    c: "Support",
    q: "How quickly do you reply to support requests?",
    a: "Email gets a reply within 24 hours, and WhatsApp or phone is usually answered within the same working hour, Mon – Fri, 9:00 AM – 6:00 PM.",
  },
  {
    c: "Support",
    q: "Which languages is DineEatz available in?",
    a: "The platform and this site are available in English, Hindi, Marathi and Kannada, and support is available in all four.",
  },
  {
    c: "Support",
    q: "Where are you based?",
    a: "We're based in {location}, and remote support is available across the country — so your location is never a problem.",
  },
  {
    c: "Support",
    q: "Is my restaurant's data safe?",
    a: "Your data stays yours. It is stored on encrypted servers, access is limited by staff role, and you can export or request deletion of your data at any time.",
  },
];

// ---- the bot's browse helpers (tap-only: no typing anywhere) ----
const FAQ_CATEGORIES: FaqCategory[] = ["Features", "Pricing", "Setup", "Products", "Support"];

// Offered first, before any topic is picked. Each must match a question above exactly.
const FAQ_POPULAR = [
  "How much does DineEatz cost?",
  "Do you charge commission on orders?",
  "Is there a free trial?",
  "Do my customers need to download an app?",
  "How do I reach your support team?",
];

const faqIn = (c: FaqCategory) => FAQS.filter((f) => f.c === c);
const faqFor = (q: string) => FAQS.find((f) => f.q === q);

// Handover message — always English so your team reads one consistent format.
const buildAskMessage = (asked: Faq[]) =>
  asked.length
    ? [
        "Hi DineEatz! I read these answers on your site:",
        ...asked.map((f) => `• ${f.q}`),
        "",
        "I'd like to know more.",
      ].join("\n")
    : whatsappChatMessage;

// ====================
// FLOATING DINEEATZ AGENT (robot launcher + panel)
// ====================
const AgentAvatar = () => {
  const reduce = useReducedMotion();
  const loop = (t: TargetAndTransition) => (reduce ? undefined : t);
  const fillBox = { transformBox: "fill-box" as const };
  return (
    <motion.svg viewBox="0 0 120 120" className="h-full w-full drop-shadow-xl" aria-hidden="true"
      animate={loop({ y: [0, -4, 0] })} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
      <defs>
        <radialGradient id="ag-head" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#CFE2FF" /></radialGradient>
        <linearGradient id="ag-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4DA3FF" /><stop offset="1" stopColor="#0B7BFF" /></linearGradient>
        <linearGradient id="ag-visor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1E3A8A" /><stop offset="1" stopColor="#0B1B3F" /></linearGradient>
        <radialGradient id="ag-glow"><stop offset="0" stopColor="#9FD0FF" /><stop offset="1" stopColor="#0B7BFF" /></radialGradient>
      </defs>
      <ellipse cx="60" cy="114" rx="26" ry="4" fill="#0B1B3F" opacity=".12" />
      {/* body */}
      <rect x="38" y="80" width="44" height="30" rx="14" fill="url(#ag-body)" />
      <rect x="50" y="88" width="20" height="10" rx="5" fill="#fff" opacity=".9" />
      <circle cx="55" cy="93" r="2" fill="#25D366" /><circle cx="61" cy="93" r="2" fill="#0B7BFF" /><circle cx="67" cy="93" r="2" fill="#FFB020" />
      {/* left arm */}
      <rect x="28" y="84" width="12" height="20" rx="6" fill="url(#ag-body)" />
      {/* antenna */}
      <line x1="60" y1="28" x2="60" y2="14" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
      <motion.circle cx="60" cy="11" r="5" fill="url(#ag-glow)" style={{ ...fillBox, transformOrigin: "center" }}
        animate={loop({ scale: [1, 1.25, 1], opacity: [1, 0.75, 1] })} transition={{ duration: 1.8, repeat: Infinity }} />
      {/* ears */}
      <rect x="20" y="46" width="10" height="20" rx="5" fill="url(#ag-body)" />
      <rect x="90" y="46" width="10" height="20" rx="5" fill="url(#ag-body)" />
      {/* head */}
      <rect x="26" y="26" width="68" height="58" rx="26" fill="url(#ag-head)" stroke="#BFDBFE" strokeWidth="1.5" />
      <ellipse cx="44" cy="36" rx="10" ry="5" fill="#fff" opacity=".8" />
      {/* visor + face */}
      <rect x="35" y="42" width="50" height="30" rx="15" fill="url(#ag-visor)" />
      {[50, 70].map((cx) => (
        <motion.ellipse key={cx} cx={cx} cy="55" rx="4.5" ry="5.5" fill="#7CE7FF" style={{ ...fillBox, transformOrigin: "center" }}
          animate={loop({ scaleY: [1, 1, 0.1, 1] })} transition={{ duration: 4, times: [0, 0.9, 0.95, 1], repeat: Infinity }} />
      ))}
      <path d="M53 63 Q60 68 67 63" stroke="#7CE7FF" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="41" cy="66" rx="3" ry="2" fill="#FF8FB1" opacity=".7" />
      <ellipse cx="79" cy="66" rx="3" ry="2" fill="#FF8FB1" opacity=".7" />
      {/* waving right arm */}
      <motion.g style={{ transformBox: "view-box", transformOrigin: "80px 92px" }}
        animate={loop({ rotate: [0, 18, -4, 18, 0] })} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}>
        <line x1="80" y1="92" x2="101" y2="72" stroke="url(#ag-body)" strokeWidth="11" strokeLinecap="round" />
        <circle cx="103" cy="69" r="7" fill="url(#ag-head)" stroke="#BFDBFE" />
      </motion.g>
    </motion.svg>
  );
};

const AGENT_COPY = {
  title: "Hi! I'm the DineEatz Agent 👋",
  body: "Want to know more about our platform? Chat with us.",
};

type PanelProps = { touch: boolean; onClose: () => void };

const CloseBtn = ({ onClose, className = "", light = false }: { onClose: () => void; className?: string; light?: boolean }) => (
  <button onClick={onClose} aria-label="Close"
    className={`${light ? "text-white/80 hover:text-white" : "text-slate-400 hover:text-slate-600"} ${className}`}>
    <X className="h-4 w-4" />
  </button>
);

const ChatButton = ({ small = false, className = "", message = whatsappChatMessage, label = "Chat with us" }:
  { small?: boolean; className?: string; message?: string; label?: string }) => {
  const t = useT();
  const href = useSite().waLink(message);
  if (!href) return null;
  return (
    <motion.a href={href} target="_blank" rel="noopener noreferrer" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      className={`inline-flex items-center justify-center gap-2 bg-[#25D366] font-semibold text-white shadow-lg shadow-green-600/25 hover:brightness-95 ${
        small ? "rounded-full px-3.5 py-1.5 text-xs" : "w-full rounded-xl py-2.5 text-sm"} ${className}`}>
      <span className={`${small ? "h-4 w-4" : "h-5 w-5"} overflow-hidden rounded`}><WhatsAppIcon /></span>
      {t(label)}
    </motion.a>
  );
};

const OnlineStatus = ({ label = "Online · replies fast" }: { label?: string }) => {
  const t = useT();
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {t(label)}
    </div>
  );
};

const panelMotion = {
  initial: { opacity: 0, y: 16, scale: 0.9 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 12, scale: 0.95 },
  transition: { type: "spring" as const, stiffness: 320, damping: 24 },
  style: { transformOrigin: "bottom right" },
};

// Shared gradient header for the chat-style panels
const AgentHeader = ({ typing, touch, onClose }: { typing: boolean; touch: boolean; onClose: () => void }) => {
  const t = useT();
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: `linear-gradient(135deg, #3D9BFF, ${BRAND.primary})` }}>
      <div className="h-11 w-11 shrink-0 rounded-full bg-white/20 p-0.5"><AgentAvatar /></div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{t("DineEatz Agent")}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/90">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{typing ? t("typing…") : t("Online · replies fast")}
        </div>
      </div>
      {touch && <CloseBtn onClose={onClose} light />}
    </div>
  );
};

// ---- Style 1: CARD (robot peeking over a card) ----
const CardPanel = ({ touch, onClose }: PanelProps) => {
  const t = useT();
  return (
    <motion.div {...panelMotion} id="dineeatz-agent" role="dialog" aria-label="DineEatz Agent"
      className="relative w-[300px] max-w-[calc(100vw-2.5rem)]">
      <motion.div className="absolute -top-10 left-3 z-10 h-24 w-24"
        initial={{ y: 24, opacity: 0, rotate: -10 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 15 }}>
        <AgentAvatar />
      </motion.div>
      <div className="relative rounded-2xl bg-white/95 backdrop-blur border border-slate-100 shadow-2xl shadow-slate-900/15 p-5">
        {touch && <CloseBtn onClose={onClose} className="absolute top-3 right-3" />}
        <div className="pl-24 min-h-[2.75rem]">
          <div className="font-bold text-sm" style={{ color: BRAND.dark }}>{t("DineEatz Agent")}</div>
          <div className="mt-0.5"><OnlineStatus /></div>
        </div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="mt-3 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm" style={{ background: BRAND.soft, color: BRAND.dark }}>
          <p className="font-semibold">{t(AGENT_COPY.title)}</p>
          <p className="mt-0.5 text-slate-600">{t(AGENT_COPY.body)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-4">
          <ChatButton />
        </motion.div>
        <span className="absolute -bottom-2 right-5 h-4 w-4 rotate-45 bg-white border-r border-b border-slate-100" />
      </div>
    </motion.div>
  );
};

// ---- Style 2: CHAT PREVIEW (typing dots → messages → quick replies) ----
const TypingDots = () => (
  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
    className="inline-flex gap-1 rounded-2xl rounded-tl-sm bg-white px-3.5 py-3 shadow-sm" aria-label="Agent is typing">
    {[0, 1, 2].map((i) => (
      <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400"
        animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
    ))}
  </motion.div>
);

const Bubble = ({ children }: { children: ReactNode }) => (
  <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ type: "spring", stiffness: 320, damping: 22 }} style={{ transformOrigin: "top left", color: BRAND.dark }}
    className="w-fit max-w-[88%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2 text-sm shadow-sm">
    {children}
  </motion.div>
);

const UserBubble = ({ children }: { children: ReactNode }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm text-white shadow-sm"
    style={{ background: BRAND.primary }}>
    {children}
  </motion.div>
);

const ChatPanel = ({ touch, onClose }: PanelProps) => {
  const t = useT();
  const { waLink } = useSite();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? 3 : 0);
  useEffect(() => {
    if (reduce) return;
    const ts = [900, 1700, 2200].map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, [reduce]);
  const typing = step < 2;

  return (
    <motion.div {...panelMotion} id="dineeatz-agent" role="dialog" aria-label="DineEatz Agent"
      className="w-[320px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-2xl shadow-slate-900/20">
      <AgentHeader typing={typing} touch={touch} onClose={onClose} />

      <div className="space-y-2 px-4 py-4 min-h-[190px]" style={{ background: "#F4F8FF" }} aria-live="polite">
        {step >= 1 && <Bubble><span className="font-semibold">{t(AGENT_COPY.title)}</span></Bubble>}
        {step >= 2 && <Bubble>{t(AGENT_COPY.body)}</Bubble>}
        <AnimatePresence>{typing && <TypingDots key={`t${step}`} />}</AnimatePresence>
        {step >= 3 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {waLink(whatsappChatMessage) && agentQuickReplies.map((q, i) => (
              <motion.a key={q.label} href={waLink(q.message) ?? undefined} target="_blank" rel="noopener noreferrer"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#EAF3FF] transition-colors"
                style={{ color: BRAND.primary }}>
                {t(q.label)}
              </motion.a>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 p-3"><ChatButton /></div>
    </motion.div>
  );
};

// ---- Style 5: GUIDED (auto questions → tap options → WhatsApp with summary) ----
// Edit FLOW to change questions. Each option's `next` is another step id or FLOW_END.
type FlowOption = { label: string; next: string };
type FlowStep = { question: string; options: FlowOption[] };
type Answer = { stepId: string; label: string };

const FLOW_START = "start";
const FLOW_END = "done";
const FLOW_ASK = "ask"; // typed question → answered from the knowledge base above

const FLOW: Record<string, FlowStep> = {
  start: {
    question: "What can I help you with today?",
    options: [
      { label: "💬 Ask a question", next: FLOW_ASK },
      { label: "💰 Pricing & plans", next: "outlets" },
      { label: "📅 Book a demo", next: "outlets" },
      { label: "🪧 QR table products", next: "product" },
      { label: "🛠️ Support", next: "support" },
    ],
  },
  outlets: {
    question: "How many outlets do you run?",
    options: [
      { label: "1 outlet", next: "business" },
      { label: "2–5 outlets", next: "business" },
      { label: "6+ outlets", next: "business" },
    ],
  },
  business: {
    question: "What type of business is it?",
    options: [
      { label: "Café", next: "feature" },
      { label: "Restaurant", next: "feature" },
      { label: "Cloud kitchen", next: "feature" },
      { label: "QSR / Fast food", next: "feature" },
    ],
  },
  feature: {
    question: "Which feature matters most to you?",
    options: [
      { label: "QR table ordering", next: FLOW_END },
      { label: "Online ordering", next: FLOW_END },
      { label: "Table bookings", next: FLOW_END },
      { label: "Kitchen & reports", next: FLOW_END },
    ],
  },
  product: {
    question: "Which product are you interested in?",
    options: [
      { label: "Condiment Holder QR", next: "tables" },
      { label: "L-Shaped Table Tent QR", next: "tables" },
      { label: "Tissue Box QR Branding", next: "tables" },
      { label: "Not sure yet", next: "tables" },
    ],
  },
  tables: {
    question: "Roughly how many tables do you have?",
    options: [
      { label: "Under 10", next: FLOW_END },
      { label: "10–25", next: FLOW_END },
      { label: "25–50", next: FLOW_END },
      { label: "50+", next: FLOW_END },
    ],
  },
  support: {
    question: "What is the issue about?",
    options: [
      { label: "Login / account", next: FLOW_END },
      { label: "Orders or payments", next: FLOW_END },
      { label: "QR or menu setup", next: FLOW_END },
      { label: "Something else", next: FLOW_END },
    ],
  },
};

// Always sent in English so your team reads a consistent format
const buildFlowMessage = (answers: Answer[]) =>
  ["Hi DineEatz! Here are my details:", ...answers.map((a) => `• ${FLOW[a.stepId].question} → ${a.label}`)].join("\n");

const GuidedPanel = ({ touch, onClose }: PanelProps) => {
  const t = useT();
  const site = useSite();
  const reduce = useReducedMotion();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [stepId, setStepId] = useState(FLOW_START);
  const [typing, setTyping] = useState(!reduce);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- question mode: tap a topic, tap a question, read the answer ---
  const [topic, setTopic] = useState<FaqCategory | null>(null);
  const [asked, setAsked] = useState<Faq[]>([]);
  const [thinking, setThinking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const asking = stepId === FLOW_ASK;
  const done = stepId === FLOW_END;
  const step = FLOW[stepId];

  // Short "typing…" pause before each new question
  useEffect(() => {
    if (reduce) { setTyping(false); return; }
    setTyping(true);
    const id = window.setTimeout(() => setTyping(false), 650);
    return () => window.clearTimeout(id);
  }, [stepId, reduce]);

  // Keep the latest message in view (scrolls the panel only, not the page)
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [answers, asked, typing, thinking, reduce]);

  const choose = (o: FlowOption) => {
    setAnswers((a) => [...a, { stepId, label: o.label }]);
    setStepId(o.next);
  };
  const resetAsk = () => { setTopic(null); setAsked([]); setThinking(false); };
  const back = () => {
    const last = answers[answers.length - 1];
    if (!last) return;
    setAnswers(answers.slice(0, -1));
    setStepId(last.stepId);
    resetAsk();
  };
  const restart = () => { setAnswers([]); setStepId(FLOW_START); resetAsk(); };

  // Answer a tapped question straight from the knowledge base.
  const answer = (f: Faq) => {
    setAsked((prev) => [...prev, f]);
    setTopic(f.c);
    if (reduce) return;
    setThinking(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setThinking(false), 550);
  };

  const Chip = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <motion.button type="button" onClick={onClick} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-blue-200 bg-white px-3 py-1.5 text-left text-xs font-medium hover:bg-[#EAF3FF] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      style={{ color: BRAND.primary }}>
      {label}
    </motion.button>
  );

  const Group = ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="flex flex-col items-start gap-2">{children}</div>
    </div>
  );

  const unread = (list: Faq[]) => list.filter((f) => !asked.includes(f) && !faqMissing(f.a, site));

  return (
    <motion.div {...panelMotion} id="dineeatz-agent" role="dialog" aria-label="DineEatz Agent"
      className="w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-2xl shadow-slate-900/20">
      <AgentHeader typing={typing || thinking} touch={touch} onClose={onClose} />

      <div ref={scrollRef} aria-live="polite"
        className="max-h-[min(360px,55vh)] overflow-y-auto overscroll-contain space-y-2 px-4 py-4" style={{ background: "#F4F8FF" }}>
        <Bubble><span className="font-semibold">{t(AGENT_COPY.title)}</span></Bubble>
        {answers.map((a, i) => (
          <div key={i} className="space-y-2">
            <Bubble>{t(FLOW[a.stepId].question)}</Bubble>
            <UserBubble>{t(a.label)}</UserBubble>
          </div>
        ))}

        {asking ? (
          <>
            <Bubble>{t("Pick a topic, or tap a popular question.")}</Bubble>

            {asked.map((f, i) => {
              const hide = i === asked.length - 1 && thinking; // hold the reply while the dots show
              return (
                <div key={f.q} className="space-y-2">
                  <UserBubble>{t(f.q)}</UserBubble>
                  {!hide && <Bubble>{fillTokens(t(f.a), site)}</Bubble>}
                </div>
              );
            })}

            {thinking ? (
              <TypingDots />
            ) : (
              <div className="space-y-3 pt-1">
                {topic === null ? (
                  <>
                    <Group title={t("Popular")}>
                      {unread(FAQ_POPULAR.map((q) => faqFor(q)).filter((f): f is Faq => !!f)).map((f) => (
                        <Chip key={f.q} label={t(f.q)} onClick={() => answer(f)} />
                      ))}
                    </Group>
                    <Group title={t("Browse by topic")}>
                      <div className="flex flex-wrap gap-2">
                        {FAQ_CATEGORIES.map((c) => (
                          <Chip key={c} label={t(c)} onClick={() => setTopic(c)} />
                        ))}
                      </div>
                    </Group>
                  </>
                ) : (
                  <>
                    {unread(faqIn(topic)).length > 0 && (
                      <Group title={t(topic)}>
                        {unread(faqIn(topic)).slice(0, 6).map((f) => (
                          <Chip key={f.q} label={t(f.q)} onClick={() => answer(f)} />
                        ))}
                      </Group>
                    )}
                    <Chip label={`← ${t("Other topics")}`} onClick={() => setTopic(null)} />
                  </>
                )}
              </div>
            )}
          </>
        ) : typing ? (
          <TypingDots />
        ) : done ? (
          <Bubble>{t("Thanks! Tap below to continue on WhatsApp — our team will reply shortly.")}</Bubble>
        ) : (
          <>
            <Bubble>{t(step.question)}</Bubble>
            <div className="flex flex-wrap gap-2 pt-1">
              {step.options.map((o, i) => (
                <motion.button key={o.label} type="button" onClick={() => choose(o)}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#EAF3FF] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  style={{ color: BRAND.primary }}>
                  {t(o.label)}
                </motion.button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-slate-100 p-3 space-y-2">
        {asking && asked.length > 0 && <ChatButton message={buildAskMessage(asked)} label="Chat with our team" />}
        {done && !typing && <ChatButton message={buildFlowMessage(answers)} label="Continue on WhatsApp" />}
        <div className="flex justify-between text-xs text-slate-500">
          <button type="button" onClick={back} disabled={!answers.length} className="hover:text-slate-800 disabled:opacity-40">
            ← {t("Back")}
          </button>
          <button type="button" onClick={restart} disabled={!answers.length} className="hover:text-slate-800 disabled:opacity-40">
            {t("Start over")}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ---- Style 3: PEEK-OUT (robot pops up from behind the button + comic bubble) ----
const PeekPanel = ({ touch, onClose }: PanelProps) => {
  const t = useT();
  return (
    <motion.div id="dineeatz-agent" role="dialog" aria-label="DineEatz Agent"
      className="relative flex items-end gap-2 -mb-6 -mr-5"
      initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 1 }}>
      <motion.div initial={{ opacity: 0, scale: 0.6, x: 20 }} animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.8, x: 10, transition: { duration: 0.15 } }}
        transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 18 }}
        style={{ transformOrigin: "right bottom", borderColor: BRAND.dark, boxShadow: `4px 4px 0 ${BRAND.dark}` }}
        className="relative mb-12 w-[230px] max-w-[calc(100vw-8.5rem)] rounded-2xl border-2 bg-white p-3.5">
        {touch && <CloseBtn onClose={onClose} className="absolute top-2 right-2" />}
        <p className="pr-4 text-sm font-extrabold" style={{ color: BRAND.dark }}>{t(AGENT_COPY.title)}</p>
        <p className="mt-1 text-[13px] text-slate-600">{t(AGENT_COPY.body)}</p>
        <ChatButton small className="mt-3" />
        <span className="absolute -right-[9px] bottom-6 h-4 w-4 rotate-45 border-t-2 border-r-2 bg-white" style={{ borderColor: BRAND.dark }} />
      </motion.div>
      <motion.div className="h-24 w-24 shrink-0"
        initial={{ y: 70, scale: 0.4, rotate: 20 }} animate={{ y: 0, scale: 1, rotate: 0 }}
        exit={{ y: 70, scale: 0.4, rotate: 20, transition: { duration: 0.25 } }}
        transition={{ type: "spring", stiffness: 280, damping: 15 }}>
        <AgentAvatar />
      </motion.div>
    </motion.div>
  );
};

// ---- Style 4: PILL (button stretches sideways) ----
const PillPanel = (_props: PanelProps) => {
  const t = useT();
  return (
    <motion.div id="dineeatz-agent" role="dialog" aria-label="DineEatz Agent"
      initial={{ width: 0, opacity: 0 }} animate={{ width: "auto", opacity: 1 }} exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="overflow-hidden max-w-[calc(100vw-7rem)]">
      <div className="flex items-center gap-3 whitespace-nowrap pl-1 pr-3">
        <div className="h-11 w-11 shrink-0 rounded-full p-0.5" style={{ background: BRAND.soft }}><AgentAvatar /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" style={{ color: BRAND.dark }}>{t(AGENT_COPY.title)}</p>
          <p className="truncate text-xs text-slate-500">{t("Want to know more about our platform?")}</p>
        </div>
        <ChatButton small className="shrink-0" />
      </div>
    </motion.div>
  );
};

const AGENT_PANELS: Record<AgentStyle, ComponentType<PanelProps>> = {
  card: CardPanel, chat: ChatPanel, peek: PeekPanel, pill: PillPanel, guided: GuidedPanel,
};

// ---- Container: hover (desktop) / tap (mobile); "guided" is always click-to-open ----
// The floating launcher is the DineEatz Agent robot itself — it bobs, waves and
// blinks (all motion is dropped automatically when the visitor prefers reduced motion).
export const AgentFloat = () => {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [touch, setTouch] = useState(false);
  const [style, setStyle] = useState<AgentStyle>(AGENT_STYLE);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  // Guided chat must stay open while the visitor taps through, so it never uses hover
  const clickMode = touch || style === "guided";

  useEffect(() => {
    setTouch(window.matchMedia("(hover: none)").matches);
    // Preview any style with ?agent=card | chat | peek | pill | guided
    const q = new URLSearchParams(window.location.search).get("agent");
    if (q && q in AGENT_PANELS) setStyle(q as AgentStyle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    if (clickMode) document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, clickMode]);

  const show = () => { window.clearTimeout(closeTimer.current); setOpen(true); };
  const hide = () => { closeTimer.current = window.setTimeout(() => setOpen(false), 250); };
  const close = () => setOpen(false);

  const Panel = AGENT_PANELS[style];
  const isPill = style === "pill";

  const launcher = (
    <motion.div className="relative z-10 shrink-0" initial={{ scale: 0, y: 24, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ delay: 0.9, type: "spring", stiffness: 240, damping: 16 }}>
      {/* soft halo, only while closed */}
      {!open && (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[#0B7BFF] opacity-20 animate-ping" />
          <span className="pointer-events-none absolute -inset-1 rounded-full bg-[#0B7BFF]/10 blur-md" />
        </>
      )}
      <motion.button type="button" onClick={() => setOpen(!open)}
        aria-expanded={open} aria-controls="dineeatz-agent"
        aria-label={open ? "Close DineEatz Agent" : "Open DineEatz Agent"}
        className="relative grid h-16 w-16 sm:h-[72px] sm:w-[72px] place-items-center rounded-full bg-white ring-1 ring-blue-100 shadow-xl shadow-blue-600/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.94 }}
        animate={reduce || open ? { y: 0 } : { y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: reduce || open ? 0 : Infinity, ease: "easeInOut" }}>
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0, scale: 0.6 }} animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 90, opacity: 0, scale: 0.6 }} className="grid h-11 w-11 place-items-center rounded-full text-white"
              style={{ background: BRAND.primary }}>
              <X className="h-5 w-5" />
            </motion.span>
          ) : (
            <motion.span key="bot" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}
              className="h-[58px] w-[58px] sm:h-[66px] sm:w-[66px]">
              <AgentAvatar />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );

  return (
    <div ref={rootRef} className="fixed z-[90] right-4 sm:right-5"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      onMouseEnter={clickMode ? undefined : show} onMouseLeave={clickMode ? undefined : hide}
      onFocus={clickMode ? undefined : show}
      onBlur={clickMode ? undefined : (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) hide(); }}>
      {isPill ? (
        <div className={`flex items-center rounded-full transition-[background-color,box-shadow] duration-300 ${
          open ? "bg-white p-1.5 -m-1.5 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-100" : ""}`}>
          <AnimatePresence>{open && <Panel key="pill" touch={clickMode} onClose={close} />}</AnimatePresence>
          {launcher}
        </div>
      ) : (
        <div className="flex flex-col items-end gap-4">
          <AnimatePresence>{open && <Panel key={style} touch={clickMode} onClose={close} />}</AnimatePresence>
          {launcher}
        </div>
      )}
    </div>
  );
};
