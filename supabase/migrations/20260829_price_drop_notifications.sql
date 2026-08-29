create or replace function market.notify_watchers_on_price_drop()
returns trigger
language plpgsql
security definer
set search_path to 'market','public'
as $$
begin
  if old.price_gross is not null and new.price_gross is not null and new.price_gross < old.price_gross then
    insert into market.notifications(user_id,channel,type,title,body)
    select w.user_id,'app','price_drop','Cena spadła: ' || left(new.title,120),
           'Nowa cena: ' || to_char(new.price_gross,'FM999999990D00') || ' zł (wcześniej ' || to_char(old.price_gross,'FM999999990D00') || ' zł)'
    from market.watchlist w
    where w.offer_id=new.id and w.notify_drop=true;
  end if;
  return new;
end;
$$;
revoke execute on function market.notify_watchers_on_price_drop() from public, anon, authenticated;
drop trigger if exists trg_notify_watchers_on_price_drop on market.offers;
create trigger trg_notify_watchers_on_price_drop
after update of price_gross on market.offers
for each row
when (new.price_gross is distinct from old.price_gross)
execute function market.notify_watchers_on_price_drop();
