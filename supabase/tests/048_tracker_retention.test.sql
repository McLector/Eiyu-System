begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- Local S02 061: 30-day retention after full withdrawal (decision 5B). Synthetic users; rolled back.
-- Users: A (custom withdrawn, removal), B (other owner, data untouched), C (fitness removal), D (first-ever
-- "withdrawal"), F (regrant), G (stale state), P (operator), N (not an operator).
insert into auth.users(id,email,raw_user_meta_data) values
 ('da241000-0000-4000-8000-0000000000a1','ret-a@example.invalid','{}'),
 ('da241000-0000-4000-8000-0000000000b1','ret-b@example.invalid','{}'),
 ('da241000-0000-4000-8000-0000000000c1','ret-c@example.invalid','{}'),
 ('da241000-0000-4000-8000-0000000000d1','ret-d@example.invalid','{}'),
 ('da241000-0000-4000-8000-0000000000f1','ret-f@example.invalid','{}'),
 ('da241000-0000-4000-8000-0000000000a9','ret-g@example.invalid','{}'),
 ('da241000-0000-4000-8000-0000000000aa','ret-p@example.invalid','{}'),
 ('da241000-0000-4000-8000-0000000000ab','ret-n@example.invalid','{}');
insert into private.operator_accounts(user_id) values('da241000-0000-4000-8000-0000000000aa');
create function pg_temp.as_user(u uuid,a text default 'aal1') returns void language sql as $$
 select set_config('request.jwt.claims',json_build_object('sub',u,'aal',a)::text,true),set_config('request.jwt.claim.sub',u::text,true);
