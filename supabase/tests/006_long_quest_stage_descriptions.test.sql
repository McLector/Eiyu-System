begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

-- Tracker writes go through public.apply_tracker_write (S02 contract). The
-- fixture chains are legacy rows without provenance, i.e. custom roots.
create function pg_temp.gw(op text, args jsonb, targets jsonb default '[]')
returns jsonb language sql set search_path = '' as $$
  select public.apply_tracker_write(
    op,
    args || jsonb_build_object('p_expected_targets', targets),
    public.get_tracker_processing_access()->'revision'
  );
$$;
-- Stage definition edit through the gateway (replaces direct reconciliation).
create function pg_temp.cs(chain uuid, stages jsonb) returns jsonb
language sql set search_path = '' as $$
  select pg_temp.gw(
    'chain-save',
    jsonb_build_object('p_id', chain, 'p_request_id', gen_random_uuid(), 'p_create', false, 'p_mode', 'custom',
      'p_input', jsonb_build_object(
        'name', (select q.name from public.long_quests q where q.id = chain),
        'stat', (select q.stat from public.long_quests q where q.id = chain),
        'stages', stages)),
    jsonb_build_array(jsonb_build_object('kind', 'chain', 'id', chain, 'inputKind', 'custom'))
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
  ('66666666-6666-4666-8666-666666665001', 'phase6-user-1@example.invalid', '{"display_name":"Phase 6 User 1","birth_date":"2000-01-01"}'::jsonb),
  ('77777777-7777-4777-8777-777777775002', 'phase6-user-2@example.invalid', '{"display_name":"Phase 6 User 2","birth_date":"2000-01-01"}'::jsonb);

insert into public.long_quests (id, user_id, name, stat)
values
  ('66666666-6666-4666-8666-666666666001', '66666666-6666-4666-8666-666666665001', 'Described quest', 'INT'),
  ('77777777-7777-4777-8777-777777776002', '77777777-7777-4777-8777-777777775002', 'Other quest', 'WIS');

insert into public.long_quest_stages (id, long_quest_id, user_id, name, position)
values
  ('66666666-6666-4666-8666-666666667001', '66666666-6666-4666-8666-666666666001', '66666666-6666-4666-8666-666666665001', 'Stage 1', 0),
  ('66666666-6666-4666-8666-666666667002', '66666666-6666-4666-8666-666666666001', '66666666-6666-4666-8666-666666665001', 'Stage 2', 1),
  ('77777777-7777-4777-8777-777777777001', '77777777-7777-4777-8777-777777776002', '77777777-7777-4777-8777-777777775002', 'Other stage', 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666665001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.set_tracker_processing_consent(
  'custom-tracker', true, '2026-10-23-custom-tracker-v1',
  public.get_tracker_processing_access()->'revision'
);

select lives_ok(
  $$select pg_temp.cs('66666666-6666-4666-8666-666666666001', '[{"id":"66666666-6666-4666-8666-666666667001","name":"Stage 1"},{"id":"66666666-6666-4666-8666-666666667002","name":"Stage 2","description":null}]'::jsonb)$$,
  'old payloads without descriptions remain valid'
);
select is((select description from public.long_quest_stages where id = '66666666-6666-4666-8666-666666667001'), null, 'omitted description persists as null');

select lives_ok(
  $$select pg_temp.cs('66666666-6666-4666-8666-666666666001', '[{"id":"66666666-6666-4666-8666-666666667001","name":"Stage 1","description":"  First line\n勇者 ✨\n  "},{"id":"66666666-6666-4666-8666-666666667002","name":"Stage 2","description":"   \n\t "}]'::jsonb)$$,
  'multiline Unicode and blank descriptions pass through the authoritative write boundary'
);
select is(
  (select description from public.long_quest_stages where id = '66666666-6666-4666-8666-666666667001'),
  E'First line\n勇者 ✨',
  'outer whitespace is trimmed without losing multiline Unicode content'
);
select is((select description from public.long_quest_stages where id = '66666666-6666-4666-8666-666666667002'), null, 'whitespace-only description normalizes to null');

select lives_ok(
  format(
    $$select pg_temp.cs('66666666-6666-4666-8666-666666666001', %L::jsonb)$$,
    jsonb_build_array(
      jsonb_build_object('id', '66666666-6666-4666-8666-666666667001', 'name', 'Stage 1', 'description', repeat('a', 2000)),
      jsonb_build_object('id', '66666666-6666-4666-8666-666666667002', 'name', 'Stage 2', 'description', null)
    )::text
  ),
  'a 2000-character description is accepted'
);
select is(length((select description from public.long_quest_stages where id = '66666666-6666-4666-8666-666666667001')), 2000, 'the at-limit value persists intact');

select throws_ok(
  format(
    $$select pg_temp.cs('66666666-6666-4666-8666-666666666001', %L::jsonb)$$,
    jsonb_build_array(
      jsonb_build_object('id', '66666666-6666-4666-8666-666666667001', 'name', 'Stage 1', 'description', repeat('b', 2001)),
      jsonb_build_object('id', '66666666-6666-4666-8666-666666667002', 'name', 'Stage 2', 'description', null)
    )::text
  ),
  'P0001', 'Stage descriptions must be 2000 characters or fewer.',
  'an over-limit RPC edit is rejected'
);
select is(length((select description from public.long_quest_stages where id = '66666666-6666-4666-8666-666666667001')), 2000, 'the rejected edit rolls back without changing the prior value');

select lives_ok(
  $$select pg_temp.cs('66666666-6666-4666-8666-666666666001', '[{"id":"66666666-6666-4666-8666-666666667001","name":"Stage 1","description":"<script>alert(\"no\")</script>"},{"id":"66666666-6666-4666-8666-666666667002","name":"Stage 2"}]'::jsonb)$$,
  'markup-like content is accepted as plain stored text'
);
select is(
  (select description from public.long_quest_stages where id = '66666666-6666-4666-8666-666666667001'),
  '<script>alert("no")</script>',
  'markup-like content round-trips verbatim as text'
);

select throws_ok(
  $$update public.long_quest_stages set description = repeat('x', 2001) where id = '66666666-6666-4666-8666-666666667001'$$,
  '42501', 'permission denied for table long_quest_stages',
  'clients can no longer write stage descriptions directly'
);
-- The limit trigger still guards the table itself; exercise it as the owner.
reset role;
select throws_ok(
  $$update public.long_quest_stages set description = repeat('x', 2001) where id = '66666666-6666-4666-8666-666666667001'$$,
  'P0001', 'Stage descriptions must be 2000 characters or fewer.',
  'a direct table write cannot bypass the limit'
);
set local role authenticated;
select is(
  (select description from public.long_quest_stages where id = '66666666-6666-4666-8666-666666667001'),
  '<script>alert("no")</script>',
  'the rejected direct write preserves the previous description'
);

select is(
  (select count(*) from public.long_quest_stages where id = '77777777-7777-4777-8777-777777777001'),
  0::bigint,
  'RLS hides another user stage'
);
select throws_ok(
  $$select pg_temp.cs('77777777-7777-4777-8777-777777776002', '[{"id":"77777777-7777-4777-8777-777777777001","name":"Other stage","description":"stolen"}]'::jsonb)$$,
  '42501', 'Tracker target unavailable.',
  'another owner description cannot be edited through the RPC'
);

-- The sequence trigger is exercised as the table owner (clients cannot write).
reset role;
select throws_ok(
  $$update public.long_quest_stages set done = true where id = '66666666-6666-4666-8666-666666667002'$$,
  'P0001', 'Complete earlier stages first.',
  'description support does not disable the Phase 5 sequence trigger'
);
set local role authenticated;
select lives_ok($$select pg_temp.sd('66666666-6666-4666-8666-666666667001', true)$$, 'description edits do not prevent Stage 1 completion');
select lives_ok(
  $$select pg_temp.cs('66666666-6666-4666-8666-666666666001', '[{"id":"66666666-6666-4666-8666-666666667001","name":"Stage 1","description":"Completed stage\nnotes"},{"id":"66666666-6666-4666-8666-666666667002","name":"Stage 2"}]'::jsonb)$$,
  'a description can be edited without changing completed progress'
);
select lives_ok($$select pg_temp.sd('66666666-6666-4666-8666-666666667002', true)$$, 'Stage 2 still completes only after Stage 1');
select ok((select completed_at is not null from public.long_quests where id = '66666666-6666-4666-8666-666666666001'), 'final completion behavior remains intact');

select * from finish();
rollback;
