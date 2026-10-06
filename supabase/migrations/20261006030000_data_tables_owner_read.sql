-- Allow restaurant owners to read data from all their outlets
-- These tables need similar policies to allow owners to access multi-outlet data

-- Reviews
DROP POLICY IF EXISTS "rev owner read" ON public.reviews;
CREATE POLICY "rev owner read" ON public.reviews
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = reviews.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    public.is_super_admin(auth.uid())
  );

-- Expenses
DROP POLICY IF EXISTS "exp owner read" ON public.expenses;
CREATE POLICY "exp owner read" ON public.expenses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = expenses.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    public.is_super_admin(auth.uid())
  );

-- Event Bookings
DROP POLICY IF EXISTS "evb owner read" ON public.event_bookings;
CREATE POLICY "evb owner read" ON public.event_bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants
      WHERE tenants.id = event_bookings.tenant_id
        AND tenants.owner_id = auth.uid()
    )
    OR
    public.is_super_admin(auth.uid())
  );

-- Order Items (for analytics)
DROP POLICY IF EXISTS "oit owner read" ON public.order_items;
CREATE POLICY "oit owner read" ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    -- Allow reading order items for orders owned by the user
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND EXISTS (
          SELECT 1 FROM public.tenants
          WHERE tenants.id = orders.tenant_id
            AND tenants.owner_id = auth.uid()
        )
    )
    OR
    public.is_super_admin(auth.uid())
  );

-- Customers
DROP POLICY IF EXISTS "cust owner read" ON public.customers;
CREATE POLICY "cust owner read" ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    -- Customers are accessible if they've placed an order at an outlet owned by the user
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.customer_phone = customers.phone
        OR orders.customer_id = customers.id
      LIMIT 1
    )
    OR
    public.is_super_admin(auth.uid())
  );
