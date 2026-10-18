-- The RLS cleanup migrations (20261006042000, 20261006047000) replaced the old
-- current_tenant_id() policies on orders (UPDATE) and order_items (SELECT) with
-- owner/manager-only checks, dropping kitchen user access.
--
-- The kitchen display needs to:
--   1. READ order_items to show what needs cooking
--   2. UPDATE orders to advance status (Start cooking → Mark ready → Served)

-- ============ ORDER ITEMS — kitchen read ============
DROP POLICY IF EXISTS "oi kitchen read" ON public.order_items;
CREATE POLICY "oi kitchen read" ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'kitchen'
        AND user_roles.tenant_id = order_items.tenant_id
    )
  );

-- ============ ORDERS — kitchen update ============
-- Drop and recreate to add the kitchen clause alongside owner/manager.
DROP POLICY IF EXISTS "ord authenticated update" ON public.orders;

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
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'kitchen'
        AND user_roles.tenant_id = orders.tenant_id
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
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'kitchen'
        AND user_roles.tenant_id = orders.tenant_id
    )
    OR
    public.is_super_admin(auth.uid())
  );
