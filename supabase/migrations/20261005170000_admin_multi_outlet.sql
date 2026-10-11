-- Admin panel for multi-outlet: invoices with tax breakdown, payments, audited
-- admin actions (outlet / subscription / invoice / payment), and super-admin
-- read access to tables the admin pages need.
--
-- Everything here is additive: existing columns, statuses and flows (UPI
-- checkout -> pending_approval -> approve in admin.billing) are untouched.
-- Invoice `status` is TEXT, so the new states (draft, issued, partially_paid,
-- overdue, cancelled) sit beside the existing ones (pending, paid,
-- pending_approval, rejected, free_trial).

-- Defined here too (CREATE OR REPLACE, identical to 20261005150000) so this file
-- also runs on its own if that migration hasn't been applied yet.
CREATE OR REPLACE FUNCTION public.is_outlet_owner(_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id AND t.owner_id = auth.uid());
$$;

-- ============ AUDIT: organization on every entry ============
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS audit_logs_org_idx ON public.audit_logs(organization_id);

-- Internal helper — only called from the SECURITY DEFINER admin functions below.
CREATE OR REPLACE FUNCTION public.admin_log(
  p_action TEXT, p_tenant_id UUID, p_entity TEXT, p_entity_id TEXT, p_old JSONB, p_new JSONB
) RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.audit_logs (actor_id, tenant_id, organization_id, action, entity, entity_id, old_value, new_value)
  VALUES (
    auth.uid(), p_tenant_id,
    (SELECT organization_id FROM public.tenants WHERE id = p_tenant_id),
    p_action, p_entity, p_entity_id, p_old, p_new
  );
$$;
REVOKE ALL ON FUNCTION public.admin_log(TEXT, UUID, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;

-- ============ INVOICES: tax breakdown, due date, line items ============
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_kind TEXT NOT NULL DEFAULT 'subscription',
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
-- Defensive: these exist in the live database but not in the repo migrations.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS plan_id UUID,
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS invoices_org_idx ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices(status);
UPDATE public.invoices i SET organization_id = t.organization_id
FROM public.tenants t WHERE t.id = i.tenant_id AND i.organization_id IS NULL;

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
$$;
REVOKE ALL ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated;

-- Once a manual invoice is issued, its money fields are frozen. Corrections go
-- through cancel + a new invoice (a credit-note equivalent), never an edit.
-- Only rows with finalized_at set are affected, so every pre-existing invoice and
-- the UPI approval flow keep working exactly as before.
CREATE OR REPLACE FUNCTION public.invoices_guard_finalized()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.finalized_at IS NOT NULL AND (
    NEW.amount IS DISTINCT FROM OLD.amount OR NEW.tax IS DISTINCT FROM OLD.tax
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.discount IS DISTINCT FROM OLD.discount
    OR NEW.cgst IS DISTINCT FROM OLD.cgst OR NEW.sgst IS DISTINCT FROM OLD.sgst OR NEW.igst IS DISTINCT FROM OLD.igst
    OR NEW.line_items IS DISTINCT FROM OLD.line_items OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
  ) THEN
    RAISE EXCEPTION 'This invoice has been issued and can no longer be edited. Cancel it and create a new one.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS invoices_guard_finalized ON public.invoices;
CREATE TRIGGER invoices_guard_finalized
  BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoices_guard_finalized();

-- ============ PAYMENTS ============
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (method IN ('bank_transfer', 'cash', 'upi', 'cheque', 'online', 'other')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'refunded')),
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  proof_url TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_org_idx ON public.payments(organization_id);
CREATE INDEX IF NOT EXISTS payments_tenant_idx ON public.payments(tenant_id);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON public.payments(invoice_id);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
-- Payments are written ONLY through admin_record_payment(); nobody can edit them directly.
CREATE POLICY "payments super read" ON public.payments
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "payments owner read" ON public.payments
  FOR SELECT TO authenticated USING (tenant_id IS NOT NULL AND public.is_outlet_owner(tenant_id));

-- ============ SUPER-ADMIN READ ACCESS FOR ADMIN PAGES ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='user_roles super read') THEN
    CREATE POLICY "user_roles super read" ON public.user_roles
      FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
  END IF;
  -- Admin pages show "who did this" / who owns what, which needs other users' names.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles super read') THEN
    CREATE POLICY "profiles super read" ON public.profiles
      FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='restaurant_tables' AND policyname='tbl super all') THEN
    CREATE POLICY "tbl super all" ON public.restaurant_tables
      FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
      WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END;
$$;

-- ============ ADMIN ACTIONS (all audited, all super-admin only) ============
CREATE OR REPLACE FUNCTION public._require_super_admin()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._require_super_admin() FROM PUBLIC, anon, authenticated;

