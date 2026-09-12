begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(37);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '88888888-8888-4888-8888-888888885001',
    'phase8-user@example.invalid',
    '{"display_name":"Phase 8 User","time_zone":"Asia/Manila"}'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999995002',
    'phase8-other@example.invalid',
    '{"display_name":"Phase 8 Other","time_zone":"UTC"}'::jsonb
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888885001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select time_zone from public.profiles where user_id = '88888888-8888-4888-8888-888888885001'),
  'Asia/Manila',
  'fresh registration persists the account product-day timezone'
);

insert into public.habits (
  id, user_id, name, easy_version, stat, difficulty, days, created_at
)
values (
  '88888888-8888-4888-8888-888888886001',
  '88888888-8888-4888-8888-888888885001',
  'MWF journey habit',
  'Penalty: train for five minutes',
  'STR',
  'Medium',
  '{1,3,5}',
  '2026-09-07T01:00:00+00'
);

insert into public.habits (
  id, user_id, name, easy_version, stat, difficulty, days, quest_type, scheduled_date
)
values (
  '88888888-8888-4888-8888-888888886002',
  '88888888-8888-4888-8888-888888885001',
  'One-time journey quest',
  null,
  'INT',
  'Easy',
  '{}',
  'one_time',
  (statement_timestamp() at time zone 'Asia/Manila')::date
);

select is(
  (select easy_version from public.habits where id = '88888888-8888-4888-8888-888888886001'),
  'Penalty: train for five minutes',
  'Penalty content round-trips without changing the stored compatibility field'
);
select results_eq(
  $$select id from public.get_habits_for_date('2026-09-07') where id = '88888888-8888-4888-8888-888888886001'$$,
  $$values ('88888888-8888-4888-8888-888888886001'::uuid)$$,
  'the MWF habit appears in Daily Quests on Monday'
);
select is_empty(
  $$select id from public.get_habits_for_date('2026-09-08') where id = '88888888-8888-4888-8888-888888886001'$$,
  'the MWF habit is absent from Daily Quests on Tuesday'
);
select results_eq(
  format(
    $$select id from public.get_habits_for_date(%L) where id = '88888888-8888-4888-8888-888888886002'$$,
    (statement_timestamp() at time zone 'Asia/Manila')::date
  ),
  $$values ('88888888-8888-4888-8888-888888886002'::uuid)$$,
  'the independently dated one-time quest appears in its current-day query'
);
select lives_ok(
  format(
    $$select public.complete_habit('88888888-8888-4888-8888-888888886002', %L, 'full')$$,
    (statement_timestamp() at time zone 'Asia/Manila')::date
  ),
  'the one-time quest completes independently'
);
select is(
  (select count(*) from public.habit_completions where habit_id = '88888888-8888-4888-8888-888888886002'),
  1::bigint,
  'the one-time quest persists one completion'
);
select is(
  (select count(*) from public.habit_completions where habit_id = '88888888-8888-4888-8888-888888886001'),
  0::bigint,
  'one-time completion does not complete the recurring habit'
);
select is(
  (select xp from public.stats where user_id = '88888888-8888-4888-8888-888888885001' and stat = 'INT'),
  20,
  'one-time completion preserves the existing full-completion reward'
);

insert into public.long_quests (id, user_id, name, stat)
values (
  '88888888-8888-4888-8888-888888886003',
  '88888888-8888-4888-8888-888888885001',
  'Three-stage journey',
  'WIS'
);
insert into public.long_quest_stages (
  id, long_quest_id, user_id, name, description, position
)
values
  (
    '88888888-8888-4888-8888-888888887001',
    '88888888-8888-4888-8888-888888886003',
    '88888888-8888-4888-8888-888888885001',
    'Plan',
    'Define the route.',
    0
  ),
  (
    '88888888-8888-4888-8888-888888887002',
    '88888888-8888-4888-8888-888888886003',
    '88888888-8888-4888-8888-888888885001',
    'Build',
    E'Build\nacross platforms',
    1
  ),
  (
    '88888888-8888-4888-8888-888888887003',
    '88888888-8888-4888-8888-888888886003',
    '88888888-8888-4888-8888-888888885001',
    'Ship',
    null,
    2
  );

