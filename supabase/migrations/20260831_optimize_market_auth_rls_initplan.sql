alter policy notifications_owner on market.notifications
  using (user_id = (select auth.uid()));

alter policy smart_self_read on market.smart_members
  using ((select auth.uid()) = user_id);

alter policy wallet_mirror_owner_read on market.wallet_mirror
  using (user_id = (select auth.uid()));

alter policy wallet_ops_owner_read on market.wallet_ops
  using (user_id = (select auth.uid()));

alter policy wallet_topups_owner_read on market.wallet_topups
  using (user_id = (select auth.uid()));

alter policy payout_runs_seller_read on market.payout_runs
  using (
    seller_id in (
      select s.id
      from market.sellers s
      where s.email = ((select auth.jwt()) ->> 'email'::text)
    )
  );

alter policy web_push_own_select on market.web_push_subscriptions
  using (user_id = (select auth.uid()));

alter policy web_push_own_insert on market.web_push_subscriptions
  with check (user_id = (select auth.uid()));

alter policy web_push_own_update on market.web_push_subscriptions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy web_push_own_delete on market.web_push_subscriptions
  using (user_id = (select auth.uid()));
