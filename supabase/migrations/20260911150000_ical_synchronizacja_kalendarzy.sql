-- Synchronizacja kalendarzy (iCal) dla ofert rezerwacyjnych.
-- Zastosowane na produkcji 2026-09-11 jako migracje:
--   ical_synchronizacja_kalendarzy, ical_rpc_sprzedawcy, ical_export_publiczny_po_tokenie
-- Eksport: /api/ical na sunrisemarket.pl (publiczny, chroniony tokenem z linku).
-- Import: edge function `ical` + cron market-ical-sync (co 30 min).

alter table market.booking_offers
  add column if not exists ical_token uuid not null default gen_random_uuid();

alter table market.booking_blocks
  add column if not exists source text not null default 'manual',
  add column if not exists feed_id uuid,
  add column if not exists external_uid text;

create unique index if not exists booking_blocks_feed_uid_uidx
  on market.booking_blocks(feed_id, external_uid)
  where feed_id is not null and external_uid is not null;

create table if not exists market.booking_ical_feeds (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references market.offers(id) on delete cascade,
  seller_id uuid not null,
  url text not null,
  label text,
  active boolean not null default true,
  last_sync_at timestamptz,
  last_status text,
  last_error text,
  last_event_count integer,
  created_at timestamptz not null default now()
);

create index if not exists booking_ical_feeds_offer_idx on market.booking_ical_feeds(offer_id);
create unique index if not exists booking_ical_feeds_offer_url_uidx on market.booking_ical_feeds(offer_id, url);
alter table market.booking_ical_feeds enable row level security;

drop policy if exists ical_feeds_select_own on market.booking_ical_feeds;
create policy ical_feeds_select_own on market.booking_ical_feeds for select using (seller_id = auth.uid());
drop policy if exists ical_feeds_write_own on market.booking_ical_feeds;
create policy ical_feeds_write_own on market.booking_ical_feeds for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());
