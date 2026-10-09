-- Free-text tags on a subscription plan, e.g. "Entry Plan", "Recommended", "Full Access".
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
