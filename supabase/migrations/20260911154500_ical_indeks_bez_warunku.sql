-- Indeks częściowy nie nadaje się jako arbiter ON CONFLICT (PostgREST nie potrafi go
-- wskazać), przez co import iCal po cichu nic nie zapisywał. Bez warunku działa tak samo:
-- dla blokad ręcznych feed_id i external_uid są NULL, a NULL-e w indeksie unikalnym
-- nie kolidują ze sobą. Zastosowane na produkcji 2026-09-11 jako ical_indeks_bez_warunku.
drop index if exists market.booking_blocks_feed_uid_uidx;
create unique index if not exists booking_blocks_feed_uid_uidx
  on market.booking_blocks(feed_id, external_uid);
