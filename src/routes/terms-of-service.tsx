import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Utensils } from "lucide-react";
import { absoluteUrl, jsonLdScript, SITE_NAME, SITE_URL } from "@/lib/seo";
import { loadSiteSettings, safeUrl } from "@/lib/site-settings";
import { BRAND, buildSite, SiteCtx, useSite, socialsFor } from "@/components/landing/shared";
import { supabase } from "@/integrations/supabase/client";

const AgentFloat = lazy(() =>
  import("@/components/landing/agent").then((m) => ({ default: m.AgentFloat })),
);

export const Route = createFileRoute("/terms-of-service")({
  loader: () => loadSiteSettings(),
  head: () => ({
    meta: [
      { title: `Terms of Service — ${SITE_NAME}` },
      { name: "description", content: `Terms of Service for ${SITE_NAME}. Read our terms and conditions for using the platform.` },
      { property: "og:title", content: `Terms of Service — ${SITE_NAME}` },
      { property: "og:description", content: `Terms of Service for ${SITE_NAME}. Read our terms and conditions for using the platform.` },
      { property: "og:url", content: absoluteUrl("/terms-of-service") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/terms-of-service") }],
    scripts: [
      jsonLdScript({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `Terms of Service — ${SITE_NAME}`,
        url: `${SITE_URL}/terms-of-service`,
        description: `Terms of Service for ${SITE_NAME}. Read our terms and conditions for using the platform.`,
      }),
    ],
  }),
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  const settings = Route.useLoaderData();
  const site = useMemo(() => buildSite(settings), [settings]);
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  return (
    <SiteCtx.Provider value={site}>
      <div className="min-h-screen bg-white text-slate-900 antialiased">
        <Header authed={authed} />

        <main className="max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-16">
          <h1
            className="text-3xl sm:text-4xl font-extrabold tracking-tight"
            style={{ color: BRAND.dark }}
          >
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Last updated: October 19, 2026
          </p>

          <div className="mt-8 space-y-8 text-slate-700 text-[15px] leading-relaxed">
            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>1. Acceptance of Terms</h2>
              <p className="mt-3">
                By accessing or using the {BRAND.name} platform, website, or any related services (collectively,
                the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree
                to these Terms, you may not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>2. Description of Service</h2>
              <p className="mt-3">
                {BRAND.name} is a multi-tenant SaaS platform that provides QR-based ordering, kitchen display,
                menu management, table management, and restaurant operations tools. We offer subscription-based
                plans with varying features and limits.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>3. Account Registration</h2>
              <p className="mt-3">
                To use certain features, you must create an account. You agree to provide accurate, current, and
                complete information during registration. You are responsible for maintaining the confidentiality
                of your account credentials and for all activities under your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>4. Subscriptions &amp; Payments</h2>
              <ul className="mt-3 space-y-2 list-disc pl-5">
                <li>
                  Paid plans are billed on a recurring basis (monthly, half-yearly, or yearly) depending on the
                  billing cycle you select.
                </li>
                <li>
                  All fees are non-refundable except as required by applicable law or as explicitly stated in our
                  refund policy.
                </li>
                <li>
                  We reserve the right to modify pricing with reasonable advance notice. Continued use of the
                  Service after a price change constitutes acceptance.
                </li>
                <li>
                  Free trials may be offered at our discretion. At the end of a trial, your account will be
                  downgraded unless you subscribe to a paid plan.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>5. Acceptable Use</h2>
              <p className="mt-3">You agree not to:</p>
              <ul className="mt-3 space-y-2 list-disc pl-5">
                <li>Use the Service for any illegal or unauthorized purpose.</li>
                <li>Attempt to gain unauthorized access to any part of the Service or its related systems.</li>
                <li>Interfere with or disrupt the integrity or performance of the Service.</li>
                <li>Upload malicious code, viruses, or harmful data.</li>
                <li>Resell, sublicense, or redistribute the Service without our written consent.</li>
                <li>Scrape, crawl, or use automated means to access the Service beyond normal usage.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>6. Intellectual Property</h2>
              <p className="mt-3">
                All content, features, and functionality of the Service — including but not limited to software,
                design, text, graphics, and logos — are owned by {BRAND.name} or its licensors and are protected
                by intellectual property laws. You may not copy, modify, or distribute any part of the Service
                without our prior written permission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>7. Your Data</h2>
              <p className="mt-3">
                You retain ownership of the data you upload to or create through the Service ("Your Data"). By
                using the Service, you grant us a limited license to host, store, and process Your Data solely to
                provide the Service. We handle Your Data in accordance with our{" "}
                <Link to="/privacy-policy" className="underline" style={{ color: BRAND.primary }}>
                  Privacy Policy
                </Link>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>8. Service Availability</h2>
              <p className="mt-3">
                We strive to maintain high availability but do not guarantee uninterrupted access. The Service may
                be temporarily unavailable due to maintenance, updates, or circumstances beyond our control. We are
                not liable for any downtime or service interruptions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>9. Limitation of Liability</h2>
              <p className="mt-3">
                To the maximum extent permitted by law, {BRAND.name} shall not be liable for any indirect,
                incidental, special, consequential, or punitive damages, or any loss of profits or revenues,
                whether incurred directly or indirectly. Our total liability for any claim arising from the Service
                shall not exceed the amount you paid us in the twelve (12) months preceding the claim.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>10. Termination</h2>
              <p className="mt-3">
                We may suspend or terminate your access to the Service at any time if you violate these Terms or
                engage in conduct that we determine is harmful to the Service or other users. Upon termination,
                your right to use the Service ceases immediately. You may also cancel your account at any time
                through your account settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>11. Governing Law</h2>
              <p className="mt-3">
                These Terms shall be governed by and construed in accordance with the laws of India. Any disputes
                arising from these Terms or the Service shall be subject to the exclusive jurisdiction of the courts
                in Bangalore, India.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>12. Changes to These Terms</h2>
              <p className="mt-3">
                We reserve the right to update these Terms at any time. We will notify you of material changes by
                posting the updated Terms on this page and updating the "Last updated" date. Your continued use of
                the Service after changes constitutes acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>13. Contact Us</h2>
              <p className="mt-3">
                If you have any questions about these Terms of Service, please contact us at:
              </p>
              <p className="mt-2 font-medium" style={{ color: BRAND.primary }}>
                support@dineeatz.in
              </p>
            </section>
          </div>
        </main>

        <Footer />
        <Suspense fallback={null}>
          <AgentFloat />
        </Suspense>
      </div>
    </SiteCtx.Provider>
  );
}

function Logo() {
  const { logoUrl } = useSite();
  const [broken, setBroken] = useState(false);
  const src = broken ? null : safeUrl(logoUrl) || "/brand/dineeatz-logo.png?v=3";
  useEffect(() => setBroken(false), [logoUrl]);
  return (
    <Link to="/" className="flex items-center gap-2" aria-label={BRAND.name}>
      {src ? (
        <img
          src={src}
          alt={BRAND.name}
          className="h-10 md:h-12 w-auto object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <>
          <span className="h-9 w-9 rounded-xl grid place-items-center text-white" style={{ background: BRAND.primary }}>
            <Utensils className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold" style={{ color: BRAND.dark }}>{BRAND.name}</span>
        </>
      )}
    </Link>
  );
}

function Header({ authed }: { authed: boolean | null }) {
  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
        <Logo />
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
  );
}

function Footer() {
  const socials = socialsFor(useSite());
  return (
    <footer className="border-t border-slate-100 bg-slate-50/60">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <Logo />
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-slate-500">
          <Link to="/privacy-policy" className="hover:text-slate-800">Privacy Policy</Link>
          <Link to="/terms-of-service" className="hover:text-slate-800">Terms of Service</Link>
          <Link to="/" className="hover:text-slate-800">Contact</Link>
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
        &copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.
      </div>
    </footer>
  );
}
