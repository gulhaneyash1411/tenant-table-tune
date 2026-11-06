UPDATE public.payments
SET method = 'cash'
WHERE method = 'other'
  AND reference LIKE 'Admin subscription: %';

CREATE OR REPLACE FUNCTION public.admin_create_subscription(
  p_tenant_id UUID, p_plan_id UUID, p_cycle TEXT, p_activate BOOLEAN DEFAULT true
) RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price NUMERIC;
  v_plan_name TEXT;
  v_organization_id UUID;
  v_sub public.subscriptions;
BEGIN
  PERFORM public._require_super_admin();

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

  SELECT organization_id INTO v_organization_id
  FROM public.tenants
  WHERE id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outlet not found'; END IF;

  v_sub := public._admin_create_subscription(p_tenant_id, p_plan_id, p_cycle, p_activate, false);

  IF v_price > 0 THEN
    INSERT INTO public.payments (
      organization_id, tenant_id, amount, method, status, reference, paid_at, notes, recorded_by
    )
    VALUES (
      v_organization_id, p_tenant_id, v_price, 'cash', 'completed',
      format('Admin subscription: %s (%s)', v_plan_name, p_cycle),
      now(), format('Subscription %s created or renewed by a super admin.', v_sub.id), auth.uid()
    );
  END IF;

  RETURN v_sub;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_subscription(UUID, UUID, TEXT, BOOLEAN)
  TO authenticated;
