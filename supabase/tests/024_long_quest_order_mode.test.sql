begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(37);

-- Fixtures (ids 24000000-...): Q1 free, Q2 default (strict), Q3 free with a gap
-- (done, open, done), Q4 free with a done prefix, Q5 free for the receipt RPC.
insert into auth.users (id, email, raw_user_meta_data) values
  ('24000000-0000-4000-8000-000000000001', 'order24-a@example.invalid', '{"display_name":"Order A"}'),
  ('24000000-0000-4000-8000-000000000002', 'order24-b@example.invalid', '{"display_name":"Order B"}');

insert into public.long_quests (id, user_id, name, stat, strict_order) values
  ('24000000-0000-4000-8000-000000000011', '24000000-0000-4000-8000-000000000001', 'Free quest', 'STR', false),
  ('24000000-0000-4000-8000-000000000013', '24000000-0000-4000-8000-000000000001', 'Gap quest', 'DEX', false),
  ('24000000-0000-4000-8000-000000000014', '24000000-0000-4000-8000-000000000001', 'Prefix quest', 'WIS', false),
  ('24000000-0000-4000-8000-000000000015', '24000000-0000-4000-8000-000000000001', 'Receipt quest', 'CHA', false);
insert into public.long_quests (id, user_id, name, stat) values
  ('24000000-0000-4000-8000-000000000012', '24000000-0000-4000-8000-000000000001', 'Default quest', 'INT');

insert into public.long_quest_stages (id, long_quest_id, user_id, name, position, done) values
  ('24000000-0000-4000-8000-000000000021', '24000000-0000-4000-8000-000000000011', '24000000-0000-4000-8000-000000000001', 'Free 1', 0, false),
  ('24000000-0000-4000-8000-000000000022', '24000000-0000-4000-8000-000000000011', '24000000-0000-4000-8000-000000000001', 'Free 2', 1, false),
  ('24000000-0000-4000-8000-000000000023', '24000000-0000-4000-8000-000000000011', '24000000-0000-4000-8000-000000000001', 'Free 3', 2, false),
  ('24000000-0000-4000-8000-000000000031', '24000000-0000-4000-8000-000000000012', '24000000-0000-4000-8000-000000000001', 'Default 1', 0, false),
  ('24000000-0000-4000-8000-000000000032', '24000000-0000-4000-8000-000000000012', '24000000-0000-4000-8000-000000000001', 'Default 2', 1, false),
  ('24000000-0000-4000-8000-000000000033', '24000000-0000-4000-8000-000000000012', '24000000-0000-4000-8000-000000000001', 'Default 3', 2, false),
  ('24000000-0000-4000-8000-000000000041', '24000000-0000-4000-8000-000000000013', '24000000-0000-4000-8000-000000000001', 'Gap 1', 0, true),
  ('24000000-0000-4000-8000-000000000042', '24000000-0000-4000-8000-000000000013', '24000000-0000-4000-8000-000000000001', 'Gap 2', 1, false),
  ('24000000-0000-4000-8000-000000000043', '24000000-0000-4000-8000-000000000013', '24000000-0000-4000-8000-000000000001', 'Gap 3', 2, true),
  ('24000000-0000-4000-8000-000000000051', '24000000-0000-4000-8000-000000000014', '24000000-0000-4000-8000-000000000001', 'Prefix 1', 0, true),
  ('24000000-0000-4000-8000-000000000052', '24000000-0000-4000-8000-000000000014', '24000000-0000-4000-8000-000000000001', 'Prefix 2', 1, true),
  ('24000000-0000-4000-8000-000000000053', '24000000-0000-4000-8000-000000000014', '24000000-0000-4000-8000-000000000001', 'Prefix 3', 2, false),
  ('24000000-0000-4000-8000-000000000061', '24000000-0000-4000-8000-000000000015', '24000000-0000-4000-8000-000000000001', 'Receipt 1', 0, false),
  ('24000000-0000-4000-8000-000000000062', '24000000-0000-4000-8000-000000000015', '24000000-0000-4000-8000-000000000001', 'Receipt 2', 1, false);

select has_column('public', 'long_quests', 'strict_order', 'long quests carry an order mode');
select is((select strict_order from public.long_quests where id = '24000000-0000-4000-8000-000000000012'), true, 'a quest created without a mode stays in order');

set local role authenticated;
set local "request.jwt.claim.sub" = '24000000-0000-4000-8000-000000000001';

