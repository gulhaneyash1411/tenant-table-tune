import { useEffect } from "react";

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