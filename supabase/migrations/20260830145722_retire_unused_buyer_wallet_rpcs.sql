-- These mutation/read paths target market.wallet_mirror. Active checkout,
-- cashback and top-up flows now use the authoritative MySunrise wallet.
drop function if exists market.credit_topup(uuid);
drop function if exists market.my_balance();
drop function if exists market.pay_from_wallet(uuid, numeric, uuid);
drop function if exists market.credit_cashback(uuid, numeric, uuid);

-- market.wallet_mirror and market.wallet_ops intentionally remain until the
-- legacy process_refund path is migrated to an idempotent MySunrise credit.
