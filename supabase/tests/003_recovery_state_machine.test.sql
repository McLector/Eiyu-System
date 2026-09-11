begin;

set local search_path = public, extensions;
select plan(57);

select has_table('public', 'habit_recovery_windows', 'recovery windows are persisted');
select has_column('public', 'habit_occurrences', 'time_zone', 'occurrences pin their original timezone');
select has_column('public', 'habit_occurrences', 'day_ends_at', 'occurrences pin their absolute end instant');
select has_column('public', 'streaks', 'current_streak', 'current streak state is persisted');
select has_column('public', 'streaks', 'recovery_armed', 'recovery re-arming is persisted');
select has_column('public', 'streaks', 'last_processed_on', 'reconciliation progress is persisted');
select has_column('public', 'streaks', 'active_recovery_id', 'the active recovery is persisted');
select has_function('public', 'reconcile_habit_recoveries', array[]::text[], 'read/resume reconciliation exists');
select has_function('public', 'complete_habit_recovery', array['uuid'], 'authoritative recovery completion exists');

insert into auth.users (id, email, raw_user_meta_data)
values
  ('44444444-4444-4444-8444-444444444444', 'phase2-a@example.invalid', '{"display_name":"Phase 2 A","time_zone":"UTC"}'::jsonb),
  ('55555555-5555-4555-8555-555555555555', 'phase2-b@example.invalid', '{"display_name":"Phase 2 B","time_zone":"UTC"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Off-day recovery: this habit is scheduled only yesterday, never today.
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, created_at)
values (
  'a1000000-0000-4000-8000-000000000001',
  '44444444-4444-4444-8444-444444444444',
  'Yesterday only', 'One minute', 'STR', 'Medium',
  array[extract(dow from ((statement_timestamp() at time zone 'UTC')::date - 1))::smallint],
  ((((statement_timestamp() at time zone 'UTC')::date - 1)::timestamp + interval '12 hours') at time zone 'UTC')
);

select lives_ok(
  $$select public.reconcile_habit_recoveries()$$,
  'reconciliation opens a window after an eligible incomplete day ends'
);
select is(
  (select count(*) from public.habit_occurrences where habit_id = 'a1000000-0000-4000-8000-000000000001' and occurrence_date = (statement_timestamp() at time zone 'UTC')::date - 1),
  1::bigint,
  'the missed eligible occurrence exists'
);
select is(
  (select count(*) from public.habit_occurrences where habit_id = 'a1000000-0000-4000-8000-000000000001' and occurrence_date = (statement_timestamp() at time zone 'UTC')::date),
  0::bigint,
  'the off-day has no normal occurrence'
);
select is(
  (select status from public.habit_recovery_windows where habit_id = 'a1000000-0000-4000-8000-000000000001'),
  'open',
  'the missed occurrence is frozen during the following calendar day'
);
select is(
  (select preserved_streak from public.habit_recovery_windows where habit_id = 'a1000000-0000-4000-8000-000000000001'),
  0,
  'the pre-miss streak is preserved exactly'
);
select is(
  (select deadline_at from public.habit_recovery_windows where habit_id = 'a1000000-0000-4000-8000-000000000001'),
  ((((statement_timestamp() at time zone 'UTC')::date + 1)::timestamp) at time zone 'UTC'),
  'the deadline is the next calendar midnight, not a rolling client timestamp'
);
select is_empty(
  $$select id from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date) where id = 'a1000000-0000-4000-8000-000000000001'$$,
  'an off-day recovery does not enter Daily Quests'
);
select results_eq(
  $$select habit_id from public.get_open_habit_recoveries() where habit_id = 'a1000000-0000-4000-8000-000000000001'$$,
  $$values ('a1000000-0000-4000-8000-000000000001'::uuid)$$,
  'the off-day recovery remains available through the recovery query'
);
select is(
  public.complete_habit_recovery('a1000000-0000-4000-8000-000000000001')->>'status',
  'recovered',
  'recovery succeeds before the authoritative deadline'
);
select is(
  (select count(*) from public.habit_completions where habit_id = 'a1000000-0000-4000-8000-000000000001' and kind = 'easy'),
  1::bigint,
  'successful recovery records one easy completion on the missed occurrence'
);
select is(
  (select xp from public.stats where user_id = '44444444-4444-4444-8444-444444444444' and stat = 'STR'),
  4,
  'successful recovery awards the existing easy-version XP once'
);
select is(
  (select current_streak from public.streaks where habit_id = 'a1000000-0000-4000-8000-000000000001'),
  1,
  'successful recovery restores and advances the preserved streak'
);
select is(
  public.complete_habit_recovery('a1000000-0000-4000-8000-000000000001')->>'status',
  'already_recovered',
  'duplicate recovery is idempotent'
);
select is(
  (select xp from public.stats where user_id = '44444444-4444-4444-8444-444444444444' and stat = 'STR'),
  4,
  'duplicate recovery cannot duplicate XP'
);
select throws_ok(
  $$select public.undo_habit_completion('a1000000-0000-4000-8000-000000000001', (statement_timestamp() at time zone 'UTC')::date - 1)$$,
  'P0001',
  'normal completion date must be the current account date',
  'the public undo operation cannot remove a server-owned recovery completion'
);
select is(
  (select count(*) from public.habit_completions where habit_id = 'a1000000-0000-4000-8000-000000000001' and kind = 'easy'),
  1::bigint,
  'a rejected recovery undo leaves the completion intact'
);

