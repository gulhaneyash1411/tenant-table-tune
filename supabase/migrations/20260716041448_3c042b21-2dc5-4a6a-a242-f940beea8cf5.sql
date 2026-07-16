
-- 1. Fix mutable search_path
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 2. Lock down SECURITY DEFINER function EXECUTE privileges
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_customer_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_super_on_new_tenant() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC;
-- Trigger-only functions: no direct callers
DO $$ BEGIN
  BEGIN REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.bump_customer_stats() FROM anon, authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.notify_super_on_new_tenant() FROM anon, authenticated; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM anon; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
-- Policy-invoked helpers stay callable by signed-in users
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;

-- 3. Remove overly permissive anon SELECT on orders / order_items
DROP POLICY IF EXISTS "ord public status read" ON public.orders;
DROP POLICY IF EXISTS "oi public read" ON public.order_items;

-- 4. Remove public write policies on customers (trigger seeds/updates via SECURITY DEFINER)
DROP POLICY IF EXISTS "cust public insert" ON public.customers;
DROP POLICY IF EXISTS "cust public update by phone" ON public.customers;

-- 5. Remove duplicate unrestricted restaurant_tables SELECT policy
DROP POLICY IF EXISTS "tables public read" ON public.restaurant_tables;

-- 6. Restrict platform_settings public reads to a whitelist of non-sensitive keys
DROP POLICY IF EXISTS "ps read" ON public.platform_settings;
CREATE POLICY "ps public whitelist read" ON public.platform_settings
  FOR SELECT
  TO anon, authenticated
  USING (key IN ('brand_logo_url','brand_name','support_email','tagline'));
CREATE POLICY "ps super read all" ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 7. Tighten anonymous INSERT policies so they aren't always-true
DROP POLICY IF EXISTS "ord public insert" ON public.orders;
CREATE POLICY "ord public insert" ON public.orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = orders.tenant_id)
    AND (table_id IS NULL OR EXISTS (
      SELECT 1 FROM public.restaurant_tables rt WHERE rt.id = orders.table_id AND rt.tenant_id = orders.tenant_id AND rt.is_active = true
    ))
    AND customer_phone IS NOT NULL
    AND length(customer_phone) BETWEEN 4 AND 20
  );

DROP POLICY IF EXISTS "oi public insert" ON public.order_items;
CREATE POLICY "oi public insert" ON public.order_items
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
    )
  );
