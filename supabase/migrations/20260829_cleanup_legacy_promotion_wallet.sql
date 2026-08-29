-- Retire dead promotion RPC/token left by the old async promotion flow.
-- Current frontend calls the authenticated promote-offer Edge Function directly.

drop function if exists market.my_promote_offer(uuid, integer);
delete from market.internal_secrets where key = 'promotion_charge_token';

-- The Market-local seller balance is no longer authoritative or used by active
-- settlement/promotion code. Seller funds settle to the MySunrise wallet.
-- Drop only after verifying there are no active function/view/trigger references
-- and all current values are zero.
alter table market.wallet_mirror drop column if exists seller_balance;
