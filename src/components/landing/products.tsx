import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { BRAND, useSite, scrollTo, useT, Pill, Reveal, QR_N, QR_CELLS } from "@/components/landing/shared";

type View = "front" | "back" | "left" | "right";
const VIEWS: { id: View; label: string }[] = [
  { id: "front", label: "Front" }, { id: "back", label: "Back" },
  { id: "left", label: "Left" }, { id: "right", label: "Right" },
];
type ArtProps = { view: View };

const QRPanel = ({ x, y, size, quiet = 0.6 }: { x: number; y: number; size: number; quiet?: number }) => {
  const u = size / (QR_N + quiet * 2);
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={size} height={size} rx={size * 0.06} fill="#fff" />
      <g transform={`translate(${quiet * u},${quiet * u}) scale(${u})`}>
        {QR_CELLS.map(([r, c]) => <rect key={`${r}-${c}`} x={c} y={r} width={1.04} height={1.04} fill={BRAND.dark} />)}
        <rect x={9.6} y={9.6} width={5.8} height={5.8} rx={1.4} fill={BRAND.primary} />
        <path d="M11.6 11.4v1.6a1 1 0 0 0 2 0v-1.6M12.6 13v2.6M13.8 11.4v4.2" stroke="#fff" strokeWidth=".5" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
};

const TableScene = ({ children, label }: { children: ReactNode; label: string }) => (
  <svg viewBox="0 0 320 240" className="h-full w-full" role="img" aria-label={label}>
    <defs>
      <linearGradient id="pw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F2F7FF" /><stop offset="1" stopColor="#E3EDFB" /></linearGradient>
      <linearGradient id="pt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#EADBC6" /><stop offset="1" stopColor="#D7C2A6" /></linearGradient>
      <linearGradient id="acr" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity=".95" /><stop offset=".45" stopColor="#DCEBFF" stopOpacity=".85" /><stop offset="1" stopColor="#FFFFFF" stopOpacity=".95" />
      </linearGradient>
      <linearGradient id="pbrand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4DA3FF" /><stop offset="1" stopColor="#0B7BFF" /></linearGradient>
    </defs>
    <rect width="320" height="240" fill="url(#pw)" />
    <circle cx="252" cy="52" r="46" fill="#fff" opacity=".55" />
    <rect y="168" width="320" height="72" fill="url(#pt)" />
    <rect y="166" width="320" height="4" fill="#C9B396" opacity=".7" />
    <g opacity=".25" stroke="#B79C78" strokeWidth="1"><path d="M0 190h320M0 212h320" /></g>
    {children}
  </svg>
);

const Shadow = ({ cx, rx = 54, cy = 196 }: { cx: number; rx?: number; cy?: number }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry="8" fill="#7A6247" opacity=".28" />
);

// Mirrors geometry for the opposite side view (text is added outside this wrapper)
const Flip = ({ on, children }: { on: boolean; children: ReactNode }) => (
  <g transform={on ? "translate(320,0) scale(-1,1)" : undefined}>{children}</g>
);

const Wordmark = ({ x, y, w = 72, h = 26, fs = 13 }: { x: number; y: number; w?: number; h?: number; fs?: number }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={h / 3.5} fill="url(#pbrand)" />
    <text x={x + w / 2} y={y + h / 2 + fs * 0.36} textAnchor="middle" fill="#fff" fontSize={fs} fontWeight="700" fontFamily="system-ui">DineEatz</text>
  </g>
);

const Caption = ({ children, y = 224 }: { children: ReactNode; y?: number }) => (
  <text x="160" y={y} textAnchor="middle" fill="#8A7358" fontSize="9" fontWeight="600" fontFamily="system-ui" letterSpacing="1">{children}</text>
);

