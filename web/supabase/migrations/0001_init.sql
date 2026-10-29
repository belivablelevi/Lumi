-- Lumi store: orders, pre-order capacity, webhook events and launch signups.
-- Apply with the Supabase SQL editor or `supabase db push`.
-- The site talks to these tables only from the server, with the service role key.

-- How many of each SKU can be sold (pre-order capacity or stock).
-- A SKU with no row can't be ordered: set it up before opening sales.
create table if not exists capacity (
  sku text primary key,
  total integer not null check (total >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  sold integer not null default 0 check (sold >= 0),
  updated_at timestamptz not null default now(),
  check (reserved + sold <= total)
);

create table if not exists orders (
  id uuid primary key,
  status text not null check (status in ('pending', 'paid', 'expired', 'failed', 'review')),
  fulfilment text not null check (fulfilment in ('preorder', 'now')),
  currency text not null,
  subtotal integer not null check (subtotal > 0),
  created_at timestamptz not null default now(),
  reservation_expires_at timestamptz not null,
  stripe_session_id text unique,
  email text,
  customer_name text,
  shipping jsonb,
  amount_total integer,
  paid_at timestamptz,
  confirmation_sent_at timestamptz
);
create index if not exists orders_pending_expiry on orders (reservation_expires_at) where status = 'pending';

create table if not exists order_items (
  order_id uuid not null references orders (id) on delete cascade,
  line integer not null,
  sku text not null references capacity (sku),
  slug text not null,
  name text not null,
  variant_id text,
  qty integer not null check (qty > 0),
  unit_amount integer not null check (unit_amount > 0),
  primary key (order_id, line)
);

create table if not exists stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create table if not exists launch_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  topic text not null,
  consent_text text not null,
  consent_version text not null,
  consented_at timestamptz not null default now(),
  confirm_token_hash text not null,
  unsubscribe_token_hash text not null,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  unique (email, topic)
);
create index if not exists launch_signups_confirm on launch_signups (confirm_token_hash);
create index if not exists launch_signups_unsub on launch_signups (unsubscribe_token_hash);

create table if not exists signup_attempts (
  key_hash text not null,
  at timestamptz not null default now()
);
create index if not exists signup_attempts_key on signup_attempts (key_hash, at);

-- Only the server (service role) may touch any of this.
alter table capacity enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table stripe_events enable row level security;
alter table launch_signups enable row level security;
alter table signup_attempts enable row level security;

-- Gives back capacity held by pending orders whose checkout window has passed.
create or replace function release_expired_reservations() returns void
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  for o in select id from orders where status = 'pending' and reservation_expires_at < now() - interval '5 minutes' for update skip locked loop
    perform release_order(o.id, 'expired');
  end loop;
end $$;

-- Creates a pending order and reserves capacity for all its items, or nothing.
-- Returns 'ok', 'insufficient:<sku>' or 'not_configured:<sku>'.
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

  insert into orders (id, status, fulfilment, currency, subtotal, created_at, reservation_expires_at)
  values ((p_order->>'id')::uuid, 'pending', p_order->>'fulfilment', p_order->>'currency', (p_order->>'subtotal')::int,
          (p_order->>'createdAt')::timestamptz, (p_order->>'reservationExpiresAt')::timestamptz);

  insert into order_items (order_id, line, sku, slug, name, variant_id, qty, unit_amount)
  select (p_order->>'id')::uuid, (ord - 1)::int, i->>'sku', i->>'slug', i->>'name', i->>'variantId', (i->>'qty')::int, (i->>'unitAmount')::int
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  update capacity set reserved = reserved + x.qty, updated_at = now()
  from (select i->>'sku' as sku, sum((i->>'qty')::int) as qty from jsonb_array_elements(p_items) i group by 1) x
  where capacity.sku = x.sku;
  return 'ok';
end $$;

-- Ends a pending order and returns its reservation. No-op for any other status.
create or replace function release_order(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('expired', 'failed') then raise exception 'bad status %', p_status; end if;
  update orders set status = p_status where id = p_order and status = 'pending';
  if found then
    update capacity set reserved = reserved - x.qty, updated_at = now()
    from (select sku, sum(qty) as qty from order_items where order_id = p_order group by sku) x
    where capacity.sku = x.sku;
  end if;
end $$;

-- Marks an order paid exactly once. Returns 'updated', 'already' or 'missing'.
-- An order paid after its reservation ended, or for the wrong amount, goes to 'review'.
create or replace function mark_order_paid(p_order uuid, p_session text, p_email text, p_name text,
                                           p_shipping jsonb, p_amount_total integer, p_mismatch boolean) returns text
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order for update;
  if not found then return 'missing'; end if;
  if o.status in ('paid', 'review') then return 'already'; end if;
  update orders set
    status = case when p_mismatch or o.status <> 'pending' then 'review' else 'paid' end,
    stripe_session_id = p_session, email = p_email, customer_name = p_name, shipping = p_shipping,
    amount_total = p_amount_total, paid_at = now()
  where id = p_order;
  -- A late payment's reservation is already gone: leave capacity for the person reviewing it.
  if o.status = 'pending' then
    update capacity set reserved = reserved - x.qty, sold = sold + x.qty, updated_at = now()
    from (select sku, sum(qty) as qty from order_items where order_id = p_order group by sku) x
    where capacity.sku = x.sku;
  end if;
  return 'updated';
end $$;

revoke all on function create_order(jsonb, jsonb) from public, anon, authenticated;
revoke all on function release_order(uuid, text) from public, anon, authenticated;
revoke all on function mark_order_paid(uuid, text, text, text, jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function release_expired_reservations() from public, anon, authenticated;
