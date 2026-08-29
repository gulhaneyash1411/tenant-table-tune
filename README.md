# QR Restaurant Management Platform

A multi-tenant SaaS for restaurants: menu builder, table QR ordering, takeaway QR, kitchen display, live orders, staff, expenses, revenue, analytics and a Super Admin console for onboarding restaurants and running the platform.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | **TanStack Start v1** (React 19 + Vite 7, SSR-capable, file-based routing) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui + Radix primitives |
| State / Data | TanStack Query, TanStack Router loaders, `createServerFn` RPC |
| Backend | Supabase (Postgres, Auth, Row-Level Security, Realtime) |
| Auth | Supabase Auth — Email/password + Google OAuth |
| Charts | Recharts |
| PDF invoices | jsPDF |
| QR codes | qrcode.react |
| Icons | lucide-react |
| Package manager | Bun (npm/pnpm also work) |
| Deployment target | Cloudflare Workers (edge) |

---

## Features at a glance

**Restaurant owner portal (`/app`)**
- Dashboard, live orders, order history with PDF invoice download
- Menu builder with categories, images, description, availability, "Must-try"
- Tables & QR management (dine-in) + takeaway QR
- Kitchen Display System
- Customers, reviews, staff & payroll
- Expenses with date + category filters
- Revenue and analytics dashboards
- Subscription plans with mock payment flow
- Settings: profile, logo, slogan, opening hours

**Super admin portal (`/admin`)**
- Restaurant approvals, plans, billing, announcements, tickets, audit log, platform settings

**Customer flows**
- `/t/:tableId` — dine-in QR ordering (Zomato-style UI)
- `/takeaway/:tenantId` — takeaway ordering
- `/status?phone=...` — live order status & invoice download
- `/review` — customer feedback (name required)

---


## Prerequisites

Install these before you start.

1. **Node.js 20+** — https://nodejs.org/
2. **Bun 1.1+** (recommended) — https://bun.sh/  
   *(You can substitute `npm`, `pnpm`, or `yarn`; commands below show Bun.)*
3. **Git** — https://git-scm.com/
4. **VS Code** — https://code.visualstudio.com/  
   Recommended extensions:
   - ESLint (`dbaeumer.vscode-eslint`)
   - Prettier (`esbenp.prettier-vscode`)
   - Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`)
   - TypeScript Nightly (`ms-vscode.vscode-typescript-next`)
5. **A Supabase project** — https://supabase.com/ (free tier is enough)

---

## Step-by-step: run the project in VS Code

### 1. Get the code

```bash
git clone <your-repo-url> qr-restaurant
cd qr-restaurant
code .
```

### 2. Install dependencies

```bash
bun install
# or: npm install
```

### 3. Create your Supabase project

1. Go to https://supabase.com/dashboard and create a new project.
2. Wait for it to finish provisioning.
3. From **Project Settings → API**, copy:
   - `Project URL`
   - `anon` / `publishable` key (starts with `sb_publishable_` or an anon JWT)
   - `service_role` key (keep this secret — server only)

### 4. Apply the database schema

All schema, RLS policies, functions, triggers and seed data live in `supabase/migrations/`.

**Option A — Supabase CLI (recommended)**

```bash
bun add -g supabase        # or: npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — manual**

Open Supabase Dashboard → **SQL Editor**, and paste/run each file in `supabase/migrations/` in chronological order (they are timestamped).

### 5. Configure environment variables

Create a `.env` file in the project root:

```dotenv
# Client-visible (must be prefixed with VITE_)
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-or-publishable-key>
VITE_SUPABASE_PROJECT_ID=<your-project-ref>

# Server-only (used by createServerFn / SSR)
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<your-anon-or-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_PROJECT_ID=<your-project-ref>
```

> ⚠️ Never commit `.env` and never expose the `SUPABASE_SERVICE_ROLE_KEY` in browser code.

### 6. Enable Auth providers in Supabase

