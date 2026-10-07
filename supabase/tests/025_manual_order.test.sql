begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- 044: a stored manual order for the three quest lanes (habit, one_time, backlog) and for chains.

select has_column('public', 'habits', 'position', 'habits carry a manual position');
select has_column('public', 'long_quests', 'position', 'long quests carry a manual position');
select ok(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('habits', 'long_quests') and column_name = 'position' and is_nullable <> 'NO'),
  'every row has a position');
select has_function('public', 'reorder_quests', array['text', 'uuid[]']::text[], 'quest reorder is a server function');
select has_function('public', 'reorder_long_quests', array['uuid[]']::text[], 'chain reorder is a server function');
select ok(has_function_privilege('authenticated', 'public.reorder_quests(text,uuid[])', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.reorder_long_quests(uuid[])', 'EXECUTE')
    and not has_function_privilege('anon', 'public.reorder_quests(text,uuid[])', 'EXECUTE')
    and not has_function_privilege('anon', 'public.reorder_long_quests(uuid[])', 'EXECUTE'),
  'only signed-in users can reorder');
select ok(not has_function_privilege('authenticated', 'public.backfill_manual_order(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.backfill_manual_order(uuid)', 'EXECUTE'),
  'the backfill is not callable by clients');

insert into auth.users (id, email, raw_user_meta_data) values
  ('25000000-0000-4000-8000-00000000000a', 'order25-a@example.invalid', '{"display_name":"Order A","time_zone":"UTC"}'),
  ('25000000-0000-4000-8000-00000000000b', 'order25-b@example.invalid', '{"display_name":"Order B","time_zone":"UTC"}'),
  ('25000000-0000-4000-8000-00000000000c', 'order25-c@example.invalid', '{"display_name":"Order C","time_zone":"UTC"}'),
  ('25000000-0000-4000-8000-00000000000d', 'order25-d@example.invalid', '{"display_name":"Order D","time_zone":"UTC"}');
update private.backlog_rollover_settings set cutover = date '2000-01-01';

-- ---------------------------------------------------------------------------
-- New rows land on top of their own lane, for their own user only.
-- ---------------------------------------------------------------------------
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values
  ('25000000-0000-4000-8000-0000000000b1', '25000000-0000-4000-8000-00000000000a', 'A backlog 1', null, 'INT', 'Easy', 'backlog', '{}', false, null);
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values
  ('25000000-0000-4000-8000-0000000000b2', '25000000-0000-4000-8000-00000000000a', 'A backlog 2', null, 'INT', 'Easy', 'backlog', '{}', false, null);
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values
  ('25000000-0000-4000-8000-0000000000b3', '25000000-0000-4000-8000-00000000000a', 'A backlog 3', null, 'INT', 'Easy', 'backlog', '{}', false, null);
select is((select array_agg(name order by position, id) from public.habits where user_id = '25000000-0000-4000-8000-00000000000a' and quest_type = 'backlog'),
  array['A backlog 3', 'A backlog 2', 'A backlog 1'], 'a new quest lands at the top of its lane');

insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values
  ('25000000-0000-4000-8000-0000000000e1', '25000000-0000-4000-8000-00000000000a', 'A daily 1', 'Do less', 'STR', 'Easy', 'habit', '{0,1,2,3,4,5,6}', true, null);
select is((select array_agg(name order by position, id) from public.habits where user_id = '25000000-0000-4000-8000-00000000000a' and quest_type = 'backlog'),
  array['A backlog 3', 'A backlog 2', 'A backlog 1'], 'adding a Daily habit does not move the Backlog');
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values
  ('25000000-0000-4000-8000-0000000000f1', '25000000-0000-4000-8000-00000000000b', 'B backlog 1', null, 'INT', 'Easy', 'backlog', '{}', false, null);
select is((select position from public.habits where id = '25000000-0000-4000-8000-0000000000b3'),
  (select min(position) from public.habits where user_id = '25000000-0000-4000-8000-00000000000a' and quest_type = 'backlog'),
  'another user''s insert does not shift this lane');

-- Resending the same quest_type (every edit does) keeps the place.
update public.habits set name = 'A backlog 2 renamed', quest_type = 'backlog', reminder_time = '09:30'
  where id = '25000000-0000-4000-8000-0000000000b2';
select is((select array_agg(name order by position, id) from public.habits where user_id = '25000000-0000-4000-8000-00000000000a' and quest_type = 'backlog'),
  array['A backlog 3', 'A backlog 2 renamed', 'A backlog 1'], 'an edit that resends the same type keeps its position');

-- A load that bypasses triggers (replica mode) must still insert: the column has a default.
set local session_replication_role = replica;
select lives_ok($$insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, schedule_start_on)
  values ('25000000-0000-4000-8000-0000000000f9', '25000000-0000-4000-8000-00000000000b', 'B loaded', null, 'INT', 'Easy', 'backlog', '{}', false, current_date)$$,
  'a habit can be inserted with triggers off');
