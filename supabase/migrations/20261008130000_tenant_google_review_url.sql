-- Google review link per outlet, shown to guests after they submit feedback.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS google_review_url TEXT;