In Supabase Dashboard → **Authentication → Providers**:
- **Email**: enable. For local dev, also enable "Auto-confirm users" so you don't need email delivery.
- **Google** (optional): enable and add your OAuth client ID/secret. In **URL Configuration**, add `http://localhost:8080` to Site URL and Redirect URLs.

### 7. Create the Super Admin user

1. Start the app (next step) and sign up at `/auth` with the email you want to use as super admin.
2. In Supabase SQL Editor, run:

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'super_admin' FROM auth.users WHERE email = '<your-email>';
   ```

3. Sign in — you'll be routed to `/admin` automatically.

### 8. Run the dev server

```bash
bun run dev
# or: npm run dev
```

Open http://localhost:8080 (Vite prints the URL). Hot reload is on.

### 9. Try the flows

- Sign up a restaurant owner at `/auth` → wait for super-admin approval from `/admin/restaurants`.
- Once approved, complete the profile in **Settings**, add menu items, create tables & print QR codes.
- Scan a table QR (`/t/<id>`) or takeaway QR (`/takeaway/<tenantId>`) from a phone.
- Track orders live at `/status?phone=<phone>` and download PDF invoices.

---

## Useful npm scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start Vite dev server (SSR + HMR) at `localhost:8080` |
| `bun run build` | Production build (Cloudflare Workers target) |
| `bun run build:dev` | Build with development mode (source maps, no minify) |
| `bun run preview` | Preview a built app locally |
| `bun run lint` | ESLint |
| `bun run format` | Prettier write |

---

## Project structure

```
src/
├── routes/                    # File-based routing (TanStack Router)
│   ├── __root.tsx             # Root shell (html/head/body, providers)
│   ├── index.tsx              # Marketing / landing
│   ├── auth.tsx               # Sign-in / sign-up
│   ├── t.$tableId.tsx         # Public dine-in customer flow
│   ├── takeaway.$tenantId.tsx # Public takeaway customer flow
│   ├── status.tsx             # Public order status
│   ├── review.tsx             # Public review submission
│   ├── _authenticated/        # Gated subtree (Supabase session required)
│   │   ├── route.tsx          # Auth gate (do not edit)
│   │   ├── app.*.tsx          # Restaurant owner pages
│   │   └── admin.*.tsx        # Super admin pages
│   └── api/public/*.ts        # Server routes (webhooks, public APIs)
├── lib/                       # Utilities + *.functions.ts server RPCs
├── components/                # Reusable components
│   └── ui/                    # shadcn/ui primitives
├── hooks/                     # Custom React hooks
├── integrations/supabase/     # Auto-generated Supabase clients (do not edit)
├── styles.css                 # Tailwind entry + theme tokens
├── router.tsx                 # Router config
└── start.ts                   # TanStack Start server middleware
supabase/
├── config.toml
└── migrations/                # All SQL schema + policies
```

---

## Troubleshooting

**"Missing Supabase environment variable(s)"**  
Double-check `.env` values, and restart the dev server (`bun run dev`).

**Blank page / `Unauthorized` on `/app` or `/admin`**  
Sign in first at `/auth`. `_authenticated/*` routes require an active Supabase session.

**"new row violates row-level security policy"**  
You're inserting as an unauthorized role. Ensure you're signed in and the table's RLS policies allow your tenant. Verify with `SELECT public.current_tenant_id();` in SQL Editor.

**"permission denied for table X"**  
Missing GRANT on the table. Re-run the migration that creates it — every table in `public` needs explicit GRANTs to `authenticated` and `service_role`.

**Google sign-in returns to `/auth`**  
Add `http://localhost:8080` (and your production URL) to Supabase → Authentication → URL Configuration → Site URL + Redirect URLs.

**Port 8080 already in use**  
`PORT=5173 bun run dev` — pick any free port.

---

## Deployment

The build targets Cloudflare Workers (edge). After `bun run build`, deploy the output to your Cloudflare account, or use any Node-compatible host that supports SSR. Set the same environment variables in the hosting provider's dashboard.

---

## License

Proprietary — all rights reserved unless a `LICENSE` file states otherwise.