select lives_ok($$insert into public.long_quests (id, user_id, name, stat)
  values ('25000000-0000-4000-8000-0000000000f8', '25000000-0000-4000-8000-00000000000b', 'B loaded chain', 'STR')$$,
  'a chain can be inserted with triggers off');
set local session_replication_role = origin;
delete from public.habits where id = '25000000-0000-4000-8000-0000000000f9';
delete from public.long_quests where id = '25000000-0000-4000-8000-0000000000f8';
-- An explicit position is kept on insert.
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, position) values
  ('25000000-0000-4000-8000-0000000000f7', '25000000-0000-4000-8000-00000000000b', 'B explicit', null, 'INT', 'Easy', 'backlog', '{}', false, 42);
select is((select position from public.habits where id = '25000000-0000-4000-8000-0000000000f7'), 42, 'an explicit position on insert is kept');
delete from public.habits where id = '25000000-0000-4000-8000-0000000000f7';

-- ---------------------------------------------------------------------------
-- Lane moves (menu, drag, midnight rollover) land on top of the target lane.
-- ---------------------------------------------------------------------------
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values
  ('25000000-0000-4000-8000-0000000000d1', '25000000-0000-4000-8000-00000000000d', 'D backlog 1', null, 'INT', 'Easy', 'backlog', '{}', false, null),
  ('25000000-0000-4000-8000-0000000000d2', '25000000-0000-4000-8000-00000000000d', 'D backlog 2', null, 'INT', 'Easy', 'backlog', '{}', false, null);
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values
  ('25000000-0000-4000-8000-0000000000d3', '25000000-0000-4000-8000-00000000000d', 'D one-time 1', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, (statement_timestamp() at time zone 'UTC')::date);

set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-00000000000d', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.move_backlog_to_one_time('25000000-0000-4000-8000-0000000000d1')$$, 'D moves a Backlog quest to One-time');
select ok((select position from public.habits where id = '25000000-0000-4000-8000-0000000000d1')
  < (select position from public.habits where id = '25000000-0000-4000-8000-0000000000d3'),
  'a quest moved into One-time lands above the quests already there');
select lives_ok($$select public.move_one_time_to_backlog('25000000-0000-4000-8000-0000000000d3')$$, 'D moves a One-time quest back to Backlog');
select ok((select position from public.habits where id = '25000000-0000-4000-8000-0000000000d3')
  < (select position from public.habits where id = '25000000-0000-4000-8000-0000000000d2'),
  'a quest moved into Backlog lands above the quests already there');
reset role;

-- The midnight rollover is a lane move too.
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values
  ('25000000-0000-4000-8000-0000000000d4', '25000000-0000-4000-8000-00000000000d', 'D missed yesterday', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, (statement_timestamp() at time zone 'UTC')::date - 1);
set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-00000000000d', true);
select lives_ok($$select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date)$$, 'D loads the board');
reset role;
select is((select quest_type from public.habits where id = '25000000-0000-4000-8000-0000000000d4'), 'backlog', 'the missed quest rolled to Backlog');
select ok((select position from public.habits where id = '25000000-0000-4000-8000-0000000000d4')
  < (select min(position) from public.habits where user_id = '25000000-0000-4000-8000-00000000000d' and quest_type = 'backlog' and id <> '25000000-0000-4000-8000-0000000000d4'),
  'a rolled-over quest lands at the top of Backlog');

-- The board read carries the position.
set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-00000000000a', true);
select ok((select count(*) from public.get_habits_for_date((statement_timestamp() at time zone 'UTC')::date) where position is not null) >= 1,
  'the board read returns the position');