-- Outlet lifecycle: ACTIVE / SUSPENDED / CANCELLED / PENDING_PAYMENT.
CREATE OR REPLACE FUNCTION public.admin_set_outlet_status(p_tenant_id UUID, p_status TEXT, p_reason TEXT DEFAULT NULL)
RETURNS public.tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old TEXT; v public.tenants;
BEGIN
  PERFORM public._require_super_admin();
  IF p_status NOT IN ('PENDING_PAYMENT', 'ACTIVE', 'SUSPENDED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid outlet status';
  END IF;
  SELECT outlet_status INTO v_old FROM public.tenants WHERE id = p_tenant_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Outlet not found'; END IF;
  UPDATE public.tenants SET outlet_status = p_status, updated_at = now()
  WHERE id = p_tenant_id RETURNING * INTO v;
  PERFORM public.admin_log(
    'outlet.' || lower(p_status), p_tenant_id, 'outlet', p_tenant_id::TEXT,
    jsonb_build_object('outlet_status', v_old),
    jsonb_build_object('outlet_status', p_status, 'reason', p_reason)
  );
  RETURN v;
END;
$$;

-- Admin adds an outlet to an existing organization (created as PENDING_PAYMENT).
CREATE OR REPLACE FUNCTION public.admin_add_outlet(
  p_org_id UUID, p_name TEXT, p_outlet_code TEXT, p_address TEXT, p_city TEXT, p_state TEXT,
  p_pincode TEXT, p_contact TEXT, p_email TEXT, p_gst TEXT, p_opening TEXT, p_closing TEXT
) RETURNS public.tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base public.tenants; v_new public.tenants;
BEGIN
  PERFORM public._require_super_admin();
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'Outlet name is required'; END IF;
  SELECT * INTO v_base FROM public.tenants WHERE organization_id = p_org_id ORDER BY created_at LIMIT 1;
  IF v_base.id IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;

  UPDATE public.organizations SET business_type = 'MULTI_OUTLET', updated_at = now()
  WHERE id = p_org_id AND business_type <> 'MULTI_OUTLET';

  INSERT INTO public.tenants (
    name, slug, owner_id, owner_name, owner_email, owner_phone, gst_number, address, city, state,
    pincode, country, opening_time, closing_time, brand_color, currency, timezone,
    number_of_tables, status, organization_id, outlet_status, settings
  ) VALUES (
    trim(p_name),
    regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g') || '-' || substr(md5(random()::text), 1, 4),
    v_base.owner_id, v_base.owner_name, COALESCE(NULLIF(trim(p_email), ''), v_base.owner_email),
    COALESCE(NULLIF(trim(p_contact), ''), v_base.owner_phone),
    COALESCE(NULLIF(trim(p_gst), ''), v_base.gst_number),
    p_address, p_city, p_state, p_pincode, v_base.country, p_opening, p_closing,
    v_base.brand_color, v_base.currency, v_base.timezone,
    0, 'approved', p_org_id, 'PENDING_PAYMENT',
    jsonb_build_object('outlet_code', NULLIF(trim(p_outlet_code), ''))
  ) RETURNING * INTO v_new;

  PERFORM public.admin_log('outlet.created', v_new.id, 'outlet', v_new.id::TEXT, NULL,
    jsonb_build_object('name', v_new.name, 'organization_id', p_org_id));
  RETURN v_new;
END;
$$;

-- Move an outlet's subscription between ACTIVE / PAUSED / CANCELED and keep the
-- outlet's operational status in step with it (rule: no active subscription, no service).
CREATE OR REPLACE FUNCTION public.admin_set_subscription_status(p_subscription_id UUID, p_status TEXT)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.subscription_status; v public.subscriptions; v_outlet TEXT;
BEGIN
  PERFORM public._require_super_admin();
  IF p_status NOT IN ('active', 'paused', 'canceled', 'expired') THEN
    RAISE EXCEPTION 'Invalid subscription status';
  END IF;
  SELECT status INTO v_old FROM public.subscriptions WHERE id = p_subscription_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  UPDATE public.subscriptions SET status = p_status::public.subscription_status
  WHERE id = p_subscription_id RETURNING * INTO v;

  v_outlet := CASE p_status WHEN 'active' THEN 'ACTIVE' WHEN 'canceled' THEN 'CANCELLED' ELSE 'SUSPENDED' END;
  UPDATE public.tenants SET outlet_status = v_outlet, updated_at = now() WHERE id = v.tenant_id;

  PERFORM public.admin_log('subscription.' || p_status, v.tenant_id, 'subscription', v.id::TEXT,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status, 'outlet_status', v_outlet));
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_extend_subscription(p_subscription_id UUID, p_days INT)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old TIMESTAMPTZ; v public.subscriptions;
BEGIN
  PERFORM public._require_super_admin();
  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN RAISE EXCEPTION 'Enter 1-3650 days'; END IF;
  SELECT current_period_end INTO v_old FROM public.subscriptions WHERE id = p_subscription_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  UPDATE public.subscriptions
  SET current_period_end = GREATEST(current_period_end, now()) + make_interval(days => p_days)
  WHERE id = p_subscription_id RETURNING * INTO v;
  PERFORM public.admin_log('subscription.extended', v.tenant_id, 'subscription', v.id::TEXT,
    jsonb_build_object('current_period_end', v_old),
    jsonb_build_object('current_period_end', v.current_period_end, 'days', p_days));
  RETURN v;
