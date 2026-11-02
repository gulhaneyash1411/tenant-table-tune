# Supabase environments: staging and production

DineEatz runs as two fully separate environments. Each has its own Supabase
project, data, credentials and Cloudflare settings. Both are served by the one
Worker, `tenant-table-tune`: `main` is its live deployment and `release` is a
preview.

```
git main    ──► tenant-table-tune (live, "Production" settings) ──► DineEatz Production (khvvukyedvuqvbemjcxb)
git release ──► tenant-table-tune preview ("Previews" settings) ──► DineEatz Staging    (mjominccvkwyintjsxja)
local dev   ──► vite dev (.env.local)                           ──► DineEatz Staging
```

| | Staging | Production |
|---|---|---|
| Git branch | `release` | `main` |
| Cloudflare | `tenant-table-tune`, preview deployment | `tenant-table-tune`, live deployment |
| URL | `https://release-tenant-table-tune.ygulhane135.workers.dev` | `https://dineeatz.in` |
| Cloudflare settings used | **Previews** build variables + preview runtime variables | **Production** build variables + runtime variables |
| `VITE_APP_ENV` | `staging` | `production` (or unset) |
| Supabase project | DineEatz Staging (`mjominccvkwyintjsxja`, ap-northeast-1) | DineEatz Production (`khvvukyedvuqvbemjcxb`, ap-south-1) |
| Badge in the UI | `STAGING`, bottom-left | none |
| Payments / WhatsApp | Cashfree sandbox, Twilio test sender | live |

**Every non-`main` branch that Cloudflare builds becomes a preview with the
staging values.** Limit non-production branch builds to `release` (Settings →
Build → Branch control → include list), unless you want other branches on
staging data too. No preview ever gets production values.

## How it works

The app is TanStack Start with server rendering. It runs as a **Cloudflare
Worker**, not a Pages site.

- **`VITE_*` variables are build-time.** Vite inlines them into the bundle that
  the browser, SSR and server functions all use. Changing one in Cloudflare
  does nothing until the next build, so **retry the build / push again after
  changing a `VITE_*` variable.**
- **Server-only secrets are runtime.** The service-role key, Cashfree and Twilio
  values are Worker variables/secrets. Cloudflare keeps a separate set for
  previews, so `release` can have the staging service-role key while `main`
  keeps production's.
- **`wrangler.jsonc`** defines staging-only `previews.vars` because
  `wrangler preview` requires an explicit preview environment. It contains no
  secrets or production values. `keep_vars: true` preserves other plain
  variables set in the dashboard; secrets remain managed separately.
- **There is one source of Supabase config.** `src/config/env.ts` →
  `requireSupabaseConfig()` is used by all three clients:
  - `src/integrations/supabase/client.ts`: browser and SSR, publishable key.
  - `src/integrations/supabase/auth-middleware.ts`: server functions, acting as the
    signed-in user.
  - `src/integrations/supabase/client.server.ts`: service role, server only.

  The server uses the same build-time URL as the browser. Runtime
  `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` variables are **not read**, so the
  two can't drift onto different projects. Nothing else in `src/` creates a
  Supabase client or calls `*.supabase.co` directly.

### Guard rails

`src/config/supabase-env.ts` enforces these rules. They run **at build time**
from `vite.config.ts`, so a bad build fails before it is deployed, and again
**at runtime**. Cloudflare Workers Builds sets `WORKERS_CI_BRANCH`, which is
how the build knows which branch it is.

