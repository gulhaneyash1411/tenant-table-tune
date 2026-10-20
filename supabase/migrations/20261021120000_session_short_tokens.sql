-- Switch ordering-session tokens from long hex strings to 10-character
-- alphanumeric strings (e.g. a7K9mP2xQ4).  Shorter, URL-friendly, and
-- each scan produces a visibly unique URL.

CREATE OR REPLACE FUNCTION public.new_session_token()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(chars, floor(random() * 62 + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

ALTER TABLE public.ordering_sessions ALTER COLUMN session_token SET DEFAULT public.new_session_token();

GRANT EXECUTE ON FUNCTION public.new_session_token() TO anon, authenticated, service_role;
