// Guards that keep each build on its own Supabase project. Pure functions with
// no imports, so vite.config.ts (at build time), src/config/env.ts (at runtime)
// and `npm test` can all use them.
//
// Rules:
//   production          → must be the production project, nothing else
//   staging             → must be the staging project, nothing else
//   development         → must NOT be the production project (staging, a local
//                         stack or a personal project are all fine)
//   any                 → the public key must not be a secret / service-role key,
//                         and VITE_SUPABASE_PROJECT_ID (if set) must match the URL

export type AppEnv = "development" | "staging" | "production";

export const APP_ENVS: readonly AppEnv[] = ["development", "staging", "production"];

/**
 * The live DineEatz Production project. Not a secret (it's in every page's
 * network traffic); pinned here so a production build can't be pointed at any
 * other project, and staging can't be pointed at this one.
 */
export const PRODUCTION_PROJECT_REF = "khvvukyedvuqvbemjcxb";

/** DineEatz Staging (the `release` deployment). Also public; pinned for the same reason. */
export const STAGING_PROJECT_REF = "mjominccvkwyintjsxja";

export class SupabaseEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseEnvError";
  }
}

/** Unset means production for builds (so the existing production deploy keeps working) and development for `vite dev`. */
export function parseAppEnv(value: string | undefined, isDevServer: boolean): AppEnv {
  if (!value) return isDevServer ? "development" : "production";
  if ((APP_ENVS as readonly string[]).includes(value)) return value as AppEnv;
  throw new SupabaseEnvError(`VITE_APP_ENV="${value}" is not one of ${APP_ENVS.join(", ")}.`);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Project ref from https://<ref>.supabase.co, "local" for a local `supabase start` stack. */
export function projectRefFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SupabaseEnvError(`VITE_SUPABASE_URL "${url}" is not a valid URL.`);
  }
  if (LOCAL_HOSTS.has(parsed.hostname)) return "local";
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname);
  if (parsed.protocol !== "https:" || !match) {
    throw new SupabaseEnvError(
      `VITE_SUPABASE_URL "${url}" must look like https://<project-ref>.supabase.co.`,
    );
  }
  return match[1];
}

/** Decoded payload of a legacy JWT API key, or null for anything else. */
export function jwtPayload(key: string): Record<string, unknown> | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
  } catch {
    return null;
  }
}

export type SupabaseEnvInput = {
  appEnv: AppEnv;
  url: string | undefined;
  publishableKey: string | undefined;
  /** VITE_SUPABASE_PROJECT_ID. Optional, but checked against the URL when present. */
  projectId?: string | undefined;
};

export type SupabaseEnv = {
  appEnv: AppEnv;
  url: string;
  publishableKey: string;
  projectRef: string;
};

