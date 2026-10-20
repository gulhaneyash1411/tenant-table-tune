-- Extend ordering sessions to cover takeaway orders.
-- Takeaway sessions have no table — they're linked to the tenant only.

-- Allow NULL table_id for takeaway sessions.
ALTER TABLE public.ordering_sessions ALTER COLUMN table_id DROP NOT NULL;

-- Create a takeaway session. Unlike dine-in, this does NOT expire other
-- sessions — multiple customers can order takeaway simultaneously.
CREATE OR REPLACE FUNCTION public.create_takeaway_session(p_tenant_id UUID)
RETURNS TABLE (session_id UUID, session_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session public.ordering_sessions;
BEGIN
  INSERT INTO public.ordering_sessions (tenant_id)
  VALUES (p_tenant_id)
  RETURNING * INTO v_session;

  RETURN QUERY SELECT v_session.id, v_session.session_token, v_session.expires_at;
END;
$$;

-- Update close_session_on_payment to work for both dine-in and takeaway.
-- Closes by session_id first (linked to the order), then falls back to
-- table_id for backward compatibility with older dine-in orders.
CREATE OR REPLACE FUNCTION public.close_session_on_payment(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session_id UUID;
  v_table_id UUID;
BEGIN
  SELECT o.session_id, o.table_id INTO v_session_id, v_table_id
  FROM public.orders o
  WHERE o.id = p_order_id;

  -- Close by session_id (works for both dine-in and takeaway)
  IF v_session_id IS NOT NULL THEN
    UPDATE public.ordering_sessions
    SET status = 'closed', closure_reason = 'bill_paid', closed_at = now()
    WHERE id = v_session_id AND status = 'active';
    RETURN;
  END IF;

  -- Fallback for dine-in orders without session_id: close by table_id
  IF v_table_id IS NOT NULL THEN
    UPDATE public.ordering_sessions
    SET status = 'closed', closure_reason = 'bill_paid', closed_at = now()
    WHERE ordering_sessions.table_id = v_table_id AND ordering_sessions.status = 'active';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_takeaway_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_takeaway_session(UUID) TO anon, authenticated, service_role;
