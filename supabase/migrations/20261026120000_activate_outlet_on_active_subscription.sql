-- An outlet with a running subscription must be ACTIVE.
--
-- Bug: outlet_status was only switched to ACTIVE inside admin_create_subscription()
-- when it inserted an 'active' row. Other ways a subscription becomes active left
-- the outlet SUSPENDED / PENDING_PAYMENT:
--   * activate_scheduled_subscriptions() promoting a 'scheduled' plan,
--   * admin_record_payment() on an invoice already linked to a subscription
--     (it only reactivated PENDING_PAYMENT, never SUSPENDED),
--   * an admin changing the subscription status / extending it directly.
-- The owner then saw "<outlet> is not active" / "Pay to activate" while the
-- header showed a paid plan, and guests could not order.
--
-- Fix: one trigger on subscriptions does the activation, whoever writes the row.
-- CANCELLED outlets are left alone (an admin closed them on purpose).

-- The owner page calls activate_scheduled_subscriptions() with the owner's JWT,
-- so tenants_guard_outlet_fields() would reject the status change. The trigger
-- below sets a transaction-local flag that the guard accepts. Clients cannot set
-- it: each API request is its own transaction and set_config is not exposed.
CREATE OR REPLACE FUNCTION public.tenants_guard_outlet_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    IF NEW.outlet_status IS DISTINCT FROM OLD.outlet_status
       AND NOT (NEW.outlet_status = 'ACTIVE' AND current_setting('app.subscription_activation', true) = 'on') THEN
      RAISE EXCEPTION 'Outlet status can only be changed after subscription payment';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'An outlet cannot be moved between organizations';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.subscriptions_activate_outlet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::TEXT = 'active' AND NEW.current_period_end > now() THEN
    PERFORM set_config('app.subscription_activation', 'on', true);
    UPDATE public.tenants SET outlet_status = 'ACTIVE', updated_at = now()
    WHERE id = NEW.tenant_id AND outlet_status IN ('PENDING_PAYMENT', 'SUSPENDED');
    PERFORM set_config('app.subscription_activation', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_activate_outlet ON public.subscriptions;
CREATE TRIGGER subscriptions_activate_outlet
  AFTER INSERT OR UPDATE OF status, current_period_end ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_activate_outlet();

-- Repair outlets already stuck: running subscription, outlet not active.
UPDATE public.tenants t SET outlet_status = 'ACTIVE', updated_at = now()
WHERE t.outlet_status IN ('PENDING_PAYMENT', 'SUSPENDED')
  AND EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.tenant_id = t.id AND s.status::TEXT = 'active' AND s.current_period_end > now()
  );
