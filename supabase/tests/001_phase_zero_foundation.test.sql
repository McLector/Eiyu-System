begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

select has_table('public', 'profiles', 'profiles migration is applied');
select has_table('public', 'habits', 'habits migration is applied');
select has_table('public', 'habit_completions', 'habit completions migration is applied');
select has_table('public', 'long_quests', 'long quests migration is applied');
select has_table('public', 'long_quest_stages', 'long quest stages migration is applied');
select has_table('public', 'habit_progress', 'habit progress migration is applied');

select ok(
  (
    select count(*) = 10 and bool_and(c.relrowsecurity)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'profiles',
        'stats',
        'habits',
        'habit_completions',
        'streaks',
        'long_quests',
        'long_quest_stages',
        'weekly_quests',
        'weekly_summaries',
        'habit_progress'
      ])
  ),
  'all ten application tables have row-level security enabled'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'phase0-user-1@example.invalid', '{"display_name":"Phase 0 User 1"}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'phase0-user-2@example.invalid', '{"display_name":"Phase 0 User 2"}'::jsonb);

insert into public.habits (id, user_id, name, easy_version, stat, difficulty)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'User 1 habit',
    'User 1 easy habit',
    'STR',
    'Medium'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'User 2 habit',
    'User 2 easy habit',
    'INT',
    'Medium'
  );

insert into public.long_quests (id, user_id, name, stat)
values
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'User 1 long quest',
    'DEX'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '22222222-2222-4222-8222-222222222222',
    'User 2 long quest',
    'WIS'
  );

insert into public.long_quest_stages (id, long_quest_id, user_id, name, position)
values
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'User 1 stage',
    0
  ),
  (
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '22222222-2222-4222-8222-222222222222',
    'User 2 stage',
    0
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.habits),
  1::bigint,
  'an authenticated user sees only their own habits'
);

select results_eq(
  $$select id from public.habits order by id$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$$,
  'the visible habit belongs to the authenticated user'
);

select throws_ok(
  $$
    insert into public.habits (user_id, name, easy_version, stat, difficulty)
    values ('22222222-2222-4222-8222-222222222222', 'Forbidden habit', 'Forbidden easy habit', 'CHA', 'Easy')
  $$,
  '42501',
  'new row violates row-level security policy for table "habits"',
  'a user cannot insert a habit for another user'
);

select lives_ok(
  $$
    update public.habits
    set name = 'Forbidden update'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  $$,
  'an update targeting another user habit is safely filtered by RLS'
);

select is(
  (select count(*) from public.long_quest_stages),
  1::bigint,
  'an authenticated user sees only their own long quest stages'
);

select lives_ok(
  $$
    update public.long_quest_stages
    set done = true
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  $$,
  'an update targeting another user long quest stage is safely filtered by RLS'
);

select lives_ok(
  $$select public.complete_habit('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-11', 'full')$$,
  'an authenticated user can complete their own habit'
);

select is(
  (select count(*) from public.habit_completions where habit_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1::bigint,
  'a successful completion creates exactly one completion row'
);

select is(
  (select xp from public.stats where stat = 'STR'),
  20,
  'a full completion awards the current server-side XP amount'
);

select throws_ok(
  $$select public.complete_habit('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-11', 'full')$$,
  '23505',
  'duplicate key value violates unique constraint "habit_completions_habit_id_completed_on_key"',
  'a duplicate completion is rejected'
);

select is(
  (select xp from public.stats where stat = 'STR'),
  20,
  'a rejected duplicate completion cannot award XP twice'
);

select throws_ok(
  $$select public.complete_habit('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-09-11', 'full')$$,
  'P0001',
  'habit bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb not found for calling user',
  'the completion RPC rejects another user habit'
);

reset role;

select is(
  (select name from public.habits where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'User 2 habit',
  'the cross-user habit update changed no underlying row'
);

select is(
  (select done from public.long_quest_stages where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
  false,
  'the cross-user stage update changed no underlying row'
);

select is(
  (select count(*) from public.habit_completions where habit_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0::bigint,
  'a rejected cross-user RPC creates no completion row'
);

select is(
  (
    select xp
    from public.stats
    where user_id = '22222222-2222-4222-8222-222222222222' and stat = 'INT'
  ),
  0,
  'a rejected cross-user RPC awards no XP'
);

select * from finish();
rollback;
