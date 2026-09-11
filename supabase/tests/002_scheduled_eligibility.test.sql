begin;

set local search_path = public, extensions;
select plan(31);

select has_column('public', 'profiles', 'time_zone', 'profiles persist an account IANA timezone');
select has_table('public', 'habit_schedule_versions', 'schedule history is persisted');
select has_table('public', 'habit_occurrences', 'eligible occurrences are persisted');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.habit_schedule_versions'::regclass),
  'schedule history has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.habit_occurrences'::regclass),
  'occurrences have row-level security enabled'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '33333333-3333-4333-8333-333333333333',
  'phase1-user@example.invalid',
  '{"display_name":"Phase 1 User","time_zone":"Asia/Manila"}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.initialize_account_time_zone('America/Los_Angeles'),
  'Asia/Manila',
  'initialization never overwrites the persisted account timezone from another device'
);

select throws_ok(
  $$select public.initialize_account_time_zone('Not/A_Real_Zone')$$,
  'P0001',
  'invalid IANA time zone: Not/A_Real_Zone',
  'invalid timezone identifiers are rejected'
);

insert into public.habits (
  id, user_id, name, easy_version, stat, difficulty, days, created_at, schedule_start_on
)
values (
  'abababab-abab-4bab-8bab-abababababab',
  '33333333-3333-4333-8333-333333333333',
  'MWF habit',
  'One minute',
  'STR',
  'Medium',
  '{1,3,5}',
  '2026-09-07T01:00:00+00',
  '2000-01-01'
);

select is(
  (select schedule_start_on from public.habits where id = 'abababab-abab-4bab-8bab-abababababab'),
  '2026-09-07'::date,
  'a client cannot backdate a new habit schedule_start_on'
);

select lives_ok(
  $$update public.habits set schedule_start_on = '1999-01-01' where id = 'abababab-abab-4bab-8bab-abababababab'$$,
  'legacy habit updates that send schedule_start_on remain compatible'
);

select is(
  (select schedule_start_on from public.habits where id = 'abababab-abab-4bab-8bab-abababababab'),
  '2026-09-07'::date,
  'a client cannot rewrite an established schedule start'
);

select lives_ok(
  $$select public.ensure_habit_occurrences('2026-09-11')$$,
  'reconciliation creates eligible occurrences'
);

select results_eq(
  $$
    select occurrence_date
    from public.habit_occurrences
    where habit_id = 'abababab-abab-4bab-8bab-abababababab'
    order by occurrence_date
  $$,
  $$values ('2026-09-07'::date), ('2026-09-09'::date), ('2026-09-11'::date)$$,
  'Monday/Wednesday/Friday occurrences exist and all off-days are absent'
);

select lives_ok(
  $$select public.ensure_habit_occurrences('2026-09-11')$$,
  'repeating reconciliation is idempotent'
);

select is(
  (select count(*) from public.habit_occurrences where habit_id = 'abababab-abab-4bab-8bab-abababababab'),
  3::bigint,
  'resume/retrieval cannot duplicate an occurrence'
);

select results_eq(
  $$select id from public.get_habits_for_date('2026-09-11') order by id$$,
  $$values ('abababab-abab-4bab-8bab-abababababab'::uuid)$$,
  'authoritative retrieval returns the scheduled Friday habit'
);

select is_empty(
  $$select id from public.get_habits_for_date('2026-09-10')$$,
  'authoritative retrieval returns no habit on Thursday'
);

select throws_ok(
  $$select public.complete_habit('abababab-abab-4bab-8bab-abababababab', '2026-09-10', 'full')$$,
  'P0001',
  'habit abababab-abab-4bab-8bab-abababababab is not eligible on 2026-09-10',
  'an off-day direct RPC completion is rejected'
);

select throws_ok(
  $$select public.complete_habit('abababab-abab-4bab-8bab-abababababab', '2099-01-01', 'full')$$,
  'P0001',
  'habit abababab-abab-4bab-8bab-abababababab is not eligible on 2099-01-01',
  'a future direct completion is rejected using authoritative server time'
);

select lives_ok(
  $$select public.complete_habit('abababab-abab-4bab-8bab-abababababab', '2026-09-11', 'full')$$,
  'a scheduled current-day completion remains valid'
);

select is(
  (select count(*) from public.habit_completions where habit_id = 'abababab-abab-4bab-8bab-abababababab'),
  1::bigint,
  'only the eligible completion is recorded'
);

select is(
  (select xp from public.stats where user_id = '33333333-3333-4333-8333-333333333333' and stat = 'STR'),
  20,
  'the rejected off-day write awards no XP'
);

select lives_ok(
  $$update public.habits set days = '{2,4}' where id = 'abababab-abab-4bab-8bab-abababababab'$$,
  'a schedule edit succeeds without rewriting prior occurrences'
);

select is(
  (select count(*) from public.habit_occurrences where habit_id = 'abababab-abab-4bab-8bab-abababababab'),
  3::bigint,
  'a schedule edit preserves existing occurrence history'
);

select is(
  (
    select days
    from public.habit_schedule_versions
    where habit_id = 'abababab-abab-4bab-8bab-abababababab'
    order by effective_from desc
    limit 1
  ),
  '{2,4}'::smallint[],
  'the edited schedule is stored as a prospective version'
);

select is(
  (
    select effective_from
    from public.habit_schedule_versions
    where habit_id = 'abababab-abab-4bab-8bab-abababababab'
    order by effective_from desc
    limit 1
  ),
  ((statement_timestamp() at time zone 'Asia/Manila')::date + 1),
  'a schedule edit takes effect at the next account-local day boundary'
);

select is(
  public.set_account_time_zone('America/Los_Angeles'),
  'America/Los_Angeles',
  'an explicit account timezone change is accepted'
);

select is(
  (select count(*) from public.habit_occurrences where habit_id = 'abababab-abab-4bab-8bab-abababababab'),
  3::bigint,
  'a timezone edit cannot move historical occurrence date keys'
);

select throws_ok(
  $$update public.profiles set time_zone = 'UTC' where user_id = '33333333-3333-4333-8333-333333333333'$$,
  '42501',
  'permission denied for table profiles',
  'timezone changes cannot bypass the prospective account RPC'
);

select throws_ok(
  $$
    insert into public.habit_occurrences (habit_id, user_id, occurrence_date)
    values (
      'abababab-abab-4bab-8bab-abababababab',
      '33333333-3333-4333-8333-333333333333',
      '2026-09-10'
    )
  $$,
  '42501',
  'permission denied for table habit_occurrences',
  'a client cannot forge an off-day occurrence row'
);

select throws_ok(
  $$
    insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded)
    values (
      '33333333-3333-4333-8333-333333333333',
      'abababab-abab-4bab-8bab-abababababab',
      '2026-09-10',
      'full',
      20
    )
  $$,
  '42501',
  'permission denied for table habit_completions',
  'a client cannot bypass the completion RPC with a direct insert'
);

select throws_ok(
  $$
    insert into public.habit_progress (user_id, habit_id, progress_date, progress_count)
    values (
      '33333333-3333-4333-8333-333333333333',
      'abababab-abab-4bab-8bab-abababababab',
      '2026-09-10',
      999
    )
  $$,
  '42501',
  'permission denied for table habit_progress',
  'a client cannot forge off-day quantity progress'
);

select * from finish();
rollback;
