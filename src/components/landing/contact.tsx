import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Mail, Phone, MapPin, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, contactHours, useSite, useT, Pill, Reveal, ring } from "@/components/landing/shared";

type FormState = { name: string; email: string; phone: string; restaurant: string; subject: string; message: string };
const EMPTY: FormState = { name: "", email: "", phone: "", restaurant: "", subject: "", message: "" };

const SUBJECTS = ["Book a demo", "Pricing", "Support", "Partnership"];

export const ContactSection = () => {
  const t = useT();
  const site = useSite();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = t("Name is required");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = t("Enter a valid email");
    if (form.phone && !/^[+\d\s-]{7,15}$/.test(form.phone)) e.phone = t("Enter a valid phone");
    if (!form.subject) e.subject = t("Choose a subject");
    if (form.message.trim().length < 10) e.message = t("Message must be at least 10 characters");
    else if (form.message.length > 5000) e.message = t("Message must be under 5000 characters");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setStatus("loading");
    // Insert-only for visitors: RLS lets anyone add a row but only a super
    // admin read them back, so no .select() here.
    const { error } = await supabase.from("contact_messages").insert({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      restaurant: form.restaurant.trim() || null,
      subject: form.subject,
      message: form.message.trim(),
    });
    if (error) {
      console.error("Contact form submit failed", error);
      setStatus("error");
      setStatusMsg(site.email
        ? `${t("Couldn't send your message. Please try again.")} ${t("Or email us at")} ${site.email}.`
        : t("Couldn't send your message. Please try again."));
      return;
    }
    setStatus("success"); setStatusMsg(t("Thanks! We'll respond within 24 hours.")); setForm(EMPTY);
  };

  const field = (k: keyof FormState) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
    className: `w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 ${errors[k] ? "border-rose-400" : "border-slate-200"}`,
  });
  const Err = ({ k }: { k: keyof FormState }) => errors[k] ? <p className="text-xs text-rose-500 mt-1">{errors[k]}</p> : null;
  const Label = ({ t, req }: { t: string; req?: boolean }) => <label className="text-xs font-medium text-slate-600 mb-1 block">{t}{req && <span className="text-rose-500"> *</span>}</label>;

  return (
    <section id="contact" className="py-14 sm:py-20 scroll-mt-16">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 grid gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-[1fr_0.9fr_1.4fr]">
        <Reveal>
          <Pill>{t("Get in touch")}</Pill>
          <h2 className="mt-4 text-3xl md:text-4xl font-extrabold" style={{ color: BRAND.dark }}>{t("Contact")} <span style={{ color: BRAND.primary }}>{t("Us")}</span></h2>
          <p className="mt-4 text-slate-600">{t("We'd love to hear from you! Whether you have a question, need support, or want to partner with us — we're here to help.")}</p>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="space-y-5 sm:space-y-6">
            {[
              { icon: Mail, t: "Email", v: site.email, href: `mailto:${site.email}`, s: "We'll respond within 24 hours." },
              { icon: Phone, t: "Phone", v: site.phone, href: `tel:${site.phone.replace(/[^\d+]/g, "")}`, s: contactHours },
              { icon: MapPin, t: "Location", v: site.location, href: null, s: "(Remote support available)" },
            ].filter((c) => c.v).map((c) => (
              <div key={c.t} className="flex gap-3">
                <span className="h-10 w-10 shrink-0 rounded-lg grid place-items-center" style={{ background: BRAND.soft, color: BRAND.primary }}><c.icon className="h-5 w-5" /></span>
                <div>
                  <div className="font-semibold text-sm" style={{ color: BRAND.dark }}>{t(c.t)}</div>
                  {c.href
                    ? <a href={c.href} className="text-sm text-slate-700 hover:underline break-all">{c.v}</a>
                    : <div className="text-sm text-slate-700">{c.v}</div>}
                  <div className="text-xs text-slate-400">{t(c.s)}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.16}>
          <form onSubmit={submit} noValidate className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-lg shadow-slate-200/50 space-y-4">
            <div className="font-semibold" style={{ color: BRAND.dark }}>{t("Send us a message")}</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label t={t("Full name")} req /><input {...field("name")} maxLength={120} placeholder={t("Your name")} /><Err k="name" /></div>
              <div><Label t={t("Email")} req /><input type="email" {...field("email")} maxLength={254} placeholder="you@example.com" /><Err k="email" /></div>
              <div><Label t={t("Phone")} /><input {...field("phone")} type="tel" inputMode="numeric" maxLength={10}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="9876543210" /><Err k="phone" /></div>
              <div><Label t={t("Restaurant name")} /><input {...field("restaurant")} maxLength={160} placeholder="Spice Garden" /></div>
            </div>
            <div><Label t={t("Subject")} req />
              <select {...field("subject")}>
                <option value="">{t("Select an option")}</option>
                {/* Value stays English so admins read one consistent subject, whatever the visitor's language */}
                {SUBJECTS.map((s) => <option key={s} value={s}>{t(s)}</option>)}
              </select><Err k="subject" />
            </div>
            <div><Label t={t("Message")} req /><textarea rows={4} {...field("message")} placeholder={t("How can we help you?")} /><Err k="message" /></div>
            <AnimatePresence>
              {(status === "success" || status === "error") && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status"
                  className={`text-sm rounded-lg px-3 py-2 ${status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{statusMsg}</motion.p>
              )}
            </AnimatePresence>
            <button type="submit" disabled={status === "loading"}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-70" style={{ background: BRAND.primary }}>
              {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {status === "loading" ? t("Sending…") : t("Send message")}
            </button>
          </form>
        </Reveal>
      </div>
    </section>
  );
};

// ====================
// FINAL CTA
// ====================
export const FinalCTA = () => {
  const t = useT();
  return (
    <section className="px-5 sm:px-6 pb-14 sm:pb-20">
      <Reveal>
        <div className="max-w-6xl mx-auto rounded-3xl p-8 sm:p-10 md:p-14 text-center text-white relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${BRAND.primary}, #0552C7)` }}>
          <h2 className="text-3xl md:text-4xl font-extrabold">{t("Ready to grow your restaurant?")}</h2>
          <p className="mt-3 text-blue-100">{t("Set up in minutes. No commission. Cancel anytime.")}</p>
          <Link to="/auth" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold" style={{ color: BRAND.primary }}>
            {t("Start free trial")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
};
