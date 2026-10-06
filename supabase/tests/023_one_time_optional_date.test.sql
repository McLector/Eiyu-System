begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- 042: one-time quests may have no date; undated and upcoming quests are on today's board and can be done now.
select has_function('public', 'guard_one_time_date_change', array[]::text[], 'the date guard is a server function');
select ok(not has_function_privilege('authenticated', 'public.guard_one_time_date_change()', 'EXECUTE'),
  'clients cannot call the date guard directly');

insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-4000-8000-00000000000a', 'optdate-a@example.invalid', '{"display_name":"Optdate A","time_zone":"UTC"}');
update private.backlog_rollover_settings set cutover = date '2000-01-01';

-- Superuser fixtures, dates relative to the account day (UTC).
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date, created_at) values
  ('30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-00000000000a', 'Undated one', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, null, now() - interval '10 days'),
  ('30000000-0000-4000-8000-0000000000a2', '30000000-0000-4000-8000-00000000000a', 'Undated two', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, null, now() - interval '10 days'),
  ('30000000-0000-4000-8000-0000000000a3', '30000000-0000-4000-8000-00000000000a', 'Undated finished yesterday', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, null, now() - interval '10 days'),
  ('30000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-00000000000a', 'Upcoming one', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, (statement_timestamp() at time zone 'UTC')::date + 3, now() - interval '10 days'),
  ('30000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-00000000000a', 'Upcoming two', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, (statement_timestamp() at time zone 'UTC')::date + 5, now() - interval '10 days'),
  ('30000000-0000-4000-8000-0000000000c1', '30000000-0000-4000-8000-00000000000a', 'Finished early, date arrives today', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, (statement_timestamp() at time zone 'UTC')::date, now() - interval '10 days'),
  ('30000000-0000-4000-8000-0000000000d1', '30000000-0000-4000-8000-00000000000a', 'Dated today', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, (statement_timestamp() at time zone 'UTC')::date, now() - interval '10 days');
insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded) values
  ('30000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-0000000000a3', (statement_timestamp() at time zone 'UTC')::date - 1, 'full', 20),
  ('30000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-0000000000c1', (statement_timestamp() at time zone 'UTC')::date - 1, 'full', 20);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-00000000000a', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A time needs a date.
select throws_ok($$insert into public.habits (user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values ('30000000-0000-4000-8000-00000000000a', 'timed undated', null, 'INT', 'Easy', 'one_time', '{1}', true, null)$$,
  '23514', null, 'an undated one-time quest cannot carry a set time');
select lives_ok($$insert into public.habits (user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values ('30000000-0000-4000-8000-00000000000a', 'plain undated', null, 'INT', 'Easy', 'one_time', '{1}', false, null)$$,
  'an undated one-time quest with no set time is allowed');

-- Board: today's, undated and upcoming quests are returned, once each; finished-earlier ones are not.
create temp table board as select id from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date);
select is((select count(*) from board where id = '30000000-0000-4000-8000-0000000000a1'), 1::bigint, 'an undated quest is on today''s board');
select is((select count(*) from board where id = '30000000-0000-4000-8000-0000000000b1'), 1::bigint, 'an upcoming quest is on today''s board');
select is((select count(*) from board where id = '30000000-0000-4000-8000-0000000000d1'), 1::bigint, 'a quest dated today is on the board once');
select is((select count(*) from board where id = '30000000-0000-4000-8000-0000000000a3'), 0::bigint, 'an undated quest finished yesterday is gone');
select is((select count(*) from board where id = '30000000-0000-4000-8000-0000000000c1'), 0::bigint, 'a quest finished early does not come back when its date arrives');
select is((select count(*) from public.habit_occurrences where habit_id = '30000000-0000-4000-8000-0000000000c1' and occurrence_date = (statement_timestamp() at time zone 'UTC')::date), 0::bigint,
  'no occurrence is written when the date of a finished quest arrives');
select is((select count(*) from public.habit_occurrences where habit_id in ('30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000b1')), 0::bigint,
  'being on the board writes no occurrence for undated or upcoming quests');

-- The rollover leaves undated and upcoming quests alone.
select is((select quest_type from public.habits where id = '30000000-0000-4000-8000-0000000000a1'), 'one_time', 'an undated quest never rolls to Backlog');
select is((select quest_type from public.habits where id = '30000000-0000-4000-8000-0000000000b1'), 'one_time', 'an upcoming quest never rolls to Backlog');

-- Complete an undated quest now, then undo.
select lives_ok($$select public.complete_habit('30000000-0000-4000-8000-0000000000a1', (statement_timestamp() at time zone 'UTC')::date, 'full')$$, 'an undated quest completes today');
select is((select count(*) from public.habit_occurrences where habit_id = '30000000-0000-4000-8000-0000000000a1' and occurrence_date = (statement_timestamp() at time zone 'UTC')::date), 1::bigint,
  'completing it writes today''s occurrence');
select is((select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date) where id = '30000000-0000-4000-8000-0000000000a1'), 1::bigint,
  'a quest finished today still shows today, once');