-- Same-day normal completion first, then recovery.
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, created_at)
values (
  'a2000000-0000-4000-8000-000000000002',
  '44444444-4444-4444-8444-444444444444',
  'Daily normal first', 'One minute', 'INT', 'Medium', '{0,1,2,3,4,5,6}',
  ((((statement_timestamp() at time zone 'UTC')::date - 2)::timestamp + interval '12 hours') at time zone 'UTC')
);
set local role postgres;
insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded)
values ('44444444-4444-4444-8444-444444444444', 'a2000000-0000-4000-8000-000000000002', (statement_timestamp() at time zone 'UTC')::date - 2, 'full', 20);
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select is((public.reconcile_habit_recoveries()->>'open_count')::integer, 1, 'the daily habit opens one recovery window');
select lives_ok(
  $$select public.complete_habit('a2000000-0000-4000-8000-000000000002', (statement_timestamp() at time zone 'UTC')::date, 'full')$$,
  'today normal completion remains independent while yesterday is frozen'
);
select is(public.complete_habit_recovery('a2000000-0000-4000-8000-000000000002')->>'status', 'recovered', 'recovery can follow today normal completion');
select is((select count(*) from public.habit_completions where habit_id = 'a2000000-0000-4000-8000-000000000002'), 3::bigint, 'normal-first order preserves prior, recovered, and today completion rows');
select is((select xp from public.stats where user_id = '44444444-4444-4444-8444-444444444444' and stat = 'INT'), 24, 'normal-first order awards each applicable effect once');

-- Recovery first, then same-day normal completion.
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, created_at)
values (
  'a3000000-0000-4000-8000-000000000003',
  '44444444-4444-4444-8444-444444444444',
  'Daily recovery first', 'One minute', 'DEX', 'Medium', '{0,1,2,3,4,5,6}',
  ((((statement_timestamp() at time zone 'UTC')::date - 2)::timestamp + interval '12 hours') at time zone 'UTC')
);
set local role postgres;
insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded)
values ('44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000003', (statement_timestamp() at time zone 'UTC')::date - 2, 'full', 20);
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select is((public.reconcile_habit_recoveries()->>'open_count')::integer, 1, 'the reverse-order habit opens one recovery window');
select is(public.complete_habit_recovery('a3000000-0000-4000-8000-000000000003')->>'status', 'recovered', 'recovery-first request succeeds');
select lives_ok(
  $$select public.complete_habit('a3000000-0000-4000-8000-000000000003', (statement_timestamp() at time zone 'UTC')::date, 'full')$$,
  'today normal completion can follow recovery'
);
select is((select count(*) from public.habit_completions where habit_id = 'a3000000-0000-4000-8000-000000000003'), 3::bigint, 'recovery-first order preserves all distinct completion rows');
select is((select xp from public.stats where user_id = '44444444-4444-4444-8444-444444444444' and stat = 'DEX'), 24, 'recovery-first order awards each applicable effect once');

-- Exact/past deadline resolves to expired without accepting a late request.
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, created_at)
values (
  'a4000000-0000-4000-8000-000000000004',
  '44444444-4444-4444-8444-444444444444',
  'Expired boundary', 'One minute', 'WIS', 'Medium',
  array[extract(dow from ((statement_timestamp() at time zone 'UTC')::date - 1))::smallint],
  ((((statement_timestamp() at time zone 'UTC')::date - 1)::timestamp + interval '12 hours') at time zone 'UTC')
);
select is((public.reconcile_habit_recoveries()->>'open_count')::integer, 1, 'the boundary fixture opens a recovery');
set local role postgres;
update public.habit_recovery_windows set deadline_at = statement_timestamp() where habit_id = 'a4000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select is(public.complete_habit_recovery('a4000000-0000-4000-8000-000000000004')->>'status', 'expired', 'a request at the exclusive deadline is rejected');
select is((select status from public.habit_recovery_windows where habit_id = 'a4000000-0000-4000-8000-000000000004'), 'expired', 'deadline rejection persists reset/closed state');
select is((select count(*) from public.habit_completions where habit_id = 'a4000000-0000-4000-8000-000000000004'), 0::bigint, 'late recovery records no completion');
select is((select active_recovery_id from public.streaks where habit_id = 'a4000000-0000-4000-8000-000000000004'), null::uuid, 'expired recovery leaves the habit unfrozen');