| Situation | Result |
|---|---|
| Branch `main` built with `VITE_APP_ENV` other than `production` | Build fails |
| Any other branch (preview) built without `VITE_APP_ENV=staging` | Build fails |
| `VITE_APP_ENV=production` (or unset) and the URL isn't `khvvukyedvuqvbemjcxb` | Build fails |
| `VITE_APP_ENV=staging` and the URL isn't `mjominccvkwyintjsxja` | Build fails |
| `VITE_APP_ENV=development` and the URL **is** production | `vite dev` throws (a local stack or another project is fine) |
| `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` missing | Build fails; no fallback to the other environment |
| `VITE_SUPABASE_PUBLISHABLE_KEY` is an `sb_secret_…` or `service_role` key | Build fails |
| Legacy anon key or `VITE_SUPABASE_PROJECT_ID` belongs to a different project than the URL | Build fails |
| `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT) belongs to a different project than the URL | Server-side admin calls throw |

Successful builds log the target, for example
`[env] Building for staging (branch: release) → Supabase project mjominccvkwyintjsxja`.
Check for that line in each Cloudflare build log.

Both refs are pinned as `PRODUCTION_PROJECT_REF` and `STAGING_PROJECT_REF` in
`src/config/supabase-env.ts`. They are not secrets: every browser that opens the
site sees them. If either project is ever replaced, change it there.

## Cloudflare setup (`tenant-table-tune`)

**Settings → Build:** Git repository `gulhaneyash1411/tenant-table-tune`,
production branch `main`, build command `bun run build`, production deploy
command `npx wrangler deploy`, and preview deploy command `npx wrangler preview`.
The preview command requires the staging-only `previews` block in
`wrangler.jsonc`. The build configuration needs a working **API token**. If the
dashboard says "Configured API token unavailable", choose **Create new token**
before saving.

### Build variables (Settings → Build → Variables and secrets)

Set them separately under **Production** and **Previews**.

| Variable | Production | Previews (`release`) |
|---|---|---|
| `VITE_APP_ENV` | `production` (optional; unset = production) | **`staging`** (required) |
| `VITE_SUPABASE_URL` | `https://khvvukyedvuqvbemjcxb.supabase.co` | `https://mjominccvkwyintjsxja.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | production publishable key | staging publishable key |
| `VITE_SUPABASE_PROJECT_ID` | `khvvukyedvuqvbemjcxb` | `mjominccvkwyintjsxja` |
| `VITE_SITE_URL` | `https://dineeatz.in` (default) | `https://release-tenant-table-tune.ygulhane135.workers.dev` |
| `VITE_CASHFREE_MODE` | `production` | `sandbox` |
| `VITE_UPI_ID` / `VITE_UPI_PAYEE_NAME` | real UPI ID / name | a test UPI ID, so nobody pays the real account |

Keys come from each project's **Project Settings → API Keys**: the publishable
key (`sb_publishable_…`), or the legacy `anon` key, which also works in
`VITE_SUPABASE_PUBLISHABLE_KEY`. The app reads only that variable name; there is
no `VITE_SUPABASE_ANON_KEY`.

**No secrets in build variables.** The build doesn't need
`SUPABASE_SERVICE_ROLE_KEY`, so delete it from both build-variable sets. The
non-`VITE_` names `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_PROJECT_ID` aren't read by the build either; you can delete them.

### Runtime variables and secrets (Settings → Variables and Secrets)

Set them separately for production and for previews. Mark the secret ones **Secret**.

| Variable | Production | Previews (`release`) |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (secret) | production key | **staging** key |
| `CASHFREE_ENV` | `production` | `sandbox` |
| `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` (secret) | live keys | **sandbox** keys |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (secret), `TWILIO_WHATSAPP_FROM` | live | Twilio test credentials / WhatsApp sandbox sender |
| `WHATSAPP_DISPATCH_SECRET` (secret) | random string | a **different** random string |

Runtime `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` are no longer read; deleting
them is optional.

**Never put a service-role or secret key in a `VITE_*` variable.** Everything
`VITE_*` can be read by anyone who opens the site, and the build refuses it.

## Local development

Local development uses the **DineEatz Staging** database. The code refuses the
production project in local dev, so it can't be used by accident.

1. `cp .env.example .env.local`. The staging URL and project ID are already in
   the template. Paste in the two keys from DineEatz Staging → Project Settings
   → API Keys: the publishable key into `VITE_SUPABASE_PUBLISHABLE_KEY`, and the
   secret / service-role key into `SUPABASE_SERVICE_ROLE_KEY`.
2. **Delete or rename any old `.env` that holds production values** (for example
   to `.env.prod-backup`; Vite never loads that name). Vite merges
   `.env` and `.env.local`, so a production `SUPABASE_SERVICE_ROLE_KEY` left in
   `.env` would still load. With production URLs in `.env` and nothing in
   `.env.local`, `npm run dev` now stops with
   `VITE_APP_ENV=development must not use the production Supabase project`.
3. `npm run dev`. Pages show a `DEV` badge.
   Don't run `npm run deploy` from your machine. It deploys straight to the live
   Worker with whatever `.env.local` holds. Deploy by pushing to `release` / `main`.
4. To reproduce a production build locally on purpose, run it with
   `VITE_APP_ENV=production` and the production URL. That has to be deliberate;
   it is never the default.
5. Supabase CLI: `npm install` downloads the binary. With bun, run
   `bun pm trust supabase` once. Bun skips the download by default, which keeps
   Cloudflare builds from fetching it.

Things to know:

- **Localhost and the `release` site share one database.** Orders, menus or users
  created locally also show up on
  `https://release-tenant-table-tune.ygulhane135.workers.dev`, and the other way round.
