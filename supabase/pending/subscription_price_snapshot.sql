-- =====================================================================
-- PENDING: save each subscription's price and billing cycle when it starts.
--
-- NOT A MIGRATION YET. Review, test on staging, then move to
-- supabase/migrations/ with a fresh timestamp.
--
-- Why: subscriptions read the plan's *current* price. Changing a plan's price
-- therefore changed the amount shown for running subscriptions and the MRR
-- figures. After this change each subscription keeps the price and cycle it
-- was bought at. Plan names still come from the plan, so a rename shows on
-- every subscription.
--
-- Run AFTER supabase/pending/schedule_next_plans.sql. This file replaces its
-- admin_create_subscription() with a version that also saves the price.
-- =====================================================================

-- 1. Enum value, helpers (idempotent, in case the earlier file did not run).
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'scheduled';

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

-- The plan's price for one billing cycle, as it is today.
CREATE OR REPLACE FUNCTION public._plan_price(p_plan UUID, p_cycle TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_cycle
           WHEN 'yearly' THEN sp.yearly_price
           WHEN 'half_yearly' THEN sp.half_yearly_price
           ELSE sp.monthly_price
         END
  FROM public.subscription_plans sp
  WHERE sp.id = p_plan
$$;

-- 2. New columns: the price and cycle this subscription was bought at.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS price_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT;

-- 3. Backfill existing subscriptions.
--    Cycle: from the invoice that started the subscription, else from the period length.
UPDATE public.subscriptions s
SET billing_cycle = i.billing_cycle
FROM (
  SELECT DISTINCT ON (subscription_id) subscription_id, billing_cycle
  FROM public.invoices
  WHERE subscription_id IS NOT NULL AND status = 'paid' AND billing_cycle IS NOT NULL
  ORDER BY subscription_id, paid_at DESC NULLS LAST
) i
WHERE i.subscription_id = s.id AND s.billing_cycle IS NULL;

UPDATE public.subscriptions
SET billing_cycle = public._cycle_of_period(current_period_start, current_period_end)
WHERE billing_cycle IS NULL;

--    Price: the amount that was paid, else today's plan price (the best we have for old rows).
UPDATE public.subscriptions s
SET price_amount = i.amount
FROM (
  SELECT DISTINCT ON (subscription_id) subscription_id, amount
  FROM public.invoices
  WHERE subscription_id IS NOT NULL AND status = 'paid'
  ORDER BY subscription_id, paid_at DESC NULLS LAST
) i
WHERE i.subscription_id = s.id AND s.price_amount IS NULL;

UPDATE public.subscriptions
SET price_amount = public._plan_price(plan_id, billing_cycle)
WHERE price_amount IS NULL;

-- 4. Create or renew an outlet's subscription, saving the price it was bought at.
CREATE OR REPLACE FUNCTION public.admin_create_subscription(
  p_tenant_id UUID, p_plan_id UUID, p_cycle TEXT, p_activate BOOLEAN DEFAULT true
) RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_running public.subscriptions;
  v_last_end TIMESTAMPTZ;
  v_price NUMERIC := public._plan_price(p_plan_id, p_cycle);
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
    -- Renewal of the running period: it keeps the price it started with.
    UPDATE public.subscriptions
    SET current_period_end = public._add_billing_cycle(current_period_end, p_cycle)
    WHERE id = v_running.id
    RETURNING * INTO v;
    v_action := 'renewed';

  ELSIF v_running.id IS NOT NULL THEN
    -- Another plan or cycle: starts when the last paid period ends, at today's price.
    SELECT GREATEST(COALESCE(MAX(current_period_end), now()), now()) INTO v_last_end
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id AND status IN ('active', 'scheduled') AND current_period_end > now();

    INSERT INTO public.subscriptions
      (tenant_id, plan_id, status, current_period_start, current_period_end, price_amount, billing_cycle)
    VALUES (p_tenant_id, p_plan_id, 'scheduled', v_last_end,
            public._add_billing_cycle(v_last_end, p_cycle), v_price, p_cycle)
    RETURNING * INTO v;
    v_action := 'scheduled';

  ELSE
    INSERT INTO public.subscriptions
      (tenant_id, plan_id, status, current_period_start, current_period_end, price_amount, billing_cycle)
    VALUES (p_tenant_id, p_plan_id, 'active', now(),
            public._add_billing_cycle(now(), p_cycle), v_price, p_cycle)
    RETURNING * INTO v;
    v_action := 'started';
  END IF;

  IF p_activate AND v.status = 'active' THEN
    UPDATE public.tenants SET outlet_status = 'ACTIVE', updated_at = now()
    WHERE id = p_tenant_id AND outlet_status <> 'ACTIVE';
  END IF;

  PERFORM public.admin_log('subscription.created', p_tenant_id, 'subscription', v.id::TEXT, NULL,
    jsonb_build_object('plan_id', p_plan_id, 'cycle', p_cycle, 'price', v_price, 'action', v_action));
  RETURN v;
END;
$$;

-- 5. Weekly digest: MRR from the saved prices, as a monthly figure.
--    Same function as in 20261001120000_notification_triggers.sql, only the MRR line changes.
CREATE OR REPLACE FUNCTION public.notify_weekly_digest() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_signups INT; v_live INT; v_churned INT; v_mrr NUMERIC;
  v_orders INT; v_pending INT; v_ref TEXT;
BEGIN
  v_ref := 'weekly:' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'IYYY-IW');

  SELECT COUNT(*) INTO v_signups
    FROM public.tenants WHERE created_at >= now() - INTERVAL '7 days';

  SELECT COUNT(*) INTO v_live
    FROM public.tenants WHERE status = 'approved';

  SELECT COUNT(*) INTO v_pending
    FROM public.tenants WHERE status = 'pending';

  SELECT COUNT(*) INTO v_churned
    FROM public.subscriptions
    WHERE status IN ('canceled', 'expired')
      AND current_period_end >= now() - INTERVAL '7 days';

  SELECT COALESCE(SUM(
           CASE s.billing_cycle
             WHEN 'yearly' THEN s.price_amount / 12
             WHEN 'half_yearly' THEN s.price_amount / 6
             ELSE s.price_amount
           END), 0) INTO v_mrr
    FROM public.subscriptions s
    WHERE s.status = 'active';

  SELECT COUNT(*) INTO v_orders
    FROM public.orders WHERE created_at >= now() - INTERVAL '7 days';

  PERFORM public.notify_super_admins(
    NULL,
    'Weekly platform digest',
    v_signups || ' new signup(s), ' || v_pending || ' awaiting approval, ' ||
      v_live || ' live restaurant(s). MRR Rs ' || ROUND(v_mrr)::TEXT || '. ' ||
      v_churned || ' churned this week. ' || v_orders || ' orders platform-wide.',
    'platform_digest', v_ref,
    jsonb_build_object(
      'signups', v_signups, 'pending', v_pending, 'live', v_live,
      'churned', v_churned, 'mrr', v_mrr, 'orders', v_orders
    )
  );
  RETURN 1;
END; $$;

-- ---------- check first (live database) -------------------------------------
-- select count(*) from subscriptions where price_amount is null;   -- expect 0 after the backfill
--
-- ---------- test plan (staging) -----------------------------------------------
-- 1. Note a subscription's price_amount. Change its plan's monthly price. The subscription's
--    price_amount does not change, and the admin Subscriptions list still shows the old amount.
-- 2. Rename the plan. The new name shows on the owner page, the admin lists and the subscription.
-- 3. Approve a new purchase. Its price_amount is today's price for its cycle.
-- 4. Run the weekly digest. MRR equals the sum of active price_amount (monthly equivalent).
--
-- ---------- rollback -----------------------------------------------------------
-- Restore the previous admin_create_subscription from supabase/pending/schedule_next_plans.sql
-- and notify_weekly_digest from 20261001120000_notification_triggers.sql.
-- ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS price_amount, DROP COLUMN IF EXISTS billing_cycle;