reset role;

-- ---------------------------------------------------------------------------
-- The backfill reproduces today's auto-sort for every list.
-- ---------------------------------------------------------------------------
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, reminder_time, scheduled_date, created_at) values
  ('25000000-0000-4000-8000-0000000000c1', '25000000-0000-4000-8000-00000000000c', 'Zed', 'Do less', 'STR', 'Easy', 'habit', '{0,1,2,3,4,5,6}', true, '09:00', null, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000c2', '25000000-0000-4000-8000-00000000000c', 'apple', 'Do less', 'STR', 'Easy', 'habit', '{0,1,2,3,4,5,6}', true, '09:00', null, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000c3', '25000000-0000-4000-8000-00000000000c', 'Mid', 'Do less', 'STR', 'Easy', 'habit', '{0,1,2,3,4,5,6}', true, '07:00', null, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000c4', '25000000-0000-4000-8000-00000000000c', 'Untimed', 'Do less', 'STR', 'Easy', 'habit', '{0,1,2,3,4,5,6}', false, '06:00', null, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000c5', '25000000-0000-4000-8000-00000000000c', 'Up3', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, '08:00', (statement_timestamp() at time zone 'UTC')::date + 3, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000c6', '25000000-0000-4000-8000-00000000000c', 'Undated', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, '08:00', null, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000c7', '25000000-0000-4000-8000-00000000000c', 'Yesterday', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, '08:00', (statement_timestamp() at time zone 'UTC')::date - 1, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000c8', '25000000-0000-4000-8000-00000000000c', 'Today', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, '08:00', (statement_timestamp() at time zone 'UTC')::date, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000c9', '25000000-0000-4000-8000-00000000000c', 'Up1', null, 'INT', 'Easy', 'one_time', '{0,1,2,3,4,5,6}', false, '08:00', (statement_timestamp() at time zone 'UTC')::date + 1, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000ca', '25000000-0000-4000-8000-00000000000c', 'Old idea', null, 'INT', 'Easy', 'backlog', '{}', false, '08:00', null, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000cb', '25000000-0000-4000-8000-00000000000c', 'Tied idea', null, 'INT', 'Easy', 'backlog', '{}', false, '08:00', null, '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000cc', '25000000-0000-4000-8000-00000000000c', 'New idea', null, 'INT', 'Easy', 'backlog', '{}', false, '08:00', null, '2026-03-01 00:00:00+00');
insert into public.long_quests (id, user_id, name, stat, created_at) values
  ('25000000-0000-4000-8000-0000000000a3', '25000000-0000-4000-8000-00000000000c', 'Newest chain', 'STR', '2026-03-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000a1', '25000000-0000-4000-8000-00000000000c', 'Oldest chain', 'STR', '2026-01-01 00:00:00+00'),
  ('25000000-0000-4000-8000-0000000000a2', '25000000-0000-4000-8000-00000000000c', 'Middle chain', 'STR', '2026-02-01 00:00:00+00');
update public.habits set position = 0 where user_id = '25000000-0000-4000-8000-00000000000c';
update public.long_quests set position = 0 where user_id = '25000000-0000-4000-8000-00000000000c';
select lives_ok($$select public.backfill_manual_order('25000000-0000-4000-8000-00000000000c')$$, 'the backfill runs');
select is((select array_agg(name order by position, id) from public.habits where user_id = '25000000-0000-4000-8000-00000000000c' and quest_type = 'habit'),
  array['Mid', 'Zed', 'apple', 'Untimed'], 'Daily backfill: timed first, then time, then name by code point');
select is((select array_agg(name order by position, id) from public.habits where user_id = '25000000-0000-4000-8000-00000000000c' and quest_type = 'one_time'),
  array['Today', 'Yesterday', 'Undated', 'Up1', 'Up3'], 'One-time backfill: due, then undated, then upcoming by date');
select is((select array_agg(name order by position, id) from public.habits where user_id = '25000000-0000-4000-8000-00000000000c' and quest_type = 'backlog'),
  array['New idea', 'Old idea', 'Tied idea'], 'Backlog backfill: newest first, ties by id');
select is((select array_agg(name order by position, id) from public.long_quests where user_id = '25000000-0000-4000-8000-00000000000c'),
  array['Oldest chain', 'Middle chain', 'Newest chain'], 'chain backfill: creation order');
