-- 2026-09-06 (decyzja właściciela): zdjęcia protokołu wydania/zwrotu muszą być robione w chwili wydania i zwrotu,
-- z czasem, którego nie da się podrobić. Pieczęć serwera na każdym zdjęciu: sha256 pliku, czas przyjęcia (created_at),
-- czas z EXIF, źródło (aparat/plik), rola (sprzedawca/klient), GPS jeśli telefon pozwolił.
-- Reguły czasowe i wymóg zdjęć egzekwuje edge fn booking-protocol.
alter table market.booking_protocol_photos
  add column if not exists sha256 text,
  add column if not exists size_bytes integer,
  add column if not exists exif_taken_at timestamptz,
  add column if not exists capture_source text not null default 'file' check (capture_source in ('camera','file')),
  add column if not exists uploaded_role text not null default 'seller' check (uploaded_role in ('seller','buyer')),
  add column if not exists lat double precision,
  add column if not exists lon double precision,
  add column if not exists client_time_skew_s integer;

comment on column market.booking_protocol_photos.sha256 is 'Odcisk SHA-256 pliku policzony na serwerze przy przyjęciu — dowód, że zdjęcie nie zostało później podmienione';
comment on column market.booking_protocol_photos.created_at is 'Czas przyjęcia zdjęcia przez serwer Sunrise (pieczęć czasu, niezależna od zegara telefonu)';
comment on column market.booking_protocol_photos.exif_taken_at is 'Czas zrobienia zdjęcia z metadanych EXIF (jeśli były); serwer odrzuca zdjęcia starsze niż 15 min';
comment on column market.booking_protocol_photos.client_time_skew_s is 'Różnica zegara telefonu względem serwera w sekundach (do wykrywania manipulacji datą)';
