-- Chit Chats labels: the shipment made for an order from the admin page, so its rates,
-- label and tracking can be looked up again.
-- Apply in the Supabase SQL editor after 0003_fulfilment.sql. Safe to run again.

alter table orders add column if not exists chitchats_shipment_id text;
