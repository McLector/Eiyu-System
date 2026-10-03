create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;

select plan(37);

select lives_ok(
  $$select extensions.dblink_connect('lifecycle_a', 'dbname=postgres user=supabase_admin application_name=lifecycle_a options=-csearch_path=')$$,
  'opens the first independent lifecycle connection'
);
select lives_ok(
  $$select extensions.dblink_connect('lifecycle_b', 'dbname=postgres user=supabase_admin application_name=lifecycle_b options=-csearch_path=')$$,
  'opens the second independent lifecycle connection'
);

select lives_ok(
  $setup$
    select extensions.dblink_exec('lifecycle_a', $sql$
      insert into auth.users (id, email, raw_user_meta_data)
      values ('88888888-8888-4888-8888-888888888888', 'phase1-race@example.invalid', '{"display_name":"Phase 1 Race","time_zone":"UTC"}'::jsonb);

      insert into public.habits (
        id, user_id, name, easy_version, stat, difficulty, days, created_at
      ) values (
        '88888888-8888-4888-8888-888888888881',
        '88888888-8888-4888-8888-888888888888',
        'Concurrent delete',
        'Do the easy version',
        'STR',
        'Medium',
        '{0,1,2,3,4,5,6}',
        statement_timestamp() - interval '1 day'
      );

      insert into public.habit_occurrences (
        habit_id, user_id, occurrence_date, time_zone, day_ends_at
      ) values (
        '88888888-8888-4888-8888-888888888881',
        '88888888-8888-4888-8888-888888888888',
        (statement_timestamp() at time zone 'UTC')::date,
        'UTC',
        (((statement_timestamp() at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC')
      );

      insert into public.habit_completions (
        user_id, habit_id, completed_on, kind, xp_awarded
      ) values (
        '88888888-8888-4888-8888-888888888888',
        '88888888-8888-4888-8888-888888888881',
        (statement_timestamp() at time zone 'UTC')::date,
        'full',
        20
      );
    $sql$)
  $setup$,
  'commits a completed habit fixture outside the pgTAP runner transaction'
);

select lives_ok(
  $$select extensions.dblink_exec('lifecycle_a', 'begin; set local role authenticated; set local "request.jwt.claim.sub" = ''88888888-8888-4888-8888-888888888888''')$$,
  'starts the first authenticated delete transaction'
);
select lives_ok(
  $$select extensions.dblink_exec('lifecycle_b', 'begin; set local role authenticated; set local "request.jwt.claim.sub" = ''88888888-8888-4888-8888-888888888888''')$$,
  'starts the second authenticated delete transaction'
);

select ok(
  extensions.dblink_send_query('lifecycle_a', $$select public.delete_habit('88888888-8888-4888-8888-888888888881')$$) = 1,
  'starts the first delete'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('lifecycle_a') as result(value text)$$,
  'the first delete snapshots history while keeping its transaction open'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('lifecycle_a') as result(value text)$$,
  'drains the first asynchronous command status'
);

select ok(
  extensions.dblink_send_query('lifecycle_b', $$select public.delete_habit('88888888-8888-4888-8888-888888888881')$$) = 1,
  'starts the second delete concurrently'
);
select is(
  extensions.dblink_is_busy('lifecycle_b'),
  1,
  'the second delete waits on the authoritative habit row lock'
);

select lives_ok(
  $$select extensions.dblink_exec('lifecycle_a', 'commit')$$,
  'commits the first delete and releases the lifecycle lock'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('lifecycle_b') as result(value text)$$,
  'the retry resumes and observes the already-deleted row'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('lifecycle_b') as result(value text)$$,
  'drains the second asynchronous command status'
);
select lives_ok(
  $$select extensions.dblink_exec('lifecycle_b', 'commit')$$,
  'commits the idempotent retry'
);

select is(
  (select count(*) from public.habits where id = '88888888-8888-4888-8888-888888888881'),
  0::bigint,
  'the concurrent delete leaves no executable habit row'
);
select is(
  (select count(*) from public.deleted_habit_history where source_habit_id = '88888888-8888-4888-8888-888888888881'),
  1::bigint,
  'the concurrent delete pair writes one retained row per historical date'
);
select is(
  (select count(*) from public.deleted_habit_history where source_habit_id = '88888888-8888-4888-8888-888888888881' and completion_kind is not null),
  1::bigint,
  'the concurrent delete pair preserves the completion exactly once'
);
select is(
  (select count(*) from public.habit_completions where habit_id = '88888888-8888-4888-8888-888888888881'),
  0::bigint,
  'the executable completion is gone after the winning delete'
);

-- A committed completion must win cleanly against a waiting delete. The
-- delete then snapshots that completion exactly once, including its earned
-- XP, before removing the executable rows.
select lives_ok(
  $setup$
    select extensions.dblink_exec('lifecycle_a', $sql$
      insert into public.habits (
        id, user_id, name, easy_version, stat, difficulty, days, created_at
      ) values (
        '88888888-8888-4888-8888-888888888882',
        '88888888-8888-4888-8888-888888888888',
        'Completion race',
        'Do the easy version',
        'INT',
        'Medium',
        '{0,1,2,3,4,5,6}',
        statement_timestamp() - interval '1 day'
      );

      insert into public.habit_occurrences (
        habit_id, user_id, occurrence_date, time_zone, day_ends_at
      ) values (
        '88888888-8888-4888-8888-888888888882',
        '88888888-8888-4888-8888-888888888888',
        (statement_timestamp() at time zone 'UTC')::date,
        'UTC',
        (((statement_timestamp() at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC')
      )
    $sql$)
  $setup$,
  'commits a second habit fixture for the completion/delete race'
);
select lives_ok(
  $$select extensions.dblink_exec('lifecycle_a', 'begin; set local role authenticated; set local "request.jwt.claim.sub" = ''88888888-8888-4888-8888-888888888888''')$$,
  'starts the authenticated completion transaction'
);
select lives_ok(
  $$select extensions.dblink_exec('lifecycle_b', 'begin; set local role authenticated; set local "request.jwt.claim.sub" = ''88888888-8888-4888-8888-888888888888''')$$,
  'starts the waiting delete transaction'
);
select ok(
  extensions.dblink_send_query('lifecycle_a', $$select public.complete_habit('88888888-8888-4888-8888-888888888882', current_date, 'full')$$) = 1,
  'starts the authoritative completion'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('lifecycle_a') as result(value text)$$,
  'the completion succeeds before its transaction commits'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('lifecycle_a') as result(value text)$$,
  'drains the completion command status'
);
select ok(
  extensions.dblink_send_query('lifecycle_b', $$select public.delete_habit('88888888-8888-4888-8888-888888888882')$$) = 1,
  'starts delete behind the uncommitted completion'
);
select is(
  extensions.dblink_is_busy('lifecycle_b'),
  1,
  'delete waits for the completion transaction'
);
select lives_ok(
  $$select extensions.dblink_exec('lifecycle_a', 'commit')$$,
  'commits the completion and its server-awarded XP'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('lifecycle_b') as result(value text)$$,
  'delete resumes and snapshots the committed completion'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('lifecycle_b') as result(value text)$$,
  'drains the racing delete command status'
);
select lives_ok(
  $$select extensions.dblink_exec('lifecycle_b', 'commit')$$,
  'commits the racing delete'
);
select is(
  (select count(*) from public.habits where id = '88888888-8888-4888-8888-888888888882'),
  0::bigint,
  'the completed habit is eventually removed'
);
select is(
  (select count(*) from public.deleted_habit_history where source_habit_id = '88888888-8888-4888-8888-888888888882' and completion_kind = 'full'),
  1::bigint,
  'the committed completion is retained once'
);
select is(
  (select xp from public.stats where user_id = '88888888-8888-4888-8888-888888888888' and stat = 'INT'),
  20,
  'the committed completion awards XP exactly once'
);
select is(
  (select count(*) from public.habit_completions where habit_id = '88888888-8888-4888-8888-888888888882'),
  0::bigint,
  'the racing delete leaves no executable completion'
);

select lives_ok(
  $$select extensions.dblink_exec('lifecycle_a', 'delete from auth.users where id = ''88888888-8888-4888-8888-888888888888''')$$,
  'removes the committed concurrency fixture'
);
select lives_ok($$select extensions.dblink_disconnect('lifecycle_a')$$, 'closes the first lifecycle connection');
select lives_ok($$select extensions.dblink_disconnect('lifecycle_b')$$, 'closes the second lifecycle connection');

select * from finish();
