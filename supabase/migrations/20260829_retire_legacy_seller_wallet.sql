-- Seller proceeds are settled directly into the authoritative MySunrise wallet.
-- Retire legacy Market-side seller balance entry points to prevent accidental reuse.

drop function if exists market.credit_seller_payouts(uuid);
drop function if exists market.my_seller_balance();
drop function if exists market.seller_wallet_withdraw(uuid,numeric);
drop function if exists market.seller_withdrawal_reverse(uuid,text);

-- Keep wallet_mirror.seller_balance temporarily only because the legacy offer-promotion
-- purchase RPC still references it. That flow is migrated separately before the column
-- itself can be removed safely.
