-- Fix additional tables with current_tenant_id() write policies
-- This migration addresses orders and expenses tables

-- ============ ORDERS UPDATE ============
DROP POLICY IF EXISTS "ord tenant write" ON public.orders;

CREATE POLICY "ord authenticated update" ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = orders.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = orders.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = orders.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = orders.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );

-- ============ EXPENSES ============
DROP POLICY IF EXISTS "exp tenant all" ON public.expenses;

CREATE POLICY "exp authenticated all" ON public.expenses
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = expenses.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = expenses.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = expenses.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      INNER JOIN public.tenants t ON t.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND t.id = expenses.tenant_id
        AND ou.role = 'manager'
    )
    OR
    public.is_super_admin(auth.uid())
  );
