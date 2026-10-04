begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- 038 adds the types, columns and server-owned moves.
select has_function('public', 'move_backlog_to_one_time', array['uuid']::text[], 'Backlog to One-time is a server function');
select has_function('public', 'move_one_time_to_backlog', array['uuid']::text[], 'One-time to Backlog is a server function');
select has_function('public', 'rollover_unfinished_one_time_quests', array[]::text[], 'the midnight rollover is a server function');
select ok(has_function_privilege('authenticated', 'public.move_backlog_to_one_time(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.move_one_time_to_backlog(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.rollover_unfinished_one_time_quests()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.move_backlog_to_one_time(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.move_one_time_to_backlog(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.rollover_unfinished_one_time_quests()', 'EXECUTE'),
  'only signed-in users can call the new functions');
select ok(not has_table_privilege('authenticated', 'private.backlog_rollover_settings', 'SELECT'),
  'rollover settings are private');

insert into auth.users (id, email, raw_user_meta_data) values
  ('20000000-0000-4000-8000-00000000000a', 'backlog-a@example.invalid', '{"display_name":"Backlog A","time_zone":"UTC"}'),
  ('20000000-0000-4000-8000-00000000000b', 'backlog-b@example.invalid', '{"display_name":"Backlog B","time_zone":"UTC"}');

-- The cutover only protects pre-existing quests; the rollover tests start with it far in the past.
update private.backlog_rollover_settings set cutover = date '2000-01-01';

-- Superuser fixtures: dates are relative to the account day (UTC) so the test never goes stale.
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, genre, scheduled_date, created_at) values
  ('20000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000a', 'Backlog idea', null, 'INT', 'Easy', 'backlog', '{}', false, 'tool', null, now() - interval '10 days'),
  ('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-00000000000a', 'Missed yesterday', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, 'concept', (statement_timestamp() at time zone 'UTC')::date - 1, now() - interval '10 days'),
  ('20000000-0000-4000-8000-0000000000c2', '20000000-0000-4000-8000-00000000000a', 'Done yesterday', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, null, (statement_timestamp() at time zone 'UTC')::date - 1, now() - interval '10 days'),
  ('20000000-0000-4000-8000-0000000000c3', '20000000-0000-4000-8000-00000000000a', 'Today task', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, null, (statement_timestamp() at time zone 'UTC')::date, now() - interval '10 days'),
  ('20000000-0000-4000-8000-0000000000c4', '20000000-0000-4000-8000-00000000000a', 'Tomorrow task', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, null, (statement_timestamp() at time zone 'UTC')::date + 1, now() - interval '10 days'),
  ('20000000-0000-4000-8000-0000000000d1', '20000000-0000-4000-8000-00000000000b', 'B missed yesterday', null, 'STR', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, null, (statement_timestamp() at time zone 'UTC')::date - 1, now() - interval '10 days');
insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded) values
  ('20000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000c2', (statement_timestamp() at time zone 'UTC')::date - 1, 'full', 20);
-- A timed One-time quest with a penalty, and a Backlog idea with a non-default stored time, so the
-- rollover and the moves have something to clear.
update public.habits set easy_version = 'Do less', reminder_time = '21:30', time_set = true
where id = '20000000-0000-4000-8000-0000000000c1';
update public.habits set reminder_time = '19:00' where id = '20000000-0000-4000-8000-0000000000b1';

-- Rollover is per account: B's board load must not touch A's quests.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-00000000000b', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date)$$, 'B loads the board');
reset role;
select is((select quest_type from public.habits where id = '20000000-0000-4000-8000-0000000000c1'), 'one_time',
  'B loading the board does not roll over A''s quest');
select is((select quest_type from public.habits where id = '20000000-0000-4000-8000-0000000000d1'), 'backlog',
  'B''s own unfinished quest from yesterday returned to Backlog');
select is((select count(*) from public.habit_occurrences where habit_id = '20000000-0000-4000-8000-0000000000d1'), 1::bigint,
  'B''s missed day is on record');

-- The rollover is callable on its own (no board load first, e.g. a client that only
-- reads a past day): it must still record the missed day before the quest leaves One-time.
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date, created_at) values
  ('20000000-0000-4000-8000-0000000000d2', '20000000-0000-4000-8000-00000000000b', 'B missed, never loaded', null, 'STR', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, (statement_timestamp() at time zone 'UTC')::date - 1, now() - interval '10 days');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-00000000000b', true);
select lives_ok($$select public.rollover_unfinished_one_time_quests()$$, 'B runs the rollover directly');
reset role;
select is((select quest_type from public.habits where id = '20000000-0000-4000-8000-0000000000d2'), 'backlog',
  'a direct rollover returns the quest to Backlog');
select is((select count(*) from public.habit_occurrences where habit_id = '20000000-0000-4000-8000-0000000000d2'
    and occurrence_date = (statement_timestamp() at time zone 'UTC')::date - 1), 1::bigint,
  'a direct rollover still records the missed day');
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.rollover_unfinished_one_time_quests()$$, 'P0001', null, 'the rollover needs a signed-in caller');

