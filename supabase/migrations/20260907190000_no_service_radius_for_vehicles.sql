-- Zasięg dojazdu ma sens dla usług z montażem, nie dla pojazdu czy nieruchomości.
-- Migracja „cała Polska” ustawiła promień 600 km wszystkim ofertom — na aucie (sprzedaż i wynajem)
-- mapa pokazywała „Montaż i dojazd w całej Polsce”. Zdejmujemy promień z motoryzacji i nieruchomości.
update market.offers o
set attributes = (o.attributes - 'service_radius_km' - 'service_lat' - 'service_lon')
from market.categories c
where c.id = o.category_id
  and (c.slug like 'motoryzacja%' or c.slug like 'nieruchomosci%')
  and o.attributes ? 'service_radius_km';
