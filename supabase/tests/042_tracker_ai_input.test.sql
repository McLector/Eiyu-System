begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local timezone='UTC';
select no_plan();
-- Local S02 Task 4: service-only canonical weekly input. Synthetic users; rolled back.
insert into auth.users(id,email,raw_user_meta_data) values
 ('da230400-0000-4000-8000-000000000001','ai-mixed@example.invalid','{"birth_date":"2000-01-01"}'),
 ('da230400-0000-4000-8000-000000000002','ai-basic@example.invalid','{"birth_date":"2000-01-01"}'),
 ('da230400-0000-4000-8000-000000000003','ai-deleted@example.invalid','{"birth_date":"2000-01-01"}'),
 ('da230400-0000-4000-8000-000000000004','ai-unproved@example.invalid','{"birth_date":"2000-01-01"}'),
 ('da230400-0000-4000-8000-000000000005','ai-many@example.invalid','{"birth_date":"2000-01-01"}'),
 ('da230400-0000-4000-8000-000000000006','ai-other@example.invalid','{"birth_date":"2000-01-01"}');
update private.mailbox_state set verified_version=version,verified_at=now()
 where user_id::text like 'da230400-%' and user_id<>'da230400-0000-4000-8000-000000000004';
insert into private.processing_consent(user_id,age_granted,age_notice,ai_granted,ai_notice,version)
 select id,true,'2026-11-08-adult-v1',true,'2026-11-08-weekly-debrief-v2',2 from auth.users where id::text like 'da230400-%';