select results_eq(
  $$
    select position::integer, description
    from public.long_quest_stages
    where long_quest_id = '88888888-8888-4888-8888-888888886003'
    order by position
  $$,
  $$values (0, 'Define the route.'::text), (1, E'Build\nacross platforms'::text), (2, null::text)$$,
  'optional stage descriptions round-trip in stable order'
);
select throws_ok(
  $$select public.set_long_quest_stage_done('88888888-8888-4888-8888-888888887002', true)$$,
  'P0001',
  'Complete earlier stages first.',
  'the public transition rejects skipping Stage 1'
);
select throws_ok(
  $$update public.long_quest_stages set done = true where id = '88888888-8888-4888-8888-888888887003'$$,
  'P0001',
  'Complete earlier stages first.',
  'a direct table write cannot skip to Stage 3'
);
select is(
  (select done from public.long_quest_stages where id = '88888888-8888-4888-8888-888888887003'),
  false,
  'the rejected direct write leaves Stage 3 unchanged'
);
select lives_ok(
  $$select public.set_long_quest_stage_done('88888888-8888-4888-8888-888888887001', true)$$,
  'Stage 1 completes'
);
select lives_ok(
  $$select public.set_long_quest_stage_done('88888888-8888-4888-8888-888888887002', true)$$,
  'Stage 2 unlocks and completes'
);
select is(
  (select completed_at from public.long_quests where id = '88888888-8888-4888-8888-888888886003'),
  null::timestamptz,
  'the long quest stays incomplete until its final stage'
);
select lives_ok(
  $$select public.set_long_quest_stage_done('88888888-8888-4888-8888-888888887003', true)$$,
  'Stage 3 unlocks and completes'
);
select is(
  (select count(*) from public.long_quest_stages where long_quest_id = '88888888-8888-4888-8888-888888886003' and done),
  3::bigint,
  'all three stage completions persist'
);
select ok(
  (select completed_at is not null from public.long_quests where id = '88888888-8888-4888-8888-888888886003'),
  'the long quest completes only after all stages complete'
);
create temp table phase8_completion_marker as
select completed_at from public.long_quests where id = '88888888-8888-4888-8888-888888886003';
select lives_ok(
  $$select public.set_long_quest_stage_done('88888888-8888-4888-8888-888888887003', true)$$,
  'repeating final completion is idempotent'
);
select is(
  (select completed_at from public.long_quests where id = '88888888-8888-4888-8888-888888886003'),
  (select completed_at from phase8_completion_marker),
  'reload/retry preserves the original completion marker'
);

-- Date-relative fixtures exercise recovery through authoritative time without
-- assuming which calendar date the suite runs on.
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days, created_at)
values
  (
    '88888888-8888-4888-8888-888888886004',
    '88888888-8888-4888-8888-888888885001',
    'Recoverable journey habit',
    'Penalty: one minute',
    'DEX',
    'Medium',
    array[extract(dow from ((statement_timestamp() at time zone 'Asia/Manila')::date - 1))::smallint],
    ((((statement_timestamp() at time zone 'Asia/Manila')::date - 1)::timestamp + interval '12 hours') at time zone 'Asia/Manila')
  ),
  (
    '88888888-8888-4888-8888-888888886005',
    '88888888-8888-4888-8888-888888885001',
    'Expired journey habit',
    'Penalty: one minute',
    'CHA',
    'Medium',
    array[extract(dow from ((statement_timestamp() at time zone 'Asia/Manila')::date - 2))::smallint],
    ((((statement_timestamp() at time zone 'Asia/Manila')::date - 2)::timestamp + interval '12 hours') at time zone 'Asia/Manila')
  );

select lives_ok(
  $$select public.reconcile_habit_recoveries()$$,
  'resume reconciliation processes elapsed occurrences chronologically'
);
select is(
  (select status from public.habit_recovery_windows where habit_id = '88888888-8888-4888-8888-888888886004'),
  'open',
  'the previous-day miss opens one recovery day'
);
select is_empty(
  format(
    $$select id from public.get_habits_for_date(%L) where id = '88888888-8888-4888-8888-888888886004'$$,
    (statement_timestamp() at time zone 'Asia/Manila')::date
  ),
  'off-day recovery does not become a normal Daily Quest'
);
select is(
  public.complete_habit_recovery('88888888-8888-4888-8888-888888886004')->>'status',
  'recovered',
  'recovery succeeds inside the one-day authoritative window'
);
select is(
  (select current_streak from public.streaks where habit_id = '88888888-8888-4888-8888-888888886004'),
  1,
  'successful recovery restores the affected streak'
);
select is(
  (select status from public.habit_recovery_windows where habit_id = '88888888-8888-4888-8888-888888886005'),
  'expired',
  'a later missed recovery is persisted as expired after resume'
);
select is(
  (select current_streak from public.streaks where habit_id = '88888888-8888-4888-8888-888888886005'),
  0,
  'failed recovery resets the affected streak'
);
select is(
  (select active_recovery_id from public.streaks where habit_id = '88888888-8888-4888-8888-888888886005'),
  null::uuid,
  'failed recovery unfreezes the affected habit'
);

select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999995002', true);
select is(
  (select count(*) from public.habits where user_id = '88888888-8888-4888-8888-888888885001'),
  0::bigint,
  'a second account cannot read the first account habits'
);
select is(
  (select count(*) from public.long_quests where user_id = '88888888-8888-4888-8888-888888885001'),
  0::bigint,
  'a second account cannot read the first account long quest'
);
select throws_ok(
  $$select public.set_long_quest_stage_done('88888888-8888-4888-8888-888888887003', true)$$,
  'P0001',
  'Long Quest stage not found for calling user.',
  'a second account cannot mutate the first account stage'
);

select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888885001', true);
select is(
  (select count(*) from public.habits),
  4::bigint,
  'switching back restores the complete habit and one-time catalog'
);
select is(
  (select count(*) from public.long_quests),
  1::bigint,
  'switching back restores the dedicated Long Quest data'
);
select is(
  (select count(*) from public.habit_completions),
  2::bigint,
  'one-time and recovery completions remain distinct after switching accounts'
);
select lives_ok(
  $$select public.reconcile_habit_recoveries()$$,
  'repeating resume reconciliation is idempotent'
);
select is(
  (
    select count(*)
    from public.habit_recovery_windows
    where habit_id in (
      '88888888-8888-4888-8888-888888886004',
      '88888888-8888-4888-8888-888888886005'
    )
  ),
  2::bigint,
  'resume cannot duplicate recovery windows'
);

select * from finish();
rollback;
