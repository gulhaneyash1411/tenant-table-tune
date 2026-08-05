import { useEffect } from "react";

type Brand = { name?: string | null; logo_url?: string | null; slogan?: string | null };

/** Cached brand so a page reload paints the restaurant's own loader instantly
 *  instead of flashing a generic placeholder first. */
export function readCachedBrand(key: string): Brand | null {
  try {
    const raw = localStorage.getItem(`brand:${key}`);
    return raw ? (JSON.parse(raw) as Brand) : null;
  } catch {
    return null;
  }
}

export function cacheBrand(key: string, tenant: Brand | null | undefined) {
  if (!tenant) return;
  try {
    localStorage.setItem(
      `brand:${key}`,
      JSON.stringify({ name: tenant.name, logo_url: tenant.logo_url, slogan: tenant.slogan }),
    );
  } catch {
    /* storage unavailable */
  }
}

/** Swaps the browser tab title + favicon to the restaurant's own branding
 *  so customers never see the platform logo after scanning a QR. */
export function useTenantBrand(tenant?: { name?: string | null; logo_url?: string | null } | null) {
  useEffect(() => {
    if (typeof document === "undefined" || !tenant?.name) return;
    const prevTitle = document.title;
    document.title = tenant.name;

    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    const prevHref = link?.href ?? null;
    if (tenant.logo_url) {
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = tenant.logo_url;
    }
    return () => {
      document.title = prevTitle;
      if (link && prevHref) link.href = prevHref;
    };
  }, [tenant?.name, tenant?.logo_url]);
}