-- Free mode: any order, any undo, same rewards.
select lives_ok($$select public.set_long_quest_stage_done('24000000-0000-4000-8000-000000000023', true)$$, 'free: the last stage can be done first');
select is((select done from public.long_quest_stages where id = '24000000-0000-4000-8000-000000000023'), true, 'free: the early completion persists');
select lives_ok($$select public.set_long_quest_stage_done('24000000-0000-4000-8000-000000000021', true)$$, 'free: the first stage can be done after');
select lives_ok($$select public.set_long_quest_stage_done('24000000-0000-4000-8000-000000000021', false)$$, 'free: an earlier stage can be undone while a later one is done');
select ok((select completed_at is null from public.long_quests where id = '24000000-0000-4000-8000-000000000011'), 'free: no completion marker while a stage is open');
select is((select xp from public.stats where user_id = '24000000-0000-4000-8000-000000000001' and stat = 'STR'), 20, 'free: the one done stage paid once');
select lives_ok($$select public.set_long_quest_stage_done('24000000-0000-4000-8000-000000000021', true), public.set_long_quest_stage_done('24000000-0000-4000-8000-000000000022', true)$$, 'free: the remaining stages complete');
select ok((select completed_at is not null from public.long_quests where id = '24000000-0000-4000-8000-000000000011'), 'free: all stages done completes the quest');
select is((select xp from public.stats where user_id = '24000000-0000-4000-8000-000000000001' and stat = 'STR'), 80, 'free: three stages and the bonus');
select lives_ok($$select public.set_long_quest_stage_done('24000000-0000-4000-8000-000000000022', false)$$, 'free: a middle stage can be undone');
select is((select xp from public.stats where user_id = '24000000-0000-4000-8000-000000000001' and stat = 'STR'), 40, 'free: undoing a stage takes back its XP and the bonus');
select lives_ok($$select public.set_long_quest_stage_done('24000000-0000-4000-8000-000000000022', true)$$, 'free: the stage can be done again');
select is((select xp from public.stats where user_id = '24000000-0000-4000-8000-000000000001' and stat = 'STR'), 80, 'free: redoing pays once, never twice');

-- A quest left in order still enforces it.
select throws_ok($$select public.set_long_quest_stage_done('24000000-0000-4000-8000-000000000033', true)$$, 'P0001', 'Complete earlier stages first.', 'in order: a stage still cannot skip its predecessors');

-- The receipt RPC rides on the same rule.
select is((select (public.set_long_quest_stage_done_receipt('24000000-0000-4000-8000-000000000062', true, '24000000-0000-4000-8000-0000000000a1')->>'changed')::boolean), true, 'free: the receipt RPC completes a later stage first');

-- Editing the stage list in a free quest may leave a done stage after an open one.
select lives_ok($$select public.reconcile_long_quest_stages('24000000-0000-4000-8000-000000000013',
  '[{"id":"24000000-0000-4000-8000-000000000041","name":"Gap 1","description":null},{"id":"24000000-0000-4000-8000-000000000042","name":"Gap 2","description":null},{"id":"24000000-0000-4000-8000-000000000043","name":"Gap 3","description":null}]'::jsonb)$$, 'free: reconcile keeps a gap');

-- Free to in order needs the done stages to form a prefix.
set constraints validate_long_quest_order_mode immediate;
select throws_ok($$update public.long_quests set strict_order = true where id = '24000000-0000-4000-8000-000000000013'$$, 'P0001', 'Long Quest stages must form a completed prefix.', 'a direct write cannot make a gapped quest in order');
select is((select strict_order from public.long_quests where id = '24000000-0000-4000-8000-000000000013'), false, 'the refused switch leaves the quest free');
set constraints validate_long_quest_order_mode deferred;

select throws_ok($$select public.save_long_quest_definition('24000000-0000-4000-8000-000000000013', '24000000-0000-4000-8000-0000000000b1',
  '{"name":"Gap quest","stat":"DEX","description":null,"strictOrder":true,"stages":[{"id":"24000000-0000-4000-8000-000000000041","name":"Gap 1","description":null},{"id":"24000000-0000-4000-8000-000000000042","name":"Gap 2","description":null},{"id":"24000000-0000-4000-8000-000000000043","name":"Gap 3","description":null}]}'::jsonb, false)$$,
  'P0001', 'Mark the later done stages not done before keeping stages in order.', 'the save refuses a gapped quest in order with a clear message');
select is((select strict_order from public.long_quests where id = '24000000-0000-4000-8000-000000000013'), false, 'the refused save leaves the quest free');

select lives_ok($$select public.save_long_quest_definition('24000000-0000-4000-8000-000000000014', '24000000-0000-4000-8000-0000000000b2',
  '{"name":"Prefix quest","stat":"WIS","description":null,"strictOrder":true,"stages":[{"id":"24000000-0000-4000-8000-000000000051","name":"Prefix 1","description":null},{"id":"24000000-0000-4000-8000-000000000052","name":"Prefix 2","description":null},{"id":"24000000-0000-4000-8000-000000000053","name":"Prefix 3","description":null}]}'::jsonb, false)$$, 'a done prefix may switch to in order');
