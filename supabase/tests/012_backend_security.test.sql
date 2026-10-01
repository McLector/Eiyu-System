begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local statement_timeout = '30s';

select plan(37);

-- All fixtures are synthetic and roll back with this test. The trigger paths
-- below verify that internal SECURITY DEFINER callers still work after the
-- exposed helper grants are removed by migration 029.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0de0000-0000-4000-8000-000000000001', 'security-owner@example.invalid', '{"display_name":"Security Owner","time_zone":"UTC"}'::jsonb),
  ('c0de0000-0000-4000-8000-000000000002', 'security-other@example.invalid', '{"display_name":"Security Other","time_zone":"UTC"}'::jsonb);

insert into public.habits (
  id, user_id, name, easy_version, stat, difficulty, days, schedule_start_on
) values
  ('c0de0000-0000-4000-8000-000000000011', 'c0de0000-0000-4000-8000-000000000001', 'Security full', 'Short version', 'STR', 'Medium', '{0,1,2,3,4,5,6}', current_date),
  ('c0de0000-0000-4000-8000-000000000012', 'c0de0000-0000-4000-8000-000000000001', 'Security recovery', 'Short version', 'WIS', 'Medium', '{0,1,2,3,4,5,6}', current_date - 1),
  ('c0de0000-0000-4000-8000-000000000021', 'c0de0000-0000-4000-8000-000000000002', 'Foreign security habit', 'Short version', 'DEX', 'Medium', '{0,1,2,3,4,5,6}', current_date);

insert into public.habit_occurrences (
  habit_id, user_id, occurrence_date, time_zone, day_ends_at
) values (
  'c0de0000-0000-4000-8000-000000000012',
  'c0de0000-0000-4000-8000-000000000001',
  current_date - 1,
  'UTC',
  (current_date::timestamp at time zone 'UTC')
);

insert into public.habit_recovery_windows (
  habit_id, user_id, missed_on, preserved_streak, opened_at, deadline_at, status
) values (
  'c0de0000-0000-4000-8000-000000000012',
  'c0de0000-0000-4000-8000-000000000001',
  current_date - 1,
  2,
  (current_date::timestamp at time zone 'UTC'),
  ((current_date + 1)::timestamp at time zone 'UTC'),
  'open'
);

select has_table('public', 'stats', 'stats table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.stats'::regclass)
    and exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'stats' and policyname = 'stats_select_own'),
  'stats retains owner-scoped SELECT RLS'
);
select ok(has_table_privilege('authenticated', 'public.stats', 'SELECT'), 'authenticated can read stats');
select ok(not has_table_privilege('authenticated', 'public.stats', 'INSERT'), 'authenticated cannot insert stats');
select ok(not has_table_privilege('authenticated', 'public.stats', 'UPDATE'), 'authenticated cannot update stats');
select ok(not has_table_privilege('authenticated', 'public.stats', 'DELETE'), 'authenticated cannot delete stats');
select ok(
  not has_table_privilege('anon', 'public.stats', 'INSERT')
    and not has_table_privilege('anon', 'public.stats', 'UPDATE')
    and not has_table_privilege('anon', 'public.stats', 'DELETE'),
  'anon has no stats write privileges'
);
select has_function('public', 'increment_stat_xp', array['public.stat_key', 'integer']::text[], 'XP helper signature remains available internally');
select ok(not has_function_privilege('authenticated', 'public.increment_stat_xp(public.stat_key,integer)', 'EXECUTE'), 'authenticated cannot call increment_stat_xp directly');
select ok(not has_function_privilege('anon', 'public.increment_stat_xp(public.stat_key,integer)', 'EXECUTE'), 'anon cannot call increment_stat_xp directly');
select ok(not exists (
  select 1 from pg_proc p,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = to_regprocedure('public.increment_stat_xp(public.stat_key,integer)')
    and a.grantee = 0 and a.privilege_type = 'EXECUTE'
), 'PUBLIC cannot call increment_stat_xp');

