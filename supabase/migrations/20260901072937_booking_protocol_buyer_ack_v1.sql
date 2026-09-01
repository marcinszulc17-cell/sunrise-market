alter table market.booking_handover_protocols
  add column if not exists handover_buyer_status text not null default 'pending' check (handover_buyer_status in ('pending','acknowledged','disputed')),
  add column if not exists handover_buyer_responded_at timestamptz,
  add column if not exists handover_buyer_responded_by uuid,
  add column if not exists handover_buyer_note text,
  add column if not exists return_buyer_status text not null default 'pending' check (return_buyer_status in ('pending','acknowledged','disputed')),
  add column if not exists return_buyer_responded_at timestamptz,
  add column if not exists return_buyer_responded_by uuid,
  add column if not exists return_buyer_note text;

comment on column market.booking_handover_protocols.handover_buyer_status is 'Buyer response to handover protocol: pending, acknowledged, disputed';
comment on column market.booking_handover_protocols.return_buyer_status is 'Buyer response to return protocol: pending, acknowledged, disputed';