- **Production logins don't exist on staging.** Sign up again on staging. The
  first account needs the `super_admin` role (section 4 of
  `supabase/staging-bootstrap.sql`).
- **Email links work locally.** Staging's allowed redirect URLs include
  `http://localhost:5173/auth` and `/reset-password`.
- **For separate data**, point `.env.local` at a local Supabase stack
  (`npx supabase start`, URL `http://127.0.0.1:54321`) or a personal project.
  Local dev accepts any project except production.

## Schema: state before staging was built (read-only comparison, 2026-10-24)

| | DineEatz Production | DineEatz Staging |
|---|---|---|
| Ref / region | `khvvukyedvuqvbemjcxb` / ap-south-1 | `mjominccvkwyintjsxja` / ap-northeast-1 |
| Tables in `public` | 51 (567 columns, RLS on all) | 0 |
| Policies / indexes | 147 / 116 | 0 / 0 |
| Enums, functions, triggers | 7 enums, many functions, ~20 triggers (one on `auth.users`) | none |
| Extensions | btree_gist, pg_cron, pg_net, pgcrypto, uuid-ossp, vault | btree_gist, pg_cron, pg_net **missing** |
| Storage buckets | `platform-assets` (public), `product-images` (public) | none |
| Migration history | **12 rows**, latest `20260917170758` | none |
| Cron jobs | 7 (`whatsapp-dispatch` + six `notify-*`) | none |
| Edge Functions | none | none |

**The repo's migrations don't describe production, so don't replay them.**
Production records the first 12 of the 59 files in `supabase/migrations`. The
other 47 (`20260926120000` onward) were run by hand in the SQL editor, or perhaps
not all of them. Also, `tenant_section_locks` and `event_bookings` are created by
no migration at all. Two consequences:

- Running `supabase/migrations` against empty staging fails. **Staging is built
  from a schema dump of production instead** (below).
- **Never run `supabase db push` against production** (nor enable the migrations
  workflow) until the history is fixed (see "Migration history" below).
  `db push` would try to re-run the 47 unrecorded migrations on live data.
  `npm run db:push` refuses production without `CONFIRM_PRODUCTION=yes` for this
  reason.

## Build the staging schema

> **Status (2026-10-24): done on staging.** The extensions, production schema
> (no data), storage buckets and the 5 storage policies, the `on_auth_user_created`
> trigger, Realtime tables, config rows (`subscription_plans` 4, `platform_settings`
> 10, `nav_defaults` 1) and 7 cron jobs (six `notify-*` +
> `activate-scheduled-subscriptions`; **no** `whatsapp-dispatch`) are all in place.
> A fingerprint comparison matched production. The steps below are kept to
> rebuild staging, or to set up another environment.

Needs the Supabase CLI and Docker (`db dump` runs `pg_dump` in a container), or
a local `pg_dump` / `psql` 17. Nothing in these steps writes to production.

1. **Staging dashboard → Database → Extensions:** enable `btree_gist`, `pg_cron`
   and `pg_net`.
2. **Dump production's schema (no data):**
   ```sh
   npx supabase login
   npm run db:link:prod
   npx supabase db dump -f supabase/baseline_schema.sql     # schema only by default
   ```
   Read it before applying. It must contain no `INSERT`/`COPY`; it's schema only.
3. **Apply it to staging.** Use the connection string from the staging
   dashboard → **Connect** (session pooler). Use it only in your terminal; never
   commit it or paste it into chat.
   ```sh
   npm run db:link:staging
   psql "<staging connection string>" -v ON_ERROR_STOP=1 -f supabase/baseline_schema.sql
   ```
4. **Production SQL editor → run [`supabase/production-export.sql`](../supabase/production-export.sql).**
   It's read-only. It prints the storage-policy DDL, the buckets, the `auth.users`
   triggers, the cron jobs and the Realtime tables.
5. **Staging SQL editor → run [`supabase/staging-bootstrap.sql`](../supabase/staging-bootstrap.sql)**,
   with the storage policies from step 4 pasted into its section 3. It recreates the
   `on_auth_user_created` trigger on `auth.users` and the two public buckets.
6. **Config rows, not customer data:** `subscription_plans`, `platform_settings`
   and `nav_defaults`. The app needs these to run. Export them from production
   (read-only), review them, then load them into staging:
   ```sh
   pg_dump "<production connection string>" --data-only --column-inserts \
     -t public.subscription_plans -t public.platform_settings -t public.nav_defaults \
     -f config_rows.sql                 # local file; don't commit it
   psql "<staging connection string>" -v ON_ERROR_STOP=1 -f config_rows.sql
   ```
   If `platform_settings` holds live credentials or contact details, swap in
   staging values before loading.
