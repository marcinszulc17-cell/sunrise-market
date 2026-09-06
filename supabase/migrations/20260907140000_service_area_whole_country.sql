-- 2026-09-06 (decyzja właściciela: „cały kraj”): marki własne Sunrise montują w całej Polsce.
-- Promień techniczny 500 → 600 km (obejmuje każde miasto w kraju), miasta wschodnie dodane do SEO (strony /miasto/<slug>, sitemap).
insert into market.service_cities(slug,name,region,lat,lon) values
('suwalki','Suwałki','podlaskie',54.1114,22.9312),
('elk','Ełk','warmińsko-mazurskie',53.8282,22.3647),
('ostroleka','Ostrołęka','mazowieckie',53.0855,21.575),
('biala-podlaska','Biała Podlaska','lubelskie',52.0324,23.1165),
('chelm','Chełm','lubelskie',51.1431,23.4716),
('zamosc','Zamość','lubelskie',50.7231,23.2518),
('stalowa-wola','Stalowa Wola','podkarpackie',50.5827,22.0532),
('tarnobrzeg','Tarnobrzeg','podkarpackie',50.573,21.6794),
('mielec','Mielec','podkarpackie',50.2871,21.4239),
('przemysl','Przemyśl','podkarpackie',49.7838,22.7676),
('krosno','Krosno','podkarpackie',49.6886,21.7705),
('sanok','Sanok','podkarpackie',49.5553,22.2054)
on conflict (slug) do nothing;
update market.offers o set attributes = o.attributes || jsonb_build_object('service_radius_km', 600)
  from market.sellers s where s.id = o.seller_id and s.seller_type = 'sunrise' and coalesce((o.attributes->>'service_radius_km')::int, 0) = 500;
