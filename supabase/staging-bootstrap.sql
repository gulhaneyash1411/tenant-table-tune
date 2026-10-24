-- STAGING ONLY (mjominccvkwyintjsxja). Run after the production schema dump has
-- been applied to staging. Recreates what the dump leaves out. Creates no
-- customer data. Safe to re-run.
-- See docs/supabase-environments.md → "Build the staging schema".
--
-- How to run: staging SQL Editor → paste → UNCOMMENT the SET line → Run.

-- SET app.target = 'staging';   -- ← uncomment to confirm this is the STAGING database

DO $$
BEGIN
  IF coalesce(current_setting('app.target', true), '') <> 'staging' THEN
    RAISE EXCEPTION 'staging-bootstrap.sql refused: run "SET app.target = ''staging'';" first, and only on STAGING';
  END IF;
END $$;

BEGIN;

-- 1. Profile row for every new auth user. The dump includes public.handle_new_user()
--    but not this trigger, because it lives on auth.users.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Storage buckets, both public in production. platform-assets holds the
--    platform logo (LOGO_BUCKET in src/lib/site-settings.ts).
INSERT INTO storage.buckets (id, name, public) VALUES
  ('platform-assets', 'platform-assets', true),
  ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies: paste the "ddl" rows printed by section 1 of
--    production-export.sql here (or run them separately).

COMMIT;

-- 4. Super admin. First sign up on the staging site (or Authentication → Add user),
--    then put that e-mail below, uncomment and run:
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'super_admin' FROM auth.users u
-- WHERE email = 'you@example.com'
--   AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'super_admin');