select is((select strict_order from public.long_quests where id = '24000000-0000-4000-8000-000000000014'), true, 'the switch persisted');
select lives_ok($$select public.save_long_quest_definition('24000000-0000-4000-8000-000000000014', '24000000-0000-4000-8000-0000000000b3',
  '{"name":"Prefix quest","stat":"WIS","description":null,"strictOrder":false,"stages":[{"id":"24000000-0000-4000-8000-000000000051","name":"Prefix 1","description":null},{"id":"24000000-0000-4000-8000-000000000052","name":"Prefix 2","description":null},{"id":"24000000-0000-4000-8000-000000000053","name":"Prefix 3","description":null}]}'::jsonb, false)$$, 'in order may always switch to free');
select is((select strict_order from public.long_quests where id = '24000000-0000-4000-8000-000000000014'), false, 'the switch to free persisted');

-- Dropping the open stage that causes the gap and switching in one save works.
select lives_ok($$select public.save_long_quest_definition('24000000-0000-4000-8000-000000000013', '24000000-0000-4000-8000-0000000000b4',
  '{"name":"Gap quest","stat":"DEX","description":null,"strictOrder":true,"stages":[{"id":"24000000-0000-4000-8000-000000000041","name":"Gap 1","description":null},{"id":"24000000-0000-4000-8000-000000000043","name":"Gap 3","description":null}]}'::jsonb, false)$$, 'removing the gap and switching to in order in one save works');
select lives_ok($$set constraints all immediate$$, 'the deferred checks pass at commit time');
set constraints all deferred;
select is((select strict_order from public.long_quests where id = '24000000-0000-4000-8000-000000000013'), true, 'the quest is now in order');
select is((select count(*) from public.long_quest_stages where long_quest_id = '24000000-0000-4000-8000-000000000013'), 2::bigint, 'only the open stage was removed');

-- Older clients never send the key: the mode stays; a new quest starts in order.
select lives_ok($$select public.save_long_quest_definition('24000000-0000-4000-8000-000000000011', '24000000-0000-4000-8000-0000000000b5',
  '{"name":"Free quest","stat":"STR","description":null,"stages":[{"id":"24000000-0000-4000-8000-000000000021","name":"Free 1","description":null},{"id":"24000000-0000-4000-8000-000000000022","name":"Free 2","description":null},{"id":"24000000-0000-4000-8000-000000000023","name":"Free 3","description":null}]}'::jsonb, false)$$, 'a save without the key succeeds');
select is((select strict_order from public.long_quests where id = '24000000-0000-4000-8000-000000000011'), false, 'a save without the key keeps the quest free');
select is(public.save_long_quest_definition('24000000-0000-4000-8000-000000000016', '24000000-0000-4000-8000-0000000000b6',
  '{"name":"Brand new","stat":"INT","description":null,"stages":[{"name":"Only stage","description":null}]}'::jsonb, true), '24000000-0000-4000-8000-000000000016'::uuid, 'a new quest is created without the key');
select is((select strict_order from public.long_quests where id = '24000000-0000-4000-8000-000000000016'), true, 'a new quest without the key is in order');

-- Another account cannot change the mode; clients cannot run the trigger function.
set local "request.jwt.claim.sub" = '24000000-0000-4000-8000-000000000002';
select throws_ok($$select public.save_long_quest_definition('24000000-0000-4000-8000-000000000011', '24000000-0000-4000-8000-0000000000b7',
  '{"name":"Free quest","stat":"STR","description":null,"strictOrder":true,"stages":[{"id":"24000000-0000-4000-8000-000000000021","name":"Free 1","description":null}]}'::jsonb, false)$$, 'P0001', 'Long Quest not found.', 'another account cannot switch the mode');
select ok(not has_function_privilege('public.validate_long_quest_order_mode()', 'execute'), 'clients cannot run the order-mode trigger function');

-- A missing quest row must read as in order, never as free (the guard runs as the caller).
reset role;
select ok(
  (select bool_and(pg_get_functiondef(p.oid) ilike '%coalesce(%strict_order%true)%')
   from pg_proc p
   where p.oid in (to_regprocedure('public.guard_long_quest_stage_sequence()'),
                   to_regprocedure('public.assert_long_quest_stage_sequence(uuid)'),
                   to_regprocedure('public.set_long_quest_stage_done(uuid,boolean)'),
                   to_regprocedure('public.reconcile_long_quest_stages(uuid,jsonb)'))),
  'every order check reads the mode through coalesce(..., true)');

select * from finish();
rollback;