7. **Realtime:** staging → Database → Publications → `supabase_realtime`. Add the
   same tables step 4 listed. The order screens rely on it.
8. **Super admin:** sign up on staging, then run section 4 of
   `staging-bootstrap.sql` with that e-mail.
9. **Optional fake data:** see "Fake data for staging" below.
10. Regenerate types from staging if they've drifted:
    `npx supabase gen types typescript --linked > src/integrations/supabase/types.ts`.

### Verify the schemas match

Run the same queries on both projects and compare.

```sql
select count(*) tables from information_schema.tables where table_schema='public' and table_type='BASE TABLE'; -- 51
select count(*) cols from information_schema.columns where table_schema='public';                              -- 567
select count(*) policies from pg_policies where schemaname='public';                                          -- 147
select count(*) indexes from pg_indexes where schemaname='public';                                            -- 116
select tablename from pg_tables where schemaname='public' and not rowsecurity;                                -- no rows
select extname from pg_extension order by 1;
select tgname, tgrelid::regclass from pg_trigger where not tgisinternal order by 2,1;
select policyname from pg_policies where schemaname='storage' order by 1;
select id, public from storage.buckets order by 1;
select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1;
```

Expected, intentional differences: no cron jobs and no Vault secrets on staging
(see below), and no data except config rows and fake seed data.

### Migration history (optional, a production change: your call)

To keep the two projects in step from now on:

1. Save `supabase/baseline_schema.sql` as `supabase/migrations/<timestamp>_baseline.sql`.
   Move the 59 old files to `supabase/migrations_archive/` for reference.
2. On **staging**: `npx supabase migration repair --status applied <timestamp>`.
3. On **production**: mark the 12 recorded old versions `reverted` and the
   baseline `applied`:
   ```sh
   npm run db:link:prod
   npx supabase migration repair --status reverted <the 12 versions from `migration list`>
   npx supabase migration repair --status applied <timestamp>
   npx supabase migration list    # only the baseline, on both sides
   ```
   This writes only to `supabase_migrations.schema_migrations`. It touches no
   tables or data, but it is still a production change.
4. Only then set up the GitHub workflow (below) and turn on
   `SUPABASE_MIGRATIONS_ENABLED`. Until this is done, leave it off.

## Staging setup the schema dump doesn't carry

- **Auth → URL Configuration:** done. Site URL = `https://release-tenant-table-tune.ygulhane135.workers.dev`. Redirect URLs:
  `https://release-tenant-table-tune.ygulhane135.workers.dev/auth` and `/reset-password`, plus the same two `localhost:5173`
  URLs production has. Production allows `https://dineeatz.in/auth` and
  `/reset-password`.
- **Auth → Sign-in methods, e-mail templates, SMTP:** match production, using
  staging credentials. Use a separate Google OAuth client, or add the staging
  callback to the existing one.
- **Cron jobs: don't copy them as they are.** Production's `whatsapp-dispatch`
  posts to `project--871470bd-…lovable.app/api/public/whatsapp-dispatch` with a
  Vault secret. A copy on staging would trigger the real dispatcher. Leave it
  out, or point it at the staging URL with its own `WHATSAPP_DISPATCH_SECRET` in
  staging's Vault. Add the `notify-*` jobs only once staging uses Twilio/e-mail
  test credentials.
- **Edge Functions:** none in either project.
- **Database webhooks, network restrictions, API settings:** compare by hand.

## Fake data for staging

`supabase/seed.sql` holds invented restaurants, menus and orders (phones
`90000xxxxx`, e-mails `*.test`). On **staging only**:

1. Authentication → Users → Add user `owner@staging.dineeatz.test` (auto-confirm).
2. SQL Editor → paste `supabase/seed.sql` → uncomment `SET app.allow_seed = 'yes';` → Run.

It refuses to run without that line, and it's safe to re-run. **Never copy
production customer data into staging.**

## Everyday flow

This flow starts once the migration history has been reset (above). Until
then, write schema changes as SQL files and apply them by hand: staging first,
then production.

1. `npm run db:new -- add_something`, then write **backward-compatible** SQL.
2. Merge to `release`. The *Supabase migrations* workflow applies it to staging,
   and Cloudflare rebuilds the `release` preview.
3. Test on staging.
4. Merge to `main`. The workflow waits for approval on the `production` GitHub
   environment, then applies it. Approve it **before or together with** the
   frontend deploy, so new code never reaches a database that lacks its columns.

