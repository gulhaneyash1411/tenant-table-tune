-- Invoice-level discount and service charge, configured under
-- Settings → Invoice & tax (tenants.settings.discount_type / discount_value /
-- service_charge) and worked out by src/lib/billing.ts.
--
-- Each order keeps its own copy of what it was charged, the same way it keeps
-- subtotal / tax / total, so changing Settings later doesn't rewrite old
-- invoices. Existing orders get the defaults: no discount, no service charge.
--
--   subtotal         items subtotal, before the discount (unchanged meaning)
--   discount_type    'rupees' (flat) or 'percentage'
--   discount_value   what was entered: rupees, or 0–100 for a percentage
--   discount_amount  rupees actually taken off
--   service_charge   flat rupees added after tax
alter table public.orders
  add column if not exists discount_type   text          not null default 'rupees',
  add column if not exists discount_value  numeric(10,2) not null default 0,
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists service_charge  numeric(10,2) not null default 0;

alter table public.orders
  drop constraint if exists orders_discount_type_valid,
  add  constraint orders_discount_type_valid check (discount_type in ('rupees', 'percentage')),
  drop constraint if exists orders_discount_value_valid,
  add  constraint orders_discount_value_valid check (
    discount_value >= 0 and (discount_type <> 'percentage' or discount_value <= 100)
  ),
  drop constraint if exists orders_discount_amount_valid,
  add  constraint orders_discount_amount_valid check (discount_amount >= 0 and discount_amount <= subtotal),
  drop constraint if exists orders_service_charge_nonneg,
  add  constraint orders_service_charge_nonneg check (service_charge >= 0);
