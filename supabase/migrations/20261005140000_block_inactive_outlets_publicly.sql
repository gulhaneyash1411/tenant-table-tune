-- An outlet only serves customers while its subscription is active. Public
-- (QR) pages read the tenant through this policy, so unpaid (PENDING_PAYMENT),
-- SUSPENDED and CANCELLED outlets simply stop resolving for guests.
DROP POLICY IF EXISTS "tenants public approved read" ON public.tenants;
CREATE POLICY "tenants public approved read" ON public.tenants
  FOR SELECT TO anon
  USING (status = 'approved' AND outlet_status = 'ACTIVE');
