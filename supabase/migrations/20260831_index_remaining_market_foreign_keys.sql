create index if not exists ad_campaigns_offer_id_idx
  on market.ad_campaigns(offer_id);

create index if not exists ad_campaigns_rate_code_idx
  on market.ad_campaigns(rate_code);

create index if not exists promotion_purchases_offer_id_idx
  on market.promotion_purchases(offer_id);
