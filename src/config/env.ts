// Which environment this build talks to, and the Supabase project it uses.
//
// Everything here is chosen by build-time variables (see .env.example and
// docs/supabase-environments.md): `main` builds with the production values,
// `release` with the staging ones. VITE_* values are inlined by Vite when the
// bundle is built, so changing one in Cloudflare needs a redeploy.
//
// The same checks run in vite.config.ts, so a misconfigured build fails before
// it is deployed; the runtime check below is the second line of defence.

import { parseAppEnv, resolveSupabaseEnv, type AppEnv, type SupabaseEnv } from "./supabase-env.ts";

export type { AppEnv } from "./supabase-env.ts";

export const APP_ENV: AppEnv = parseAppEnv(import.meta.env.VITE_APP_ENV, import.meta.env.DEV);
export const isProduction = APP_ENV === "production";
export const isStaging = APP_ENV === "staging";

/** Public origin for canonical / Open Graph URLs. Auth redirects use window.location.origin instead. */
export const SITE_URL: string = import.meta.env.VITE_SITE_URL || "https://dineeatz.in";

let resolved: SupabaseEnv | undefined;

/**
 * The Supabase project every client in this app uses (browser, SSR, server
 * functions and the service-role client). Build-time values only — no runtime
 * fallback — so the browser and the server can never end up on different
 * projects. Throws a clear error if the config is missing or points at the
 * wrong environment's project.
 */
export function requireSupabaseConfig(): SupabaseEnv {
  if (resolved) return resolved;
  try {
    resolved = resolveSupabaseEnv({
      appEnv: APP_ENV,
      url: import.meta.env.VITE_SUPABASE_URL,
      publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      projectId: import.meta.env.VITE_SUPABASE_PROJECT_ID,
    });
  } catch (error) {
    console.error(`[Supabase] ${(error as Error).message}`);
    throw error;
  }
  return resolved;
}
