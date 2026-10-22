-- Dropshipping Onninen (2026-10-21) zapisuje w attributes koszty zakupu, wysyłki i marżę.
-- atrybuty_publiczne() nie wycinała tych kluczy, więc cena zakupu u hurtowni trafiała do przeglądarki.
-- Dokładamy je do listy wycinanej (stara lista bez zmian).
create or replace function market.atrybuty_publiczne(p jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to 'pg_catalog', 'market'
as $function$
  select coalesce(p, '{}'::jsonb)
    - 'markup_percent' - 'margin_percent' - 'net_margin_percent' - 'min_margin_required'
    - 'supplier_price_gross_pln' - 'break_even_price_pln' - 'net_profit_pln' - 'below_market'
    - 'market_lowest_pln' - 'market_source' - 'market_note' - 'market_checked_at'
    - 'supplier_key' - 'base_product_id' - 'base_inventory_id' - 'base_category' - 'base_refreshed_at'
    - 'price_source' - 'description_source' - 'cena_regularna_pln'
    -- koszty i dane hurtowni (Onninen i kolejni dostawcy ręczni)
    - 'supplier_price_net_pln' - 'supplier_shipping_net_pln' - 'shipping_allowance_pln'
    - 'supplier_list_price_gross_pln' - 'price_vs_list' - 'margin_target_percent' - 'payment_fee_percent'
    - 'supplier_index' - 'supplier_stock' - 'stock_checked_at' - 'onninen_group'
    - 'desc_model' - 'desc_err' - 'desc_at' - 'desc_v' - 'needs_photos' - 'archived_reason'
$function$;
