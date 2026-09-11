-- Polityka anulowania rezerwacji + anulowanie przez gościa.
-- Zastosowane na produkcji 2026-09-11 jako migracje:
--   polityka_anulowania_rezerwacji, anulowanie_przez_goscia, polityka_anulowania_rpc_i_katalog
--
-- Do tej pory gość nie mógł anulować sam, a sprzedawca zwracał zawsze 100%.
-- Teraz właściciel wybiera zasadę, gość widzi ją przed płatnością, a kwota zwrotu
-- liczy się z market.booking_cancellation_quote — tej samej, którą widział na ofercie.
-- Kaucja i opłata za sprzątanie wracają zawsze; zatrzymana część czynszu zostaje
-- u właściciela, a jego wypłata i nasza prowizja są zmniejszane proporcjonalnie.
alter table market.booking_offers
  add column if not exists cancellation_policy text not null default 'moderate'
    check (cancellation_policy in ('flexible','moderate','strict','non_refundable'));
