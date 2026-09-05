-- Dwa poziomy sprzedaży (decyzja właściciela 2026-09-05):
--   "Sprzedawca"       = seller_type private_partner (uproszczony, bez NIP, wypłaty na portfel prywatny)
--                        -> 12 mies. gratis, potem 299 zł / rok  (partner_program_config + trade_partner_annual_fee)
--   "Partner Handlowy" = seller_type business (firma z NIP, Stripe Connect, faktury, saldo firmowe/merchant)
--                        -> 12 mies. gratis, potem 499 zł / rok  (pay_annual_fee + pay_subscriptions.annual_fee)
-- Zastosowane na produkcji 2026-09-05.
update market.partner_program_config set annual_fee_gross = 299, updated_at = now() where id = 1;
update market.platform_config set value = '299' where key = 'trade_partner_annual_fee';
update market.platform_config set value = '499' where key = 'pay_annual_fee';
update market.pay_subscriptions set annual_fee = 499;