$$;
create function pg_temp.state_of(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end;$$;
grant execute on function pg_temp.state_of(text) to authenticated;
create function pg_temp.consent(p text,g boolean) returns void language sql as $$
 select public.set_tracker_processing_consent(p,g,case p when 'custom-tracker' then '2026-10-23-custom-tracker-v1' else '2026-10-23-fitness-tracking-v1' end,
  public.get_tracker_processing_access()->'revision');
$$;
grant execute on function pg_temp.consent(text,boolean) to authenticated;
create function pg_temp.id(u uuid,tag text) returns uuid language sql immutable as $$ select md5(u::text||tag)::uuid; $$;
-- Protected and basic data for one owner: custom + basic + unclassified (legacy) roots, chains, history, receipts, gym, media.
create function pg_temp.seed(u uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims','',true),set_config('request.jwt.claim.sub','',true);
 insert into public.habits(id,user_id,name,easy_version,stat,difficulty) values
  (pg_temp.id(u,'hc'),u,'SECRET-custom','tiny','INT','Easy'),(pg_temp.id(u,'hb'),u,'Quest 2','tiny','STR','Easy'),(pg_temp.id(u,'hl'),u,'LEGACY-unclassified','tiny','WIS','Easy');
 insert into private.tracker_input_provenance(object_kind,object_id,user_id,input_kind,ordinal) values
  ('habit',pg_temp.id(u,'hc'),u,'custom',1),('habit',pg_temp.id(u,'hb'),u,'basic',2);
 insert into public.habit_completions(user_id,habit_id,kind,xp_awarded) values (u,pg_temp.id(u,'hc'),'full',20),(u,pg_temp.id(u,'hb'),'full',20);
 insert into public.deleted_habit_history(user_id,source_habit_id,historical_date,habit_name,stat,quest_type) values
  (u,pg_temp.id(u,'hc'),current_date-3,'SECRET-old-custom','INT','habit'),(u,pg_temp.id(u,'hb'),current_date-3,'Quest 1','STR','habit');
 insert into public.long_quests(id,user_id,name,stat) values (pg_temp.id(u,'qc'),u,'SECRET-chain','INT'),(pg_temp.id(u,'qb'),u,'Chain 2','STR');
 insert into public.long_quest_stages(long_quest_id,user_id,name,position) values (pg_temp.id(u,'qc'),u,'SECRET-stage',1),(pg_temp.id(u,'qb'),u,'Stage 1',1);
 insert into private.tracker_input_provenance(object_kind,object_id,user_id,input_kind,ordinal) values
  ('chain',pg_temp.id(u,'qc'),u,'custom',1),('chain',pg_temp.id(u,'qb'),u,'basic',2);
 insert into private.long_quest_definition_receipts(user_id,request_id,quest_id,input) values
  (u,pg_temp.id(u,'rc'),pg_temp.id(u,'qc'),'{"stages":[{"name":"SECRET-stage"}]}'),(u,pg_temp.id(u,'rb'),pg_temp.id(u,'qb'),'{"stages":[]}');
 insert into public.gym_routines(id,user_id,name,unit) values (pg_temp.id(u,'gr'),u,'SECRET-routine','kg');
 insert into public.gym_exercises(id,routine_id,user_id,name,sets,reps,rest_seconds,rir,media_path,media_mime) values
  (pg_temp.id(u,'ge'),pg_temp.id(u,'gr'),u,'SECRET-lift',3,'5',60,2,u||'/'||pg_temp.id(u,'gr')||'/1-1-1/'||pg_temp.id(u,'gm')||'.gif','image/gif');
 insert into public.gym_sessions(id,routine_id,user_id,routine_name,unit) values (pg_temp.id(u,'gs'),pg_temp.id(u,'gr'),u,'SECRET-routine','kg');
 insert into public.gym_entries(session_id,user_id,exercise_id,position,prescription) values (pg_temp.id(u,'gs'),u,pg_temp.id(u,'ge'),1,'{}');
 insert into storage.objects(bucket_id,name) values ('gym-exercise-media',u||'/'||pg_temp.id(u,'gr')||'/1-1-1/'||pg_temp.id(u,'go')||'.gif');
end;$$;
create function pg_temp.cnt(u uuid) returns jsonb language sql as $$
 select jsonb_build_object(
  'customHabits',(select count(*) from public.habits h join private.tracker_input_provenance p on p.object_id=h.id and p.object_kind='habit' where h.user_id=u and p.input_kind='custom'),
  'basicHabits',(select count(*) from public.habits h join private.tracker_input_provenance p on p.object_id=h.id and p.object_kind='habit' where h.user_id=u and p.input_kind='basic'),
  'legacyHabits',(select count(*) from public.habits h where h.user_id=u and not exists(select 1 from private.tracker_input_provenance p where p.object_id=h.id)),
  'completions',(select count(*) from public.habit_completions where user_id=u),
  'deletedCustom',(select count(*) from public.deleted_habit_history where user_id=u and habit_name like 'SECRET%'),
  'deletedBasic',(select count(*) from public.deleted_habit_history where user_id=u and habit_name not like 'SECRET%'),
  'customChains',(select count(*) from public.long_quests where user_id=u and name like 'SECRET%'),
  'basicChains',(select count(*) from public.long_quests where user_id=u and name not like 'SECRET%'),
  'stages',(select count(*) from public.long_quest_stages where user_id=u),
  'receipts',(select count(*) from private.long_quest_definition_receipts where user_id=u),
  'provenance',(select count(*) from private.tracker_input_provenance where user_id=u),
  'routines',(select count(*) from public.gym_routines where user_id=u),
  'exercises',(select count(*) from public.gym_exercises where user_id=u),
  'sessions',(select count(*) from public.gym_sessions where user_id=u),
  'entries',(select count(*) from public.gym_entries where user_id=u),
  'consentEvents',(select count(*) from private.processing_consent_events where user_id=u),
  'objects',(select count(*) from storage.objects where bucket_id='gym-exercise-media' and name like u||'/%'));
$$;

-- Grants.
select ok(not has_function_privilege('authenticated','private.run_tracker_retention(timestamptz)','execute')
 and not has_function_privilege('anon','private.run_tracker_retention(timestamptz)','execute')
 and not has_function_privilege('service_role','private.run_tracker_retention(timestamptz)','execute'),'the retention job is not client callable');
select ok(has_function_privilege('authenticated','public.get_tracker_retention_notice()','execute')
 and not has_function_privilege('anon','public.get_tracker_retention_notice()','execute')
 and not has_function_privilege('service_role','public.get_tracker_retention_notice()','execute'),'notice: authenticated only');
select ok(has_function_privilege('authenticated','public.operator_list_retention()','execute')
 and not has_function_privilege('anon','public.operator_list_retention()','execute')
 and not has_function_privilege('service_role','public.operator_list_retention()','execute'),'operator list: authenticated only');
select is((select count(*)::integer from (values('anon'),('authenticated'),('service_role')) r(n) where has_table_privilege(r.n,'private.tracker_retention_state','select,insert,update,delete')),0,'no client table access');
select ok((select relrowsecurity from pg_class where oid='private.tracker_retention_state'::regclass),'retention state has RLS');
select is((select count(*)::integer from pg_proc where proname in ('run_tracker_retention','get_tracker_retention_notice','operator_list_retention')
 and pronamespace in ('public'::regnamespace,'private'::regnamespace) and 'search_path=""'<>all(coalesce(proconfig,'{}'))),0,'search_path is empty');
select throws_ok($$select private.run_tracker_retention(null)$$,'22023',null,'a null clock is refused');

-- Retention is off (065 open tracker): withdrawing a permission starts no clock, the job reminds and
-- removes nobody, and nothing is deleted. The 061/062 schedule and removal rules are not exercised because
-- nothing runs; the removal routine itself is left in place, unused.
-- A and B: consent, data, withdrawal.
select pg_temp.seed('da241000-0000-4000-8000-0000000000a1'),pg_temp.seed('da241000-0000-4000-8000-0000000000b1');
select pg_temp.as_user('da241000-0000-4000-8000-0000000000a1');
set local role authenticated;
select pg_temp.consent('custom-tracker',true);
select pg_temp.consent('fitness-tracking',true);
reset role;
select is((select count(*)::integer from private.tracker_retention_state),0,'granting starts no clock');
select pg_temp.as_user('da241000-0000-4000-8000-0000000000b1');
set local role authenticated;
select pg_temp.consent('custom-tracker',true);
select pg_temp.consent('fitness-tracking',true);
reset role;
create temp table snap as select pg_temp.cnt('da241000-0000-4000-8000-0000000000a1') a,pg_temp.cnt('da241000-0000-4000-8000-0000000000b1') b;
select is((select a->>'customHabits' from snap)||(select a->>'basicHabits' from snap)||(select a->>'legacyHabits' from snap),'111','fixture: one custom, one basic, one legacy habit');
select pg_temp.as_user('da241000-0000-4000-8000-0000000000a1');
set local role authenticated;
select pg_temp.consent('custom-tracker',false);
reset role;
select is((select count(*)::integer from private.tracker_retention_state where user_id='da241000-0000-4000-8000-0000000000a1'),0,'a full withdrawal starts no retention state');
select is((select count(*)::integer from private.tracker_retention_state where user_id='da241000-0000-4000-8000-0000000000b1'),0,'other owners have no state');
select pg_temp.as_user('da241000-0000-4000-8000-0000000000a1');
set local role authenticated;
select pg_temp.consent('custom-tracker',true);
select pg_temp.consent('custom-tracker',false);
reset role;
select is((select count(*)::integer from private.tracker_retention_state where user_id='da241000-0000-4000-8000-0000000000a1'),0,'a regrant and a second withdrawal start none either');

-- Notice: nothing pending, for anyone.
select pg_temp.as_user('da241000-0000-4000-8000-0000000000a1');
set local role authenticated;
select is(public.get_tracker_retention_notice(),'[]'::jsonb,'the withdrawing account sees no removal notice');
reset role;
select pg_temp.as_user('da241000-0000-4000-8000-0000000000b1');
set local role authenticated;
select is(public.get_tracker_retention_notice(),'[]'::jsonb,'another account sees none of it');
reset role;
select set_config('request.jwt.claims','',true),set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select is(pg_temp.state_of($$select public.get_tracker_retention_notice()$$),'42501','notice needs sign-in');
reset role;

-- The job does nothing on any date, even with a stray pending row (for example from before the unblock).
insert into private.tracker_retention_state(user_id,purpose,withdrawn_at,reminder_due_on,removal_due_on)
 values('da241000-0000-4000-8000-0000000000a1','custom-tracker',statement_timestamp()-interval '90 days',current_date-66,current_date-59);
select is(private.run_tracker_retention(statement_timestamp()+interval '24 days'),'{"reminded":0,"removed":0}'::jsonb,'no reminder on any date');
select is(private.run_tracker_retention(statement_timestamp()+interval '31 days'),'{"reminded":0,"removed":0}'::jsonb,'no removal after 31 days');
select is(private.run_tracker_retention(statement_timestamp()+interval '1000 days'),'{"reminded":0,"removed":0}'::jsonb,'and none years later');
select is(pg_temp.cnt('da241000-0000-4000-8000-0000000000a1')-'consentEvents',(select a-'consentEvents' from snap),'every record of the withdrawing owner is kept, custom, Gym and media included');
select is(pg_temp.cnt('da241000-0000-4000-8000-0000000000b1'),(select b from snap),'another owner is untouched');
select ok((select removed_at is null and reminded_at is null and last_failed_at is null from private.tracker_retention_state where user_id='da241000-0000-4000-8000-0000000000a1'),'and the stray row is untouched');
delete from private.tracker_retention_state where user_id='da241000-0000-4000-8000-0000000000a1';

-- C: a fitness withdrawal queues no media cleanup.
select pg_temp.seed('da241000-0000-4000-8000-0000000000c1');
select pg_temp.as_user('da241000-0000-4000-8000-0000000000c1');
set local role authenticated;
select pg_temp.consent('custom-tracker',true);
select pg_temp.consent('fitness-tracking',true);
select pg_temp.consent('fitness-tracking',false);
reset role;
select is((select count(*)::integer from private.tracker_retention_state where user_id='da241000-0000-4000-8000-0000000000c1'),0,'a fitness withdrawal starts no clock');
select is((select count(*)::integer from public.gym_media_cleanup where user_id='da241000-0000-4000-8000-0000000000c1'),0,'and queues no media cleanup');
select is((select concat_ws(',',x->>'routines',x->>'exercises',x->>'sessions',x->>'entries') from (select pg_temp.cnt('da241000-0000-4000-8000-0000000000c1') x) q),'1,1,1,1','routines, exercises, sessions and entries are kept');

-- D: a first-ever "withdrawal" (never granted) starts no clock.
select pg_temp.as_user('da241000-0000-4000-8000-0000000000d1');
set local role authenticated;
select pg_temp.consent('custom-tracker',false);
reset role;
select is((select count(*)::integer from private.tracker_retention_state where user_id='da241000-0000-4000-8000-0000000000d1'),0,'withdrawing a never-granted purpose starts no clock');

-- F: a regrant keeps its data under any later run.
select pg_temp.seed('da241000-0000-4000-8000-0000000000f1');
select pg_temp.as_user('da241000-0000-4000-8000-0000000000f1');
set local role authenticated;
select pg_temp.consent('custom-tracker',true);
select pg_temp.consent('custom-tracker',false);
select pg_temp.consent('custom-tracker',true);
reset role;
select private.run_tracker_retention(statement_timestamp()+interval '60 days');
select is(pg_temp.cnt('da241000-0000-4000-8000-0000000000f1')->>'customHabits','1','regranted purpose keeps its data');

-- G: a completed removal stays as a record and a pending row is left alone; the operator list shows both.
select pg_temp.seed('da241000-0000-4000-8000-0000000000a9');
insert into private.tracker_retention_state(user_id,purpose,withdrawn_at,reminder_due_on,removal_due_on,removed_at)
 values('da241000-0000-4000-8000-0000000000a1','custom-tracker',statement_timestamp()-interval '40 days',current_date-16,current_date-9,statement_timestamp()-interval '9 days');
insert into private.tracker_retention_state(user_id,purpose,withdrawn_at,reminder_due_on,removal_due_on)
 values('da241000-0000-4000-8000-0000000000c1','fitness-tracking',statement_timestamp()-interval '5 days',current_date+19,current_date+26);
select is(private.run_tracker_retention(statement_timestamp()+interval '60 days'),'{"reminded":0,"removed":0}'::jsonb,'a recorded removal and a pending row both stay as they are');
select is(pg_temp.cnt('da241000-0000-4000-8000-0000000000a9')->>'customHabits','1','and nobody else is touched');

-- Operator retention list.
select pg_temp.as_user('da241000-0000-4000-8000-0000000000ab','aal2');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_list_retention()$$),'42501','non-operator refused');
reset role;
select pg_temp.as_user('da241000-0000-4000-8000-0000000000aa','aal1');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_list_retention()$$),'42501','operator at aal1 refused');
reset role;
select pg_temp.as_user('da241000-0000-4000-8000-0000000000aa','aal2');
set local role authenticated;
select is((select jsonb_agg(distinct k order by k) from jsonb_array_elements(public.operator_list_retention()) e,jsonb_object_keys(e) k),
 '["email","purpose","reminderDueOn","removalDueOn","status","withdrawnAt"]'::jsonb,'retention list keys');
select ok((select bool_or(e->>'email'='ret-a@example.invalid' and e->>'status'='removed' and e->>'purpose'='custom-tracker') from jsonb_array_elements(public.operator_list_retention()) e),'a recorded removal is listed with its status');
select ok((select bool_or(e->>'email'='ret-c@example.invalid' and e->>'purpose'='fitness-tracking') from jsonb_array_elements(public.operator_list_retention()) e),'a stray fitness row is listed');
select ok(public.operator_list_retention()::text !~* 'SECRET|birth|1990-01-01|2010-01-01','no content or birthday in the list');
reset role;
select is((select count(*)::integer from private.operator_audit where action='list-retention' and operator_id='da241000-0000-4000-8000-0000000000aa'),4,'list audited per successful call');
select * from finish();
rollback;
