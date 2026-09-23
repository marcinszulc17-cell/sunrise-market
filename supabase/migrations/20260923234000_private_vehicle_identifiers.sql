-- Private vehicle identifiers for Sunrise Verify.
-- Full VIN / registration data must never live in public offer attributes.
create table if not exists market.offer_private_data (
  offer_id uuid primary key references market.offers(id) on delete cascade,
  vin text,
  registration_number text,
  first_registration date,
  updated_at timestamptz not null default now()
);

alter table market.offer_private_data enable row level security;

revoke all on market.offer_private_data from public, anon, authenticated;
grant select, insert, update, delete on market.offer_private_data to service_role;

-- One-time migration of identifiers already stored in offers.attributes.
insert into market.offer_private_data(offer_id, vin, registration_number, first_registration, updated_at)
select
  id,
  nullif(attributes->>'vin',''),
  nullif(attributes->>'registration_number',''),
  case
    when coalesce(attributes->>'first_registration','') ~ '^\d{4}-\d{2}-\d{2}$'
      then (attributes->>'first_registration')::date
    else null
  end,
  now()
from market.offers
where coalesce(attributes->>'vin','') <> ''
   or coalesce(attributes->>'registration_number','') <> ''
on conflict (offer_id) do update
set vin = coalesce(excluded.vin, market.offer_private_data.vin),
    registration_number = coalesce(excluded.registration_number, market.offer_private_data.registration_number),
    first_registration = coalesce(excluded.first_registration, market.offer_private_data.first_registration),
    updated_at = now();

update market.offers
set attributes =
  (coalesce(attributes,'{}'::jsonb) - 'vin' - 'registration_number')
  || jsonb_build_object('has_vin', coalesce(nullif(attributes->>'vin',''),'') <> ''),
  updated_at = now()
where coalesce(attributes,'{}'::jsonb) ? 'vin'
   or coalesce(attributes,'{}'::jsonb) ? 'registration_number';
