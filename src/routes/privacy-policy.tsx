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

export const Route = createFileRoute("/privacy-policy")({
  loader: () => loadSiteSettings(),
  head: () => ({
    meta: [
      { title: `Privacy Policy — ${SITE_NAME}` },
      { name: "description", content: `Privacy Policy for ${SITE_NAME}. Learn how we collect, use, and protect your data.` },
      { property: "og:title", content: `Privacy Policy — ${SITE_NAME}` },
      { property: "og:description", content: `Privacy Policy for ${SITE_NAME}. Learn how we collect, use, and protect your data.` },
      { property: "og:url", content: absoluteUrl("/privacy-policy") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/privacy-policy") }],
    scripts: [
      jsonLdScript({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `Privacy Policy — ${SITE_NAME}`,
        url: `${SITE_URL}/privacy-policy`,
        description: `Privacy Policy for ${SITE_NAME}. Learn how we collect, use, and protect your data.`,
      }),
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Last updated: October 19, 2026
          </p>

          <div className="mt-8 space-y-8 text-slate-700 text-[15px] leading-relaxed">
            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>1. Introduction</h2>
              <p className="mt-3">
                Welcome to {BRAND.name} ("we", "our", or "us"). We are committed to protecting the privacy and security
                of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard
                your information when you use our website, mobile application, and SaaS platform (collectively, the "Service").
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>2. Information We Collect</h2>
              <p className="mt-3">We may collect the following types of information:</p>
              <ul className="mt-3 space-y-2 list-disc pl-5">
                <li>
                  <strong>Account Information:</strong> Name, email address, phone number, restaurant name, and business
                  details when you register for an account.
                </li>
                <li>
                  <strong>Payment Information:</strong> Billing address and payment method details. Payment processing is
                  handled by secure third-party payment processors; we do not store full payment card numbers.
                </li>
                <li>
                  <strong>Usage Data:</strong> Information about how you interact with the Service, including pages visited,
                  features used, order history, and device/browser information.
                </li>
                <li>
                  <strong>Customer Data:</strong> Information your end customers provide when placing orders through
                  QR-based menus, such as table number, order details, and optional contact information.
                </li>
                <li>
                  <strong>Cookies &amp; Analytics:</strong> We use cookies and similar technologies to improve
                  the Service and analyze usage patterns.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>3. How We Use Your Information</h2>
              <p className="mt-3">We use the information we collect to:</p>
              <ul className="mt-3 space-y-2 list-disc pl-5">
                <li>Provide, operate, and maintain the Service.</li>
                <li>Process subscriptions, payments, and transactions.</li>
                <li>Send you important updates, including service notifications and billing information.</li>
                <li>Improve the Service through analytics and user feedback.</li>
                <li>Respond to your inquiries and provide customer support.</li>
                <li>Comply with legal obligations and enforce our terms.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>4. Sharing of Information</h2>
              <p className="mt-3">
                We do not sell your personal information. We may share data with trusted third-party service providers
                who assist us in operating the Service (e.g., hosting, payment processing, analytics), subject to
                confidentiality obligations. We may also disclose information if required by law or to protect the
                rights and safety of {BRAND.name}, our users, or the public.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>5. Data Security</h2>
              <p className="mt-3">
                We implement industry-standard security measures to protect your data, including encryption in transit
                (TLS/SSL) and at rest. However, no method of transmission over the Internet is 100% secure, and we
                cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>6. Data Retention</h2>
              <p className="mt-3">
                We retain your personal information for as long as your account is active or as needed to provide the
                Service. Upon account deletion, we will remove or anonymize your data within a reasonable timeframe,
                except where retention is required by law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>7. Your Rights</h2>
              <p className="mt-3">
                Depending on your jurisdiction, you may have the right to access, correct, delete, or port your
                personal data. You may also object to or restrict certain processing activities. To exercise these
                rights, please contact us using the details below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>8. Third-Party Links</h2>
              <p className="mt-3">
                The Service may contain links to third-party websites or services. We are not responsible for the
                privacy practices of those third parties. We encourage you to review their privacy policies before
                providing any information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>9. Changes to This Policy</h2>
              <p className="mt-3">
                We may update this Privacy Policy from time to time. We will notify you of material changes by posting
                the updated policy on this page and updating the "Last updated" date above. Your continued use of the
                Service after changes constitutes acceptance of the revised policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>10. Contact Us</h2>
              <p className="mt-3">
                If you have any questions about this Privacy Policy or our data practices, please contact us at:
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
