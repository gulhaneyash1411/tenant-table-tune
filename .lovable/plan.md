
# Multi-Tenant Restaurant SaaS — Build Plan

Heads up: this project is currently the blank Lovable starter (only `src/routes/index.tsx` with the placeholder). None of the QR ordering, tenant, or admin code you referenced exists here yet — everything must be built from scratch. The scope you sent is roughly 6–8 weeks of product work; trying to ship it all in one turn would produce a broken app. I'll break it into phases you can approve/iterate on, starting with the foundation that unblocks everything else.

## Phase 0 — Foundation (this turn, after you approve)

1. **Enable Lovable Cloud** (Postgres + Auth + Storage + server functions). Required for tenants, RLS, subscriptions, orders, notifications.
2. **Design system**: dark/light themes, semantic tokens in `src/styles.css`, SaaS-grade shadcn setup (Stripe/Linear-ish aesthetic — not purple).
3. **Auth + roles**
   - `user_roles` table (`super_admin`, `restaurant_admin`, `manager`, `cashier`, `kitchen`, `waiter`) + `has_role()` security-definer fn.
   - Separate `/auth` (restaurant) and `/admin/auth` (super admin) portals. No email confirmation; login is gated by super-admin approval status.
4. **Multi-tenant schema (all tables carry `tenant_id`, RLS enforced)**:
   `tenants`, `tenant_members`, `subscription_plans`, `subscriptions`, `invoices`, `payments`, `tables`, `menu_categories`, `menu_items`, `orders`, `order_items`, `customers`, `reviews`, `notifications`, `audit_logs`, `support_tickets`, `platform_settings`.
5. **Seed data**: 4 plans (Starter/Standard/Professional/Enterprise), 1 super admin, 1 approved demo tenant `owner@bellacucina.dev / Owner123!` with dummy categories + menu items.

## Phase 1 — Restaurant Owner Dashboard

- Layout with sidebar + top navbar. **Notification bell in navbar** opens a **modal** (not sidebar page) with unseen count badge; count clears on open.
- Pages: Dashboard, **Live Orders** (auto-refresh + drag between columns + mark-paid + date filter + served archive), **Menu** (single page — categories inline, no separate Categories page), **Tables & QR** (per-table QR download; QR shows "Table already booked" until active order completes, but same customer name+phone re-entry re-opens their live status), **Feedback QR**, **Takeaway QR**, **Customers** (name/phone/email/visits/spend/last-visit + per-customer order history), **Reviews**, **Staff**, **Analytics**, **Settings** (working save for profile / branding / invoice / taxes / hours / printers / KDS / Twilio / UPI), **Subscription**, **Billing**.
- Post-signup empty state: friendly "Awaiting super-admin approval" screen — no "register your restaurant" dead-end.

## Phase 2 — Customer Ordering (QR flows)

- `/t/:tableId` table order flow, `/takeaway/:tenantId`, `/review`.
- Returning-customer detection by name+phone while an order is open; new customer required otherwise.
- Cart shows item quantity **and** name; **name field required** at checkout.
- Fix: placing an order should not immediately block the same customer from seeing status.
- Live order status page (realtime via Supabase Realtime).
- **Invoice PDF download** with itemised lines + totals.

## Phase 3 — Super Admin Console (`/admin`)

- Dashboard KPIs + charts (MRR/ARR, restaurant growth, order volume, subscription mix).
- Restaurants table with all listed columns + actions (approve/reject/suspend/activate/delete/reset-password/**send notification to specific owner**/renew/upgrade/downgrade/assign+extend trial/view details/login history/activity log). **No "Switch to restaurant view" / impersonation** per your instruction.
- Subscription plans CRUD (with all limit toggles), Billing, Support Tickets, Announcements (all/segment/single tenant, channels: dashboard + email + SMS + WhatsApp stubs), Product Management (global settings, templates, API keys via secrets), Audit Logs, Reports (PDF/Excel/CSV).
- **Realtime notification to super admin when a new restaurant registers.**

## Phase 4 — "Coming in Phase" placeholder pages

Route-level stubs with "Coming soon" UI for: White-label domains, Custom Branding, Multi-branch, Franchise, Marketplace, Plugins, API Access, Webhooks, Inventory, Accounting, CRM, Marketing Automation, AI Analytics/Forecasting/Recommendations, Loyalty, Gift Cards, Referrals, POS, Thermal Printer, KDS, Offline Mode, Mobile Apps. Real work deferred.

## Technical notes

- TanStack Start file routes; protected areas under `src/routes/_authenticated/` and `src/routes/_admin/`.
- Every query goes through `requireSupabaseAuth` server fns; RLS policies scope by `tenant_id = current tenant of auth.uid()` via a `current_tenant_id()` security-definer fn.
- Realtime: Supabase channels for orders + notifications.
- Payments (Razorpay/PhonePe/Stripe) and Twilio/WhatsApp: wired as secret placeholders; live integration only when you provide keys.

## What I need from you before I start

1. **Approve this plan** (or tell me what to cut/re-order).
2. **Scope for this turn**: I recommend shipping Phase 0 + a walkable skeleton of Phase 1 pages this turn, then iterating. Ok?
3. **Payment provider**: Razorpay+PhonePe (India-first, matches GST/UPI in your spec) or Stripe? I'll wire the chosen one; the others become stubs.
4. **Super admin email/password** you want seeded (defaults to `admin@platform.dev / Admin123!` if you don't specify).
