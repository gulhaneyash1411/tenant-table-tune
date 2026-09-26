-- Sales Team feature: a new role for platform-side sales staff, created by
-- the Super Admin. Kept in its own migration, separate from anything that
-- uses the value (e.g. a partial index predicate or a row insert in the
-- same migration file/transaction) — Postgres does not allow a brand-new
-- enum label to be used that way until the ALTER TYPE has committed.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_user';
