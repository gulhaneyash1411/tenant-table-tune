import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Utensils, ArrowRight, PlayCircle, Check, X, Globe, ChevronDown, Menu } from "lucide-react";
import {
  EMPTY_SITE_SETTINGS,
  loadSiteSettings,
  safeUrl,
  type SiteSettings,
} from "@/lib/site-settings";
import {
  absoluteUrl,
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE,
  DEFAULT_LOGO,
  DEFAULT_TITLE,
  jsonLdScript,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";
import {
  BRAND,
  buildSite,
  SiteCtx,
  useSite,
  fillTokens,
  DEMO_VIDEO_URL,
  NAV,
  scrollTo,
  Lang,
  LANGS,
  LangCtx,
  useT,
  loadDict,
  Pill,
  Reveal,
  PrimaryBtn,
  socialsFor,
  ring,
  ProductCarousel,
} from "@/components/landing/shared";
// import dineeatz_teaser from "public/videos/dineeatz_teaser.mp4"

export const Route = createFileRoute("/")({
  loader: () => loadSiteSettings(),
  head: ({ loaderData }) => landingHead(loaderData),
  component: DineEatz,
});

// Title, description, social tags and structured data for the landing page.
// Contact details and logo come only from Platform settings; an unset value is
// left out rather than filled in.
function landingHead(settings: SiteSettings | undefined) {
  const s = settings ?? EMPTY_SITE_SETTINGS;
  const logo = absoluteUrl(safeUrl(s.logoUrl) ?? DEFAULT_LOGO);
  const sameAs = [s.instagram, s.facebook, s.linkedin]
    .map((v) => safeUrl(v))
    .filter((u): u is string => u !== null);
  const email = s.email.trim() || undefined;
  const phone = s.phone.trim() || undefined;

  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo,
    sameAs: sameAs.length ? sameAs : undefined,
    contactPoint:
      email || phone
        ? [{ "@type": "ContactPoint", contactType: "customer support", email, telephone: phone }]
        : undefined,
  };
  const website = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en",
  };

  return {
    meta: [
      { title: DEFAULT_TITLE },
      { name: "description", content: DEFAULT_DESCRIPTION },
      { property: "og:title", content: DEFAULT_TITLE },
      { property: "og:description", content: DEFAULT_DESCRIPTION },
      { property: "og:url", content: absoluteUrl("/") },
      { property: "og:image", content: absoluteUrl(DEFAULT_IMAGE) },
      { name: "twitter:title", content: DEFAULT_TITLE },
      { name: "twitter:description", content: DEFAULT_DESCRIPTION },
      { name: "twitter:image", content: absoluteUrl(DEFAULT_IMAGE) },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/") }],
    scripts: [
      jsonLdScript({ "@context": "https://schema.org", "@graph": [organization, website] }),
    ],
  };
}

