-- Sunrise Smart: użytkownik może odczytać własny status członkostwa (koszyk sprawdzał tabelę bez uprawnień → 403,
-- przez co członkom nadal wyświetlał się baner „Kup Sunrise Smart”).
grant select on market.smart_members to authenticated;
alter table market.smart_members enable row level security;
drop policy if exists smart_members_self_read on market.smart_members;
create policy smart_members_self_read on market.smart_members for select to authenticated using (user_id = auth.uid());