select throws_ok($$select public.complete_habit('30000000-0000-4000-8000-0000000000a1', (statement_timestamp() at time zone 'UTC')::date, 'full')$$,
  'P0001', null, 'a one-time quest cannot be completed twice');
select throws_ok($$select public.complete_habit('30000000-0000-4000-8000-0000000000a3', (statement_timestamp() at time zone 'UTC')::date, 'full')$$,
  'P0001', null, 'a quest finished on an earlier day cannot be completed again');
select lives_ok($$select public.undo_habit_completion('30000000-0000-4000-8000-0000000000a1', (statement_timestamp() at time zone 'UTC')::date)$$, 'undo works');
select is((select count(*) from public.habit_occurrences where habit_id = '30000000-0000-4000-8000-0000000000a1'), 0::bigint,
  'undo leaves no stray occurrence, so no missed day');
select is((select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date) where id = '30000000-0000-4000-8000-0000000000a1'), 1::bigint,
  'after undo the quest is on the board once');
select is((select count(*) from jsonb_array_elements(public.read_history_range((statement_timestamp() at time zone 'UTC')::date - 1, (statement_timestamp() at time zone 'UTC')::date + 1)->'rows') r
    where r->>'source_habit_id' = '30000000-0000-4000-8000-0000000000a1'), 0::bigint,
  'History shows nothing for it');

-- Complete an upcoming quest early.
select lives_ok($$select public.complete_habit('30000000-0000-4000-8000-0000000000b1', (statement_timestamp() at time zone 'UTC')::date, 'full')$$, 'an upcoming quest completes early');
select is((select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date) where id = '30000000-0000-4000-8000-0000000000b1'), 1::bigint,
  'it shows once today after completion');

-- Date edits.
select throws_ok($$update public.habits set scheduled_date = (statement_timestamp() at time zone 'UTC')::date - 1 where id = '30000000-0000-4000-8000-0000000000b2'$$,
  'P0001', null, 'a date cannot be moved to the past');
select throws_ok($$update public.habits set scheduled_date = (statement_timestamp() at time zone 'UTC')::date + 9 where id = '30000000-0000-4000-8000-0000000000b1'$$,
  'P0001', null, 'the date of a finished quest is fixed');
select lives_ok($$update public.habits set name = 'Renamed after done', scheduled_date = scheduled_date where id = '30000000-0000-4000-8000-0000000000b1'$$,
  'renaming a finished quest passes even though the update lists scheduled_date');
select lives_ok($$update public.habits set scheduled_date = (statement_timestamp() at time zone 'UTC')::date + 7 where id = '30000000-0000-4000-8000-0000000000b2'$$,
  'an unfinished quest can move to a later date');
select lives_ok($$update public.habits set scheduled_date = null, time_set = false where id = '30000000-0000-4000-8000-0000000000b2'$$,
  'an unfinished quest can drop its date');
select lives_ok($$update public.habits set scheduled_date = (statement_timestamp() at time zone 'UTC')::date where id = '30000000-0000-4000-8000-0000000000a2'$$,
  'an undated quest can be given today''s date');

-- Moving a quest dated today to a later day removes today's occurrence, and it stays on the board.
select is((select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date) where id = '30000000-0000-4000-8000-0000000000d1'), 1::bigint, 'dated today: on the board');
select is((select count(*) from public.habit_occurrences where habit_id = '30000000-0000-4000-8000-0000000000d1'), 1::bigint, 'dated today: has today''s occurrence');
select lives_ok($$update public.habits set scheduled_date = (statement_timestamp() at time zone 'UTC')::date + 2 where id = '30000000-0000-4000-8000-0000000000d1'$$,
  'moving it to a later day works');
select is((select count(*) from public.habit_occurrences where habit_id = '30000000-0000-4000-8000-0000000000d1'), 0::bigint, 'its occurrence for today is gone');
select is((select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date) where id = '30000000-0000-4000-8000-0000000000d1'), 1::bigint, 'it is still on the board as upcoming');

-- The existing moves still work for an undated quest.
select lives_ok($$select public.move_one_time_to_backlog('30000000-0000-4000-8000-0000000000a2')$$, 'an unfinished quest returns to Backlog');
select is((select quest_type from public.habits where id = '30000000-0000-4000-8000-0000000000a2'), 'backlog', 'it is Backlog');

select * from finish();
rollback;
