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
  v public.subscriptions;
  v_price NUMERIC;
  v_plan_name TEXT;
  v_organization_id UUID;
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

  SELECT * INTO v_running
  FROM public.subscriptions
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
    AND current_period_end > now()
  ORDER BY current_period_end DESC
  LIMIT 1;

  IF v_running.id IS NOT NULL THEN
    UPDATE public.subscriptions
    SET plan_id = p_plan_id,
        current_period_end = public._add_billing_cycle(current_period_end, p_cycle)
    WHERE id = v_running.id
    RETURNING * INTO v;
  ELSE
    INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (p_tenant_id, p_plan_id, 'active', now(), public._add_billing_cycle(now(), p_cycle))
    RETURNING * INTO v;
  END IF;

  IF p_activate THEN
    UPDATE public.tenants
    SET outlet_status = 'ACTIVE', updated_at = now()
    WHERE id = p_tenant_id AND outlet_status <> 'ACTIVE';
  END IF;

  -- Invoice payments are already recorded by admin_record_payment.
  IF p_record_payment AND v_price > 0 THEN
    INSERT INTO public.payments (
      organization_id, tenant_id, amount, method, status, reference, paid_at, notes, recorded_by
    )
    VALUES (
      v_organization_id, p_tenant_id, v_price, 'cash', 'completed',
      format('Admin subscription: %s (%s)', v_plan_name, p_cycle),
      now(), format('Subscription %s created or renewed by a super admin.', v.id), auth.uid()
    );
  END IF;

  PERFORM public.admin_log(
    'subscription.created', p_tenant_id, 'subscription', v.id::TEXT, NULL,
    jsonb_build_object('plan_id', p_plan_id, 'cycle', p_cycle, 'renewed', v_running.id IS NOT NULL)
  );
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public._admin_create_subscription(UUID, UUID, TEXT, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_subscription(
  p_tenant_id UUID, p_plan_id UUID, p_cycle TEXT, p_activate BOOLEAN DEFAULT true
) RETURNS public.subscriptions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public._admin_create_subscription(p_tenant_id, p_plan_id, p_cycle, p_activate, true);
$$;

CREATE OR REPLACE FUNCTION public.admin_record_payment(
  p_invoice_id UUID, p_amount NUMERIC, p_method TEXT, p_reference TEXT,
  p_paid_at TIMESTAMPTZ, p_notes TEXT DEFAULT NULL, p_proof_url TEXT DEFAULT NULL
) RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices;
  v_pay public.payments;
  v_paid NUMERIC;
  v_status TEXT;
  v_sub public.subscriptions;
BEGIN
  PERFORM public._require_super_admin();
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status IN ('cancelled', 'draft', 'rejected') THEN
    RAISE EXCEPTION 'Payments can only be recorded against an issued invoice';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter a payment amount'; END IF;
  IF v_inv.amount_paid + p_amount > v_inv.amount + 0.005 THEN
    RAISE EXCEPTION 'This payment exceeds the amount due on the invoice';
  END IF;

  INSERT INTO public.payments (
    organization_id, tenant_id, invoice_id, amount, method, reference, paid_at,
    notes, proof_url, recorded_by
  )
  VALUES (
    v_inv.organization_id, v_inv.tenant_id, v_inv.id, p_amount, p_method, p_reference,
    COALESCE(p_paid_at, now()), p_notes, p_proof_url, auth.uid()
  )
  RETURNING * INTO v_pay;

  v_paid := v_inv.amount_paid + p_amount;
  v_status := CASE WHEN v_paid >= v_inv.amount - 0.005 THEN 'paid' ELSE 'partially_paid' END;
  UPDATE public.invoices
  SET amount_paid = v_paid,
      status = v_status,
      paid_at = CASE WHEN v_status = 'paid' THEN COALESCE(p_paid_at, now()) ELSE paid_at END,
      payment_method = COALESCE(payment_method, 'manual')
  WHERE id = v_inv.id;

  IF v_status = 'paid' THEN
    IF v_inv.plan_id IS NOT NULL AND v_inv.subscription_id IS NULL
      AND v_inv.invoice_kind IN ('subscription', 'renewal') THEN
      v_sub := public._admin_create_subscription(
        v_inv.tenant_id, v_inv.plan_id, COALESCE(v_inv.billing_cycle, 'monthly'), true, false
      );
      UPDATE public.invoices SET subscription_id = v_sub.id WHERE id = v_inv.id;
    ELSE
      UPDATE public.tenants
      SET outlet_status = 'ACTIVE', updated_at = now()
      WHERE id = v_inv.tenant_id
        AND outlet_status = 'PENDING_PAYMENT'
        AND v_inv.subscription_id IS NOT NULL;
    END IF;
  END IF;

  PERFORM public.admin_log(
    'payment.recorded', v_inv.tenant_id, 'payment', v_pay.id::TEXT, NULL,
    jsonb_build_object('invoice_id', v_inv.id, 'amount', p_amount, 'method', p_method, 'invoice_status', v_status)
  );
  RETURN v_pay;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_subscription(UUID, UUID, TEXT, BOOLEAN),
  public.admin_record_payment(UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)
TO authenticated;
