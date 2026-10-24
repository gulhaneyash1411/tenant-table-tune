// Run with `npm test` (Node's built-in runner; no extra dependencies).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBuildTarget,
  checkServiceRoleKey,
  parseAppEnv,
  PRODUCTION_PROJECT_REF,
  projectRefFromUrl,
  resolveSupabaseEnv,
  STAGING_PROJECT_REF,
  SupabaseEnvError,
} from "./supabase-env.ts";

const STAGING_REF = STAGING_PROJECT_REF;
const OTHER_REF = "abcdefghijklmnopqrst"; // neither staging nor production
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const KEY = "sb_publishable_test";

// Unsigned JWT-shaped keys; only the payload is ever read.
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.signature`;
}

describe("parseAppEnv", () => {
  it("defaults to production for builds and development for the dev server", () => {
    assert.equal(parseAppEnv(undefined, false), "production");
    assert.equal(parseAppEnv("", true), "development");
  });
  it("rejects unknown values instead of guessing", () => {
    assert.throws(() => parseAppEnv("prod", false), SupabaseEnvError);
  });
});

describe("projectRefFromUrl", () => {
  it("reads the ref from a hosted project URL", () => {
    assert.equal(projectRefFromUrl(STAGING_URL), STAGING_REF);
  });
  it("accepts a local supabase stack", () => {
    assert.equal(projectRefFromUrl("http://127.0.0.1:54321"), "local");
  });
  it("rejects anything else", () => {
    assert.throws(() => projectRefFromUrl("https://example.com"), SupabaseEnvError);
    assert.throws(() => projectRefFromUrl(`http://${STAGING_REF}.supabase.co`), SupabaseEnvError);
    assert.throws(() => projectRefFromUrl("not a url"), SupabaseEnvError);
  });
});

describe("resolveSupabaseEnv", () => {
  it("accepts production on the production project", () => {
    const env = resolveSupabaseEnv({ appEnv: "production", url: PROD_URL, publishableKey: KEY });
    assert.equal(env.projectRef, PRODUCTION_PROJECT_REF);
  });

  it("accepts staging and development on a non-production project", () => {
    for (const appEnv of ["staging", "development"] as const) {
      assert.equal(
        resolveSupabaseEnv({ appEnv, url: STAGING_URL, publishableKey: KEY }).projectRef,
        STAGING_REF,
      );
    }
  });

  it("refuses to let staging or development use production", () => {
    for (const appEnv of ["staging", "development"] as const) {
      assert.throws(
        () => resolveSupabaseEnv({ appEnv, url: PROD_URL, publishableKey: KEY }),
        /must not use the production Supabase project/,
      );
    }
  });

  it("refuses to let production use any other project", () => {
    assert.throws(
      () => resolveSupabaseEnv({ appEnv: "production", url: STAGING_URL, publishableKey: KEY }),
      /not the production project/,
    );
  });

  it("pins staging to the DineEatz Staging project, but lets development use any non-production one", () => {
    const otherUrl = `https://${OTHER_REF}.supabase.co`;
    assert.throws(
      () => resolveSupabaseEnv({ appEnv: "staging", url: otherUrl, publishableKey: KEY }),
      /not the DineEatz Staging project/,
    );
    assert.equal(
      resolveSupabaseEnv({ appEnv: "development", url: otherUrl, publishableKey: KEY }).projectRef,
      OTHER_REF,
    );
  });

  it("fails clearly when a variable is missing, with no fallback", () => {
    assert.throws(
      () => resolveSupabaseEnv({ appEnv: "staging", url: undefined, publishableKey: KEY }),
      /Missing Supabase environment variable\(s\) for staging: VITE_SUPABASE_URL/,
    );
    assert.throws(
      () => resolveSupabaseEnv({ appEnv: "production", url: PROD_URL, publishableKey: "" }),
      /VITE_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("refuses a secret or service-role key in the public variable", () => {
    for (const publishableKey of [
      "sb_secret_abc",
      fakeJwt({ ref: STAGING_REF, role: "service_role" }),
    ]) {
      assert.throws(
        () => resolveSupabaseEnv({ appEnv: "staging", url: STAGING_URL, publishableKey }),
        /secret \/ service-role key/,
      );
    }
  });

  it("refuses a legacy anon key from the other project", () => {
    const anonForProd = fakeJwt({ ref: PRODUCTION_PROJECT_REF, role: "anon" });
    assert.throws(
      () =>
        resolveSupabaseEnv({ appEnv: "staging", url: STAGING_URL, publishableKey: anonForProd }),
      /belongs to project/,
    );
    const anonForStaging = fakeJwt({ ref: STAGING_REF, role: "anon" });
    assert.equal(
      resolveSupabaseEnv({ appEnv: "staging", url: STAGING_URL, publishableKey: anonForStaging })
        .projectRef,
      STAGING_REF,
    );
  });

  it("checks VITE_SUPABASE_PROJECT_ID against the URL when set", () => {
    assert.throws(
      () =>
        resolveSupabaseEnv({
          appEnv: "staging",
          url: STAGING_URL,
          publishableKey: KEY,
          projectId: "zzzzzzzzzzzzzzzzzzzz",
        }),
      /VITE_SUPABASE_PROJECT_ID/,
    );
  });
});

describe("checkBuildTarget", () => {
  it("pairs main with production and preview branches with staging", () => {
    checkBuildTarget("production", "main");
    checkBuildTarget("staging", "release");
  });
  it("refuses staging values on main", () => {
    assert.throws(() => checkBuildTarget("staging", "main"), /deploys the live site/);
  });
  it("refuses production (or unset) values on a preview branch", () => {
    assert.throws(() => checkBuildTarget("production", "release"), /Previews build variables/);
  });
  it("doesn't check local builds", () => {
    checkBuildTarget("development", undefined);
    checkBuildTarget("staging", "");
  });
});

describe("checkServiceRoleKey", () => {
  it("refuses a service-role key from another project", () => {
    assert.throws(
      () =>
        checkServiceRoleKey(
          fakeJwt({ ref: PRODUCTION_PROJECT_REF, role: "service_role" }),
          STAGING_REF,
        ),
      /belongs to project/,
    );
  });
  it("accepts the matching project's key and opaque secret keys", () => {
    checkServiceRoleKey(fakeJwt({ ref: STAGING_REF, role: "service_role" }), STAGING_REF);
    checkServiceRoleKey("sb_secret_opaque", STAGING_REF);
  });
  it("refuses a publishable key used as the service key", () => {
    assert.throws(() => checkServiceRoleKey("sb_publishable_x", STAGING_REF), /publishable key/);
  });
});