-- A: shape constraints.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-00000000000a', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$insert into public.habits (user_id, name, easy_version, stat, difficulty, quest_type, days, genre) values ('20000000-0000-4000-8000-00000000000a', 'bad genre', null, 'INT', 'Easy', 'backlog', '{}', 'bogus')$$,
  '23514', null, 'an unknown genre is rejected');
select throws_ok($$insert into public.habits (user_id, name, easy_version, stat, difficulty, quest_type, days, scheduled_date) values ('20000000-0000-4000-8000-00000000000a', 'dated backlog', null, 'INT', 'Easy', 'backlog', '{}', (statement_timestamp() at time zone 'UTC')::date)$$,
  '23514', null, 'a Backlog row carries no date');
select throws_ok($$insert into public.habits (user_id, name, easy_version, stat, difficulty, quest_type, days, genre) values ('20000000-0000-4000-8000-00000000000a', 'habit genre', 'Do less', 'INT', 'Easy', 'habit', '{1}', 'tool')$$,
  '23514', null, 'habits have no genre');
select throws_ok($$insert into public.habits (user_id, name, easy_version, stat, difficulty, quest_type, days, time_set) values ('20000000-0000-4000-8000-00000000000a', 'penalty backlog', 'Do less', 'INT', 'Easy', 'backlog', '{}', false)$$,
  '23514', null, 'a Backlog row carries no penalty');
select throws_ok($$insert into public.habits (user_id, name, easy_version, stat, difficulty, quest_type, days, time_set) values ('20000000-0000-4000-8000-00000000000a', 'timed backlog', null, 'INT', 'Easy', 'backlog', '{}', true)$$,
  '23514', null, 'a Backlog row carries no set time');
select throws_ok($$insert into public.habits (user_id, name, easy_version, stat, difficulty, quest_type, days, time_set) values ('20000000-0000-4000-8000-00000000000a', 'weekday backlog', null, 'INT', 'Easy', 'backlog', '{1}', false)$$,
  '23514', null, 'a Backlog row carries no weekdays');
select throws_ok($$insert into public.habits (user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, target_count) values ('20000000-0000-4000-8000-00000000000a', 'counted backlog', null, 'INT', 'Easy', 'backlog', '{}', false, 3)$$,
  '23514', null, 'a Backlog row carries no target count');
select lives_ok($$insert into public.habits (user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, genre) values ('20000000-0000-4000-8000-00000000000a', 'Fresh idea', null, 'WIS', 'Easy', 'backlog', '{}', false, 'todo')$$,
  'a Backlog quest needs no penalty');

-- Backlog quests cannot be archived, completed or progressed.
select throws_ok($$select public.archive_habit('20000000-0000-4000-8000-0000000000b1')$$, 'P0001', null, 'a Backlog quest cannot be archived');
select throws_ok($$select public.complete_habit('20000000-0000-4000-8000-0000000000b1', (statement_timestamp() at time zone 'UTC')::date, 'full')$$, 'P0001', null, 'a Backlog quest cannot be completed');
select throws_ok($$select public.increment_habit_progress('20000000-0000-4000-8000-0000000000b1', (statement_timestamp() at time zone 'UTC')::date, 1)$$, 'P0001', null, 'a Backlog quest has no progress counter');

-- Board load: Backlog never appears; the rollover returns only yesterday's unfinished quest.
select is((select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date) where id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint,
  'the board query never returns a Backlog quest');
select is((select quest_type from public.habits where id = '20000000-0000-4000-8000-0000000000c1'), 'backlog', 'an unfinished quest from yesterday returned to Backlog');
select is((select scheduled_date from public.habits where id = '20000000-0000-4000-8000-0000000000c1'), null::date, 'its date is cleared');
select is((select days from public.habits where id = '20000000-0000-4000-8000-0000000000c1'), '{}'::smallint[], 'its days are cleared so the Backlog shape holds');
select is((select genre from public.habits where id = '20000000-0000-4000-8000-0000000000c1'), 'concept', 'its genre is kept');
select is((select easy_version from public.habits where id = '20000000-0000-4000-8000-0000000000c1'), null::text, 'its penalty is cleared');
select is((select time_set from public.habits where id = '20000000-0000-4000-8000-0000000000c1'), false, 'its set time is cleared');
select is((select reminder_time from public.habits where id = '20000000-0000-4000-8000-0000000000c1'), '08:00'::time, 'its stored time is the untimed 08:00');
select is((select count(*) from public.habit_occurrences where habit_id = '20000000-0000-4000-8000-0000000000c1'), 1::bigint,
  'the missed day is still on record');
select is((select count(*) from jsonb_array_elements(public.read_history_range((statement_timestamp() at time zone 'UTC')::date - 1, (statement_timestamp() at time zone 'UTC')::date)->'rows') r
    where r->>'source_habit_id' = '20000000-0000-4000-8000-0000000000c1'), 1::bigint,
  'History still shows the missed day');
