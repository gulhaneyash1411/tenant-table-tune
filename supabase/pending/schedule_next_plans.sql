-- =====================================================================
-- PENDING: schedule a purchased plan to start after the current one ends.
--
-- NOT A MIGRATION YET. Review, test on staging, then move to
-- supabase/migrations/ with a fresh timestamp.
--
-- Why: today admin_create_subscription() extends the running subscription AND
-- switches its plan_id straight away when an owner's payment is approved. The
-- owner page promises "This plan will become active after the current plan
-- ends", and it reads subscriptions with status 'scheduled'. Nothing in the
-- migrations creates those rows, and 'scheduled' is not in the
-- subscription_status enum. The live database may differ from the migrations,
-- so check it first (see the bottom of this file).
--
-- What this does:
--   1. Adds 'scheduled' to subscription_status.
--   2. admin_create_subscription(): same plan AND same cycle -> extend the running
--      period (renewal, unchanged). Anything else while a plan is running -> create a
--      'scheduled' row that starts when the last paid period ends.
--   3. activate_scheduled_subscriptions(): when a scheduled row's start has passed,
--      end the running row and activate the scheduled one. Runs from the owner page
--      (already called) and from a daily cron job.
--
-- Decision for you: admin_create_subscription() is also used by the admin
-- "Renew / change plan" dialog. After this change, an admin changing plan on a
-- running subscription schedules the new plan instead of switching now.
-- =====================================================================

-- 1. Enum value (no-op if the live database already has it).
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'scheduled';

-- Billing cycle of an existing period, from its length (same rule as the admin pages).
CREATE OR REPLACE FUNCTION public._cycle_of_period(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(EPOCH FROM (p_end - p_start)) / 86400 > 320 THEN 'yearly'
    WHEN EXTRACT(EPOCH FROM (p_end - p_start)) / 86400 > 120 THEN 'half_yearly'
    ELSE 'monthly'
  END
$$;

-- 2. Create or renew an outlet's subscription.
CREATE OR REPLACE FUNCTION public.admin_create_subscription(
  p_tenant_id UUID, p_plan_id UUID, p_cycle TEXT, p_activate BOOLEAN DEFAULT true
) RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_running public.subscriptions;
  v_last_end TIMESTAMPTZ;
  v public.subscriptions;
  v_action TEXT;
BEGIN
  PERFORM public._require_super_admin();

  SELECT * INTO v_running FROM public.subscriptions
  WHERE tenant_id = p_tenant_id AND status = 'active' AND current_period_end > now()
  ORDER BY current_period_end DESC LIMIT 1;

  IF v_running.id IS NOT NULL
     AND v_running.plan_id = p_plan_id
     AND public._cycle_of_period(v_running.current_period_start, v_running.current_period_end) = p_cycle THEN
    -- Renewal of the same plan on the same cycle: extend the running period.
    UPDATE public.subscriptions
    SET current_period_end = public._add_billing_cycle(current_period_end, p_cycle)
    WHERE id = v_running.id
    RETURNING * INTO v;
    v_action := 'renewed';

  ELSIF v_running.id IS NOT NULL THEN
    -- Another plan or cycle: start when the last paid period (running or scheduled) ends.
    SELECT GREATEST(COALESCE(MAX(current_period_end), now()), now()) INTO v_last_end
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id AND status IN ('active', 'scheduled') AND current_period_end > now();

    INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (p_tenant_id, p_plan_id, 'scheduled', v_last_end, public._add_billing_cycle(v_last_end, p_cycle))
    RETURNING * INTO v;
    v_action := 'scheduled';

  ELSE
    -- Nothing running: start now.
    INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (p_tenant_id, p_plan_id, 'active', now(), public._add_billing_cycle(now(), p_cycle))
    RETURNING * INTO v;
    v_action := 'started';
  END IF;

  IF p_activate AND v.status = 'active' THEN
    UPDATE public.tenants SET outlet_status = 'ACTIVE', updated_at = now()
    WHERE id = p_tenant_id AND outlet_status <> 'ACTIVE';
  END IF;

  PERFORM public.admin_log('subscription.created', p_tenant_id, 'subscription', v.id::TEXT, NULL,
    jsonb_build_object('plan_id', p_plan_id, 'cycle', p_cycle, 'action', v_action));
  RETURN v;
END;
$$;

-- 3. Start scheduled plans whose start date has come.
-- The live database already has a function with this name and a different return type,
-- so it must be dropped first. Check its definition before running this (see the bottom).
DROP FUNCTION IF EXISTS public.activate_scheduled_subscriptions();
CREATE FUNCTION public.activate_scheduled_subscriptions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.subscriptions;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.subscriptions
    WHERE status = 'scheduled' AND current_period_start <= now()
    ORDER BY current_period_start
  LOOP
    UPDATE public.subscriptions SET status = 'expired'
    WHERE tenant_id = r.tenant_id AND status = 'active' AND id <> r.id;
    UPDATE public.subscriptions SET status = 'active' WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_scheduled_subscriptions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_scheduled_subscriptions() TO authenticated, service_role;

-- Daily check, 00:05 IST (same pattern as the other cron jobs; skipped if pg_cron is absent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('activate-scheduled-subscriptions')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'activate-scheduled-subscriptions');
    PERFORM cron.schedule('activate-scheduled-subscriptions', '35 18 * * *',
      $cron$SELECT public.activate_scheduled_subscriptions();$cron$);
  END IF;
END $$;

-- ---------- check the live database first ----------------------------------
-- select pg_get_functiondef('public.activate_scheduled_subscriptions'::regproc);
-- select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
--   where t.typname = 'subscription_status';
-- select tenant_id, plan_id, status, current_period_start, current_period_end
--   from subscriptions order by tenant_id, current_period_start;
--
-- ---------- test plan (staging) -----------------------------------------------
-- 1. Running Growth monthly; approve a Growth yearly payment -> one 'scheduled' row
--    starting at the running end date. Running plan_id is unchanged.
-- 2. Approve a Starter monthly after that -> a second 'scheduled' row starting at the end of the first.
-- 3. Approve Growth monthly again (same plan and cycle as running) -> running period extended, no new row.
-- 4. Run activate_scheduled_subscriptions() at the scheduled start -> running row 'expired',
--    scheduled row 'active'.
--
-- ---------- rollback -----------------------------------------------------------
-- Restore the previous admin_create_subscription from
--   supabase/migrations/20261005170000_admin_multi_outlet.sql
-- DROP FUNCTION IF EXISTS public.activate_scheduled_subscriptions();
-- DROP FUNCTION IF EXISTS public._cycle_of_period(TIMESTAMPTZ, TIMESTAMPTZ);
-- (The enum value cannot be removed in PostgreSQL without recreating the type.)
