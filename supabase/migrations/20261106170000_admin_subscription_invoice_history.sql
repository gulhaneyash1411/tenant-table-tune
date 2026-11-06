ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'scheduled';

CREATE OR REPLACE FUNCTION public._admin_create_subscription(
  p_tenant_id UUID,
  p_plan_id UUID,
  p_cycle TEXT,
  p_activate BOOLEAN,
  p_record_payment BOOLEAN
) RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_running public.subscriptions;
  v_sub public.subscriptions;
  v_price NUMERIC;
  v_plan_name TEXT;
  v_last_end TIMESTAMPTZ;
  v_action TEXT;
  v_has_scheduled BOOLEAN;
BEGIN
  PERFORM public._require_super_admin();

  IF p_cycle IS NULL OR p_cycle NOT IN ('monthly', 'half_yearly', 'yearly') THEN
    RAISE EXCEPTION 'Invalid billing cycle';
  END IF;

  SELECT
    CASE p_cycle
      WHEN 'yearly' THEN yearly_price
      WHEN 'half_yearly' THEN half_yearly_price
      ELSE monthly_price
    END,
    name
  INTO v_price, v_plan_name
  FROM public.subscription_plans
  WHERE id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Outlet not found';
  END IF;

  SELECT * INTO v_running
  FROM public.subscriptions
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
    AND current_period_end > now()
  ORDER BY current_period_end DESC
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
      AND status = 'scheduled'
      AND current_period_end > now()
  ) INTO v_has_scheduled;

  IF v_running.id IS NOT NULL AND v_running.plan_id = p_plan_id AND NOT v_has_scheduled THEN
    UPDATE public.subscriptions
    SET current_period_end = public._add_billing_cycle(current_period_end, p_cycle)
    WHERE id = v_running.id
    RETURNING * INTO v_sub;
    v_action := 'renewed';
  ELSIF v_running.id IS NOT NULL OR v_has_scheduled THEN
    SELECT GREATEST(COALESCE(MAX(current_period_end), now()), now())
    INTO v_last_end
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
      AND status IN ('active', 'scheduled')
      AND current_period_end > now();

    INSERT INTO public.subscriptions (
      tenant_id, plan_id, status, current_period_start, current_period_end
    )
    VALUES (
      p_tenant_id, p_plan_id, 'scheduled', v_last_end,
      public._add_billing_cycle(v_last_end, p_cycle)
    )
    RETURNING * INTO v_sub;
    v_action := 'scheduled';
  ELSE
    INSERT INTO public.subscriptions (
      tenant_id, plan_id, status, current_period_start, current_period_end
    )
    VALUES (
      p_tenant_id, p_plan_id, 'active', now(),
      public._add_billing_cycle(now(), p_cycle)
    )
    RETURNING * INTO v_sub;
    v_action := 'started';
  END IF;

  IF p_activate AND v_sub.status = 'active' THEN
    UPDATE public.tenants
    SET outlet_status = 'ACTIVE', updated_at = now()
    WHERE id = p_tenant_id AND outlet_status <> 'ACTIVE';
  END IF;

  PERFORM public.admin_log(
    'subscription.created', p_tenant_id, 'subscription', v_sub.id::TEXT, NULL,
    jsonb_build_object('plan_id', p_plan_id, 'cycle', p_cycle, 'action', v_action)
  );
  RETURN v_sub;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_subscription(
  p_tenant_id UUID, p_plan_id UUID, p_cycle TEXT, p_activate BOOLEAN DEFAULT true
) RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
  v_tenant public.tenants;
  v_plan_name TEXT;
  v_price NUMERIC;
  v_invoice_id UUID;
  v_period_start TIMESTAMPTZ;