select is((select array_agg(position order by position) from public.habits where user_id = '25000000-0000-4000-8000-00000000000c' and quest_type = 'backlog'),
  array[0, 1, 2], 'the backfill numbers a lane from 0');

-- ---------------------------------------------------------------------------
-- reorder_quests: the given ids fill the slots they already hold.
-- ---------------------------------------------------------------------------
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, quest_type, days, time_set, scheduled_date) values
  ('25000000-0000-4000-8000-0000000000aa', '25000000-0000-4000-8000-00000000000b', 'W', null, 'INT', 'Easy', 'backlog', '{}', false, null),
  ('25000000-0000-4000-8000-0000000000ab', '25000000-0000-4000-8000-00000000000b', 'X', null, 'INT', 'Easy', 'backlog', '{}', false, null),
  ('25000000-0000-4000-8000-0000000000ac', '25000000-0000-4000-8000-00000000000b', 'Y', null, 'INT', 'Easy', 'backlog', '{}', false, null),
  ('25000000-0000-4000-8000-0000000000ad', '25000000-0000-4000-8000-00000000000b', 'Z', null, 'INT', 'Easy', 'backlog', '{}', false, null);
update public.habits set position = case name when 'W' then 0 when 'X' then 1 when 'Y' then 2 else 3 end
  where user_id = '25000000-0000-4000-8000-00000000000b' and name in ('W', 'X', 'Y', 'Z');
-- B''s earlier fixture sits in the same lane; park it at the end so W..Z are slots 0..3.
update public.habits set position = 9 where id = '25000000-0000-4000-8000-0000000000f1';

set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-00000000000b', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.reorder_quests('backlog', array['25000000-0000-4000-8000-0000000000ad', '25000000-0000-4000-8000-0000000000ab']::uuid[])$$,
  'a subset of a lane can be reordered');
reset role;
select is((select array_agg(name order by position, id) from public.habits where user_id = '25000000-0000-4000-8000-00000000000b' and quest_type = 'backlog' and name in ('W', 'X', 'Y', 'Z')),
  array['W', 'Z', 'Y', 'X'], 'the subset swapped slots and the hidden quest kept its place');
select is((select array_agg(position order by position) from public.habits where user_id = '25000000-0000-4000-8000-00000000000b' and quest_type = 'backlog'),
  array[0, 1, 2, 3, 4], 'the lane is renumbered with no gaps');

-- Ties (for example two inserts racing) are resolved by a full reorder.
update public.habits set position = 0 where user_id = '25000000-0000-4000-8000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-00000000000b', true);
select lives_ok($$select public.reorder_quests('backlog', array['25000000-0000-4000-8000-0000000000ac', '25000000-0000-4000-8000-0000000000ab', '25000000-0000-4000-8000-0000000000aa', '25000000-0000-4000-8000-0000000000ad', '25000000-0000-4000-8000-0000000000f1']::uuid[])$$,
  'a full reorder works when every position is tied');
reset role;
select is((select array_agg(name order by position, id) from public.habits where user_id = '25000000-0000-4000-8000-00000000000b' and quest_type = 'backlog'),
  array['Y', 'X', 'W', 'Z', 'B backlog 1'], 'the full reorder is exactly the given order');