-- Schedule/timezone changes and reload cannot extend an already-open deadline.
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, created_at)
values (
  'a5000000-0000-4000-8000-000000000005',
  '44444444-4444-4444-8444-444444444444',
  'Pinned deadline', 'One minute', 'CHA', 'Medium',
  array[extract(dow from ((statement_timestamp() at time zone 'UTC')::date - 1))::smallint],
  ((((statement_timestamp() at time zone 'UTC')::date - 1)::timestamp + interval '12 hours') at time zone 'UTC')
);
select is((public.reconcile_habit_recoveries()->>'open_count')::integer, 1, 'the deadline fixture opens one recovery');
select lives_ok($$update public.habits set days = '{0,6}' where id = 'a5000000-0000-4000-8000-000000000005'$$, 'a schedule edit is allowed while recovery is open');
select is(public.set_account_time_zone('America/Los_Angeles'), 'America/Los_Angeles', 'an account timezone edit is allowed while recovery is open');
select is(
  (select deadline_at from public.habit_recovery_windows where habit_id = 'a5000000-0000-4000-8000-000000000005'),
  ((((statement_timestamp() at time zone 'UTC')::date + 1)::timestamp) at time zone 'UTC'),
  'schedule/timezone edits do not move the stored absolute deadline'
);
select lives_ok($$select public.reconcile_habit_recoveries()$$, 'reload reconciliation is safe while a window remains open');
select is((select count(*) from public.habit_recovery_windows where habit_id = 'a5000000-0000-4000-8000-000000000005'), 1::bigint, 'reload cannot duplicate or extend recovery');

-- App absent for days: create one expired window, do not repeatedly refreeze.
select is(public.set_account_time_zone('UTC'), 'UTC', 'the fixture timezone returns to UTC');
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, created_at)
values (
  'a6000000-0000-4000-8000-000000000006',
  '44444444-4444-4444-8444-444444444444',
  'Absent for days', 'One minute', 'STR', 'Medium', '{0,1,2,3,4,5,6}',
  ((((statement_timestamp() at time zone 'UTC')::date - 4)::timestamp + interval '12 hours') at time zone 'UTC')
);
set local role postgres;
insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded)
values ('44444444-4444-4444-8444-444444444444', 'a6000000-0000-4000-8000-000000000006', (statement_timestamp() at time zone 'UTC')::date - 4, 'full', 20);
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select lives_ok($$select public.reconcile_habit_recoveries()$$, 'multi-day absence reconciles chronologically');
select is((select status from public.habit_recovery_windows where habit_id = 'a6000000-0000-4000-8000-000000000006'), 'expired', 'legacy/absent expired freeze is closed deterministically');
select is((select current_streak from public.streaks where habit_id = 'a6000000-0000-4000-8000-000000000006'), 0, 'failed recovery resets the streak');
select is((select recovery_armed from public.streaks where habit_id = 'a6000000-0000-4000-8000-000000000006'), false, 'continued inactivity cannot immediately open another chance');
select lives_ok($$select public.reconcile_habit_recoveries()$$, 'repeating multi-day reconciliation is idempotent');
select is((select count(*) from public.habit_recovery_windows where habit_id = 'a6000000-0000-4000-8000-000000000006'), 1::bigint, 'continued misses do not create repeated windows');

select throws_ok(
  $$select public.complete_habit('a4000000-0000-4000-8000-000000000004', (statement_timestamp() at time zone 'UTC')::date - 1, 'full')$$,
  'P0001',
  'normal completion date must be the current account date',
  'a forged client date cannot backdate normal completion'
);

select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
select throws_ok(
  $$select public.complete_habit_recovery('a2000000-0000-4000-8000-000000000002')$$,
  'P0001',
  'habit a2000000-0000-4000-8000-000000000002 not found for calling user',
  'another user cannot recover the habit'
);

select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select throws_ok(
  $$insert into public.habit_recovery_windows (habit_id, user_id, missed_on, preserved_streak, opened_at, deadline_at, status) values ('a4000000-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444', current_date, 99, now(), now() + interval '1 day', 'open')$$,
  '42501',
  'permission denied for table habit_recovery_windows',
  'clients cannot forge recovery windows'
);
select throws_ok(
  $$update public.streaks set current_streak = 999 where habit_id = 'a2000000-0000-4000-8000-000000000002'$$,
  '42501',
  'permission denied for table streaks',
  'clients cannot forge persisted streak state'
);

select * from finish();
rollback;
