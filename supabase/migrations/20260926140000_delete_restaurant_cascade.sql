-- Super Admin "Delete Restaurant" (src/routes/api/admin-delete-restaurant.ts)
-- removes a hotel by deleting its single `public.tenants` row and letting
-- Postgres cascade the delete through every tenant-scoped table, instead of
-- the route hand-listing ~30 tables in child-before-parent order (a list that
-- silently rots every time a table is added).
--
-- Every FK created by a migration in this repo already says
-- ON DELETE CASCADE, but some tables were created directly against the
-- hosted database and only show up in the generated types
-- (event_bookings, table_reservations, staff_attendance,
-- tenant_nav_overrides, tenant_section_locks) — their delete action is
-- whatever was typed at the time, and a plain NO ACTION one would fail the
-- tenant delete with 23503. So rather than naming tables, this walks
-- pg_constraint for every FK that points at public.tenants and re-creates
-- the ones that don't cascade, preserving the rest of each definition
-- (columns, MATCH, ON UPDATE, DEFERRABLE) via pg_get_constraintdef.
DO $$
DECLARE
  r record;
  def text;
BEGIN
  FOR r IN
    SELECT c.conname, c.oid, n.nspname AS schema_name, t.relname AS table_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.tenants'::regclass
      AND c.confdeltype <> 'c'  -- 'c' = ON DELETE CASCADE, already fine
  LOOP
    -- Drop any existing ON DELETE clause, then append CASCADE.
    def := regexp_replace(
      pg_get_constraintdef(r.oid),
      '\s+ON DELETE (CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT)(\s*\([^)]*\))?',
      '',
      'i'
    );
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.schema_name, r.table_name, r.conname
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I %s ON DELETE CASCADE',
      r.schema_name, r.table_name, r.conname, def
    );
    RAISE NOTICE 'tenants FK %.% (%) now cascades', r.schema_name, r.table_name, r.conname;
  END LOOP;
END $$;

-- The delete itself runs with the service role from the server route, so no
-- DELETE grant or RLS policy is added for `authenticated` here: a browser
-- session — super admin or not — still cannot delete a tenant directly.
