-- Fix: every order insert failed with '"-" is not a valid hexadecimal digit'.
--
-- get_next_order_number() built its advisory-lock id from the first 16 characters
-- of the tenant UUID text. That text contains hyphens (e.g. 3f2a1b4c-5d6e-...), and
-- the 'x' || ... bit-string cast rejects '-'. The hyphens are removed first so the
-- cast only sees hex digits. The function body is otherwise unchanged.

CREATE OR REPLACE FUNCTION public.get_next_order_number(p_tenant_id UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next_number BIGINT;
  v_lock_id BIGINT;
BEGIN
  -- Convert UUID to bigint for advisory lock (PostgreSQL requires int8).
  -- Hyphens are stripped: they are not hex digits and break the bit-string cast.
  v_lock_id := ('x' || substr(replace(p_tenant_id::text, '-', ''), 1, 16))::bit(64)::bigint;

  -- Acquire exclusive lock on this tenant's order number sequence
  PERFORM pg_advisory_lock(v_lock_id);

  -- Get the maximum order_number for this tenant and add 1
  -- Start from 1 if no orders exist yet
  SELECT COALESCE(MAX(order_number), 0) + 1 INTO v_next_number
  FROM public.orders
  WHERE tenant_id = p_tenant_id;

  -- Release the lock
  PERFORM pg_advisory_unlock(v_lock_id);

  RETURN v_next_number;
EXCEPTION WHEN others THEN
  -- Ensure lock is released even if an error occurs
  PERFORM pg_advisory_unlock(v_lock_id);
  RAISE;
END;
$$;
