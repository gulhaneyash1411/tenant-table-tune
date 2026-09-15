-- If orders.order_type is a Postgres enum:
alter type public.order_type add value if not exists 'home_delivery';

-- Delivery columns
alter table public.orders
  add column if not exists delivery_fee      numeric(10,2) not null default 0,
  add column if not exists delivery_address  text,
  add column if not exists delivery_landmark text,
  add column if not exists delivery_pincode  text;

alter table public.orders
  drop constraint if exists orders_delivery_fee_nonneg,
  add  constraint orders_delivery_fee_nonneg check (delivery_fee >= 0);