/** Throws SupabaseEnvError with every problem found, or returns the checked config. */
export function resolveSupabaseEnv(input: SupabaseEnvInput): SupabaseEnv {
  const { appEnv, url, publishableKey, projectId } = input;
  const missing = [
    ...(!url ? ["VITE_SUPABASE_URL"] : []),
    ...(!publishableKey ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
  ];
  if (!url || !publishableKey) {
    throw new SupabaseEnvError(
      `Missing Supabase environment variable(s) for ${appEnv}: ${missing.join(", ")}. ` +
        `Set them in .env.local (local) or the Cloudflare build variables, then rebuild.`,
    );
  }

  const projectRef = projectRefFromUrl(url);

  if (
    publishableKey.startsWith("sb_secret_") ||
    jwtPayload(publishableKey)?.role === "service_role"
  ) {
    throw new SupabaseEnvError(
      "VITE_SUPABASE_PUBLISHABLE_KEY holds a secret / service-role key. VITE_* values ship to " +
        "every browser: use the project's publishable (or anon) key, and rotate the exposed one.",
    );
  }

  const keyRef = jwtPayload(publishableKey)?.ref;
  if (typeof keyRef === "string" && projectRef !== "local" && keyRef !== projectRef) {
    throw new SupabaseEnvError(
      `VITE_SUPABASE_PUBLISHABLE_KEY belongs to project ${keyRef}, but VITE_SUPABASE_URL is project ${projectRef}.`,
    );
  }

  if (projectId && projectRef !== "local" && projectId !== projectRef) {
    throw new SupabaseEnvError(
      `VITE_SUPABASE_PROJECT_ID is ${projectId}, but VITE_SUPABASE_URL is project ${projectRef}.`,
    );
  }

  if (appEnv === "production" && projectRef !== PRODUCTION_PROJECT_REF) {
    throw new SupabaseEnvError(
      `This is a production build (VITE_APP_ENV=production, or unset), but VITE_SUPABASE_URL is ` +
        `project ${projectRef}, not the production project ${PRODUCTION_PROJECT_REF}. ` +
        `A staging build must set VITE_APP_ENV=staging.`,
    );
  }
  if (appEnv !== "production" && projectRef === PRODUCTION_PROJECT_REF) {
    throw new SupabaseEnvError(
      `VITE_APP_ENV=${appEnv} must not use the production Supabase project (${PRODUCTION_PROJECT_REF}). ` +
        `Use the DineEatz Staging project's URL and publishable key.`,
    );
  }
  if (appEnv === "staging" && projectRef !== STAGING_PROJECT_REF) {
    throw new SupabaseEnvError(
      `This is a staging build, but VITE_SUPABASE_URL is project ${projectRef}, not the ` +
        `DineEatz Staging project ${STAGING_PROJECT_REF}.`,
    );
  }

  return { appEnv, url, publishableKey, projectRef };
}

/** The branch Cloudflare Workers Builds deploys as the live Worker; every other branch is a preview. */
export const PRODUCTION_BRANCH = "main";

/**
 * Build-time only. In Cloudflare Workers Builds (WORKERS_CI_BRANCH is set),
 * `main` deploys the live Worker with the Production build variables and every
 * other branch (`release`) uploads a preview with the Previews build variables.
 * Each must carry its own environment's values. Local builds aren't checked.
 */
export function checkBuildTarget(appEnv: AppEnv, ciBranch: string | undefined): void {
  if (!ciBranch) return;
  if (ciBranch === PRODUCTION_BRANCH && appEnv !== "production") {
    throw new SupabaseEnvError(
      `Branch ${ciBranch} deploys the live site but VITE_APP_ENV=${appEnv}. ` +
        `Fix the Production build variables (VITE_APP_ENV=production, production Supabase values).`,
    );
  }
  if (ciBranch !== PRODUCTION_BRANCH && appEnv !== "staging") {
    throw new SupabaseEnvError(
      `Branch ${ciBranch} builds a preview (staging) but VITE_APP_ENV=${appEnv} (unset counts as production). ` +
        `Set VITE_APP_ENV=staging and the staging Supabase values in the Previews build variables.`,
    );
  }
}

/**
 * Server-only: a legacy JWT service-role key carries its project ref; reject one
 * that belongs to a different project than the build's URL. (New sb_secret_ keys
 * are opaque — the other project simply rejects them.)
 */
export function checkServiceRoleKey(serviceRoleKey: string, projectRef: string): void {
  if (serviceRoleKey.startsWith("sb_publishable_")) {
    throw new SupabaseEnvError(
      "SUPABASE_SERVICE_ROLE_KEY holds a publishable key, not a secret key.",
    );
  }
  const ref = jwtPayload(serviceRoleKey)?.ref;
  if (typeof ref === "string" && projectRef !== "local" && ref !== projectRef) {
    throw new SupabaseEnvError(
      `SUPABASE_SERVICE_ROLE_KEY belongs to project ${ref}, but this build uses project ${projectRef}. ` +
        `Each Worker needs its own project's key.`,
    );
  }
}
