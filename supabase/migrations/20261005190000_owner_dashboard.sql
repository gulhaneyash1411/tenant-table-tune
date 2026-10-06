-- Consolidated "All outlets" numbers for a multi-outlet owner's dashboard.
-- Row-level security only exposes the CURRENTLY SELECTED outlet's orders, so the
-- cross-outlet totals come from this function, which is limited to outlets the
-- caller owns.
CREATE OR REPLACE FUNCTION public.owner_outlet_stats(p_since TIMESTAMPTZ)
RETURNS TABLE (
  tenant_id UUID, name TEXT, city TEXT, outlet_status TEXT,
  orders BIGINT, sales NUMERIC, pending_orders BIGINT, tables BIGINT, active_qrs BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    t.id, t.name, t.city, t.outlet_status,
    (SELECT count(*) FROM public.orders o WHERE o.tenant_id = t.id AND o.created_at >= p_since),
    (SELECT COALESCE(sum(o.total), 0) FROM public.orders o
       WHERE o.tenant_id = t.id AND o.created_at >= p_since AND o.payment_status = 'paid'),
    (SELECT count(*) FROM public.orders o
       WHERE o.tenant_id = t.id AND o.status IN ('new', 'preparing', 'ready')),
    (SELECT count(*) FROM public.restaurant_tables rt WHERE rt.tenant_id = t.id AND rt.is_active),
    (SELECT count(*) FROM public.qr_codes q WHERE q.tenant_id = t.id AND q.status = 'ACTIVE')
  FROM public.tenants t
  WHERE t.owner_id = auth.uid()
  ORDER BY t.created_at;
$$;
REVOKE ALL ON FUNCTION public.owner_outlet_stats(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_outlet_stats(TIMESTAMPTZ) TO authenticated;
