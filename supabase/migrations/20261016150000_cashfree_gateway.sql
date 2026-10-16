-- Cashfree payment gateway: the server records a verified gateway payment
-- through the same admin_record_payment() an admin uses, so plan activation
-- (and scheduling after the current plan) stays in one place.
--
-- The server calls it with the service-role key, which has no auth.uid(), so
-- the super-admin check also accepts the service role. The service-role key
-- already bypasses RLS, so this grants nothing new.
CREATE OR REPLACE FUNCTION public._require_super_admin()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._require_super_admin() FROM PUBLIC, anon, authenticated;
