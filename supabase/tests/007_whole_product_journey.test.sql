begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(38);

-- Tracker writes go through public.apply_tracker_write (S02 contract). The
-- fixture roots are legacy rows without provenance, i.e. custom roots.
create function pg_temp.gw(op text, args jsonb, targets jsonb default '[]')
returns jsonb language sql set search_path = '' as $$
  select public.apply_tracker_write(
    op,
    args || jsonb_build_object('p_expected_targets', targets),
    public.get_tracker_processing_access()->'revision'
  );
$$;
create function pg_temp.hw(op text, habit uuid, extra jsonb default '{}')
returns jsonb language sql set search_path = '' as $$
  select pg_temp.gw(
    op,
    jsonb_build_object('p_habit_id', habit) || extra,
    jsonb_build_array(jsonb_build_object('kind', 'habit', 'id', habit, 'inputKind', 'custom'))
  );
$$;
create function pg_temp.sd(stage uuid, done boolean) returns jsonb
language sql set search_path = '' as $$
  select pg_temp.gw(
    'set_long_quest_stage_done_receipt',
    jsonb_build_object('p_stage_id', stage, 'p_done', done, 'p_request_id', gen_random_uuid()),
    jsonb_build_array(jsonb_build_object('kind', 'chain',
      'id', (select s.long_quest_id from public.long_quest_stages s where s.id = stage), 'inputKind', 'custom'))
  );
$$;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '88888888-8888-4888-8888-888888885001',
    'phase8-user@example.invalid',
    '{"display_name":"Phase 8 User","time_zone":"Asia/Manila","birth_date":"2000-01-01"}'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999995002',
    'phase8-other@example.invalid',
    '{"display_name":"Phase 8 Other","time_zone":"UTC","birth_date":"2000-01-01"}'::jsonb
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888885001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select time_zone from public.profiles where user_id = '88888888-8888-4888-8888-888888885001'),
  'Asia/Manila',
  'fresh registration persists the account product-day timezone'
);

reset role;
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
set local role authenticated;

reset role;
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
set local role authenticated;

-- Legacy fixture roots need the owner's custom-tracker grant; reads no longer
-- materialize occurrences, so prepare the day explicitly.
select public.set_tracker_processing_consent(
  'custom-tracker', true, '2026-10-23-custom-tracker-v1',
  public.get_tracker_processing_access()->'revision'
);
-- Model a grant that predates these backdated legacy schedules; 059 treats days
-- before any custom-tracker grant as paused (legacy rollout), which is not what
-- this test is about. The session role is restored afterwards.
select set_config('eiyu.test_prior_role', current_setting('role'), true);
reset role;
update private.processing_consent_events set changed_at = '2000-01-01 00:00:00+00'
 where user_id = auth.uid() and purpose = 'custom-tracker';
select set_config('role', current_setting('eiyu.test_prior_role'), true);
select pg_temp.gw('prepare-day', '{}');

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
    $$select pg_temp.hw('complete_habit', '88888888-8888-4888-8888-888888886002', jsonb_build_object('p_completed_on', %L, 'p_kind', 'full'))$$,
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

reset role;
insert into public.long_quests (id, user_id, name, stat)
values (
  '88888888-8888-4888-8888-888888886003',
  '88888888-8888-4888-8888-888888885001',
  'Three-stage journey',
  'WIS'
);
set local role authenticated;
reset role;
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
set local role authenticated;

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
  $$select pg_temp.sd('88888888-8888-4888-8888-888888887002', true)$$,
  'P0001',
  'Complete earlier stages first.',
  'the public transition rejects skipping Stage 1'
);
select throws_ok(
  $$update public.long_quest_stages set done = true where id = '88888888-8888-4888-8888-888888887003'$$,
  '42501',
  'permission denied for table long_quest_stages',
  'clients can no longer write stage progress directly'
);
-- The sequence trigger still guards the table itself; exercise it as the owner.
reset role;
select throws_ok(
  $$update public.long_quest_stages set done = true where id = '88888888-8888-4888-8888-888888887003'$$,
  'P0001',
  'Complete earlier stages first.',
  'a direct table write cannot skip to Stage 3'
);
set local role authenticated;
select is(
  (select done from public.long_quest_stages where id = '88888888-8888-4888-8888-888888887003'),
  false,
  'the rejected direct write leaves Stage 3 unchanged'
);
select lives_ok(
  $$select pg_temp.sd('88888888-8888-4888-8888-888888887001', true)$$,
  'Stage 1 completes'
);
select lives_ok(
  $$select pg_temp.sd('88888888-8888-4888-8888-888888887002', true)$$,
  'Stage 2 unlocks and completes'
);
select is(
  (select completed_at from public.long_quests where id = '88888888-8888-4888-8888-888888886003'),
  null::timestamptz,
  'the long quest stays incomplete until its final stage'
);
select lives_ok(
  $$select pg_temp.sd('88888888-8888-4888-8888-888888887003', true)$$,
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
  $$select pg_temp.sd('88888888-8888-4888-8888-888888887003', true)$$,
  'repeating final completion is idempotent'
);
select is(
  (select completed_at from public.long_quests where id = '88888888-8888-4888-8888-888888886003'),
  (select completed_at from phase8_completion_marker),
  'reload/retry preserves the original completion marker'
);

-- Date-relative fixtures exercise recovery through authoritative time without
-- assuming which calendar date the suite runs on.
reset role;
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
set local role authenticated;

select lives_ok(
  $$select pg_temp.gw('prepare-day', '{}')$$,
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
  pg_temp.hw('complete_habit_recovery', '88888888-8888-4888-8888-888888886004')->>'status',
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
  $$select pg_temp.sd('88888888-8888-4888-8888-888888887003', true)$$,
  '42501',
  'Tracker target unavailable.',
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
  $$select pg_temp.gw('prepare-day', '{}')$$,
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
