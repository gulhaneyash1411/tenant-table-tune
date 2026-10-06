-- Phase 4: adding outlets to an organization.
--
-- New outlets are created as drafts (outlet_status = PENDING_PAYMENT) through a
-- SECURITY DEFINER function, never by a direct insert. They only become ACTIVE
-- once their subscription is paid (activated by a super admin / the service
-- role until a payment gateway exists).

-- Owners can no longer insert tenant rows themselves: a direct insert would
-- default to outlet_status ACTIVE and skip payment. Signup uses register_tenant,
-- admin-created restaurants use the service role, and extra outlets use
-- add_outlet() below — all of which bypass this policy.
DROP POLICY IF EXISTS "tenants insert self" ON public.tenants;

-- Owners may keep editing their own tenant row (settings, branding, ...) but
-- must not be able to activate an outlet or move it between organizations.
-- auth.uid() is NULL for the service role, so server-side activation still works.
CREATE OR REPLACE FUNCTION public.tenants_guard_outlet_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    IF NEW.outlet_status IS DISTINCT FROM OLD.outlet_status THEN
      RAISE EXCEPTION 'Outlet status can only be changed after subscription payment';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'An outlet cannot be moved between organizations';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_guard_outlet_fields ON public.tenants;
CREATE TRIGGER tenants_guard_outlet_fields
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_guard_outlet_fields();

-- Add an outlet to the caller's organization. A single-outlet organization is
-- upgraded to MULTI_OUTLET in place: same account, same data, same subscription.
CREATE OR REPLACE FUNCTION public.add_outlet(
  p_name text,
  p_address text,
  p_city text,
  p_state text,
  p_pincode text,
  p_contact text,
  p_opening_time text,
  p_closing_time text,
  p_gst_number text DEFAULT NULL
) RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base public.tenants;
  v_new public.tenants;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Outlet name is required';
  END IF;

  -- The owner's first (oldest) outlet anchors the organization.
  SELECT * INTO v_base FROM public.tenants
  WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1;
  IF v_base.id IS NULL THEN
    RAISE EXCEPTION 'No restaurant found for this account';
  END IF;
  IF v_base.status <> 'approved' THEN
    RAISE EXCEPTION 'Your restaurant must be approved before adding outlets';
  END IF;

  UPDATE public.organizations SET business_type = 'MULTI_OUTLET', updated_at = now()
  WHERE id = v_base.organization_id AND business_type <> 'MULTI_OUTLET';

  INSERT INTO public.tenants (
    name, slug, owner_id, owner_name, owner_email, owner_phone,
    gst_number, address, city, state, pincode, country,
    opening_time, closing_time, brand_color, currency, timezone,
    number_of_tables, status, organization_id, outlet_status, settings
  ) VALUES (
    trim(p_name),
    regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g') || '-' || substr(md5(random()::text), 1, 4),
    v_base.owner_id, v_base.owner_name, v_base.owner_email,
    COALESCE(NULLIF(trim(p_contact), ''), v_base.owner_phone),
    COALESCE(NULLIF(trim(p_gst_number), ''), v_base.gst_number),
    p_address, p_city, p_state, p_pincode, v_base.country,
    p_opening_time, p_closing_time, v_base.brand_color, v_base.currency, v_base.timezone,
    0, 'approved', v_base.organization_id, 'PENDING_PAYMENT', '{}'::jsonb
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.add_outlet(text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_outlet(text, text, text, text, text, text, text, text, text) TO authenticated;
