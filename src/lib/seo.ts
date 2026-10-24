// Shared SEO helpers: the canonical site URL, default metadata, the robots
// directive for pages that must stay out of search, and JSON-LD encoding.
// Routes build their head() from these so tags stay consistent.

import { SITE_URL as CONFIGURED_SITE_URL } from "@/config/env";

// VITE_SITE_URL, defaulting to the production domain. Keep the production value
// in step with public/robots.txt and public/sitemap.xml.
export const SITE_URL = CONFIGURED_SITE_URL;
export const SITE_NAME = "DineEatz";

export const DEFAULT_TITLE = "DineEatz: QR Ordering & Restaurant Management Software";
export const DEFAULT_DESCRIPTION =
  "Run your restaurant with QR ordering, live kitchen, and one dashboard. Multi-tenant SaaS for hospitality.";
export const DEFAULT_LOGO = "/brand/dineeatz-logo.png?v=3";
// 1200x630 share card used for og:image and twitter:image.
export const DEFAULT_IMAGE = "/brand/og-image.png";

/** Absolute URL on the public site for a root-relative path. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

/** Head for pages that must not appear in search results (login, the
 *  owner/admin/kitchen/sales portals, and customer order screens). */
export const noindexHead = () => ({
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});

/** A JSON-LD <script> tag for a route head. `<` is escaped so values from
 *  the database can never close the script element early. */
export function jsonLdScript(data: unknown) {
  return {
    type: "application/ld+json",
    children: JSON.stringify(data).replace(/</g, "\\u003c"),
  };
}
