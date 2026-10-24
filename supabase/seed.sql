-- FAKE sample data for the STAGING project. Never run this on production.
--
-- Everything here is invented: names, phone numbers (90000xxxxx), addresses,
-- e-mails (*.test). Written against the final schema of supabase/migrations.
--
-- How to run (staging only):
--   1. In the staging project: Authentication → Users → Add user
--        e-mail  owner@staging.dineeatz.test   (any password, auto-confirm)
--      That account becomes the owner of the demo restaurant. Without it the
--      data still loads, but nobody can log in to it (owner_id stays NULL).
--   2. SQL Editor → paste this whole file → UNCOMMENT the SET line below → Run.
--
-- Safe to re-run: fixed ids + ON CONFLICT DO NOTHING. Side effects to expect,
-- from triggers in the migrations:
--   * each tenant gets an organization only if organization_id is NULL (we pass one)
--     and 3 outreach_qr_codes rows; super admins get an "awaiting approval" notification
--   * each restaurant_tables row gets a qr_codes row
--   * each order gets order_number automatically and creates / bumps a customers
--     row (visits, total_spend) — so customers are NOT inserted here directly

-- SET app.allow_seed = 'yes';   -- ← uncomment to confirm this is the staging database

DO $$
BEGIN
  IF coalesce(current_setting('app.allow_seed', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'seed.sql refused: run "SET app.allow_seed = ''yes'';" first, and only on STAGING';
  END IF;
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- Organizations and outlets
-- ---------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, business_type, owner_id, status) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Spice Garden Hospitality (Demo)', 'SINGLE_OUTLET',
     (SELECT id FROM auth.users WHERE email = 'owner@staging.dineeatz.test'), 'active'),
  ('00000000-0000-4000-8000-000000000002', 'Chai Corner (Demo)', 'SINGLE_OUTLET', NULL, 'active')
ON CONFLICT (id) DO NOTHING;

-- status 'approved' + outlet_status 'ACTIVE' + address / city / owner_phone /
-- opening & closing time are what the app needs to treat an outlet as live
-- (otherwise it shows "awaiting approval" or locks the owner to Settings).
INSERT INTO public.tenants (
  id, organization_id, owner_id, name, slug, owner_name, owner_email, owner_phone,
  business_type, address, city, state, pincode, country, number_of_tables,
  brand_color, currency, timezone, status, outlet_status, slogan, opening_time,
  closing_time, settings
) VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
     (SELECT id FROM auth.users WHERE email = 'owner@staging.dineeatz.test'),
     'Spice Garden (Demo)', 'demo-spice-garden', 'Riya Demo', 'owner@staging.dineeatz.test', '9000000100',
     'SINGLE_OUTLET', '12 Test Street, Sector 1', 'Pune', 'Maharashtra', '411001', 'India', 4,
     '#0ea5e9', 'INR', 'Asia/Kolkata', 'approved', 'ACTIVE', 'Staging sample restaurant', '09:00', '23:00',
     -- Settings → Invoice & tax / delivery. Discount and service charge are 0 so
     -- new staging orders behave like an untouched outlet.
     '{"tax_rate": "5", "discount_type": "rupees", "discount_value": 0, "service_charge": 0,
       "delivery_enabled": true, "delivery_fee": 40, "delivery_min_order": 200,
       "delivery_pincodes": ["411001", "411002"]}'::jsonb),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000002', NULL,
     'Chai Corner (Demo)', 'demo-chai-corner', 'Kabir Demo', 'chai@staging.dineeatz.test', '9000000200',
     'SINGLE_OUTLET', '7 Sample Road', 'Bengaluru', 'Karnataka', '560001', 'India', 2,
     '#16a34a', 'INR', 'Asia/Kolkata', 'approved', 'ACTIVE', NULL, '07:00', '21:00',
     '{"tax_rate": "0"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Keeps the demo outlet past the free trial (the app blocks every page once
-- created_at + trial_days has passed without an active subscription).
-- Uses the free plan that migration 20261016120000 creates; skipped if it's missing.
INSERT INTO public.subscriptions (id, tenant_id, plan_id, status, current_period_start, current_period_end)
SELECT '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000101', p.id,
       'active', now(), now() + interval '1 year'
