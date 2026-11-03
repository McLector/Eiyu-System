begin;
set search_path=public,extensions;
select plan(19);

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
create function pg_temp.sd(stage uuid, done boolean) returns jsonb
language sql set search_path = '' as $$
  select pg_temp.gw(
    'set_long_quest_stage_done_receipt',
    jsonb_build_object('p_stage_id', stage, 'p_done', done, 'p_request_id', gen_random_uuid()),
    jsonb_build_array(jsonb_build_object('kind', 'chain',
      'id', (select s.long_quest_id from public.long_quest_stages s where s.id = stage), 'inputKind', 'custom'))
  );
$$;
insert into auth.users(id,email,raw_user_meta_data) values
('16000000-0000-4000-8000-000000000001','rewards16@example.invalid','{"display_name":"Rewards","birth_date":"2000-01-01"}'),
('16000000-0000-4000-8000-000000000099','rewards16-other@example.invalid','{"display_name":"Other","birth_date":"2000-01-01"}');
insert into public.long_quests(id,user_id,name,stat) values
('16000000-0000-4000-8000-000000000002','16000000-0000-4000-8000-000000000001','Reward quest','STR');
insert into public.long_quest_stages(id,long_quest_id,user_id,name,position) values
('16000000-0000-4000-8000-000000000003','16000000-0000-4000-8000-000000000002','16000000-0000-4000-8000-000000000001','First',0),
('16000000-0000-4000-8000-000000000004','16000000-0000-4000-8000-000000000002','16000000-0000-4000-8000-000000000001','Last',1);
-- Simulate pre-rollout completions with the same zero-value exemption records as migration 032.
insert into public.long_quests(id,user_id,name,stat) values
('16000000-0000-4000-8000-000000000005','16000000-0000-4000-8000-000000000001','Legacy quest','INT');
insert into public.long_quest_stages(id,long_quest_id,user_id,name,position,done) values
('16000000-0000-4000-8000-000000000006','16000000-0000-4000-8000-000000000005','16000000-0000-4000-8000-000000000001','Legacy',0,true);
insert into public.long_quest_rewards(user_id,quest_id,reward_key,kind,stat,amount,legacy_exempt) values
('16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000005','16000000-0000-4000-8000-000000000006','stage','INT',0,true),
('16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000005','16000000-0000-4000-8000-000000000005','bonus','INT',0,true);
set local role authenticated;
set local "request.jwt.claim.sub"='16000000-0000-4000-8000-000000000001';
select public.set_tracker_processing_consent(
  'custom-tracker', true, '2026-10-23-custom-tracker-v1',
  public.get_tracker_processing_access()->'revision'
);
select lives_ok($$select pg_temp.sd('16000000-0000-4000-8000-000000000003', true)$$,'first stage completes');
select is((select xp from public.stats where stat='STR'),20,'stage awards 20');
select lives_ok($$select pg_temp.sd('16000000-0000-4000-8000-000000000003', true)$$,'duplicate completion no-op');
select is((select xp from public.stats where stat='STR'),20,'duplicate does not award again');
select throws_ok($$update public.long_quest_stages set done=true where id='16000000-0000-4000-8000-000000000004'$$,'42501',null,'clients can no longer complete stages directly');
-- The reward trigger is the boundary for every write path; exercise it as the owner.
reset role;
select lives_ok($$update public.long_quest_stages set done=true where id='16000000-0000-4000-8000-000000000004'$$,'direct completion uses same reward boundary');
set local role authenticated;
select is((select xp from public.stats where stat='STR'),60,'last stage plus bonus');
select lives_ok($$select pg_temp.sd('16000000-0000-4000-8000-000000000004', false)$$,'undo last stage');
select is((select xp from public.stats where stat='STR'),20,'undo removes stage and bonus');
select pg_temp.gw('chain-save','{"p_id":"16000000-0000-4000-8000-000000000002","p_request_id":"16000000-0000-4000-8000-0000000000a1","p_create":false,"p_mode":"custom","p_input":{"name":"Reward quest","stat":"INT","stages":[{"id":"16000000-0000-4000-8000-000000000003","name":"First"},{"id":"16000000-0000-4000-8000-000000000004","name":"Last"}]}}','[{"kind":"chain","id":"16000000-0000-4000-8000-000000000002","inputKind":"custom"}]');
select pg_temp.sd('16000000-0000-4000-8000-000000000004', true);
select is((select xp from public.stats where stat='STR'),60,'redo credits original recorded stat');
select is((select xp from public.stats where stat='INT'),0,'stat edit cannot redirect redo');
select throws_ok($$update public.long_quest_rewards set amount=200$$,'42501',null,'ledger cannot be written by client');
select throws_ok($$update public.stats set xp=1000$$,'42501',null,'stats remain server-owned');
select lives_ok($$select pg_temp.sd('16000000-0000-4000-8000-000000000006', false)$$,'legacy stage can be undone');
select lives_ok($$select pg_temp.sd('16000000-0000-4000-8000-000000000006', true)$$,'legacy stage can be redone');
select is((select xp from public.stats where stat='INT'),0,'legacy undo/redo never backdates XP');
select is((select count(*) from public.long_quest_rewards where active),3::bigint,'exactly two stages and one bonus remain active');
select lives_ok($$select pg_temp.gw('chain-delete','{"p_id":"16000000-0000-4000-8000-000000000002"}','[{"kind":"chain","id":"16000000-0000-4000-8000-000000000002","inputKind":"custom"}]')$$,'definition deletion keeps earned history');
set local "request.jwt.claim.sub"='16000000-0000-4000-8000-000000000099';
select throws_ok($$select pg_temp.sd('16000000-0000-4000-8000-000000000004', false)$$,'42501','Tracker target unavailable.','other account cannot mutate');
select * from finish();
rollback;
