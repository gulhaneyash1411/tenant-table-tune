-- A plan has one tag (e.g. "Entry Plan", "Recommended", "Full Access"), not a list.
-- Replaces the list column added in 20261010130000_plan_tags.sql.
ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS tags;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS tag TEXT;