const LanguageMenu = () => {
  const { lang, setLang } = useContext(LangCtx);
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const current = LANGS.find((l) => l.id === lang)!;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("Language")}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        <Globe className="h-4 w-4" style={{ color: BRAND.primary }} />
        <span className="font-medium">{current.short}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-40 overflow-hidden rounded-xl border border-slate-100 bg-white py-1 shadow-xl"
          >
            {LANGS.map((l) => (
              <li key={l.id}>
                <button
                  role="menuitemradio"
                  aria-checked={l.id === lang}
                  onClick={() => {
                    setLang(l.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-50"
                  style={
                    l.id === lang ? { color: BRAND.primary, fontWeight: 600 } : { color: "#334155" }
                  }
                >
                  {l.label}
                  {l.id === lang && <Check className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

// ====================
// SHARED UI
// ====================
// Uploaded logo from Platform settings; the bundled DineEatz logo when none
// is set or the image fails to load.
const Logo = () => {
  const { logoUrl } = useSite();
  const [broken, setBroken] = useState(false);
  const src = broken ? null : safeUrl(logoUrl) || "/brand/dineeatz-logo.png?v=3";
  useEffect(() => setBroken(false), [logoUrl]);
  return (
    <button
      onClick={() => scrollTo("home")}
      className="flex items-center gap-2"
      aria-label={BRAND.name}
    >
      {src ? (
        <img
          src={src}
          alt={BRAND.name}
          className="h-14 md:h-[4.5rem] w-auto max-w-[300px] md:max-w-[380px] object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <>
          <span
            className="h-9 w-9 rounded-xl grid place-items-center text-white"
            style={{ background: BRAND.primary }}
          >
            <Utensils className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold" style={{ color: BRAND.dark }}>
            {BRAND.name}
          </span>
        </>
      )}
    </button>
  );
};

const Navbar = () => {
  const t = useT();
  const [active, setActive] = useState("home");
  const [menu, setMenu] = useState(false);
  // Section to scroll to once the mobile drawer has finished collapsing. Scrolling while the
  // drawer animates shifts the layout mid-scroll, which cancels/misdirects smooth scrolling on mobile.
  const pendingScroll = useRef<string | null>(null);
  // While a nav-triggered scroll is in flight, keep the clicked item active instead of
  // flickering through every section the page passes on the way.
  // const scrollLock = useRef(false);
  // const lockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // const holdLock = (ms: number) => {
  //   clearTimeout(lockTimer.current);
  //   lockTimer.current = setTimeout(() => { scrollLock.current = false; }, ms);
  // };
  // const goTo = (id: string) => {
  //   setActive(id);
  //   scrollLock.current = true;
  //   holdLock(600); // covers the mobile drawer collapse before scrolling starts
  // };
  // useEffect(() => {
  //   const onScroll = () => { if (scrollLock.current) holdLock(150); };
  //   window.addEventListener("scroll", onScroll, { passive: true });
  //   const obs = new IntersectionObserver(
  //     (entries) => entries.forEach((e) => e.isIntersecting && !scrollLock.current && setActive(e.target.id)),
  //     { rootMargin: "-45% 0px -50% 0px" },
  //   );
  //   // Most sections are lazy-loaded, so they may not exist yet on mount; observe them as they appear.
  //   const seen = new Set<Element>();
  //   const attach = () => {
  //     NAV.forEach((n) => {
  //       const el = document.getElementById(n.id);
  //       if (el && !seen.has(el)) { seen.add(el); obs.observe(el); }
  //     });
  //   };
  //   attach();
  //   const mo = new MutationObserver(attach);
  //   mo.observe(document.body, { childList: true, subtree: true });
  //   return () => {
  //     obs.disconnect();
  //     mo.disconnect();
  //     window.removeEventListener("scroll", onScroll);
  //     clearTimeout(lockTimer.current);
  //   };
  // }, []);
  // After a nav click the clicked item stays active until the user scrolls by hand.
  // Releasing it on a timer let late observer events re-highlight the section above.
  const scrollLock = useRef(false);
  const goTo = (id: string) => {
    setActive(id);
    scrollLock.current = true;
  };
  useEffect(() => {
    const release = () => {
      scrollLock.current = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key))
        release();
    };
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchmove", release, { passive: true });
    window.addEventListener("keydown", onKey);
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => e.isIntersecting && !scrollLock.current && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    // Most sections are lazy-loaded, so they may not exist yet on mount; observe them as they appear.
    const seen = new Set<Element>();
    const attach = () => {
      NAV.forEach((n) => {
        const el = document.getElementById(n.id);
        if (el && !seen.has(el)) {
          seen.add(el);
          obs.observe(el);
        }
      });
    };
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      mo.disconnect();
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchmove", release);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 md:h-20 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                goTo(n.id);
                scrollTo(n.id);
              }}
              className="relative py-5 transition-colors"
              style={{
                color: active === n.id ? BRAND.primary : "#475569",
                fontWeight: active === n.id ? 600 : 400,
              }}
            >
              {t(n.label)}
              {active === n.id && (
                <motion.span
                  layoutId="navline"
                  className="absolute left-0 right-0 bottom-3 h-0.5 rounded-full"
                  style={{ background: BRAND.primary }}
                />
              )}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/auth" className="hidden sm:inline text-sm text-slate-700 hover:text-slate-900">
            {t("Sign in")}
          </Link>
          <Link
            to="/auth"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: BRAND.primary }}
          >
            {t("Get started")} <ArrowRight className="h-4 w-4" />
          </Link>
          <LanguageMenu />
          <button
            onClick={() => setMenu((o) => !o)}
            aria-expanded={menu}
            aria-controls="mobile-nav"
            aria-label={menu ? "Close menu" : "Open menu"}
            className="md:hidden h-10 w-10 grid place-items-center rounded-lg border border-slate-200 text-slate-700"
          >
            {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* mobile drawer */}
      <AnimatePresence
        onExitComplete={() => {
          const id = pendingScroll.current;
          pendingScroll.current = null;
          if (id) scrollTo(id);
        }}
      >
        {menu && (
          <motion.nav
            id="mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="md:hidden overflow-hidden border-t border-slate-100 bg-white"
          >
            <div className="px-6 py-4 space-y-1">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    goTo(n.id);
                    pendingScroll.current = n.id;
                    setMenu(false);
                  }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-[15px]"
                  style={
                    active === n.id
                      ? { background: BRAND.soft, color: BRAND.primary, fontWeight: 600 }
                      : { color: "#334155" }
                  }
                >
                  {t(n.label)}
                </button>
              ))}
              <div className="flex gap-3 pt-3">
                <Link
                  to="/auth"
                  onClick={() => setMenu(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2.5 text-center text-sm font-medium text-slate-700"
                >
                  {t("Sign in")}
                </Link>
                <Link
                  to="/auth"
                  onClick={() => setMenu(false)}
                  className="flex-1 rounded-lg py-2.5 text-center text-sm font-semibold text-white"
                  style={{ background: BRAND.primary }}
                >
                  {t("Get started")}
                </Link>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
};

// Scales a fixed-size mockup down to fit whatever width is available (phones, tablets)

// ====================
// VIDEO MODAL
// ====================
const toEmbed = (url: string) => {
  if (!/youtube\.com|youtu\.be/.test(url)) return null;
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0&modestbranding=1` : null;
};

const VideoModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const embed = toEmbed(DEMO_VIDEO_URL);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="DineEatz demo video"
        >
          <motion.div
            className="relative w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative aspect-video w-full overflow-hidden rounded-xl sm:rounded-2xl bg-black shadow-2xl">
              {embed ? (
                <iframe
                  src={embed}
                  title="DineEatz demo"
                  className="h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              ) : (
                <video
                  src={DEMO_VIDEO_URL}
                  className="h-full w-full"
                  autoPlay
                  muted
                  controls
                  playsInline
                />
              )}
              <button
                onClick={onClose}
                autoFocus
                aria-label="Close video"
                className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-black/55 text-white backdrop-blur grid place-items-center transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ====================
// HERO
// ====================
const Hero = () => {
  const t = useT();
  const site = useSite();
  const [videoOpen, setVideoOpen] = useState(false);
  return (
    <section id="home" className="relative overflow-hidden scroll-mt-16">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse at 80% 0%, ${BRAND.soft}, transparent 60%), linear-gradient(180deg,#fff, #F6F9FF)`,
        }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 lg:py-8 grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-8 sm:gap-10 lg:gap-6 items-center overflow-hidden">
        <Reveal>
          <Pill>{t("Modern Restaurant Management Platform")}</Pill>
          <h1
            className="mt-4 sm:mt-5 text-[clamp(2.15rem,8.3vw,3.7rem)] font-extrabold tracking-tight leading-[1.08]"
            style={{ color: BRAND.dark }}
          >
            <span className="block whitespace-nowrap">{t("Run Your Restaurant.")}</span>
            <span className="block" style={{ color: BRAND.primary }}>
              {t("Smarter.")}
            </span>
          </h1>
          <p className="mt-4 sm:mt-5 text-base sm:text-lg text-slate-600 max-w-md leading-relaxed">
            {t(
              "One powerful platform to manage orders, tables, bookings, QR ordering, and daily operations — all in one place.",
            )}
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col xs:flex-row sm:flex-row gap-3 w-full">
            <PrimaryBtn to="/auth">
              <span className="text-center flex-1">{t("Start free trial")}</span>
              <ArrowRight className="h-4 w-4" />
            </PrimaryBtn>
            <button
              onClick={() => setVideoOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold bg-white border border-slate-200 shadow-sm hover:bg-slate-50 w-full sm:w-auto"
              style={{ color: BRAND.dark }}
            >
              <PlayCircle className="h-4 w-4" style={{ color: BRAND.primary }} />
              <span>{t("Watch video")}</span>
            </button>
          </div>
          <div className="mt-5 sm:mt-6 flex flex-wrap gap-x-4 sm:gap-x-5 gap-y-2 text-xs sm:text-sm text-slate-500">
            {["No commission", "{days}-day free trial", "Easy setup"].map((label) => (
              <span key={label} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 shrink-0" style={{ color: BRAND.primary }} />
                {fillTokens(t(label), site)}
              </span>
            ))}
          </div>
        </Reveal>
        {/* Product carousel */}
        <div className="w-full min-w-0">
          <ProductCarousel />
        </div>
      </div>
      <VideoModal open={videoOpen} onClose={() => setVideoOpen(false)} />
    </section>
  );
};

const Footer = () => {
  const t = useT();
  const socials = socialsFor(useSite());
  return (
    <footer className="border-t border-slate-100 bg-slate-50/60">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <Logo />
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-slate-500">
          <Link to="/privacy-policy" className="hover:text-slate-800">
            {t("Privacy Policy")}
          </Link>
          <Link to="/terms-of-service" className="hover:text-slate-800">
            {t("Terms of Service")}
          </Link>
          <button onClick={() => scrollTo("contact")} className="hover:text-slate-800">
            {t("Contact")}
          </button>
        </div>
        {socials.length > 0 && (
          <div className="flex gap-3">
            {socials.map((s) => (
              <a
                key={s.key}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.name}
                className="h-7 w-7 hover:scale-110 transition"
              >
                <s.Icon />
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="text-center text-xs text-slate-400 pb-6">
        © {new Date().getFullYear()} {BRAND.name}. {t("All rights reserved.")}
      </div>
    </footer>
  );
};

const Features = lazy(() =>
  import("@/components/landing/features").then((m) => ({ default: m.Features })),
);
const Products = lazy(() =>
  import("@/components/landing/products").then((m) => ({ default: m.Products })),
);
const WhyDineEatz = lazy(() =>
  import("@/components/landing/why").then((m) => ({ default: m.WhyDineEatz })),
);
const Pricing = lazy(() =>
  import("@/components/landing/pricing").then((m) => ({ default: m.Pricing })),
);
const ContactSection = lazy(() =>
  import("@/components/landing/contact").then((m) => ({ default: m.ContactSection })),
);
const FinalCTA = lazy(() =>
  import("@/components/landing/contact").then((m) => ({ default: m.FinalCTA })),
);
const AgentFloat = lazy(() =>
  import("@/components/landing/agent").then((m) => ({ default: m.AgentFloat })),
);

function DineEatz() {
  // Language resets to English on every load/refresh (nothing is persisted)
  const [lang, setLangState] = useState<Lang>("en");
  const [dict, setDict] = useState<Record<string, string>>({});
  const setLang = useCallback((l: Lang) => {
    if (l === "en") {
      setDict({});
      setLangState("en");
      return;
    }
    loadDict(l).then((d) => {
      setDict(d);
      setLangState(l);
    });
  }, []);
  const settings = Route.useLoaderData();
  const site = useMemo(() => buildSite(settings), [settings]);

  // Always open at the top on load/refresh (browsers otherwise restore the old scroll position)
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    if (window.location.hash)
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    window.scrollTo(0, 0);
  }, []);

  return (
    <LangCtx.Provider value={{ lang, setLang, dict }}>
      <SiteCtx.Provider value={site}>
        <div
          className="min-h-screen bg-white text-slate-900 antialiased [scroll-behavior:smooth]"
          lang={lang}
        >
          <Navbar />
          <main>
            <Hero />
            <Suspense fallback={null}>
              <Features />
              <Products />
              <WhyDineEatz />
              <Pricing />
              <ContactSection />
              <FinalCTA />
            </Suspense>
          </main>
          <Footer />
          <Suspense fallback={null}>
            <AgentFloat />
          </Suspense>
        </div>
      </SiteCtx.Provider>
    </LangCtx.Provider>
  );
}
