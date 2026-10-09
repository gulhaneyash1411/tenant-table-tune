-- Icon shown next to a plan's name (a key such as "rocket", "trending", "crown").
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS icon TEXT;