select ok(
  not has_function_privilege('anon', 'public.is_valid_time_zone(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.is_valid_time_zone(text)', 'EXECUTE')
    and not exists (select 1 from pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = to_regprocedure('public.is_valid_time_zone(text)')
        and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'is_valid_time_zone is not an exposed RPC'
);
select ok(
  not has_function_privilege('anon', 'public.validate_profile_time_zone()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.validate_profile_time_zone()', 'EXECUTE')
    and not exists (select 1 from pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = to_regprocedure('public.validate_profile_time_zone()')
        and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'validate_profile_time_zone is not an exposed RPC'
);
select ok(
  not has_function_privilege('anon', 'public.set_habit_schedule_start()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.set_habit_schedule_start()', 'EXECUTE')
    and not exists (select 1 from pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = to_regprocedure('public.set_habit_schedule_start()')
        and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'set_habit_schedule_start is not an exposed RPC'
);
select ok(
  not has_function_privilege('anon', 'public.record_habit_schedule_version()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_habit_schedule_version()', 'EXECUTE')
    and not exists (select 1 from pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = to_regprocedure('public.record_habit_schedule_version()')
        and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'record_habit_schedule_version is not an exposed RPC'
);
select ok(
  not has_function_privilege('anon', 'public.record_habit_archive_interval()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_habit_archive_interval()', 'EXECUTE')
    and not exists (select 1 from pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = to_regprocedure('public.record_habit_archive_interval()')
        and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'record_habit_archive_interval is not an exposed RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0de0000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$update public.stats set xp = 5000 where user_id = auth.uid() and stat = 'STR'$$,
  '42501', 'permission denied for table stats',
  'direct XP table writes are denied'
);
select throws_ok(
  $$select public.increment_stat_xp('STR', 20)$$,
  '42501', 'permission denied for function increment_stat_xp',
  'in-range direct XP RPC writes are denied'
);
select throws_ok(
  $$select public.increment_stat_xp('STR', 21)$$,
  '42501', 'permission denied for function increment_stat_xp',
  'out-of-range direct XP calls fail at authorization, not only the old delta bound'
);

select lives_ok($$select public.set_account_time_zone('UTC')$$, 'supported timezone updates still call the private validator');
select lives_ok($$select public.initialize_account_time_zone('UTC')$$, 'timezone initialization still calls the private validator');

select lives_ok(
  $$select public.complete_habit('c0de0000-0000-4000-8000-000000000011', current_date, 'full')$$,
  'server-owned full completion still awards XP after helper grants are revoked'
);
select is((select xp from public.stats where user_id = auth.uid() and stat = 'STR'), 20, 'full completion awards exactly 20 XP');
select lives_ok($$select public.undo_habit_completion('c0de0000-0000-4000-8000-000000000011', current_date)$$, 'server-owned undo still reverses XP');
select is((select xp from public.stats where user_id = auth.uid() and stat = 'STR'), 0, 'undo reverses the exact full award');
select lives_ok(
  $$select public.complete_habit('c0de0000-0000-4000-8000-000000000011', current_date, 'easy')$$,
  'server-owned easy completion still works'
);
select is((select xp from public.stats where user_id = auth.uid() and stat = 'STR'), 4, 'easy completion awards exactly 4 XP');
select lives_ok($$select public.undo_habit_completion('c0de0000-0000-4000-8000-000000000011', current_date)$$, 'easy completion can be undone');
select is((select xp from public.stats where user_id = auth.uid() and stat = 'STR'), 0, 'easy undo reverses the exact award');
select throws_ok(
  $$select public.complete_habit('c0de0000-0000-4000-8000-000000000021', current_date, 'full')$$,
  'P0001', 'habit c0de0000-0000-4000-8000-000000000021 not found for calling user',
  'completion remains isolated from another account'
);
select is((public.complete_habit_recovery('c0de0000-0000-4000-8000-000000000012')->>'status'), 'recovered', 'recovery completion remains callable and successful');
select is((select xp from public.stats where user_id = auth.uid() and stat = 'WIS'), 4, 'recovery completion awards its normal 4 XP exactly once');
select is((select count(*) from public.habit_completions where habit_id = 'c0de0000-0000-4000-8000-000000000012' and completed_on = current_date - 1 and kind = 'easy'), 1::bigint, 'recovery preserves one server-owned easy completion');

select lives_ok($$update public.habits set archived = true where id = 'c0de0000-0000-4000-8000-000000000011'$$, 'archive trigger still records lifecycle state internally');
select is((select count(*) from public.habit_archive_intervals where habit_id = 'c0de0000-0000-4000-8000-000000000011' and restored_on is null), 1::bigint, 'archive trigger creates one open interval');
select lives_ok($$update public.habits set archived = false where id = 'c0de0000-0000-4000-8000-000000000011'$$, 'restore trigger still closes lifecycle state internally');
select is((select restored_on from public.habit_archive_intervals where habit_id = 'c0de0000-0000-4000-8000-000000000011'), current_date, 'restore interval records the account day');

select * from finish();
rollback;
