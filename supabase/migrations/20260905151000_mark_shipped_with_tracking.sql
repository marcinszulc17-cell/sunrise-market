-- Sprzedawca firmowy (centrum /sprzedawca/zamowienia) nie miał w ogóle przycisku "Wysłane" — akcja była
-- tylko w starym panelu, do którego aktywny sprzedawca już nie trafia. Nowa wersja mark_shipped przyjmuje
-- prawdziwy numer przesyłki (opcjonalny) zamiast generować losowy "PL…". Stara sygnatura zostaje.
create or replace function market.mark_shipped(p_order uuid, p_tracking text)
returns text language plpgsql security definer set search_path to 'market','public','extensions' as $$
declare v_seller uuid := market.current_seller_id();
begin
  if not exists (
    select 1 from market.order_items oi where oi.order_id = p_order
      and (oi.seller_id = v_seller or market.is_operator())
  ) then raise exception 'To nie jest Twoje zamówienie'; end if;
  update market.orders
    set status = 'shipped',
        tracking_no = coalesce(nullif(trim(p_tracking),''), tracking_no)
    where id = p_order and status = 'paid';
  if not found then raise exception 'Zamówienie nie jest w statusie „opłacone” — nie można oznaczyć wysyłki'; end if;
  return (select tracking_no from market.orders where id = p_order);
end; $$;
revoke all on function market.mark_shipped(uuid, text) from public;
grant execute on function market.mark_shipped(uuid, text) to authenticated;
