-- Fix salary_payments and events_bookings policies for multi-outlet

-- ============ SALARY PAYMENTS ============
DROP POLICY IF EXISTS "sal tenant all" ON public.salary_payments;

CREATE POLICY "sal authenticated all" ON public.salary_payments
  FOR ALL
  TO authenticated
  USING (
    -- Owner can manage salary payments for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = salary_payments.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can manage salary payments for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = salary_payments.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can manage all
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = salary_payments.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = salary_payments.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );

-- ============ EVENT BOOKINGS ============
DROP POLICY IF EXISTS "evbk tenant all" ON public.event_bookings;

CREATE POLICY "evbk authenticated all" ON public.event_bookings
  FOR ALL
  TO authenticated
  USING (
    -- Owner can manage event bookings for any tenant they own
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = event_bookings.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    -- Manager can manage event bookings for their outlet
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = event_bookings.tenant_id
        AND ou.role = 'manager'
    )
    OR
    -- Super admin can manage all
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = event_bookings.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = event_bookings.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );
