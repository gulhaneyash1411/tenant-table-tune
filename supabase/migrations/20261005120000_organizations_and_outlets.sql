-- Multi-outlet foundation (phases 1-3).
--
-- Model: an ORGANIZATION owns one or more OUTLETS, and every outlet is a row in
-- public.tenants. Every existing table already scopes by tenant_id and RLS keys
-- on current_tenant_id(), so each outlet is isolated with no change to those
-- tables. Single-outlet customers get an organization + their existing tenant
-- as the default outlet, invisibly.

-- ============ ORGANIZATIONS ============
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Stored as codes, never UI labels.
  business_type TEXT NOT NULL DEFAULT 'SINGLE_OUTLET'
    CHECK (business_type IN ('SINGLE_OUTLET', 'MULTI_OUTLET')),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organizations_owner_idx ON public.organizations(owner_id);

GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orgs owner read" ON public.organizations
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "orgs owner update" ON public.organizations
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "orgs super all" ON public.organizations
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============ OUTLET COLUMNS ON TENANTS ============
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outlet_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (outlet_status IN ('PENDING_PAYMENT', 'ACTIVE', 'SUSPENDED', 'CANCELLED'));
CREATE INDEX IF NOT EXISTS tenants_organization_idx ON public.tenants(organization_id);

-- Any tenant inserted without an organization (self-signup, admin-created, ...)
-- gets its own SINGLE_OUTLET organization automatically.
CREATE OR REPLACE FUNCTION public.tenants_ensure_organization()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    INSERT INTO public.organizations (name, business_type, owner_id)
    VALUES (NEW.name, 'SINGLE_OUTLET', NEW.owner_id)
    RETURNING id INTO NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_ensure_organization ON public.tenants;
CREATE TRIGGER tenants_ensure_organization
  BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_ensure_organization();

-- Backfill: every existing tenant becomes the default outlet of its own
-- SINGLE_OUTLET organization. No data is moved.
DO $$
DECLARE
  t RECORD;
  v_org UUID;
BEGIN
  FOR t IN SELECT id, name, owner_id FROM public.tenants WHERE organization_id IS NULL LOOP
    INSERT INTO public.organizations (name, business_type, owner_id)
    VALUES (t.name, 'SINGLE_OUTLET', t.owner_id)
    RETURNING id INTO v_org;
    UPDATE public.tenants SET organization_id = v_org WHERE id = t.id;
  END LOOP;
END;
$$;

-- ============ SELECTED-OUTLET AWARE current_tenant_id() ============
-- The client sends the outlet the owner is working in as the `x-outlet-id`
-- request header. It is honoured ONLY if the caller owns that outlet or holds a
-- role on it, so changing the header can never reach another account's data.
-- With no (or an invalid) header it falls back to the oldest outlet the caller
-- owns, then to a role-assigned tenant — the previous behaviour for users with
-- a single tenant.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req UUID;
  v_result UUID;
BEGIN
  BEGIN
    v_req := NULLIF(current_setting('request.headers', true)::json ->> 'x-outlet-id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_req := NULL;
  END;

  IF v_req IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = v_req AND t.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = v_req)
  ) THEN
    RETURN v_req;
  END IF;

  SELECT t.id INTO v_result FROM public.tenants t
  WHERE t.owner_id = auth.uid() ORDER BY t.created_at LIMIT 1;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  SELECT ur.tenant_id INTO v_result FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.tenant_id IS NOT NULL
  ORDER BY ur.created_at LIMIT 1;
  RETURN v_result;
END;
$$;

-- ============ register_tenant WITH BUSINESS TYPE ============
DROP FUNCTION IF EXISTS public.register_tenant(
  uuid, text, text, text, text, text, text, text, text, text, int
);

CREATE OR REPLACE FUNCTION public.register_tenant(
  p_owner_id uuid,
  p_name text,
  p_slug text,
  p_owner_name text,
  p_owner_email text,
  p_owner_phone text,
  p_gst_number text,
  p_city text,
  p_state text,
  p_pincode text,
  p_number_of_tables int,
  p_business_type text DEFAULT 'SINGLE_OUTLET',
  p_organization_name text DEFAULT NULL
) RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants;
  v_org UUID;
BEGIN
  IF p_business_type NOT IN ('SINGLE_OUTLET', 'MULTI_OUTLET') THEN
    RAISE EXCEPTION 'Invalid business type';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = p_owner_id AND created_at > now() - INTERVAL '1 hour'
  ) THEN
    RAISE EXCEPTION 'Invalid or expired signup';
  END IF;

  -- Signup creates the first outlet only; further outlets are added later.
  IF EXISTS (SELECT 1 FROM public.tenants WHERE owner_id = p_owner_id) THEN
    RAISE EXCEPTION 'This account already has a registered restaurant';
  END IF;

  INSERT INTO public.organizations (name, business_type, owner_id)
  VALUES (COALESCE(NULLIF(trim(p_organization_name), ''), p_name), p_business_type, p_owner_id)
  RETURNING id INTO v_org;

  INSERT INTO public.tenants (
    name, slug, owner_id, owner_name, owner_email, owner_phone,
    gst_number, city, state, pincode, number_of_tables, status, organization_id
  ) VALUES (
    p_name, p_slug, p_owner_id, p_owner_name, p_owner_email, p_owner_phone,
    p_gst_number, p_city, p_state, p_pincode, p_number_of_tables, 'pending', v_org
  )
  RETURNING * INTO v_tenant;

  RETURN v_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_tenant(
  uuid, text, text, text, text, text, text, text, text, text, int, text, text
) TO anon, authenticated;
