-- Registering a restaurant calls this instead of inserting into public.tenants
-- directly. Supabase auth.signUp() does NOT return a session when
-- "Confirm email" is enabled on the project, so the client is still
-- unauthenticated (role = anon) at the moment the tenant row needs to be
-- created — auth.uid() is null and the existing
-- "tenants insert self" RLS policy (owner_id = auth.uid()) always rejects
-- the insert with 42501. This SECURITY DEFINER function bypasses RLS and
-- validates ownership itself instead, so registration works regardless of
-- the email-confirmation setting.
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
  p_number_of_tables int
) RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants;
BEGIN
  -- p_owner_id must be a real, freshly-created auth user (bounds the window
  -- in which this anon-callable function can attach a tenant to an account).
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = p_owner_id AND created_at > now() - INTERVAL '1 hour'
  ) THEN
    RAISE EXCEPTION 'Invalid or expired signup';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE owner_id = p_owner_id) THEN
    RAISE EXCEPTION 'This account already has a registered restaurant';
  END IF;

  INSERT INTO public.tenants (
    name, slug, owner_id, owner_name, owner_email, owner_phone,
    gst_number, city, state, pincode, number_of_tables, status
  ) VALUES (
    p_name, p_slug, p_owner_id, p_owner_name, p_owner_email, p_owner_phone,
    p_gst_number, p_city, p_state, p_pincode, p_number_of_tables, 'pending'
  )
  RETURNING * INTO v_tenant;

  RETURN v_tenant;
END;
$$;

-- Callable pre-confirmation (client is still anon) and post-confirmation.
GRANT EXECUTE ON FUNCTION public.register_tenant(
  uuid, text, text, text, text, text, text, text, text, text, int
) TO anon, authenticated;
