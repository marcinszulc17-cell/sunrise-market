-- Keep booking offers hidden until the seller explicitly activates the calendar.
-- Implemented with triggers so newer create/configure RPC definitions stay untouched.

create or replace function market.prepare_booking_offer_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
     and coalesce(new.attributes ->> 'purchase_mode', 'purchase') in ('appointment','daily') then
    new.status := 'paused';
  end if;
  return new;
end;
$$;

revoke all on function market.prepare_booking_offer_visibility() from public, anon, authenticated;

drop trigger if exists booking_offer_hide_until_setup_trg on market.offers;
create trigger booking_offer_hide_until_setup_trg
before insert on market.offers
for each row execute function market.prepare_booking_offer_visibility();

create or replace function market.publish_booking_offer_on_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active = true
     and (tg_op = 'INSERT' or old.active is distinct from new.active) then
    update market.offers
       set status = 'active', updated_at = now()
     where id = new.offer_id
       and status = 'paused'
       and coalesce(attributes ->> 'purchase_mode', '') in ('appointment','daily');
  end if;
  return new;
end;
$$;

revoke all on function market.publish_booking_offer_on_activation() from public, anon, authenticated;

drop trigger if exists booking_offer_publish_on_activation_trg on market.booking_offers;
create trigger booking_offer_publish_on_activation_trg
after insert or update of active on market.booking_offers
for each row execute function market.publish_booking_offer_on_activation();