**No more schema changes in the production dashboard.** Otherwise the repo and
production drift apart again.

`npm run db:push` refuses to push to production unless `CONFIRM_PRODUCTION=yes`
is set (`--dry-run` is always allowed).

### GitHub setup for the workflow

- **Environments** (Settings → Environments): `staging`, and `production` with
  **required reviewers**.
- **Secrets**: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_STAGING_REF`,
  `SUPABASE_STAGING_DB_PASSWORD`, `SUPABASE_PROD_REF`, `SUPABASE_PROD_DB_PASSWORD`.
- **Secret values**: `SUPABASE_STAGING_REF=mjominccvkwyintjsxja`,
  `SUPABASE_PROD_REF=khvvukyedvuqvbemjcxb`. Database passwords come from each
  project's settings.
- **Variable**: `SUPABASE_MIGRATIONS_ENABLED=true`, only after the migration
  history reset above. Turned on earlier, the first `main` run would re-apply 47
  migrations to production. Until then the workflow does nothing.

## Checking which project a deployment uses

- **In the browser**: DevTools → Network → filter `supabase.co`. Every request
  should go to that environment's ref. Staging pages also show the `STAGING` badge.
- **From the shell** (read-only):
  ```sh
  url=https://dineeatz.in
  curl -s $url | grep -oE '/assets/[^"]+\.js' | sort -u | while read a; do curl -s $url$a; done \
    | grep -oE '[a-z0-9]{20}\.supabase\.co' | sort | uniq -c
  ```
  Production should print only `khvvukyedvuqvbemjcxb.supabase.co`, and the staging
  URL only the staging ref.
- **Cloudflare build log**: the `[env] Building for …` line.

## Troubleshooting

| Error | Cause / fix |
|---|---|
| `Missing Supabase environment variable(s) for staging: …` | Add the build variable to that Worker, then **Retry build** (VITE values are build-time). |
| `… must not use the production Supabase project` | Staging/dev was given production values. Use the staging URL and key. Locally: check for an old `.env`. |
| `… not the production project khvvukyedvuqvbemjcxb` | The Production build variables point at another project. |
| `Branch release builds a preview (staging) but VITE_APP_ENV=…` | Add `VITE_APP_ENV=staging` to the **Previews** build variables, then retry the build. |
| `Branch main deploys the live site but VITE_APP_ENV=…` | Staging values ended up in the **Production** build variables. Put the production values back. |
| `SUPABASE_SERVICE_ROLE_KEY belongs to project …` | The Worker has the other environment's service key. Replace the secret. |
| Login works but password-reset links fail on staging | Staging Auth → URL Configuration is missing the staging URL. |
| Staging site still talks to `khvvukyedvuqvbemjcxb` | The preview was built before the Previews variables were saved, or from old code. Push to `release` (or retry the build) after saving. |
| Dashboard variables disappeared after a deploy | Only happens without `keep_vars: true` in `wrangler.jsonc`. Secrets are never removed. |

## Not touching production by accident

- Staging builds can't reach the production project (build- and run-time guard).
- Each Worker only has its own environment's secrets.
- `db:push` to production needs `CONFIRM_PRODUCTION=yes`. The CI workflow needs a
  reviewer on the `production` environment.
- The seed refuses to run without an explicit opt-in.
- Staging uses Cashfree sandbox, a test UPI ID and a Twilio test sender, so no
  real payments or customer messages.

## Rollback

- **Code**: revert the merge commit on `release` / `main` (`git revert -m 1 <sha>`)
  and push. Don't force-push: the repo is synced with Lovable. Reverting restores
  the old behaviour: the runtime `SUPABASE_URL` fallback and no guards.
- **Cloudflare**: Deployments → pick the previous version → *Rollback*. Restoring
  variables doesn't affect a running version until the next build.
- **Previews settings**: changing them never affects the live deployment.
- **Migrations**: roll forward with a new migration that undoes the change. Never
  reset or restore production as a rollback. The baseline only changes migration
  *history* rows (`migration repair`), which you can undo with
  `migration repair --status applied|reverted <version>`.

## Security notes

- A production `service_role` key was once committed in `.env` (commits
  `a8deb57`, `bcf026b`; reachable from `main`). `.env` is now untracked and
  ignored, but the key stays in git history. **Rotate it**: Supabase →
  Project Settings → API Keys → create a new secret key, set it on the
  production Worker, redeploy, verify, then disable the legacy JWT keys. Don't
  rewrite git history: that breaks the Lovable sync, and the old key is
  compromised regardless.
- RLS is the actual security boundary. The publishable key is public by design.
