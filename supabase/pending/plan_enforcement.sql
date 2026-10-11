-- =====================================================================
-- PENDING: server-side enforcement of subscription plan limits & features.
--
-- NOT A MIGRATION YET. It lives in supabase/pending/ so it isn't applied
-- automatically. Review it, test it on a staging project, then move it to
-- supabase/migrations/ with a fresh timestamp.
--
-- What it does (BEFORE INSERT triggers, so the database refuses the row):
--   menu_items        -> max_menu_items
--   staff_members     -> max_staff
--   orders            -> max_orders_month (counted per calendar month, IST)
--   restaurant_tables -> max_tables, and the Tables & QR feature
--   table_reservations / event_bookings -> the Bookings feature
--
-- Rules, matching the app (src/lib/plan-limits.ts, src/config/plan-features.ts,
-- and the owner shell in src/routes/_authenticated/app.tsx):
--   * Dashboards are always on.
--   * Trial (no active paid plan, within trial_days of tenants.created_at): every
--     feature, no limits.
--   * Trial ended, no active paid plan: every insert below is refused.
--   * Active paid plan with features = '{}': no feature restriction.
--   * A NULL limit: unlimited.
--
-- Not covered here (needs a decision first, see notes at the bottom):
--   * Read access to plan-gated data (customers, reviews, WhatsApp, revenue...).
--   * Orders that some other path inserts.
-- =====================================================================

-- ---------- helpers -------------------------------------------------------

-- Trial length in days from platform_settings.trial_days ({"text": "14"}).
-- Falls back to 14, and rejects values the app would also reject (1..365).
CREATE OR REPLACE FUNCTION public.platform_trial_days()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE
              WHEN ps.value ->> 'text' ~ '^[0-9]{1,3}$'
                   AND (ps.value ->> 'text')::INT BETWEEN 1 AND 365
              THEN (ps.value ->> 'text')::INT
            END
     FROM public.platform_settings ps
     WHERE ps.key = 'trial_days'),
    14)
$$;

