-- Managers can view the subscription and payment history for assigned outlets.
-- Billing writes remain restricted to owners.
DROP POLICY IF EXISTS "inv manager assigned outlet read" ON public.invoices;
CREATE POLICY "inv manager assigned outlet read" ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'manager'
        AND ur.tenant_id = invoices.tenant_id
    )
  );
