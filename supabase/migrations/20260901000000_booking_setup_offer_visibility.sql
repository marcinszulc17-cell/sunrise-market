-- Keep newly configured booking offers out of the public Market until the
-- seller explicitly activates the calendar. Later manual booking disable does
-- not hide an already published offer.

create or replace function market.sync_booking_setup_offer_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.active = false then
    update market.offers
    set status = 'paused',
        attributes = coalesce(attributes, '{}'::jsonb) || jsonb_build_object('booking_setup_pending', true),
        updated_at = now()
    where id = new.offer_id
      and status = 'active';

  elsif tg_op = 'UPDATE'
    and old.active = false
    and new.active = true then
    update market.offers
    set status = 'active',
        attributes = coalesce(attributes, '{}'::jsonb) - 'booking_setup_pending',
        updated_at = now()
    where id = new.offer_id
      and status = 'paused'
      and coalesce(attributes ->> 'booking_setup_pending', 'false') = 'true';
  end if;

  return new;
end;
$$;

revoke all on function market.sync_booking_setup_offer_visibility() from public, anon, authenticated;

drop trigger if exists booking_setup_offer_visibility_trg on market.booking_offers;
create trigger booking_setup_offer_visibility_trg
after insert or update of active on market.booking_offers
for each row
execute function market.sync_booking_setup_offer_visibility();
