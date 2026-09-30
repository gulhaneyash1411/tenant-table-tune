ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS must_reset_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.must_reset_password IS
  'When true the restaurant owner is forced to change their password before accessing the dashboard.';