BEGIN
  PERFORM public._require_super_admin();

  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outlet not found'; END IF;

  SELECT
    CASE p_cycle
      WHEN 'yearly' THEN yearly_price
      WHEN 'half_yearly' THEN half_yearly_price
      ELSE monthly_price
    END,
    name
  INTO v_price, v_plan_name
  FROM public.subscription_plans
  WHERE id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;

  SELECT s.current_period_end INTO v_period_start
  FROM public.subscriptions s
  WHERE s.tenant_id = p_tenant_id
    AND s.plan_id = p_plan_id
    AND s.status = 'active'
    AND s.current_period_end > now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.subscriptions queued
      WHERE queued.tenant_id = p_tenant_id
        AND queued.status = 'scheduled'
        AND queued.current_period_end > now()
    )
  ORDER BY s.current_period_end DESC
  LIMIT 1;

  v_sub := public._admin_create_subscription(p_tenant_id, p_plan_id, p_cycle, p_activate, false);

  IF v_price > 0 THEN
    INSERT INTO public.invoices (
      tenant_id, organization_id, subscription_id, amount, subtotal, tax, status,
      issued_at, paid_at, invoice_number, amount_paid, plan, plan_id, billing_cycle,
      payment_method, period_start, period_end, finalized_at, invoice_kind,
      billing_address, gst_number, description, notes, line_items, meta
    )
    VALUES (
      p_tenant_id, v_tenant.organization_id, v_sub.id, v_price, v_price, 0, 'paid',
      now(), now(), public.next_invoice_number(), v_price, v_plan_name, p_plan_id, p_cycle,
      'cash',
      CASE WHEN v_sub.status = 'active' THEN COALESCE(v_period_start, v_sub.current_period_start)
           ELSE v_sub.current_period_start END,
      v_sub.current_period_end, now(),
      CASE WHEN v_sub.status = 'scheduled' OR v_period_start IS NOT NULL THEN 'renewal' ELSE 'subscription' END,
      concat_ws(', ', v_tenant.address, v_tenant.city, v_tenant.state),
      v_tenant.gst_number,
      format('%s plan subscription (%s)', v_plan_name, p_cycle),
      'Manually recorded as cash by a super admin.',
      jsonb_build_array(jsonb_build_object(
        'description', format('%s plan (%s)', v_plan_name, p_cycle),
        'quantity', 1,
        'unit_price', v_price
      )),
      jsonb_build_object('source', 'admin_subscription')
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.payments (
      organization_id, tenant_id, invoice_id, amount, method, status, reference, paid_at, notes, recorded_by
    )
    VALUES (
      v_tenant.organization_id, p_tenant_id, v_invoice_id, v_price, 'cash', 'completed',
      format('Admin subscription: %s (%s)', v_plan_name, p_cycle),
      now(), format('Subscription %s created or renewed by a super admin.', v_sub.id), auth.uid()
    );
  END IF;

  RETURN v_sub;
END;
$$;

REVOKE ALL ON FUNCTION public._admin_create_subscription(UUID, UUID, TEXT, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_subscription(UUID, UUID, TEXT, BOOLEAN)
  TO authenticated;

DROP FUNCTION IF EXISTS public.activate_scheduled_subscriptions();
CREATE FUNCTION public.activate_scheduled_subscriptions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
  v_count INT := 0;
BEGIN
  FOR v_sub IN
    SELECT *
    FROM public.subscriptions
    WHERE status = 'scheduled'
      AND current_period_start <= now()
    ORDER BY current_period_start
  LOOP
    UPDATE public.subscriptions
    SET status = 'expired'
    WHERE tenant_id = v_sub.tenant_id
      AND status = 'active'
      AND id <> v_sub.id;

    UPDATE public.subscriptions
    SET status = 'active'
    WHERE id = v_sub.id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_scheduled_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_scheduled_subscriptions() TO authenticated, service_role;

WITH legacy_payments AS (
  SELECT
    p.id AS payment_id,
    p.tenant_id,
    p.organization_id,
    p.amount,
    COALESCE(p.paid_at, p.created_at) AS paid_at,
    p.reference,
    substring(p.notes FROM 'Subscription ([0-9a-fA-F-]{36})')::UUID AS subscription_id,
    substring(p.reference FROM '^Admin subscription: (.*) \((monthly|half_yearly|yearly)\)$') AS plan_name,
    substring(p.reference FROM '\((monthly|half_yearly|yearly)\)$') AS billing_cycle
  FROM public.payments p
  WHERE p.invoice_id IS NULL
    AND p.status = 'completed'
    AND p.reference LIKE 'Admin subscription: %'
), created_invoices AS (
  INSERT INTO public.invoices (
    tenant_id, organization_id, subscription_id, amount, subtotal, tax, status,
    issued_at, paid_at, invoice_number, amount_paid, plan, plan_id, billing_cycle,
    payment_method, finalized_at, invoice_kind, description, notes, line_items, meta
  )
  SELECT
    lp.tenant_id, lp.organization_id, s.id, lp.amount, lp.amount, 0, 'paid',
    lp.paid_at, lp.paid_at, public.next_invoice_number(), lp.amount,
    COALESCE(lp.plan_name, sp.name), s.plan_id, lp.billing_cycle,
    'cash', lp.paid_at,
    CASE WHEN s.status::TEXT = 'scheduled' THEN 'renewal' ELSE 'subscription' END,
    'Admin-created subscription payment',
    'Historical admin subscription payment; recorded as cash.',
    jsonb_build_array(jsonb_build_object(
      'description', COALESCE(lp.plan_name, sp.name, 'Subscription plan'),
      'quantity', 1,
      'unit_price', lp.amount
    )),
    jsonb_build_object('source', 'admin_subscription', 'payment_id', lp.payment_id)
  FROM legacy_payments lp
  JOIN public.subscriptions s ON s.id = lp.subscription_id
  LEFT JOIN public.subscription_plans sp ON sp.id = s.plan_id
  WHERE lp.subscription_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.meta->>'payment_id' = lp.payment_id::TEXT
    )
  RETURNING id, meta
)
UPDATE public.payments p
SET invoice_id = ci.id,
    method = 'cash'
FROM created_invoices ci
WHERE ci.meta->>'payment_id' = p.id::TEXT;