FROM public.subscription_plans p
WHERE p.is_free
LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tables and menu
-- ---------------------------------------------------------------------------
INSERT INTO public.restaurant_tables (id, tenant_id, label, seats, is_active) VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Table 1', 4, true),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'Table 2', 2, true),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000101', 'Table 3', 6, true),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000101', 'Patio', 4, false),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000102', 'Counter', 2, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.menu_categories (id, tenant_id, name, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101', 'Starters', 1),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000101', 'Main Course', 2),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000101', 'Breads', 3),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000101', 'Beverages', 4),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000102', 'Chai & Snacks', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.menu_items (id, tenant_id, category_id, name, description, price, is_veg, is_available, is_must_try, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000301', 'Paneer Tikka', 'Char-grilled cottage cheese, mint chutney', 280, true, true, true, 1),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000301', 'Chicken 65', 'Spicy fried chicken', 320, false, true, false, 2),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000302', 'Dal Makhani', 'Slow-cooked black lentils', 240, true, true, false, 1),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000302', 'Butter Chicken', 'Tandoori chicken in tomato-butter gravy', 360, false, true, true, 2),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303', 'Butter Naan', NULL, 60, true, true, false, 1),
  ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303', 'Tandoori Roti', NULL, 30, true, true, false, 2),
  ('00000000-0000-4000-8000-000000000407', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000304', 'Masala Chai', NULL, 40, true, true, false, 1),
  ('00000000-0000-4000-8000-000000000408', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000304', 'Sweet Lassi', NULL, 90, true, true, false, 2),
  ('00000000-0000-4000-8000-000000000409', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000304', 'Cold Coffee', 'Out of stock — tests the unavailable state', 120, true, false, false, 3),
  ('00000000-0000-4000-8000-000000000411', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000305', 'Cutting Chai', NULL, 20, true, true, true, 1),
  ('00000000-0000-4000-8000-000000000412', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000305', 'Bun Maska', NULL, 45, true, true, false, 2)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Orders. Totals follow src/lib/billing.ts: subtotal − discount, tax on that,
-- then service charge and delivery added after tax. order_number is assigned
-- by the orders_set_order_number trigger.
-- ---------------------------------------------------------------------------
INSERT INTO public.orders (
  id, tenant_id, table_id, customer_name, customer_phone, order_type, status, payment_status,
  subtotal, discount_type, discount_value, discount_amount, tax, service_charge, delivery_fee, total,
  delivery_address, delivery_landmark, delivery_pincode, notes, created_at, served_at
) VALUES
  -- 2 Paneer Tikka + 2 Butter Naan = 680; tax 5% = 34
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201',
     'Aarav Test', '9000000001', 'dine_in', 'served', 'paid',
     680, 'rupees', 0, 0, 34, 0, 0, 714, NULL, NULL, NULL, NULL, now() - interval '2 days', now() - interval '2 days' + interval '40 minutes'),
  -- 1 Butter Chicken + 2 Tandoori Roti = 420; 10% off = 42 → 378; tax 18.90
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000101', NULL,
     'Meera Sample', '9000000002', 'takeaway', 'served', 'paid',
     420, 'percentage', 10, 42, 18.90, 0, 0, 396.90, NULL, NULL, NULL, 'Less spicy', now() - interval '1 day', now() - interval '1 day' + interval '25 minutes'),
  -- 1 Dal Makhani + 1 Sweet Lassi + 2 Masala Chai = 410; ₹50 off → 360; tax 18; service 20
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000202',
     'Kabir Placeholder', '9000000003', 'dine_in', 'preparing', 'unpaid',
     410, 'rupees', 50, 50, 18, 20, 0, 398, NULL, NULL, NULL, NULL, now() - interval '20 minutes', NULL),
  -- 1 Chicken 65 + 1 Butter Naan = 380; tax 19; delivery 40
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000101', NULL,
     'Isha Example', '9000000004', 'home_delivery', 'new', 'unpaid',
     380, 'rupees', 0, 0, 19, 0, 40, 439, 'Flat 101, Test Residency, Sector 2', 'Near Demo Park', '411002', NULL, now() - interval '5 minutes', NULL),
  -- 1 Masala Chai = 40; tax 2
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000203',
     'Walk-in', '9000000005', 'dine_in', 'cancelled', 'unpaid',
     40, 'rupees', 0, 0, 2, 0, 0, 42, NULL, NULL, NULL, 'Customer left', now() - interval '3 hours', NULL),
  -- 2 Cutting Chai + 1 Bun Maska = 85; no tax at this outlet
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000205',
     'Aarav Test', '9000000001', 'dine_in', 'served', 'paid',
     85, 'rupees', 0, 0, 0, 0, 0, 85, NULL, NULL, NULL, NULL, now() - interval '6 hours', now() - interval '6 hours' + interval '10 minutes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.order_items (id, order_id, tenant_id, menu_item_id, name, price, quantity) VALUES
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000401', 'Paneer Tikka', 280, 2),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000405', 'Butter Naan', 60, 2),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000404', 'Butter Chicken', 360, 1),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000406', 'Tandoori Roti', 30, 2),
  ('00000000-0000-4000-8000-000000000605', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000403', 'Dal Makhani', 240, 1),
  ('00000000-0000-4000-8000-000000000606', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000408', 'Sweet Lassi', 90, 1),
  ('00000000-0000-4000-8000-000000000607', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000407', 'Masala Chai', 40, 2),
  ('00000000-0000-4000-8000-000000000608', '00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000402', 'Chicken 65', 320, 1),
  ('00000000-0000-4000-8000-000000000609', '00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000405', 'Butter Naan', 60, 1),
  ('00000000-0000-4000-8000-000000000610', '00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000407', 'Masala Chai', 40, 1),
  ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000411', 'Cutting Chai', 20, 2),
  ('00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000412', 'Bun Maska', 45, 1)
ON CONFLICT (id) DO NOTHING;

-- TODO: optional extras not seeded — staff (user_roles + auth users), reviews,
-- expenses, loyalty, WhatsApp campaigns, global menus. Add when staging tests need them.

COMMIT;