END;
$$;

-- Add one billing period to `base` (monthly / yearly / "<N> days").
CREATE OR REPLACE FUNCTION public._add_billing_cycle(base TIMESTAMPTZ, cycle TEXT)
RETURNS TIMESTAMPTZ LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN cycle = 'yearly' THEN base + INTERVAL '1 year'
    WHEN cycle ~ '^[0-9]+[ _]days?$' THEN base + make_interval(days => (regexp_replace(cycle, '[^0-9]', '', 'g'))::INT)
    ELSE base + INTERVAL '1 month'
  END;
$$;

-- Create (or renew) an outlet's subscription. A running subscription is
-- extended instead of duplicated; p_activate also switches the outlet ACTIVE.
CREATE OR REPLACE FUNCTION public.admin_create_subscription(
  p_tenant_id UUID, p_plan_id UUID, p_cycle TEXT, p_activate BOOLEAN DEFAULT true
) RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_running public.subscriptions; v public.subscriptions;
BEGIN
  PERFORM public._require_super_admin();
  SELECT * INTO v_running FROM public.subscriptions
  WHERE tenant_id = p_tenant_id AND status = 'active' AND current_period_end > now()
  ORDER BY current_period_end DESC LIMIT 1;

  IF v_running.id IS NOT NULL THEN
    UPDATE public.subscriptions
    SET plan_id = p_plan_id, current_period_end = public._add_billing_cycle(current_period_end, p_cycle)
    WHERE id = v_running.id RETURNING * INTO v;
  ELSE
    INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (p_tenant_id, p_plan_id, 'active', now(), public._add_billing_cycle(now(), p_cycle))
    RETURNING * INTO v;
  END IF;

  IF p_activate THEN
    UPDATE public.tenants SET outlet_status = 'ACTIVE', updated_at = now()
    WHERE id = p_tenant_id AND outlet_status <> 'ACTIVE';
  END IF;
  PERFORM public.admin_log('subscription.created', p_tenant_id, 'subscription', v.id::TEXT, NULL,
    jsonb_build_object('plan_id', p_plan_id, 'cycle', p_cycle, 'renewed', v_running.id IS NOT NULL));
  RETURN v;
END;
$$;

-- Issue / cancel / mark overdue. Issuing freezes the money fields (see trigger).
CREATE OR REPLACE FUNCTION public.admin_set_invoice_status(p_invoice_id UUID, p_status TEXT)
RETURNS public.invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.invoices; v public.invoices;
BEGIN
  PERFORM public._require_super_admin();
  IF p_status NOT IN ('issued', 'overdue', 'cancelled') THEN RAISE EXCEPTION 'Invalid invoice status'; END IF;
  SELECT * INTO v_old FROM public.invoices WHERE id = p_invoice_id;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF p_status = 'cancelled' AND v_old.amount_paid > 0 THEN
    RAISE EXCEPTION 'A payment has been recorded against this invoice and it cannot be cancelled';
  END IF;
  IF p_status = 'issued' AND v_old.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be issued'; END IF;
  IF v_old.status IN ('paid', 'cancelled') THEN RAISE EXCEPTION 'This invoice is already %', v_old.status; END IF;

  UPDATE public.invoices SET
    status = p_status,
    invoice_number = COALESCE(invoice_number, public.next_invoice_number()),
    finalized_at = COALESCE(finalized_at, CASE WHEN p_status = 'issued' THEN now() END),
    issued_at = CASE WHEN p_status = 'issued' THEN now() ELSE issued_at END
  WHERE id = p_invoice_id RETURNING * INTO v;
  PERFORM public.admin_log('invoice.' || p_status, v.tenant_id, 'invoice', v.id::TEXT,
    jsonb_build_object('status', v_old.status), jsonb_build_object('status', p_status, 'invoice_number', v.invoice_number));
  RETURN v;
END;
$$;

