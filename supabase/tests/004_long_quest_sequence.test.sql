begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(33);

select has_function('public', 'set_long_quest_stage_done', array['uuid', 'boolean'], 'authoritative stage transition RPC exists');
select has_function('public', 'normalize_long_quest_stage_sequences', array[]::text[], 'legacy sequence normalization function exists');
select has_column('public', 'long_quests', 'completed_at', 'long quests persist their first completion time');

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111115001', 'phase5-user-1@example.invalid', '{"display_name":"Phase 5 User 1"}'::jsonb),
  ('22222222-2222-4222-8222-222222225002', 'phase5-user-2@example.invalid', '{"display_name":"Phase 5 User 2"}'::jsonb);

insert into public.long_quests (id, user_id, name, stat)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001', '11111111-1111-4111-8111-111111115001', 'Sequential quest', 'STR'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb6002', '11111111-1111-4111-8111-111111115001', 'Reorder quest', 'INT'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeee6005', '11111111-1111-4111-8111-111111115001', 'Direct-write quest', 'CHA'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccc6003', '22222222-2222-4222-8222-222222225002', 'Other user quest', 'WIS');

insert into public.long_quest_stages (id, long_quest_id, user_id, name, position, done)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001', '11111111-1111-4111-8111-111111115001', 'Stage 1', 0, false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001', '11111111-1111-4111-8111-111111115001', 'Stage 2', 1, false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001', '11111111-1111-4111-8111-111111115001', 'Stage 3', 2, false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb7001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb6002', '11111111-1111-4111-8111-111111115001', 'Done first', 0, true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb7002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb6002', '11111111-1111-4111-8111-111111115001', 'Not done second', 1, false),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeee7001', 'eeeeeeee-eeee-4eee-8eee-eeeeeeee6005', '11111111-1111-4111-8111-111111115001', 'Direct first', 0, false),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeee7002', 'eeeeeeee-eeee-4eee-8eee-eeeeeeee6005', '11111111-1111-4111-8111-111111115001', 'Direct second', 1, false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccc7001', 'cccccccc-cccc-4ccc-8ccc-cccccccc6003', '22222222-2222-4222-8222-222222225002', 'Other stage', 0, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111115001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.set_long_quest_stage_done('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7002', true)$$,
  'P0001', 'Complete earlier stages first.', 'Stage 2 cannot skip Stage 1'
);
select throws_ok(
  $$select public.set_long_quest_stage_done('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7003', true)$$,
  'P0001', 'Complete earlier stages first.', 'Stage 3 cannot skip its predecessors'
);
select is((select done from public.long_quest_stages where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7002'), false, 'rejected skip leaves Stage 2 unchanged');

select lives_ok($$select public.set_long_quest_stage_done('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7001', true)$$, 'Stage 1 is initially completable');
select is((select done from public.long_quest_stages where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7001'), true, 'Stage 1 persists complete');
select lives_ok($$select public.set_long_quest_stage_done('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7001', true)$$, 'repeating the same completion is idempotent');
select lives_ok($$select public.set_long_quest_stage_done('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7002', true)$$, 'Stage 2 unlocks after Stage 1');
select throws_ok(
  $$select public.set_long_quest_stage_done('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7001', false)$$,
  'P0001', 'Undo later stages first.', 'a completed predecessor cannot be undone before its successor'
);
select is((select done from public.long_quest_stages where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7001'), true, 'rejected unsafe undo leaves Stage 1 complete');
select lives_ok($$select public.set_long_quest_stage_done('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7003', true)$$, 'Stage 3 unlocks after Stage 2');
select is((select count(*) from public.long_quest_stages where long_quest_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001' and done), 3::bigint, 'all three stages persist complete');
select ok((select completed_at is not null from public.long_quests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001'), 'quest receives a completion marker only after every stage is done');

create temp table phase5_completion_marker as
select completed_at from public.long_quests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001';
select lives_ok($$select public.set_long_quest_stage_done('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7003', true)$$, 'repeating final completion is idempotent');
select is(
  (select completed_at from public.long_quests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001'),
  (select completed_at from phase5_completion_marker),
  'repeated final completion does not create a second completion event'
);
select is(
  (select coalesce(sum(xp), 0)::integer from public.stats where user_id = '11111111-1111-4111-8111-111111115001'),
  0,
  'stage retries and rejections do not duplicate rewards'
);

select throws_ok(
  $$select public.set_long_quest_stage_done('cccccccc-cccc-4ccc-8ccc-cccccccc7001', true)$$,
  'P0001', 'Long Quest stage not found for calling user.', 'another user cannot complete a stage'
);

select throws_ok(
  $$update public.long_quest_stages set done = true where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee7002'$$,
  'P0001', 'Complete earlier stages first.', 'a direct table write cannot bypass sequence enforcement after its predecessor is made incomplete'
);
select is((select done from public.long_quest_stages where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee7002'), false, 'rejected direct write leaves progress unchanged');

select throws_ok(
  $$select public.reconcile_long_quest_stages(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb6002',
    '[{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb7002","name":"Not done second","description":null},{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb7001","name":"Done first","description":null}]'::jsonb
  )$$,
  'P0001', 'Long Quest stages must form a completed prefix.', 'reordering cannot place an incomplete stage before a completed stage'
);
select results_eq(
  $$select id from public.long_quest_stages where long_quest_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb6002' order by position$$,
  $$values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb7001'::uuid), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb7002'::uuid)$$,
  'failed reorder rolls the stage order back'
);

select lives_ok($$select public.set_long_quest_stage_done('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7003', false)$$, 'the latest completed stage can be undone');
select is((select count(*) from public.long_quest_stages where long_quest_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001' and not done), 1::bigint, 'undo leaves the quest currently incomplete');
select is(
  (select completed_at from public.long_quests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001'),
  (select completed_at from phase5_completion_marker),
  'undo preserves the immutable first-completion marker'
);
select lives_ok($$select public.set_long_quest_stage_done('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa7003', true)$$, 'the final stage can be completed again after an undo');
select is(
  (select completed_at from public.long_quests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa6001'),
  (select completed_at from phase5_completion_marker),
  'recompletion preserves the original completion marker'
);

reset role;
set local session_replication_role = replica;
insert into public.long_quests (id, user_id, name, stat)
values ('dddddddd-dddd-4ddd-8ddd-dddddddd6004', '11111111-1111-4111-8111-111111115001', 'Legacy quest', 'DEX');
insert into public.long_quest_stages (id, long_quest_id, user_id, name, position, done)
values
  ('dddddddd-dddd-4ddd-8ddd-dddddddd7001', 'dddddddd-dddd-4ddd-8ddd-dddddddd6004', '11111111-1111-4111-8111-111111115001', 'Legacy missed predecessor', 0, false),
  ('dddddddd-dddd-4ddd-8ddd-dddddddd7002', 'dddddddd-dddd-4ddd-8ddd-dddddddd6004', '11111111-1111-4111-8111-111111115001', 'Legacy completed later stage', 1, true);
set local session_replication_role = origin;

select lives_ok($$select public.normalize_long_quest_stage_sequences()$$, 'legacy out-of-order records can be normalized without deleting completed history');
select is((select count(*) from public.long_quest_stages where long_quest_id = 'dddddddd-dddd-4ddd-8ddd-dddddddd6004' and done), 2::bigint, 'legacy normalization treats predecessors of an earned later stage as satisfied');
select is((select done from public.long_quest_stages where id = 'dddddddd-dddd-4ddd-8ddd-dddddddd7002'), true, 'legacy normalization preserves the originally completed stage');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111115001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(not has_function_privilege('public.normalize_long_quest_stage_sequences()', 'execute'), 'clients cannot invoke the migration-only normalization helper');
select lives_ok(
  $$delete from public.long_quests where id = 'dddddddd-dddd-4ddd-8ddd-dddddddd6004'$$,
  'deleting a completed Long Quest cascades its stages without sequence-order failures'
);

select * from finish();
rollback;
