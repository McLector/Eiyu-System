-- F-001/F-003: XP and trigger/helper calls remain server-owned. The final
-- completion/recovery RPC definitions are SECURITY DEFINER and continue to
-- call increment_stat_xp as the function owner.
begin;

revoke all on table public.stats from public, anon, authenticated;
grant select on table public.stats to authenticated;

drop policy if exists stats_insert_own on public.stats;
drop policy if exists stats_update_own on public.stats;

revoke all on function public.increment_stat_xp(public.stat_key, integer)
  from public, anon, authenticated;

revoke all on function public.is_valid_time_zone(text)
  from public, anon, authenticated;
revoke all on function public.validate_profile_time_zone()
  from public, anon, authenticated;
revoke all on function public.set_habit_schedule_start()
  from public, anon, authenticated;
revoke all on function public.record_habit_schedule_version()
  from public, anon, authenticated;
revoke all on function public.record_habit_archive_interval()
  from public, anon, authenticated;

commit;