-- Refusals.
set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-00000000000b', true);
select throws_ok($$select public.reorder_quests('backlog', null)$$, 'P0001', 'Quest order must list each quest once.', 'a null list is refused');
select throws_ok($$select public.reorder_quests('backlog', array[]::uuid[])$$, 'P0001', 'Quest order must list each quest once.', 'an empty list is refused');
select throws_ok($$select public.reorder_quests('backlog', array['25000000-0000-4000-8000-0000000000aa', '25000000-0000-4000-8000-0000000000aa']::uuid[])$$, 'P0001', 'Quest order must list each quest once.', 'a duplicate is refused');
select throws_ok($$select public.reorder_quests('backlog', (select array_agg(gen_random_uuid()) from generate_series(1, 1001)))$$, 'P0001', 'Quest order must list each quest once.', 'more than 1000 ids are refused');
select throws_ok($$select public.reorder_quests('backlog', array['25000000-0000-4000-8000-0000000000b1']::uuid[])$$, 'P0001', 'Quest order is out of date. Reload and try again.', 'another user''s quest is refused');
select throws_ok($$select public.reorder_quests('backlog', array[gen_random_uuid()]::uuid[])$$, 'P0001', 'Quest order is out of date. Reload and try again.', 'an unknown id is refused');
select throws_ok($$select public.reorder_quests('one_time', array['25000000-0000-4000-8000-0000000000aa']::uuid[])$$, 'P0001', 'Quest order is out of date. Reload and try again.', 'a quest from another lane is refused');
select throws_ok($$select public.reorder_quests('archived', array['25000000-0000-4000-8000-0000000000aa']::uuid[])$$, 'P0001', 'Unknown quest lane.', 'an unknown lane is refused');
reset role;
update public.habits set archived = true where id = '25000000-0000-4000-8000-0000000000ad';
set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-00000000000b', true);
select throws_ok($$select public.reorder_quests('backlog', array['25000000-0000-4000-8000-0000000000ad']::uuid[])$$, 'P0001', 'Quest order is out of date. Reload and try again.', 'an archived quest is refused');
-- B cannot reorder A's lane even with A's real ids.
select throws_ok($$select public.reorder_quests('backlog', array['25000000-0000-4000-8000-0000000000b2', '25000000-0000-4000-8000-0000000000b3']::uuid[])$$, 'P0001', 'Quest order is out of date. Reload and try again.', 'a user cannot reorder someone else''s lane');
reset role;
select is((select array_agg(name order by position, id) from public.habits where user_id = '25000000-0000-4000-8000-00000000000a' and quest_type = 'backlog'),
  array['A backlog 3', 'A backlog 2 renamed', 'A backlog 1'], 'the refused attempts changed nothing');

-- ---------------------------------------------------------------------------
-- Chains.
-- ---------------------------------------------------------------------------
insert into public.long_quests (id, user_id, name, stat) values
  ('25000000-0000-4000-8000-0000000000e2', '25000000-0000-4000-8000-00000000000a', 'A chain 1', 'STR');
insert into public.long_quests (id, user_id, name, stat) values
  ('25000000-0000-4000-8000-0000000000e3', '25000000-0000-4000-8000-00000000000a', 'A chain 2', 'STR');
select is((select array_agg(name order by position, id) from public.long_quests where user_id = '25000000-0000-4000-8000-00000000000a'),
  array['A chain 2', 'A chain 1'], 'a new chain lands at the top');

set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-00000000000a', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.save_long_quest_definition('25000000-0000-4000-8000-0000000000e4', '25000000-0000-4000-8000-0000000000f2',
  '{"name":"A chain 3","stat":"STR","description":null,"strictOrder":true,"stages":[{"id":null,"name":"Stage 1","description":null}]}'::jsonb, true)$$, 'a chain is created through the save RPC');
reset role;
select is((select array_agg(name order by position, id) from public.long_quests where user_id = '25000000-0000-4000-8000-00000000000a'),
  array['A chain 3', 'A chain 2', 'A chain 1'], 'a chain created by the save RPC lands at the top');

set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-00000000000a', true);
select lives_ok($$select public.reorder_long_quests(array['25000000-0000-4000-8000-0000000000e2', '25000000-0000-4000-8000-0000000000e4', '25000000-0000-4000-8000-0000000000e3']::uuid[])$$, 'chains can be reordered');
reset role;
select is((select array_agg(name order by position, id) from public.long_quests where user_id = '25000000-0000-4000-8000-00000000000a'),
  array['A chain 1', 'A chain 3', 'A chain 2'], 'the chain order is exactly the given order');
set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-00000000000a', true);
select throws_ok($$select public.reorder_long_quests(null)$$, 'P0001', 'Quest order must list each quest once.', 'chains: a null list is refused');
select throws_ok($$select public.reorder_long_quests(array['25000000-0000-4000-8000-0000000000e2', '25000000-0000-4000-8000-0000000000e2']::uuid[])$$, 'P0001', 'Quest order must list each quest once.', 'chains: a duplicate is refused');
select throws_ok($$select public.reorder_long_quests(array['25000000-0000-4000-8000-0000000000a1']::uuid[])$$, 'P0001', 'Quest order is out of date. Reload and try again.', 'chains: another user''s chain is refused');
reset role;

select * from finish();
rollback;
