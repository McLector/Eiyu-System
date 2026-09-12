begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('66666666-6666-4666-8666-666666665001', 'phase6-user-1@example.invalid', '{"display_name":"Phase 6 User 1"}'::jsonb),
  ('77777777-7777-4777-8777-777777775002', 'phase6-user-2@example.invalid', '{"display_name":"Phase 6 User 2"}'::jsonb);

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

select lives_ok(
  $$select public.reconcile_long_quest_stages(
    '66666666-6666-4666-8666-666666666001',
    '[{"id":"66666666-6666-4666-8666-666666667001","name":"Stage 1"},{"id":"66666666-6666-4666-8666-666666667002","name":"Stage 2","description":null}]'::jsonb
  )$$,
  'old payloads without descriptions remain valid'
);
select is((select description from public.long_quest_stages where id = '66666666-6666-4666-8666-666666667001'), null, 'omitted description persists as null');

select lives_ok(
  $$select public.reconcile_long_quest_stages(
    '66666666-6666-4666-8666-666666666001',
    '[{"id":"66666666-6666-4666-8666-666666667001","name":"Stage 1","description":"  First line\n勇者 ✨\n  "},{"id":"66666666-6666-4666-8666-666666667002","name":"Stage 2","description":"   \n\t "}]'::jsonb
  )$$,
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
    $$select public.reconcile_long_quest_stages(
      '66666666-6666-4666-8666-666666666001',
      %L::jsonb
    )$$,
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
    $$select public.reconcile_long_quest_stages(
      '66666666-6666-4666-8666-666666666001',
      %L::jsonb
    )$$,
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
  $$update public.long_quest_stages set description = '<script>alert("no")</script>' where id = '66666666-6666-4666-8666-666666667001'$$,
  'markup-like content is accepted as plain stored text'
);
select is(
  (select description from public.long_quest_stages where id = '66666666-6666-4666-8666-666666667001'),
  '<script>alert("no")</script>',
  'markup-like content round-trips verbatim as text'
);

select throws_ok(
  $$update public.long_quest_stages set description = repeat('x', 2001) where id = '66666666-6666-4666-8666-666666667001'$$,
  'P0001', 'Stage descriptions must be 2000 characters or fewer.',
  'a direct table write cannot bypass the limit'
);
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
  $$select public.reconcile_long_quest_stages(
    '77777777-7777-4777-8777-777777776002',
    '[{"id":"77777777-7777-4777-8777-777777777001","name":"Other stage","description":"stolen"}]'::jsonb
  )$$,
  'P0001', 'long quest 77777777-7777-4777-8777-777777776002 not found for calling user',
  'another owner description cannot be edited through the RPC'
);

select throws_ok(
  $$update public.long_quest_stages set done = true where id = '66666666-6666-4666-8666-666666667002'$$,
  'P0001', 'Complete earlier stages first.',
  'description support does not disable the Phase 5 sequence trigger'
);
select lives_ok($$select public.set_long_quest_stage_done('66666666-6666-4666-8666-666666667001', true)$$, 'description edits do not prevent Stage 1 completion');
select lives_ok(
  $$update public.long_quest_stages set description = E'Completed stage\nnotes' where id = '66666666-6666-4666-8666-666666667001'$$,
  'a description can be edited without changing completed progress'
);
select lives_ok($$select public.set_long_quest_stage_done('66666666-6666-4666-8666-666666667002', true)$$, 'Stage 2 still completes only after Stage 1');
select ok((select completed_at is not null from public.long_quests where id = '66666666-6666-4666-8666-666666666001'), 'final completion behavior remains intact');

select * from finish();
rollback;
