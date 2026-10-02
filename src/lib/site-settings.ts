import { supabase } from "@/integrations/supabase/client";

// platform_settings keys the public landing page (/) reads. Every key listed
// here must also be in the "ps public whitelist read" RLS policy, otherwise
// anonymous visitors get nothing back for it.
export const SITE_KEYS = {
  email: "support_email",
  phone: "support_phone",
  location: "contact_location",
  instagram: "social_instagram",
  facebook: "social_facebook",
  linkedin: "social_linkedin",
  whatsapp: "social_whatsapp",
  logoUrl: "brand_logo_url",
} as const;

export type SiteSettingField = keyof typeof SITE_KEYS;
export type SiteSettings = Record<SiteSettingField, string>;

export const EMPTY_SITE_SETTINGS: SiteSettings = {
  email: "", phone: "", location: "", instagram: "", facebook: "", linkedin: "", whatsapp: "", logoUrl: "",
};

// Storage bucket the admin uploads the website logo into (public read).
export const LOGO_BUCKET = "platform-assets";

// Text settings are stored as { text }, the logo as { url } — the shape the
// admin settings page has always written.
export function readSettingValue(key: string, value: unknown): string {
  const v = (value ?? {}) as { text?: unknown; url?: unknown };
  const raw = key === SITE_KEYS.logoUrl ? v.url : v.text;
  return typeof raw === "string" ? raw.trim() : "";
}

export function writeSettingValue(key: string, text: string) {
  const v = text.trim();
  return { key, value: key === SITE_KEYS.logoUrl ? { url: v } : { text: v } };
}

/** Public site settings. Never throws — the landing page must render even
 *  when Supabase is unreachable, so a failure falls back to empty values. */
export async function loadSiteSettings(): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("key,value")
    .in("key", Object.values(SITE_KEYS));
  if (error) {
    console.error("Failed to load site settings", error);
    return EMPTY_SITE_SETTINGS;
  }
  const out: SiteSettings = { ...EMPTY_SITE_SETTINGS };
  const fieldByKey = Object.fromEntries(Object.entries(SITE_KEYS).map(([f, k]) => [k, f])) as Record<string, SiteSettingField>;
  (data ?? []).forEach((r) => {
    const field = fieldByKey[r.key];
    if (field) out[field] = readSettingValue(r.key, r.value);
  });
  return out;
}

/** An http(s) URL, or null. Bare domains ("instagram.com/x") get https://. */
export function safeUrl(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** WhatsApp number in international format (digits only) from either a plain
 *  number ("+91 72185 58850") or a wa.me / api.whatsapp.com link. */
export function whatsappNumber(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/wa\.me\/(\d{7,15})/) || s.match(/[?&]phone=(\d{7,15})/);
  if (m) return m[1];
  if (/^[+\d\s().-]+$/.test(s)) {
    const digits = s.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15 ? digits : null;
  }
  return null;
}

/** Where the WhatsApp social icon should point, or null when not configured. */
export function whatsappHref(v: string): string | null {
  const n = whatsappNumber(v);
  return n ? `https://wa.me/${n}` : safeUrl(v);
}
