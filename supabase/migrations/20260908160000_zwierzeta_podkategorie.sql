-- Katalog PolZoo (18 200 SKU) to nie tylko karma: duzy udzial maja suplementy i preparaty
-- weterynaryjne, pielegnacja, akcesoria/transport oraz zwierzeta gospodarskie i hodowla.
-- Bez tych podkategorii 90 z pierwszych 300 ofert ladowalo w korzeniu "Zwierzeta".
insert into market.categories (parent_id, slug, name, sort_order, i18n)
select p.id, v.slug, v.name, v.sort_order, v.i18n
from market.categories p,
  (values
    ('zwierzeta-zdrowie',        'Zdrowie i suplementy', 6, '{"en":{"name":"Health & Supplements"}}'::jsonb),
    ('zwierzeta-pielegnacja',    'Pielęgnacja',          7, '{"en":{"name":"Grooming"}}'::jsonb),
    ('zwierzeta-akcesoria',      'Akcesoria i transport',8, '{"en":{"name":"Accessories & Travel"}}'::jsonb),
    ('zwierzeta-gospodarskie',   'Zwierzęta gospodarskie', 9, '{"en":{"name":"Farm Animals"}}'::jsonb)
  ) as v(slug, name, sort_order, i18n)
where p.slug = 'zwierzeta'
on conflict (slug) do nothing;