-- What the tenant may use right now:
--   * the active paid plan (JSON of subscription_plans), or
--   * {"trial": true}   inside the trial window measured from tenants.created_at, or
--   * {"expired": true} once the trial has ended with no paid plan.
CREATE OR REPLACE FUNCTION public.tenant_access(p_tenant UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan JSONB;
  v_created TIMESTAMPTZ;
BEGIN
  SELECT to_jsonb(sp) INTO v_plan
  FROM public.subscriptions s
  JOIN public.subscription_plans sp ON sp.id = s.plan_id
  WHERE s.tenant_id = p_tenant
    AND s.status = 'active'
    AND s.current_period_end > now()
  ORDER BY s.current_period_end DESC
  LIMIT 1;

  IF v_plan IS NOT NULL THEN
    RETURN v_plan;
  END IF;

  SELECT t.created_at INTO v_created FROM public.tenants t WHERE t.id = p_tenant;
  IF v_created IS NOT NULL AND now() < v_created + make_interval(days => public.platform_trial_days()) THEN
    RETURN '{"trial": true}'::JSONB;
  END IF;

  RETURN '{"expired": true}'::JSONB;
END;
$$;

-- Whether the tenant may use a feature key. Dashboards are always on.
-- A trial gets every feature. A plan with no feature config ('{}') gets every feature.
CREATE OR REPLACE FUNCTION public.plan_allows(p_tenant UUID, p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a JSONB := public.tenant_access(p_tenant);
  f JSONB;
BEGIN
  IF p_feature = 'dashboards' THEN RETURN TRUE; END IF;
  IF a ? 'expired' THEN RETURN FALSE; END IF;
  IF a ? 'trial' THEN RETURN TRUE; END IF;
  f := COALESCE(a -> 'features', '{}'::JSONB);
  IF f = '{}'::JSONB THEN RETURN TRUE; END IF;
  RETURN COALESCE((f ->> p_feature)::BOOLEAN, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.platform_trial_days() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tenant_access(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.plan_allows(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_trial_days() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_access(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_allows(UUID, TEXT) TO authenticated, service_role;

-- ---------- one trigger function for limits and features -----------------
-- TG_ARGV:
--   [0] limit key (max_menu_items / max_staff / max_orders_month / max_tables) or ''
--   [1] table name, in public
--   [2] label used in the limit message, e.g. 'menu items'
--   [3] 'monthly' to count this calendar month only, otherwise 'all'
--   [4] feature key the table needs (e.g. 'tables_qr', 'bookings') or ''

CREATE OR REPLACE FUNCTION public.enforce_plan_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit_key TEXT := NULLIF(TG_ARGV[0], '');
  v_table     TEXT := TG_ARGV[1];
  v_label     TEXT := TG_ARGV[2];
  v_feature   TEXT := NULLIF(TG_ARGV[4], '');
  v_access    JSONB;
  v_max       INT;
  v_since     TIMESTAMPTZ := '-infinity'::TIMESTAMPTZ;
  v_count     BIGINT;
BEGIN
  v_access := public.tenant_access(NEW.tenant_id);

  IF v_access ? 'expired' THEN
    RAISE EXCEPTION 'Your free trial has ended. Choose a plan to keep using your restaurant.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Trial: everything is allowed, with no limits.
  IF v_access ? 'trial' THEN
    RETURN NEW;
  END IF;

  IF v_feature IS NOT NULL AND NOT public.plan_allows(NEW.tenant_id, v_feature) THEN
    RAISE EXCEPTION 'This feature is not included in your plan. Upgrade to use it.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_limit_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_max := (v_access ->> v_limit_key)::INT;
  IF v_max IS NULL THEN RETURN NEW; END IF;

  -- Serialise concurrent inserts for the same tenant so two requests can't
  -- both pass the count at the same time.
  PERFORM pg_advisory_xact_lock(hashtext(v_table || ':' || NEW.tenant_id::TEXT));

  IF TG_ARGV[3] = 'monthly' THEN
    v_since := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
  END IF;

  EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1 AND created_at >= $2', v_table)
    INTO v_count
    USING NEW.tenant_id, v_since;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Your plan allows % %. Upgrade to add more.', v_max, v_label
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------- attach to tables ----------------------------------------------

DROP TRIGGER IF EXISTS trg_plan_menu_items ON public.menu_items;
CREATE TRIGGER trg_plan_menu_items BEFORE INSERT ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_rules('max_menu_items', 'menu_items', 'menu items', 'all', '');

DROP TRIGGER IF EXISTS trg_plan_staff_members ON public.staff_members;
CREATE TRIGGER trg_plan_staff_members BEFORE INSERT ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_rules('max_staff', 'staff_members', 'staff members', 'all', '');

DROP TRIGGER IF EXISTS trg_plan_orders ON public.orders;
CREATE TRIGGER trg_plan_orders BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_rules('max_orders_month', 'orders', 'orders a month', 'monthly', '');

DROP TRIGGER IF EXISTS trg_plan_restaurant_tables ON public.restaurant_tables;
CREATE TRIGGER trg_plan_restaurant_tables BEFORE INSERT ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_rules('max_tables', 'restaurant_tables', 'tables', 'all', 'tables_qr');

-- Bookings tables were created outside the migrations, so attach only if they exist.
DO $$
BEGIN
  IF to_regclass('public.table_reservations') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_plan_table_reservations ON public.table_reservations;
    CREATE TRIGGER trg_plan_table_reservations BEFORE INSERT ON public.table_reservations
      FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_rules('', 'table_reservations', 'bookings', 'all', 'bookings');
  END IF;
  IF to_regclass('public.event_bookings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_plan_event_bookings ON public.event_bookings;
    CREATE TRIGGER trg_plan_event_bookings BEFORE INSERT ON public.event_bookings
      FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_rules('', 'event_bookings', 'bookings', 'all', 'bookings');
  END IF;
END $$;

-- ---------- test plan (run on staging, not here) ----------------------------
-- 1. Plan with max_menu_items = 2: the third menu item insert must fail with
--    "Your plan allows 2 menu items. Upgrade to add more."
-- 2. Plan with max_tables = NULL: many tables insert fine.
-- 3. Plan features without 'bookings': a table_reservations insert fails.
-- 4. Tenant registered < trial_days ago, no plan: every insert above succeeds, with no limits.
-- 5. Tenant registered > trial_days ago, no plan: every insert above fails with
--    "Your free trial has ended...".
-- 6. Plan with features = '{}': bookings and tables insert succeed.
-- 7. Plan with dashboards = false: the dashboard still works (no trigger involved).
--
-- ---------- rollback -------------------------------------------------------
-- DROP TRIGGER IF EXISTS trg_plan_menu_items ON public.menu_items;
-- DROP TRIGGER IF EXISTS trg_plan_staff_members ON public.staff_members;
-- DROP TRIGGER IF EXISTS trg_plan_orders ON public.orders;
-- DROP TRIGGER IF EXISTS trg_plan_restaurant_tables ON public.restaurant_tables;
-- DROP TRIGGER IF EXISTS trg_plan_table_reservations ON public.table_reservations;
-- DROP TRIGGER IF EXISTS trg_plan_event_bookings ON public.event_bookings;
-- DROP FUNCTION IF EXISTS public.enforce_plan_rules();
-- DROP FUNCTION IF EXISTS public.plan_allows(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.tenant_access(UUID);
-- DROP FUNCTION IF EXISTS public.platform_trial_days();
--
-- ---------- open decisions ---------------------------------------------------
-- a) Read access is NOT restricted here. Customers, reviews, WhatsApp and
--    revenue data can still be read through the API. Gating reads means changing
--    the SELECT policies on those tables, which needs a per-table decision.
-- b) Orders from other insert paths are counted only if they write to public.orders.
