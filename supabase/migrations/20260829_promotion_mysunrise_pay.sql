create table if not exists market.promotion_purchases (
  id uuid primary key,
  seller_id uuid not null references market.sellers(id),
  offer_id uuid not null references market.offers(id),
  days integer not null check (days between 1 and 365),
  amount numeric(10,2) not null check (amount > 0),
  pricing_code text not null default 'highlight_day',
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  mysunrise_tx_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table market.promotion_purchases enable row level security;
revoke all on market.promotion_purchases from public, anon, authenticated;
grant all on market.promotion_purchases to service_role;
create index if not exists promotion_purchases_seller_created_idx on market.promotion_purchases(seller_id, created_at desc);

alter table market.promoted_offers add column if not exists source_purchase_id uuid references market.promotion_purchases(id);
create unique index if not exists promoted_offers_source_purchase_uidx on market.promoted_offers(source_purchase_id) where source_purchase_id is not null;

insert into market.internal_secrets(key,value)
values ('promotion_charge_token', encode(gen_random_bytes(32),'hex'))
on conflict (key) do nothing;

create or replace function market.my_promote_offer(p_offer uuid, p_days integer)
returns numeric
language plpgsql
security definer
set search_path = market, public, extensions
as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_seller uuid;
  v_rate numeric;
  v_cost numeric;
  v_purchase uuid := gen_random_uuid();
  v_token text;
begin
  if auth.uid() is null or v_email is null then raise exception 'Brak autoryzacji'; end if;
  if p_days < 1 or p_days > 365 then raise exception 'Nieprawidłowa liczba dni'; end if;
  select id into v_seller from market.sellers where lower(email)=lower(v_email) limit 1;
  if v_seller is null then raise exception 'Najpierw zostań sprzedawcą'; end if;
  if not exists(select 1 from market.offers where id=p_offer and seller_id=v_seller) then raise exception 'To nie Twoja oferta'; end if;
  select price into v_rate from market.ad_rates where code='highlight_day' and active;
  if coalesce(v_rate,0) <= 0 then raise exception 'Cennik promowania niedostępny'; end if;
  v_cost := round(v_rate * p_days, 2);
  insert into market.promotion_purchases(id,seller_id,offer_id,days,amount) values(v_purchase,v_seller,p_offer,p_days,v_cost);
  select value into v_token from market.internal_secrets where key='promotion_charge_token';
  perform net.http_post(
    url := 'https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/promote-offer',
    headers := jsonb_build_object('Content-Type','application/json','x-promotion-token',v_token),
    body := jsonb_build_object('purchase_id',v_purchase)
  );
  return v_cost;
end;
$$;
revoke execute on function market.my_promote_offer(uuid,integer) from public, anon;
grant execute on function market.my_promote_offer(uuid,integer) to authenticated, service_role;
