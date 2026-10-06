-- Fix order numbering to be per-outlet/tenant instead of global
--
-- Current issue: BIGSERIAL creates a single global sequence for all restaurants
-- Restaurant A order: #1, Restaurant B order: #2 (wrong, should be #1)
--
-- Solution:
-- 1. Remove BIGSERIAL auto-generation
-- 2. Add per-tenant order counter via database function
-- 3. Use trigger to auto-generate order_number per tenant
-- 4. Ensure concurrent order creation doesn't produce duplicates

-- Step 0: Remove existing constraints if they block backfill
-- First, make order_number nullable so we can clear values
ALTER TABLE public.orders ALTER COLUMN order_number DROP NOT NULL;

-- Try dropping constraint with most likely name first
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tenant_order_number_unique;
-- Also try the shortened name
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tenant_number_uniq;

-- Set all order_numbers to NULL to prepare for fresh numbering
UPDATE public.orders SET order_number = NULL WHERE order_number IS NOT NULL;

-- Step 1: Create a function to safely get the next order number for a tenant
-- Uses advisory locking to prevent race conditions during concurrent inserts
CREATE OR REPLACE FUNCTION public.get_next_order_number(p_tenant_id UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next_number BIGINT;
  v_lock_id BIGINT;
BEGIN
  -- Convert UUID to bigint for advisory lock (PostgreSQL requires int8)
  v_lock_id := ('x' || substr(p_tenant_id::text, 1, 16))::bit(64)::bigint;

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

-- Step 2: Backfill existing orders with per-tenant order numbers
-- For each tenant, renumber orders sequentially by creation date
DO $$
DECLARE
  v_tenant_id UUID;
  v_order_id UUID;
  v_order_number BIGINT;
BEGIN
  -- Process each tenant independently
  FOR v_tenant_id IN (SELECT DISTINCT tenant_id FROM public.orders)
  LOOP
    v_order_number := 1;

    -- Renumber ALL orders for this tenant in chronological order
    -- Start from 1 for each tenant regardless of previous numbering
    FOR v_order_id IN (
      SELECT id FROM public.orders
      WHERE tenant_id = v_tenant_id
      ORDER BY created_at ASC, id ASC
    )
    LOOP
      UPDATE public.orders
      SET order_number = v_order_number
      WHERE id = v_order_id;

      v_order_number := v_order_number + 1;
    END LOOP;
  END LOOP;
END;
$$;

-- Step 3: Modify the orders table to support per-tenant numbering
-- Remove BIGSERIAL default
ALTER TABLE public.orders
  ALTER COLUMN order_number DROP DEFAULT;

-- Add unique constraint on (tenant_id, order_number) to ensure
-- each outlet has independent sequence
ALTER TABLE public.orders
  ADD CONSTRAINT orders_tenant_order_number_unique UNIQUE (tenant_id, order_number);

-- Step 4: Create trigger function to auto-populate order_number before INSERT
CREATE OR REPLACE FUNCTION public.orders_set_order_number_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Auto-generate order_number if not provided
  IF NEW.order_number IS NULL THEN
    NEW.order_number := public.get_next_order_number(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Step 5: Create the trigger
DROP TRIGGER IF EXISTS orders_set_order_number ON public.orders;
CREATE TRIGGER orders_set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_set_order_number_trigger();
