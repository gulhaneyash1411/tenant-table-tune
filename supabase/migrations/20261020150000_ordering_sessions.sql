-- Ordering sessions: time-limited tokens that gate dine-in order placement.
--
-- A permanent QR code opens the menu, but placing an order requires an active
-- session. Sessions are created on scan, expire after 120 minutes, and close
-- immediately when the bill is paid. This prevents stale/saved links from
-- generating false orders after the customer leaves.

CREATE TABLE IF NOT EXISTS public.ordering_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE DEFAULT public.new_qr_token(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
  closure_reason TEXT CHECK (closure_reason IN ('bill_paid', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '120 minutes'),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ordering_sessions_table_status_idx
  ON public.ordering_sessions(table_id, status);
CREATE INDEX IF NOT EXISTS ordering_sessions_token_idx
  ON public.ordering_sessions(session_token) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ordering_sessions_tenant_idx
  ON public.ordering_sessions(tenant_id);

-- Link orders to the session they were placed in.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.ordering_sessions(id);

-- ────────────────────────────────────────────────────────────────────────────
-- Create a new session for a table. Expires any still-active session on the
-- same table first (a new customer scanning replaces the previous session).
-- Callable by anon (QR scan) and service_role.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_ordering_session(p_table_id UUID, p_tenant_id UUID)
RETURNS TABLE (session_id UUID, session_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session public.ordering_sessions;
BEGIN
  -- Expire any active session on this table (new customer replaces old).
  UPDATE public.ordering_sessions
  SET status = 'expired', closure_reason = 'expired', closed_at = now()
  WHERE ordering_sessions.table_id = p_table_id AND ordering_sessions.status = 'active';

  INSERT INTO public.ordering_sessions (tenant_id, table_id)
  VALUES (p_tenant_id, p_table_id)
  RETURNING * INTO v_session;

  RETURN QUERY SELECT v_session.id, v_session.session_token, v_session.expires_at;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Validate a session token. Returns the session row only if active AND not
-- past its expiry. If it finds a token that is active but past expiry, it
-- flips it to expired on the spot (lazy expiry).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_ordering_session(p_session_token TEXT)
RETURNS TABLE (session_id UUID, table_id UUID, tenant_id UUID, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.ordering_sessions;
BEGIN
  SELECT * INTO v
  FROM public.ordering_sessions os
  WHERE os.session_token = p_session_token AND os.status = 'active'
  FOR UPDATE;

  IF v.id IS NULL THEN
    RETURN;  -- no active session with this token
  END IF;

  -- Lazy expiry: if the clock has passed expires_at, close it now.
  IF v.expires_at <= now() THEN
    UPDATE public.ordering_sessions
    SET status = 'expired', closure_reason = 'expired', closed_at = now()
    WHERE ordering_sessions.id = v.id;
    RETURN;  -- expired, return nothing
  END IF;

  RETURN QUERY SELECT v.id, v.table_id, v.tenant_id, v.expires_at;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Close session when the bill is paid. Called from the payment path.
-- Only closes an active session that is linked to this order's table.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_session_on_payment(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table_id UUID;
BEGIN
  SELECT o.table_id INTO v_table_id
  FROM public.orders o
  WHERE o.id = p_order_id AND o.order_type = 'dine_in';

  IF v_table_id IS NULL THEN RETURN; END IF;

  UPDATE public.ordering_sessions
  SET status = 'closed', closure_reason = 'bill_paid', closed_at = now()
  WHERE ordering_sessions.table_id = v_table_id AND ordering_sessions.status = 'active';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Batch-expire sessions that passed their expiry time. Can be called by a
-- cron job or on-demand. Also used as a fallback for sessions that were never
-- lazily expired (customer never came back).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_sessions()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.ordering_sessions
  SET status = 'expired', closure_reason = 'expired', closed_at = now()
  WHERE status = 'active' AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Find the active session for a table (used by the QR scan loader to check
-- if an existing session can be reused or a new one is needed).
-- Returns NULL if no active session or if the active session has expired.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_table_session(p_table_id UUID)
RETURNS TABLE (session_id UUID, session_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.ordering_sessions;
BEGIN
  SELECT * INTO v
  FROM public.ordering_sessions os
  WHERE os.table_id = p_table_id AND os.status = 'active'
  ORDER BY os.created_at DESC LIMIT 1
  FOR UPDATE;

  IF v.id IS NULL THEN RETURN; END IF;

  IF v.expires_at <= now() THEN
    UPDATE public.ordering_sessions
    SET status = 'expired', closure_reason = 'expired', closed_at = now()
    WHERE ordering_sessions.id = v.id;
    RETURN;
  END IF;

  RETURN QUERY SELECT v.id, v.session_token, v.expires_at;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- RLS: owners/managers see their outlet's sessions. Super admins see all.
-- Anonymous and unauthenticated users cannot read the table directly.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ordering_sessions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.ordering_sessions TO authenticated;
GRANT ALL ON public.ordering_sessions TO service_role;

CREATE POLICY "session tenant read" ON public.ordering_sessions
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "session super all" ON public.ordering_sessions
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Permissions: anon can create and validate sessions (QR scan flow), but not
-- read or modify the table directly.
REVOKE ALL ON FUNCTION public.create_ordering_session(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ordering_session(UUID, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_ordering_session(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_session_on_payment(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_active_table_session(UUID) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_stale_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_sessions() TO service_role;