select is((select quest_type from public.habits where id = '20000000-0000-4000-8000-0000000000c2'), 'one_time', 'a completed quest stays One-time');
select is((select quest_type from public.habits where id = '20000000-0000-4000-8000-0000000000c3'), 'one_time', 'today''s quest stays One-time');
select is((select quest_type from public.habits where id = '20000000-0000-4000-8000-0000000000c4'), 'one_time', 'a future quest stays One-time');

-- Cutover: older quests are never swept into Backlog.
reset role;
update private.backlog_rollover_settings set cutover = (statement_timestamp() at time zone 'UTC')::date - 3;
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date, created_at) values
  ('20000000-0000-4000-8000-0000000000c5', '20000000-0000-4000-8000-00000000000a', 'Ancient task', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, (statement_timestamp() at time zone 'UTC')::date - 5, now() - interval '20 days');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-00000000000a', true);
select lives_ok($$select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date)$$, 'A loads the board again');
select is((select quest_type from public.habits where id = '20000000-0000-4000-8000-0000000000c5'), 'one_time', 'a quest older than the cutover is left alone');

-- Moves.
select lives_ok($$select public.move_backlog_to_one_time('20000000-0000-4000-8000-0000000000b1')$$, 'Backlog moves to One-time');
select is((select quest_type from public.habits where id = '20000000-0000-4000-8000-0000000000b1'), 'one_time', 'it is now One-time');
select is((select scheduled_date from public.habits where id = '20000000-0000-4000-8000-0000000000b1'), (statement_timestamp() at time zone 'UTC')::date, 'dated today by the server');
select is((select time_set from public.habits where id = '20000000-0000-4000-8000-0000000000b1'), false, 'with no set time');
select is((select reminder_time from public.habits where id = '20000000-0000-4000-8000-0000000000b1'), '08:00'::time, 'stored as the untimed 08:00');
select is((select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date) where id = '20000000-0000-4000-8000-0000000000b1'), 1::bigint, 'and it is on today''s board');
select throws_ok($$select public.move_backlog_to_one_time('20000000-0000-4000-8000-0000000000b1')$$, 'P0001', null, 'a quest that is not in Backlog cannot be moved again');
-- The user gives it a time and a penalty while it is One-time; going back to Backlog clears both.
update public.habits set reminder_time = '20:00', time_set = true, easy_version = 'Do less'
where id = '20000000-0000-4000-8000-0000000000b1';
select lives_ok($$select public.move_one_time_to_backlog('20000000-0000-4000-8000-0000000000b1')$$, 'One-time returns to Backlog');
select is((select time_set from public.habits where id = '20000000-0000-4000-8000-0000000000b1'), false, 'back in Backlog with no set time');
select is((select reminder_time from public.habits where id = '20000000-0000-4000-8000-0000000000b1'), '08:00'::time, 'back in Backlog stored as 08:00');
select is((select easy_version from public.habits where id = '20000000-0000-4000-8000-0000000000b1'), null::text, 'back in Backlog with no penalty');
select is((select quest_type from public.habits where id = '20000000-0000-4000-8000-0000000000b1'), 'backlog', 'it is Backlog again');
select is((select scheduled_date from public.habits where id = '20000000-0000-4000-8000-0000000000b1'), null::date, 'with no date');
select is((select count(*) from public.habit_occurrences where habit_id = '20000000-0000-4000-8000-0000000000b1' and occurrence_date >= (statement_timestamp() at time zone 'UTC')::date), 0::bigint,
  'today''s stale occurrence is gone');
select is((select count(*) from jsonb_array_elements(public.read_history_range((statement_timestamp() at time zone 'UTC')::date, (statement_timestamp() at time zone 'UTC')::date + 1)->'rows') r
    where r->>'source_habit_id' = '20000000-0000-4000-8000-0000000000b1'), 0::bigint,
  'History shows nothing for it today');

-- A completed One-time quest cannot return.
select public.move_backlog_to_one_time('20000000-0000-4000-8000-0000000000b1');
select lives_ok($$select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date)$$, 'occurrence created');
select lives_ok($$select public.complete_habit('20000000-0000-4000-8000-0000000000b1', (statement_timestamp() at time zone 'UTC')::date, 'full')$$, 'completes today');
select throws_ok($$select public.move_one_time_to_backlog('20000000-0000-4000-8000-0000000000b1')$$, 'P0001', null, 'a completed quest cannot go back to Backlog');

-- Ownership.
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-00000000000b', true);
select throws_ok($$select public.move_one_time_to_backlog('20000000-0000-4000-8000-0000000000c3')$$, 'P0001', null, 'B cannot move A''s One-time quest');
select throws_ok($$select public.move_backlog_to_one_time('20000000-0000-4000-8000-0000000000c1')$$, 'P0001', null, 'B cannot move A''s Backlog quest');

select * from finish();
rollback;