const SideFace = ({ x, y, h, qr = true }: { x: number; y: number; h: number; qr?: boolean }) => (
  <g transform={`translate(${x},${y}) skewY(9)`}>
    <rect width="26" height={h} rx="3" fill="#F8FAFC" stroke="#E2E8F0" />
    <g transform="translate(3,6) scale(0.29,1)"><rect width="68" height={h * 0.12} rx="4" fill="url(#pbrand)" /></g>
    {qr && <g transform={`translate(3,${h * 0.26}) scale(0.29,1)`}><QRPanel x={0} y={0} size={h * 0.46} /></g>}
    <g transform={`translate(3,${h - 14}) scale(0.29,1)`}><rect width="68" height="5" rx="2.5" fill="#CBD5E1" /></g>
  </g>
);

// ---------- 1. Cutlery & Condiment Caddy QR ----------
const Shaker = ({ x, y = 116, cap }: { x: number; y?: number; cap: string }) => (
  <g>
    <rect x={x} y={y} width="24" height="42" rx="7" fill="#fff" stroke="#CBD5E1" />
    <rect x={x + 4} y={y - 8} width="16" height="11" rx="4" fill={cap} />
    <circle cx={x + 12} cy={y + 22} r="6" fill="#E2E8F0" />
  </g>
);

const Cutlery = ({ x }: { x: number }) => (
  <g stroke="#B6C2D1" fill="#E4EAF2">
    {/* spoon */}
    <path d={`M${x} 150 v-48`} strokeWidth="4" strokeLinecap="round" />
    <ellipse cx={x} cy={98} rx="6.5" ry="9" />
    {/* fork */}
    <path d={`M${x + 20} 150 v-40`} strokeWidth="4" strokeLinecap="round" />
    <path d={`M${x + 20} 110 q-7 -2 -7 -10 v-10 M${x + 20} 110 q7 -2 7 -10 v-10`} strokeWidth="2.5" fill="none" />
    <path d={`M${x + 20} 100 v-10`} strokeWidth="2.5" fill="none" />
    {/* knife */}
    <path d={`M${x + 40} 150 v-38`} strokeWidth="4" strokeLinecap="round" />
    <path d={`M${x + 40} 112 q6 -6 6 -16 t-6 -8 z`} strokeWidth="2" />
  </g>
);

const Napkins = ({ x }: { x: number }) => (
  <g>
    <rect x={x} y="104" width="28" height="46" rx="3" fill="#fff" stroke="#CBD5E1" />
    <rect x={x + 3} y="100" width="28" height="46" rx="3" fill="#F8FAFC" stroke="#CBD5E1" />
    <path d={`M${x + 6} 112 h22 M${x + 6} 120 h22`} stroke="#E2E8F0" strokeWidth="2" />
  </g>
);

const Caddy = ({ x, w }: { x: number; w: number }) => (
  <g>
    <rect x={x} y="132" width={w} height="62" rx="10" fill="#fff" stroke="#CBD5E1" strokeWidth="2" />
    <rect x={x} y="132" width={w} height="10" rx="5" fill="#F1F5F9" />
  </g>
);

const CondimentArt = ({ view }: ArtProps) => {
  const side = view === "left" || view === "right";
  return (
    <TableScene label={`Cutlery and condiment caddy with QR panel, ${view} view`}>
      <Shadow cx={160} rx={side ? 46 : 80} />
      {side ? (
        <>
          <Flip on={view === "right"}>
            <Cutlery x={130} />
            <Shaker x={158} y={112} cap="#94A3B8" />
            <Caddy x={122} w={78} />
            <SideFace x={198} y={126} h={62} qr />
          </Flip>
          <text x="160" y="216" textAnchor="middle" fill="#8A7358" fontSize="9" fontWeight="700" fontFamily="system-ui">SLIM 90 mm FOOTPRINT</text>
        </>
      ) : view === "front" ? (
        <g>
          <Cutlery x={86} />
          <Shaker x={158} y={112} cap="#94A3B8" />
          <Shaker x={186} y={112} cap="#475569" />
          <Napkins x={216} />
          <Caddy x={68} w={184} />
          <path d="M150 142 v52 M206 142 v52" stroke="#E2E8F0" strokeWidth="2" />
          <Wordmark x={78} y={146} w={58} h={18} fs={10} />
          <text x="78" y="182" fill={BRAND.dark} fontSize="9" fontWeight="700" fontFamily="system-ui">SCAN TO ORDER</text>
          <QRPanel x={196} y={142} size={44} />
        </g>
      ) : (
        <g>
          <Cutlery x={86} />
          <Shaker x={158} y={112} cap="#475569" />
          <Shaker x={186} y={112} cap="#94A3B8" />
          <Napkins x={216} />
          <Caddy x={68} w={184} />
          <text x="160" y="162" textAnchor="middle" fill={BRAND.dark} fontSize="10" fontWeight="700" fontFamily="system-ui">Cutlery · Condiments · Napkins</text>
          <text x="160" y="180" textAnchor="middle" fill="#94A3B8" fontSize="8" fontWeight="600" fontFamily="system-ui">POWERED BY DINEEATZ</text>
        </g>
      )}
    </TableScene>
  );
};

