begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local statement_timeout = '30s';

-- Phase 1 contract: the definition is deleted, dated evidence survives in a
-- read-only ledger, and archive/restore pauses do not manufacture occurrences.
select plan(58);

select has_table('public', 'deleted_habit_history', 'the deleted-habit history ledger exists');
select has_table('public', 'habit_archive_intervals', 'archive intervals exist separately from executable habit state');
select has_function('public', 'archive_habit', array['uuid']::text[], 'archive is an ownership-checked transport boundary');
select has_function('public', 'restore_habit', array['uuid']::text[], 'restore is an ownership-checked transport boundary');
select has_function('public', 'delete_habit', array['uuid']::text[], 'permanent delete is an ownership-checked transport boundary');
select ok(
  coalesce(
    (
      select c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'deleted_habit_history'
    ),
    false
  ),
  'the retained-history ledger has RLS enabled'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'phase1-user-1@example.invalid', '{"display_name":"Phase 1 User 1","time_zone":"UTC"}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'phase1-user-2@example.invalid', '{"display_name":"Phase 1 User 2","time_zone":"UTC"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.habits (
  id, user_id, name, easy_version, stat, difficulty, days, created_at
)
values
  (
    '11111111-1111-4111-8111-111111111101',
    '11111111-1111-4111-8111-111111111111',
    'Delete me with history',
    'Do the easy version',
    'STR',
    'Medium',
    '{0,1,2,3,4,5,6}',
    statement_timestamp() - interval '3 days'
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    '11111111-1111-4111-8111-111111111111',
    'Archive and restore me',
    'Do the easy version',
    'INT',
    'Easy',
    '{0,1,2,3,4,5,6}',
    statement_timestamp() - interval '3 days'
  )
;

insert into public.habits (
  id, user_id, name, easy_version, stat, difficulty, days, quest_type, scheduled_date, created_at
)
values (
  '11111111-1111-4111-8111-111111111103',
  '11111111-1111-4111-8111-111111111111',
  'One-time archive',
  null,
  'DEX',
  'Easy',
  '{}',
  'one_time',
  (statement_timestamp() at time zone 'UTC')::date,
  statement_timestamp() - interval '1 day'
);

insert into public.habits (
  id, user_id, name, easy_version, stat, difficulty, days, archived, created_at
)
values (
  '11111111-1111-4111-8111-111111111104',
  '11111111-1111-4111-8111-111111111111',
  'Legacy archived habit',
  'Do the easy version',
  'WIS',
  'Hard',
  '{0,1,2,3,4,5,6}',
  true,
  statement_timestamp() - interval '3 days'
);

select lives_ok(
  format($sql$select public.ensure_habit_occurrences(%L)$sql$, (statement_timestamp() at time zone 'UTC')::date),
  'the test fixture materializes current account-local occurrences'
);

select lives_ok(
  format(
    $sql$select public.complete_habit('11111111-1111-4111-8111-111111111101', %L, 'full')$sql$,
    (statement_timestamp() at time zone 'UTC')::date
  ),
  'the active fixture has one server-authoritative completion'
);
select is(
  (select count(*) from public.habit_completions where habit_id = '11111111-1111-4111-8111-111111111101'),
  1::bigint,
  'the active fixture has one completion before deletion'
);

select lives_ok(
  $$select public.archive_habit('11111111-1111-4111-8111-111111111102')$$,
  'archive succeeds for the owning account'
);
select is(
  (select archived from public.habits where id = '11111111-1111-4111-8111-111111111102'),
  true,
  'archive changes executable state'
);
select is(
  (select count(*) from public.habit_archive_intervals where habit_id = '11111111-1111-4111-8111-111111111102'),
  1::bigint,
  'archive creates one interval'
);
select lives_ok(
  $$select public.archive_habit('11111111-1111-4111-8111-111111111102')$$,
  'repeating archive is idempotent'
);
select is(
  (select count(*) from public.habit_archive_intervals where habit_id = '11111111-1111-4111-8111-111111111102'),
  1::bigint,
  'repeating archive does not duplicate the interval'
);
select lives_ok(
  $$select public.restore_habit('11111111-1111-4111-8111-111111111102')$$,
  'restore succeeds for the owning account'
);
select is(
  (select archived from public.habits where id = '11111111-1111-4111-8111-111111111102'),
  false,
  'restore reactivates the same definition'
);
select is(
  (select restored_on from public.habit_archive_intervals where habit_id = '11111111-1111-4111-8111-111111111102'),
  (statement_timestamp() at time zone 'UTC')::date,
  'restore closes the interval on the account date'
);

select lives_ok(
  $$select public.archive_habit('11111111-1111-4111-8111-111111111103')$$,
  'archive also supports one-time quests'
);
select lives_ok(
  $$select public.restore_habit('11111111-1111-4111-8111-111111111103')$$,
  'restore also supports one-time quests'
);
select is(
  (select quest_type from public.habits where id = '11111111-1111-4111-8111-111111111103'),
  'one_time',
  'restoring a one-time quest does not turn it into a recurring habit'
);

-- Recovery deadlines are absolute instants. Lifecycle transitions may pause
-- future scheduling, but they must not silently grant more recovery time.
set local role postgres;
select set_config(
  'phase1.recovery_deadline',
  (statement_timestamp() + interval '2 hours')::text,
  true
);
select lives_ok(
  format(
    $sql$insert into public.habit_recovery_windows (
      habit_id, user_id, missed_on, preserved_streak, opened_at, deadline_at, status
    ) values (
      '11111111-1111-4111-8111-111111111102',
      '11111111-1111-4111-8111-111111111111',
      (statement_timestamp() at time zone 'UTC')::date - 1,
      2,
      statement_timestamp(),
      %L::timestamptz,
      'open'
    )$sql$,
    current_setting('phase1.recovery_deadline')
  ),
  'the fixture has an open recovery deadline before lifecycle transitions'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select lives_ok(
  $$select public.archive_habit('11111111-1111-4111-8111-111111111102')$$,
  'archiving a habit with open recovery preserves the recovery state'
);
select lives_ok(
  $$select public.restore_habit('11111111-1111-4111-8111-111111111102')$$,
  'restoring a habit with open recovery preserves the recovery state'
);
select is(
  (select deadline_at::text from public.habit_recovery_windows where habit_id = '11111111-1111-4111-8111-111111111102' and status = 'open'),
  current_setting('phase1.recovery_deadline'),
  'archive and restore do not extend an open recovery deadline'
);

-- Add executable dependent rows and a completion-only date to prove that the
-- delete transaction snapshots everything before the cascades run.
set local role postgres;
insert into public.habit_progress (user_id, habit_id, progress_date, progress_count)
values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111101', (statement_timestamp() at time zone 'UTC')::date, 2);
update public.streaks
set best = 3,
    current_streak = 2,
    recovery_armed = true,
    last_processed_on = (statement_timestamp() at time zone 'UTC')::date
where habit_id = '11111111-1111-4111-8111-111111111101';
insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded)
values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111101', (statement_timestamp() at time zone 'UTC')::date - 10, 'easy', 4);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select is(
  (select xp from public.stats where user_id = '11111111-1111-4111-8111-111111111111' and stat = 'STR'),
  20,
  'the pre-delete XP total is known and server-awarded'
);
select set_config(
  'phase1.scheduled_count',
  (select count(*)::text from public.habit_occurrences where habit_id = '11111111-1111-4111-8111-111111111101'),
  true
);

select lives_ok(
  $$select public.delete_habit('11111111-1111-4111-8111-111111111101')$$,
  'permanent delete succeeds for the owning account'
);
select is(
  (select count(*) from public.habits where id = '11111111-1111-4111-8111-111111111101'),
  0::bigint,
  'permanent delete removes the actual habit definition'
);
select is(
  (select count(*) from public.habit_completions where habit_id = '11111111-1111-4111-8111-111111111101'),
  0::bigint,
  'executable completion rows are removed by the cascade'
);
select is(
  (select count(*) from public.habit_progress where habit_id = '11111111-1111-4111-8111-111111111101'),
  0::bigint,
  'executable progress rows are removed by the cascade'
);
select is(
  (select count(*) from public.streaks where habit_id = '11111111-1111-4111-8111-111111111101'),
  0::bigint,
  'executable streak state is removed by the cascade'
);
select ok(
  (select count(*) >= 2 from public.deleted_habit_history where source_habit_id = '11111111-1111-4111-8111-111111111101'),
  'retained history contains scheduled and completion-only dates'
);
select is(
  (select count(*) from public.deleted_habit_history where source_habit_id = '11111111-1111-4111-8111-111111111101' and scheduled),
  current_setting('phase1.scheduled_count')::bigint,
  'retained scheduled evidence is snapshotted before occurrences are cascaded'
);
select is(
  (select count(*) from public.deleted_habit_history where source_habit_id = '11111111-1111-4111-8111-111111111101' and historical_date = (statement_timestamp() at time zone 'UTC')::date - 10),
  1::bigint,
  'completion-only evidence is retained'
);
select is(
  (select xp from public.stats where user_id = '11111111-1111-4111-8111-111111111111' and stat = 'STR'),
  20,
  'deleting a habit does not remove earned XP'
);
select lives_ok(
  $$select public.delete_habit('11111111-1111-4111-8111-111111111101')$$,
  'repeating delete is idempotent'
);
select throws_ok(
  $$select public.archive_habit('11111111-1111-4111-8111-111111111101')$$,
  'P0001',
  'habit 11111111-1111-4111-8111-111111111101 not found for calling user',
  'a stale archive cannot resurrect a deleted definition'
);
select throws_ok(
  $$select public.restore_habit('11111111-1111-4111-8111-111111111101')$$,
  'P0001',
  'habit 11111111-1111-4111-8111-111111111101 not found for calling user',
  'a stale restore cannot resurrect a deleted definition'
);
select throws_ok(
  $$select public.complete_habit('11111111-1111-4111-8111-111111111101', (statement_timestamp() at time zone 'UTC')::date, 'full')$$,
  'P0001',
  'habit 11111111-1111-4111-8111-111111111101 not found for calling user',
  'a stale completion cannot resurrect a deleted definition or award XP'
);

select throws_ok(
  $$delete from public.habits where id = '11111111-1111-4111-8111-111111111102'$$,
  '42501',
  'permission denied for table habits',
  'authenticated clients cannot bypass the delete preservation RPC'
);
select throws_ok(
  $$insert into public.deleted_habit_history (user_id, source_habit_id, historical_date, habit_name, stat, quest_type, scheduled)
    values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111999', current_date, 'forged', 'CHA', 'habit', false)$$,
  '42501',
  'permission denied for table deleted_habit_history',
  'authenticated clients cannot forge retained history'
);
select lives_ok(
  $$select public.delete_habit('22222222-2222-4222-8222-222222222201')$$,
  'a missing or foreign ID is an indistinguishable, safe delete retry'
);

-- A legacy archived row has no interval metadata. Restore must establish a
-- conservative closed interval so materialization cannot backfill its pause.
select lives_ok(
  $$select public.restore_habit('11111111-1111-4111-8111-111111111104')$$,
  'legacy archived rows can be restored'
);
select is(
  (select count(*) from public.habit_archive_intervals where habit_id = '11111111-1111-4111-8111-111111111104'),
  1::bigint,
  'legacy restore creates conservative interval metadata'
);
select lives_ok(
  format($sql$select public.ensure_habit_occurrences(%L)$sql$, (statement_timestamp() at time zone 'UTC')::date),
  'restored legacy row can materialize only current/future eligibility'
);
select is(
  (select count(*) from public.habit_occurrences where habit_id = '11111111-1111-4111-8111-111111111104' and occurrence_date < (statement_timestamp() at time zone 'UTC')::date),
  0::bigint,
  'legacy restore does not backfill paused historical days'
);

-- Restoring on an off-day keeps the definition reachable but does not invent
-- an occurrence for the current date.
set local role postgres;
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, archived, created_at)
values (
  '11111111-1111-4111-8111-111111111105',
  '11111111-1111-4111-8111-111111111111',
  'Off-day restore',
  'Do the easy version',
  'CHA',
  'Easy',
  array[((extract(dow from (statement_timestamp() at time zone 'UTC')::date)::integer + 1) % 7)::smallint],
  true,
  statement_timestamp() - interval '3 days'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select lives_ok(
  $$select public.restore_habit('11111111-1111-4111-8111-111111111105')$$,
  'an off-day archived habit can be restored'
);
select lives_ok(
  format($sql$select public.ensure_habit_occurrences(%L)$sql$, (statement_timestamp() at time zone 'UTC')::date),
  'off-day restoration can reconcile without fabricating today'
);
select is(
  (select count(*) from public.habit_occurrences where habit_id = '11111111-1111-4111-8111-111111111105' and occurrence_date = (statement_timestamp() at time zone 'UTC')::date),
  0::bigint,
  'off-day restoration has no current-day occurrence'
);

-- Archive intervals use the persisted account timezone rather than the
-- database/session timezone at the transition boundary.
set local role postgres;
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, created_at)
values (
  '11111111-1111-4111-8111-111111111106',
  '11111111-1111-4111-8111-111111111111',
  'Timezone archive',
  'Do the easy version',
  'DEX',
  'Medium',
  '{0,1,2,3,4,5,6}',
  statement_timestamp() - interval '1 day'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is(
  public.set_account_time_zone('Pacific/Kiritimati'),
  'Pacific/Kiritimati',
  'the lifecycle timezone fixture uses a persisted IANA timezone'
);
select lives_ok(
  $$select public.archive_habit('11111111-1111-4111-8111-111111111106')$$,
  'archive succeeds at a timezone boundary'
);
select is(
  (select archived_from from public.habit_archive_intervals where habit_id = '11111111-1111-4111-8111-111111111106'),
  (statement_timestamp() at time zone 'Pacific/Kiritimati')::date,
  'archive interval stores the account-local transition date'
);
select lives_ok(
  $$select public.restore_habit('11111111-1111-4111-8111-111111111106')$$,
  'timezone-boundary archive can be restored'
);

-- Owner two gets a retained row and then account deletion must remove it.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role postgres;
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, created_at)
values ('22222222-2222-4222-8222-222222222201', '22222222-2222-4222-8222-222222222222', 'User two deleted habit', 'Easy', 'CHA', 'Easy', '{0,1,2,3,4,5,6}', statement_timestamp() - interval '1 day');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select lives_ok($$select public.delete_habit('22222222-2222-4222-8222-222222222201')$$, 'a foreign delete request is a safe no-op');
set local role postgres;
select is((select count(*) from public.habits where id = '22222222-2222-4222-8222-222222222201'), 1::bigint, 'a foreign delete request leaves the owner''s definition intact');
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is(auth.uid(), '22222222-2222-4222-8222-222222222222'::uuid, 'the owner claim switches before the owner delete');
select public.ensure_habit_occurrences((statement_timestamp() at time zone 'UTC')::date);
select lives_ok($$select public.delete_habit('22222222-2222-4222-8222-222222222201')$$, 'the second owner can delete its own habit');
select ok((select count(*) > 0 from public.deleted_habit_history where user_id = '22222222-2222-4222-8222-222222222222'), 'the second owner receives isolated retained history');
delete from auth.users where id = '22222222-2222-4222-8222-222222222222';
reset role;
select is((select count(*) from public.deleted_habit_history where user_id = '22222222-2222-4222-8222-222222222222'), 0::bigint, 'account deletion cascades retained history');

select * from finish();
rollback;
