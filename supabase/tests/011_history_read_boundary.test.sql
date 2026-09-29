begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select has_function('public', 'read_history_range', array['date', 'date']::text[], 'normalized history snapshot exists');
select ok(has_function_privilege('authenticated', 'public.read_history_range(date,date)', 'execute'), 'authenticated may read snapshot');
select ok(not has_function_privilege('anon', 'public.read_history_range(date,date)', 'execute'), 'anon cannot read snapshot');
select ok(not has_function_privilege('public', 'public.read_history_range(date,date)', 'execute'), 'PUBLIC cannot read snapshot');

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-1111-4111-8111-111111111111', 'history-owner-a@example.invalid', '{"time_zone":"UTC"}'::jsonb),
  ('b2222222-2222-4222-8222-222222222222', 'history-owner-b@example.invalid', '{"time_zone":"UTC"}'::jsonb);
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, quest_type, scheduled_date) values
  ('a1111111-1111-4111-8111-111111111101', 'a1111111-1111-4111-8111-111111111111', 'Live recurring', 'Easy', 'STR', 'Easy', '{0,1,2,3,4,5,6}', 'habit', null),
  ('a1111111-1111-4111-8111-111111111102', 'a1111111-1111-4111-8111-111111111111', 'Live one time', null, 'WIS', 'Easy', '{}', 'one_time', current_date),
  ('b2222222-2222-4222-8222-222222222201', 'b2222222-2222-4222-8222-222222222222', 'Foreign recurring', 'Easy', 'STR', 'Easy', '{0,1,2,3,4,5,6}', 'habit', null);
insert into public.habit_occurrences (habit_id, user_id, occurrence_date, time_zone, day_ends_at) values
  ('a1111111-1111-4111-8111-111111111101', 'a1111111-1111-4111-8111-111111111111', current_date, 'UTC', (current_date + 1)::timestamp at time zone 'UTC'),
  ('a1111111-1111-4111-8111-111111111102', 'a1111111-1111-4111-8111-111111111111', current_date, 'UTC', (current_date + 1)::timestamp at time zone 'UTC'),
  ('b2222222-2222-4222-8222-222222222201', 'b2222222-2222-4222-8222-222222222222', current_date, 'UTC', (current_date + 1)::timestamp at time zone 'UTC');
insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded) values
  ('a1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111101', current_date, 'full', 20),
  ('a1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111102', current_date, 'easy', 5),
  ('b2222222-2222-4222-8222-222222222222', 'b2222222-2222-4222-8222-222222222201', current_date, 'full', 20);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
select is(jsonb_array_length(public.read_history_range(current_date, current_date + 1)->'rows'), 2, 'owner sees two live records');
select is((public.read_history_range(current_date, current_date + 1)->'recurring_totals'->>'STR')::integer, 1, 'recurring aggregate excludes completed one-time quest');
select is(jsonb_array_length(public.read_history_range(current_date + 1, current_date + 2)->'rows'), 0, 'exclusive end and empty future range work');
select is(jsonb_array_length(public.read_history_range(current_date, current_date + 1)->'habits'), 2, 'snapshot includes live metadata for AI inputs');

select set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
select is(jsonb_array_length(public.read_history_range(current_date, current_date + 1)->'rows'), 1, 'other owner sees only their own record');
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
select is((public.read_history_range(current_date, current_date + 1)->'rows'->0->>'source_habit_id')::uuid,
  'a1111111-1111-4111-8111-111111111101'::uuid, 'detail ordering is stable by date and source ID');

select * from finish();
rollback;
