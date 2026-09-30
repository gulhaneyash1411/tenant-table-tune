-- Track when each order_items row was inserted, so the kitchen and the live
-- board can tell a new round from the original order.
--
-- Existing rows get the column value filled from their order's created_at,
-- which is correct: they ARE the original round. New rows inserted after this
-- migration default to now(), which is always later than the order's own
-- created_at — that delta is what the UI uses to badge "New round".

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Back-fill existing rows so they sit at the order's timestamp, not the
-- migration timestamp.  Without this every item in every past order would
-- look like a "new round" until the next insert.
UPDATE public.order_items oi
   SET created_at = o.created_at
  FROM public.orders o
 WHERE oi.order_id = o.id;
