-- Nocleg: struktura obiektu i zasady pobytu (parytet z Bookingiem, etap 1 — dane opisowe).
-- Zastosowane na produkcji 2026-09-11 jako migracje:
--   nocleg_struktura_i_zasady_pobytu, seller_stay_settings_pelne_dane
alter table market.booking_offers
  add column if not exists bedrooms integer,
  add column if not exists bathrooms integer,
  add column if not exists beds jsonb,
  add column if not exists area_m2 numeric,
  add column if not exists quiet_hours_from time,
  add column if not exists quiet_hours_to time,
  add column if not exists smoking_allowed boolean,
  add column if not exists parties_allowed boolean,
  add column if not exists children_allowed boolean,
  add column if not exists pets_allowed boolean,
  add column if not exists checkin_instructions text,
  add column if not exists house_rules_extra text;