-- Record an offline/manual payment against an invoice. A fully paid invoice
-- becomes PAID; if it carries a plan, the outlet's subscription is created or
-- renewed and the outlet is activated.
CREATE OR REPLACE FUNCTION public.admin_record_payment(
  p_invoice_id UUID, p_amount NUMERIC, p_method TEXT, p_reference TEXT,
  p_paid_at TIMESTAMPTZ, p_notes TEXT DEFAULT NULL, p_proof_url TEXT DEFAULT NULL
) RETURNS public.payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv public.invoices; v_pay public.payments; v_paid NUMERIC; v_status TEXT; v_sub public.subscriptions;
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

  INSERT INTO public.payments (organization_id, tenant_id, invoice_id, amount, method, reference, paid_at, notes, proof_url, recorded_by)
  VALUES (v_inv.organization_id, v_inv.tenant_id, v_inv.id, p_amount, p_method, p_reference,
          COALESCE(p_paid_at, now()), p_notes, p_proof_url, auth.uid())
  RETURNING * INTO v_pay;

  v_paid := v_inv.amount_paid + p_amount;
  v_status := CASE WHEN v_paid >= v_inv.amount - 0.005 THEN 'paid' ELSE 'partially_paid' END;
  UPDATE public.invoices
  SET amount_paid = v_paid, status = v_status,
      paid_at = CASE WHEN v_status = 'paid' THEN COALESCE(p_paid_at, now()) ELSE paid_at END,
      payment_method = COALESCE(payment_method, 'manual')
  WHERE id = v_inv.id;

  IF v_status = 'paid' THEN
    IF v_inv.plan_id IS NOT NULL AND v_inv.subscription_id IS NULL AND v_inv.invoice_kind IN ('subscription', 'renewal') THEN
      v_sub := public.admin_create_subscription(v_inv.tenant_id, v_inv.plan_id, COALESCE(v_inv.billing_cycle, 'monthly'), true);
      UPDATE public.invoices SET subscription_id = v_sub.id WHERE id = v_inv.id;
    ELSE
      UPDATE public.tenants SET outlet_status = 'ACTIVE', updated_at = now()
      WHERE id = v_inv.tenant_id AND outlet_status = 'PENDING_PAYMENT' AND v_inv.subscription_id IS NOT NULL;
    END IF;
  END IF;

  PERFORM public.admin_log('payment.recorded', v_inv.tenant_id, 'payment', v_pay.id::TEXT, NULL,
    jsonb_build_object('invoice_id', v_inv.id, 'amount', p_amount, 'method', p_method, 'invoice_status', v_status));
  RETURN v_pay;
END;
$$;

-- Suspend outlets of multi-outlet organizations whose subscription has lapsed.
-- Deliberately limited to MULTI_OUTLET organizations that HAVE had a
-- subscription: existing single-outlet customers (free trials, manual billing,
-- no subscription rows) are never touched by this.
CREATE OR REPLACE FUNCTION public.admin_sweep_expired_outlets()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  PERFORM public._require_super_admin();
  FOR r IN
    SELECT t.id FROM public.tenants t
    JOIN public.organizations o ON o.id = t.organization_id AND o.business_type = 'MULTI_OUTLET'
    WHERE t.outlet_status = 'ACTIVE'
      AND EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = t.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.tenant_id = t.id AND s.status::TEXT IN ('active', 'scheduled', 'trialing') AND s.current_period_end > now()
      )
  LOOP
    UPDATE public.tenants SET outlet_status = 'SUSPENDED', updated_at = now() WHERE id = r.id;
    PERFORM public.admin_log('outlet.suspended', r.id, 'outlet', r.id::TEXT,
      jsonb_build_object('outlet_status', 'ACTIVE'), jsonb_build_object('outlet_status', 'SUSPENDED', 'reason', 'subscription expired'));
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION
  public.admin_set_outlet_status(UUID, TEXT, TEXT),
  public.admin_add_outlet(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.admin_set_subscription_status(UUID, TEXT),
  public.admin_extend_subscription(UUID, INT),
  public.admin_create_subscription(UUID, UUID, TEXT, BOOLEAN),
  public.admin_set_invoice_status(UUID, TEXT),
  public.admin_record_payment(UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT),
  public.admin_sweep_expired_outlets()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.admin_set_outlet_status(UUID, TEXT, TEXT),
  public.admin_add_outlet(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.admin_set_subscription_status(UUID, TEXT),
  public.admin_extend_subscription(UUID, INT),
  public.admin_create_subscription(UUID, UUID, TEXT, BOOLEAN),
  public.admin_set_invoice_status(UUID, TEXT),
  public.admin_record_payment(UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT),
  public.admin_sweep_expired_outlets()
TO authenticated;
-- (each function re-checks is_super_admin() itself; the GRANT only lets the call reach it)
