#!/usr/bin/env node
// Runs the Supabase CLI with project refs taken from the environment, never
// hardcoded. Works the same on Windows, macOS and Linux (no `$VAR` shell
// expansion needed). Refs are read from the shell, or from .env.local / .env.
//
//   npm run db:link:staging       supabase link --project-ref $SUPABASE_STAGING_REF
//   npm run db:link:prod          supabase link --project-ref $SUPABASE_PROD_REF
//   npm run db:push               supabase db push   (says which project is linked first)
//
// Anything after `--` is passed through: npm run db:push -- --dry-run

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  // Earlier files win: loadEnvFile never overwrites a variable that's already set.
  if (existsSync(file)) process.loadEnvFile(file);
}

const [command, ...rest] = process.argv.slice(2);

function supabase(args) {
  // npx resolves the local devDependency; shell is needed for npx.cmd on Windows.
  const result = spawnSync("npx", ["supabase", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(result.status ?? 1);
}

function linkedRef() {
  const file = "supabase/.temp/project-ref";
  return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
}

function describe(ref) {
  if (!ref) return "no project (run npm run db:link:staging first)";
  if (ref === process.env.SUPABASE_PROD_REF) return `${ref} (PRODUCTION)`;
  if (ref === process.env.SUPABASE_STAGING_REF) return `${ref} (staging)`;
  return `${ref} (unknown — not SUPABASE_STAGING_REF or SUPABASE_PROD_REF)`;
}

switch (command) {
  case "link:staging":
  case "link:prod": {
    const name = command === "link:prod" ? "SUPABASE_PROD_REF" : "SUPABASE_STAGING_REF";
    const ref = process.env[name];
    if (!ref) {
      console.error(`${name} is not set. Add it to .env.local (see .env.example) or your shell.`);
      process.exit(1);
    }
    supabase(["link", "--project-ref", ref, ...rest]);
    break;
  }
  case "push": {
    const ref = linkedRef();
    console.log(`Pushing migrations to: ${describe(ref)}`);
    // Production normally gets migrations from the GitHub workflow (with a
    // reviewer). A hand push must be deliberate; --dry-run is always allowed.
    if (
      ref &&
      ref === process.env.SUPABASE_PROD_REF &&
      !rest.includes("--dry-run") &&
      process.env.CONFIRM_PRODUCTION !== "yes"
    ) {
      console.error(
        "Refusing to push to PRODUCTION. Review `npm run db:push -- --dry-run` first, then re-run with CONFIRM_PRODUCTION=yes.",
      );
      process.exit(1);
    }
    supabase(["db", "push", ...rest]);
    break;
  }
  default:
    console.error("Usage: node scripts/supabase.mjs <link:staging|link:prod|push> [-- extra args]");
    process.exit(1);
}