// ---------- 2. L-Shaped Table Tent QR ----------
const TableTentArt = ({ view }: ArtProps) => {
  const side = view === "left" || view === "right";
  return (
    <TableScene label={`L-shaped table tent, ${view} view`}>
      <Shadow cx={158} rx={side ? 48 : 62} />
      {side ? (
        <>
          <Flip on={view === "right"}>
            <path d="M150 184 L206 184 L220 192 L164 192 Z" fill="#E2E8F0" />
            <path d="M150 56 q0-8 8-8 h6 q8 0 8 8 v128 h-22 z" fill="#fff" stroke="#CBD5E1" strokeWidth="2" />
            <path d="M150 184 L206 184 L220 192 L164 192 Z" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
            <SideFace x={172} y={50} h={128} />
          </Flip>
          <text x="160" y="212" textAnchor="middle" fill="#8A7358" fontSize="9" fontWeight="700" fontFamily="system-ui">SELF-STANDING L PROFILE</text>
        </>
      ) : (
        <g>
          <path d="M96 184 L224 184 L238 192 L110 192 Z" fill="#E2E8F0" />
          <path d="M110 184 L110 56 Q110 48 118 48 L214 48 Q222 48 222 56 L222 184 Z" fill="#fff" stroke="#CBD5E1" strokeWidth="2" />
          <path d="M110 184 L222 184 L236 192 L124 192 Z" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
          {view === "front" ? (
            <>
              <Wordmark x={122} y={58} w={88} h={24} fs={13} />
              <QRPanel x={132} y={88} size={64} />
              <text x="166" y="166" textAnchor="middle" fill={BRAND.dark} fontSize="9" fontWeight="700" fontFamily="system-ui">TABLE 12</text>
              <text x="166" y="178" textAnchor="middle" fill="#64748B" fontSize="8" fontWeight="600" fontFamily="system-ui">SCAN TO ORDER</text>
            </>
          ) : (
            <>
              <text x="166" y="74" textAnchor="middle" fill={BRAND.dark} fontSize="12" fontWeight="700" fontFamily="system-ui">Table</text>
              <text x="166" y="112" textAnchor="middle" fill={BRAND.primary} fontSize="34" fontWeight="800" fontFamily="system-ui">12</text>
              <QRPanel x={144} y={114} size={42} />
              <text x="166" y="168" textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="600" fontFamily="system-ui">SAME QR ON BOTH FACES</text>
            </>
          )}
        </g>
      )}
    </TableScene>
  );
};