create function pg_temp.week() returns date language sql as $$ select (current_date-(extract(isodow from current_date)::integer-1)) $$;
create function pg_temp.expected(u uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('userId',u,'ageVersion',a->'ageVersion','mailboxVersion',a->'mailboxVersion',
  'consentVersion',a->'consentVersion','authorityVersion',a->'authorityVersion') from (select private.processing_access(u) a) s
$$;
create function pg_temp.input(u uuid,w date default pg_temp.week(),e jsonb default null) returns jsonb language sql as $$
 select public.ai_tracker_week_input(u,w,coalesce(e,pg_temp.expected(u)))
$$;
insert into public.habits(id,user_id,name,easy_version,stat) values
 ('da230400-0000-4000-8000-000000000011','da230400-0000-4000-8000-000000000001','Quest 1','Take one small step','STR'),
 ('da230400-0000-4000-8000-000000000012','da230400-0000-4000-8000-000000000001','Secret custom quest','small','INT'),
 ('da230400-0000-4000-8000-000000000021','da230400-0000-4000-8000-000000000002','Quest 1','Take one small step','DEX');
insert into private.tracker_input_provenance(object_kind,object_id,user_id,input_kind,ordinal) values
 ('habit','da230400-0000-4000-8000-000000000011','da230400-0000-4000-8000-000000000001','basic',1),
 ('habit','da230400-0000-4000-8000-000000000021','da230400-0000-4000-8000-000000000002','basic',1);
insert into public.habit_completions(user_id,habit_id,completed_on,kind,xp_awarded) values
 ('da230400-0000-4000-8000-000000000001','da230400-0000-4000-8000-000000000011',pg_temp.week(),'full',20),
 ('da230400-0000-4000-8000-000000000001','da230400-0000-4000-8000-000000000012',pg_temp.week(),'full',20),
 ('da230400-0000-4000-8000-000000000002','da230400-0000-4000-8000-000000000021',pg_temp.week(),'full',20),
 ('da230400-0000-4000-8000-000000000002','da230400-0000-4000-8000-000000000021',pg_temp.week()+1,'easy',4);
insert into public.deleted_habit_history(source_habit_id,user_id,historical_date,habit_name,stat,quest_type,scheduled,completion_kind)
 values('da230400-0000-4000-8000-000000000031','da230400-0000-4000-8000-000000000003',pg_temp.week(),'Unclassified legacy name','WIS','habit',true,'full');
-- 101 live basic roots with one completion each.
insert into public.habits(id,user_id,name,easy_version,stat)
 select ('da230400-0000-4000-9000-'||lpad(i::text,12,'0'))::uuid,'da230400-0000-4000-8000-000000000005','Quest '||i,'Take one small step','STR' from generate_series(1,101) i;
insert into private.tracker_input_provenance(object_kind,object_id,user_id,input_kind,ordinal)
 select 'habit',('da230400-0000-4000-9000-'||lpad(i::text,12,'0'))::uuid,'da230400-0000-4000-8000-000000000005','basic',i from generate_series(1,101) i;
insert into public.habit_completions(user_id,habit_id,completed_on,kind,xp_awarded)
 select 'da230400-0000-4000-8000-000000000005',('da230400-0000-4000-9000-'||lpad(i::text,12,'0'))::uuid,pg_temp.week(),'full',20 from generate_series(1,101) i;
create temp table counts_before as select (select count(*) from private.ai_logical_requests) requests,(select count(*) from private.ai_execution_details) details;
select has_function('public','ai_tracker_week_input',array['uuid','date','jsonb'],'canonical input RPC exists');
select ok(not has_function_privilege('authenticated','public.ai_tracker_week_input(uuid,date,jsonb)','execute'),'clients cannot call the canonical input RPC');
select ok(not has_function_privilege('anon','public.ai_tracker_week_input(uuid,date,jsonb)','execute'),'anonymous cannot call it');
select ok(has_function_privilege('service_role','public.ai_tracker_week_input(uuid,date,jsonb)','execute'),'service role can call it');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230400-0000-4000-8000-000000000002',true);
select throws_ok($$select public.ai_tracker_week_input('da230400-0000-4000-8000-000000000002',date_trunc('week',current_date)::date,'{}')$$,'42501',null,'authenticated role is refused even for its own account');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
-- Basic-only owner: neutral names, no fitness grant required.
select is(pg_temp.input('da230400-0000-4000-8000-000000000002'),
 '{"habits":[{"name":"Quest 1","stat":"DEX","fullCount":1,"easyCount":1}],"statTotals":{"STR":0,"INT":0,"DEX":2,"WIS":0,"CHA":0}}'::jsonb,
 'basic-only account yields the same bounded names/counts/totals as the client gatherer');
-- Open tracker (065): custom quests need no separate permission, so a mixed owner's named quests and
-- unclassified deleted history are included with no grant at all.
select is(jsonb_array_length(pg_temp.input('da230400-0000-4000-8000-000000000001')->'habits'),2,'open tracker: custom input is included with no grant');
select is(pg_temp.input('da230400-0000-4000-8000-000000000003')#>>'{habits,0,name}','Unclassified legacy name','open tracker: unclassified deleted history is included with no grant');
reset role;
update private.processing_consent set fitness_granted=true,fitness_notice='2026-10-23-fitness-tracking-v1',version=version+1 where user_id in('da230400-0000-4000-8000-000000000001','da230400-0000-4000-8000-000000000003');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(jsonb_array_length(pg_temp.input('da230400-0000-4000-8000-000000000001')->'habits'),2,'open tracker: a fitness grant changes nothing about custom input');
reset role;
update private.processing_consent set custom_granted=true,custom_notice='2026-10-23-custom-tracker-v1',version=version+1 where user_id in('da230400-0000-4000-8000-000000000001','da230400-0000-4000-8000-000000000003');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(jsonb_array_length(pg_temp.input('da230400-0000-4000-8000-000000000001')->'habits'),2,'current custom permission includes custom input');
select is(pg_temp.input('da230400-0000-4000-8000-000000000003')#>>'{habits,0,name}','Unclassified legacy name','permitted deleted history is retained');
select ok(not (pg_temp.input('da230400-0000-4000-8000-000000000001')::text like '%da230400-0000-4000-8000-000000000021%'),'another owner is never read');
-- Contract failures.
select throws_ok($$select pg_temp.input('da230400-0000-4000-8000-000000000002',pg_temp.week()-7)$$,'22023',null,'only the current calendar week is accepted');
select throws_ok($$select pg_temp.input('da230400-0000-4000-8000-000000000002',pg_temp.week()+1)$$,'22023',null,'a non-Monday date is refused');
select throws_ok($$select pg_temp.input('da230400-0000-4000-8000-000000000002',pg_temp.week(),pg_temp.expected('da230400-0000-4000-8000-000000000006'))$$,'22023',null,'expected object for a different owner refuses');
select throws_ok($$select pg_temp.input('da230400-0000-4000-8000-000000000002',pg_temp.week(),pg_temp.expected('da230400-0000-4000-8000-000000000002')||'{"extra":1}')$$,'22023',null,'unknown expected keys refuse');
select throws_ok($$select pg_temp.input('da230400-0000-4000-8000-000000000002',pg_temp.week(),jsonb_set(pg_temp.expected('da230400-0000-4000-8000-000000000002'),'{consentVersion}',to_jsonb(99)))$$,'EP002',null,'held consent revision change denies');
select throws_ok($$select pg_temp.input('da230400-0000-4000-8000-000000000002',pg_temp.week(),jsonb_set(pg_temp.expected('da230400-0000-4000-8000-000000000002'),'{authorityVersion}','"x"'))$$,'22023',null,'non-integer revision refuses');
select throws_ok($$select pg_temp.input('da230400-0000-4000-8000-000000000004')$$,'EM001',null,'unverified mailbox denies the debrief input');
select throws_ok($$select pg_temp.input('da230400-0000-4000-8000-000000000005')$$,'22023',null,'more than 100 habits is rejected, not truncated');
reset role;
select is((select requests from counts_before),(select count(*) from private.ai_logical_requests),'input reads charge no quota receipt');
select is((select details from counts_before),(select count(*) from private.ai_execution_details),'input reads register no execution');
select * from finish();
rollback;
