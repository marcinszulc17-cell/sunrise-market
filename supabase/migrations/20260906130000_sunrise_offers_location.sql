-- 2026-09-06 (decyzja właściciela): oferty marki własnej Sunrise bez miejscowości dostają „Nowy Tomyśl, wielkopolskie”
-- (siedziba operatora) — filtr regionu, „📍” na kartach i mapa mają co pokazywać. Nie nadpisujemy wpisanych lokalizacji.
update market.offers o set attributes = coalesce(o.attributes,'{}'::jsonb) || '{"location":"Nowy Tomyśl, wielkopolskie"}'::jsonb, updated_at = now()
from market.sellers s
where s.id = o.seller_id and s.seller_type = 'sunrise' and coalesce(o.attributes->>'location','') = '';