// ---------- 3. Tissue Box QR Branding ----------
const TissueBoxArt = ({ view }: ArtProps) => {
  const side = view === "left" || view === "right";
  return (
    <TableScene label={`Branded tissue box, ${view} view`}>
      <Shadow cx={160} rx={side ? 56 : 76} />
      {side ? (
        <>
          <Flip on={view === "right"}>
            <path d="M150 66 q10 -18 22 -2 q10 -14 18 4 l-4 14 h-40 z" fill="#fff" stroke="#E2E8F0" />
            <path d="M112 84 L208 84 L208 186 L112 186 Z" fill="url(#pbrand)" opacity=".92" stroke="#CBD5E1" strokeWidth="2" />
            <path d="M112 84 L136 66 L232 66 L208 84 Z" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
            <path d="M208 84 L232 66 L232 168 L208 186 Z" fill="#fff" opacity=".9" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
            <ellipse cx="172" cy="75" rx="26" ry="6" fill="#E2E8F0" />
            <rect x="124" y="102" width="72" height="66" rx="8" fill="#fff" opacity=".95" />
          </Flip>
          <g>
            <QRPanel x={141} y={108} size={38} />
            <text x="160" y="160" textAnchor="middle" fill={BRAND.dark} fontSize="7" fontWeight="700" fontFamily="system-ui">SCAN TO ORDER</text>
          </g>
          <text x="160" y="212" textAnchor="middle" fill="#8A7358" fontSize="9" fontWeight="700" fontFamily="system-ui">BRANDED ON ALL FOUR SIDES</text>
        </>
      ) : (
        <g>
          <path d="M150 66 q10 -18 22 -2 q10 -14 18 4 l-4 14 h-40 z" fill="#fff" stroke="#E2E8F0" />
          <path d="M84 84 L236 84 L236 186 L84 186 Z" fill="#fff" stroke="#CBD5E1" strokeWidth="2" />
          <path d="M84 84 L108 66 L260 66 L236 84 Z" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
          <path d="M236 84 L260 66 L260 168 L236 186 Z" fill="url(#pbrand)" opacity=".9" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
          <ellipse cx="172" cy="75" rx="26" ry="6" fill="#E2E8F0" />
          {view === "front" ? (
            <>
              <Wordmark x={96} y={98} w={70} h={24} fs={12} />
              <text x="96" y="146" fill={BRAND.dark} fontSize="10" fontWeight="700" fontFamily="system-ui">Scan to order</text>
              <text x="96" y="160" fill="#64748B" fontSize="8" fontFamily="system-ui">No app needed</text>
              <QRPanel x={176} y={110} size={48} />
            </>
          ) : (
            <>
              <Wordmark x={125} y={104} w={70} h={24} fs={12} />
              <text x="160" y="150" textAnchor="middle" fill={BRAND.dark} fontSize="10" fontWeight="700" fontFamily="system-ui">Your logo here</text>
              <text x="160" y="164" textAnchor="middle" fill="#94A3B8" fontSize="8" fontFamily="system-ui">Full-colour print · 100 boxes min.</text>
            </>
          )}
        </g>
      )}
    </TableScene>
  );
};

const PRODUCTS = [
  { name: "Condiment Holder QR", Art: CondimentArt, tag: "Best seller",
    body: "One caddy for spoons, forks, salt, pepper and napkins — with your ordering QR printed on the front face.",
    message: "Hi DineEatz! I'm interested in the Condiment Holder QR for my restaurant." },
  { name: "L-Shaped Table Tent QR", Art: TableTentArt, tag: "Table numbering",
    body: "Slim L-stand printed with your table number on both faces, so guests and servers always know the table.",
    message: "Hi DineEatz! I'm interested in the L-Shaped Table Tent QR for my restaurant." },
  { name: "Tissue Box QR Branding", Art: TissueBoxArt, tag: "Everyday branding",
    body: "Custom-printed tissue boxes carrying your logo and ordering QR — useful on the table, seen at every meal.",
    message: "Hi DineEatz! I'm interested in Tissue Box QR Branding for my restaurant." },
];

