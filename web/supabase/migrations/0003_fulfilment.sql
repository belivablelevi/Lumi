-- Fulfilment and refunds: what happens to an order after it's paid.
--   fulfilment_status: unfulfilled -> packed -> shipped, set from the admin page
--   carrier / tracking_number / shipped_at: filled in when it ships
--   unit_names: the Lumi(s) packed for this order, for the card in the box
--   payment_intent / refunded_amount: link to Stripe, so a refund there marks the order here
--   tip_amount / protection_amount / shipping_amount: the checkout extras
-- Apply in the Supabase SQL editor after 0002_cleanup.sql. Safe to run again.

alter table orders add column if not exists fulfilment_status text not null default 'unfulfilled';
alter table orders add column if not exists carrier text;
alter table orders add column if not exists tracking_number text;
alter table orders add column if not exists shipped_at timestamptz;
alter table orders add column if not exists shipped_email_sent_at timestamptz;
alter table orders add column if not exists unit_names text;
alter table orders add column if not exists admin_note text;
alter table orders add column if not exists payment_intent text;
alter table orders add column if not exists refunded_amount integer not null default 0;
-- Whether this order's units count in capacity.sold, so a refund gives them back exactly once.
alter table orders add column if not exists counted_sold boolean not null default false;
-- Checkout extras, in cents: a tip, shipping protection, and the shipping Stripe charged.
alter table orders add column if not exists tip_amount integer not null default 0 check (tip_amount >= 0);
alter table orders add column if not exists protection_amount integer not null default 0 check (protection_amount >= 0);
alter table orders add column if not exists shipping_amount integer;

alter table orders drop constraint if exists orders_fulfilment_status_check;
alter table orders add constraint orders_fulfilment_status_check check (fulfilment_status in ('unfulfilled', 'packed', 'shipped'));
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in ('pending', 'paid', 'expired', 'failed', 'review', 'refunded'));
create unique index if not exists orders_payment_intent on orders (payment_intent);
create index if not exists orders_to_ship on orders (paid_at) where status in ('paid', 'review') and fulfilment_status <> 'shipped';

-- Orders paid before this migration: a 'paid' order always moved its units into sold.
update orders set counted_sold = true where status = 'paid' and not counted_sold;

-- Same as 0001, and now also stores the tip and shipping protection chosen at checkout.
create or replace function create_order(p_order jsonb, p_items jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  need record;
  c capacity%rowtype;
begin
  perform release_expired_reservations();
  for need in
    select i->>'sku' as sku, sum((i->>'qty')::int) as qty from jsonb_array_elements(p_items) i group by 1 order by 1
  loop
    select * into c from capacity where sku = need.sku for update;
    if not found then return 'not_configured:' || need.sku; end if;
    if c.total - c.reserved - c.sold < need.qty then return 'insufficient:' || need.sku; end if;
  end loop;

  insert into orders (id, status, fulfilment, currency, subtotal, created_at, reservation_expires_at, tip_amount, protection_amount)
  values ((p_order->>'id')::uuid, 'pending', p_order->>'fulfilment', p_order->>'currency', (p_order->>'subtotal')::int,
          (p_order->>'createdAt')::timestamptz, (p_order->>'reservationExpiresAt')::timestamptz,
          coalesce((p_order->>'tipAmount')::int, 0), coalesce((p_order->>'protectionAmount')::int, 0));

  insert into order_items (order_id, line, sku, slug, name, variant_id, qty, unit_amount)
  select (p_order->>'id')::uuid, (ord - 1)::int, i->>'sku', i->>'slug', i->>'name', i->>'variantId', (i->>'qty')::int, (i->>'unitAmount')::int
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  update capacity set reserved = reserved + x.qty, updated_at = now()
  from (select i->>'sku' as sku, sum((i->>'qty')::int) as qty from jsonb_array_elements(p_items) i group by 1) x
  where capacity.sku = x.sku;
  return 'ok';
end $$;

-- Same as 0001, and now also records whether the units moved into sold.
create or replace function mark_order_paid(p_order uuid, p_session text, p_email text, p_name text,
                                           p_shipping jsonb, p_amount_total integer, p_mismatch boolean) returns text
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order for update;
  if not found then return 'missing'; end if;
  if o.status in ('paid', 'review', 'refunded') then return 'already'; end if;
  update orders set
    status = case when p_mismatch or o.status <> 'pending' then 'review' else 'paid' end,
    stripe_session_id = p_session, email = p_email, customer_name = p_name, shipping = p_shipping,
    amount_total = p_amount_total, paid_at = now(), counted_sold = (o.status = 'pending')
  where id = p_order;
  -- A late payment's reservation is already gone: leave capacity for the person reviewing it.
  if o.status = 'pending' then
    update capacity set reserved = reserved - x.qty, sold = sold + x.qty, updated_at = now()
    from (select sku, sum(qty) as qty from order_items where order_id = p_order group by sku) x
    where capacity.sku = x.sku;
  end if;
  return 'updated';
end $$;

-- Records a refund made in Stripe. A full refund marks the order refunded and, if
-- it hasn't shipped, gives its units back so they can be sold again.
-- Returns 'updated', 'partial', 'already' or 'missing'.
create or replace function mark_order_refunded(p_payment_intent text, p_refunded integer, p_full boolean) returns text
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where payment_intent = p_payment_intent for update;
  if not found then return 'missing'; end if;
  if o.status = 'refunded' then return 'already'; end if;
  update orders set refunded_amount = greatest(refunded_amount, p_refunded) where id = o.id;
  if not p_full then return 'partial'; end if;
  update orders set status = 'refunded' where id = o.id;
  if o.counted_sold and o.fulfilment_status <> 'shipped' then
    update capacity set sold = sold - x.qty, updated_at = now()
    from (select sku, sum(qty) as qty from order_items where order_id = o.id group by sku) x
    where capacity.sku = x.sku;
    update orders set counted_sold = false where id = o.id;
  end if;
  return 'updated';
end $$;

revoke all on function mark_order_refunded(text, integer, boolean) from public, anon, authenticated;