const ProductViewer = ({ p }: { p: (typeof PRODUCTS)[number] }) => {
  const t = useT();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [hover, setHover] = useState(false);
  const reduce = useReducedMotion();
  const go = (d: number) => { setDir(d); setI((n) => (n + d + VIEWS.length) % VIEWS.length); };
  const jump = (n: number) => { setDir(n > i ? 1 : -1); setI(n); };

  useEffect(() => {
    if (!hover || reduce) return;
    const t = setInterval(() => go(1), 1300);
    return () => clearInterval(t);
  }, [hover, reduce]);

  const view = VIEWS[i];
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-[#F2F7FF]"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div key={view.id} className="absolute inset-0" custom={dir}
          initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -40 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
          <p.Art view={view.id} />
        </motion.div>
      </AnimatePresence>

      <span className="absolute top-3 left-3 rounded-full bg-white/90 backdrop-blur px-2.5 py-1 text-[11px] font-semibold shadow-sm"
        style={{ color: BRAND.primary }}>{t(p.tag)}</span>
      <span className="absolute top-3 right-3 rounded-full bg-white/90 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
        {t(view.label)}
      </span>

      {[-1, 1].map((d) => (
        <button key={d} onClick={() => go(d)} aria-label={d < 0 ? `Previous view of ${p.name}` : `Next view of ${p.name}`}
          className={`absolute top-1/2 -translate-y-1/2 ${d < 0 ? "left-2" : "right-2"} h-8 w-8 rounded-full bg-white/90 shadow grid place-items-center opacity-100 sm:opacity-0 transition-opacity hover:bg-white focus-visible:opacity-100 group-hover:opacity-100`}
          style={{ color: BRAND.primary }}>
          {d < 0 ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      ))}

      <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5">
        {VIEWS.map((v, n) => (
          <button key={v.id} onClick={() => jump(n)} aria-label={`${v.label} view of ${p.name}`} aria-current={n === i}
            className="h-1.5 rounded-full transition-all" style={{ width: n === i ? 16 : 6, background: n === i ? BRAND.primary : "#C7D7EC" }} />
        ))}
      </div>
    </div>
  );
};

const ProductCard = ({ p }: { p: (typeof PRODUCTS)[number] }) => {
  const t = useT();
  const href = useSite().waLink(p.message);
  const cls = "mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-[#0B7BFF] bg-transparent py-2.5 text-sm font-semibold text-[#0B7BFF] transition-colors duration-300 group-hover:bg-[#0B7BFF] group-hover:text-white hover:bg-[#0B7BFF] hover:text-white";
  const label = <>{t("Get This for My Restaurant")} <ArrowRight className="h-4 w-4" /></>;
  return (
    <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition-shadow duration-300 hover:shadow-xl hover:shadow-blue-500/15">
      <ProductViewer p={p} />
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-bold" style={{ color: BRAND.dark }}>{t(p.name)}</h3>
        <p className="mt-1.5 flex-1 text-sm text-slate-500">{t(p.body)}</p>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{label}</a>
          : <button type="button" onClick={() => scrollTo("contact")} className={cls}>{label}</button>}
      </div>
    </motion.div>
  );
};

export const Products = () => {
  const t = useT();
  return (
    <section id="products" className="py-14 sm:py-20 scroll-mt-16" style={{ background: "#F8FAFF" }}>
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto">
            <Pill>{t("On every table")}</Pill>
            <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>
              {t("Premium QR products for")} <span style={{ color: BRAND.primary }}>{t("your tables")}</span>
            </h2>
            <p className="mt-4 text-slate-600">{t("Printed once, branded to your restaurant, and built to survive daily service. Every product links straight to your DineEatz menu.")}</p>
          </div>
        </Reveal>
        <div className="mt-10 sm:mt-14 grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {PRODUCTS.map((p, i) => (
            <Reveal key={p.name} className="h-full" delay={(i % 3) * 0.08}><ProductCard p={p} /></Reveal>
          ))}
        </div>
        <Reveal delay={0.2}>
          <p className="mt-8 text-center text-sm text-slate-500">
            {t("Product images are indicative mockups — hover or tap the arrows to see all four sides. Custom sizes, colours and branding available on request.")}
          </p>
        </Reveal>
      </div>
    </section>
  );
};
