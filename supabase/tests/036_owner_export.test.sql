begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_function('public','owner_export_snapshot',array['uuid','uuid'],'owner snapshot RPC exists');
select has_function('public','owner_export_check',array['uuid','uuid','integer'],'fresh confirmation RPC exists');
select ok(not has_function_privilege('authenticated','public.owner_export_snapshot(uuid,uuid)','EXECUTE'),'client cannot select export owner');
select ok(not has_function_privilege('anon','public.owner_export_check(uuid,uuid,integer)','EXECUTE'),'anonymous cannot confirm export');
select ok(has_function_privilege('service_role','public.owner_export_snapshot(uuid,uuid)','EXECUTE'),'trusted handler can request snapshot');
select ok(not has_function_privilege('service_role','private.owner_export_manifest()','EXECUTE'),'service cannot directly inspect private manifest');
select is((select provolatile::text from pg_proc where oid='public.owner_export_snapshot(uuid,uuid)'::regprocedure),'s','snapshot uses statement-consistent stable reads');
select is((select prosecdef from pg_proc where oid='public.owner_export_snapshot(uuid,uuid)'::regprocedure),true,'snapshot is trusted definer');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid='public.owner_export_snapshot(uuid,uuid)'::regprocedure),'postgres','snapshot has trusted owner');

insert into auth.users(id,email,raw_user_meta_data,created_at) values
 ('e3600000-0000-4000-8000-000000000001','export-a@example.invalid','{"display_name":"Export synthetic A"}',now()),
 ('e3600000-0000-4000-8000-000000000002','export-b@example.invalid','{"display_name":"Export synthetic B"}',now());
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values
 ('e3600000-0000-4000-8000-000000000011','e3600000-0000-4000-8000-000000000001',now(),now(),now()+interval '1 hour'),
 ('e3600000-0000-4000-8000-000000000012','e3600000-0000-4000-8000-000000000002',now(),now(),now()+interval '1 hour');
update private.mailbox_state set verified_version=version,verified_at=now(),challenge_id='e3600000-0000-4000-8000-000000000099'
 where user_id in('e3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000002');
insert into public.habits(id,user_id,name,easy_version,stat,days) values
 ('e3600000-0000-4000-8000-000000000101','e3600000-0000-4000-8000-000000000001','Synthetic export quest A','A small step','INT','{1}'),
 ('e3600000-0000-4000-8000-000000000102','e3600000-0000-4000-8000-000000000002','FOREIGN_EXPORT_SENTINEL','B small step','INT','{1}');
insert into private.processing_consent_events(id,user_id,purpose,granted,notice_version,version,changed_at) overriding system value values
 (9007199254740993,'e3600000-0000-4000-8000-000000000001','age-screening',false,'synthetic-notice',1,now());
insert into private.processing_authority(user_id,state,purposes,age_version,review_reference) values
 ('e3600000-0000-4000-8000-000000000001','pending','{weekly-debrief}',0,'e3600000-0000-4000-8000-000000000098');

create function pg_temp.export_a() returns jsonb language sql as $$
 select public.owner_export_snapshot('e3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000011');
$$;
select throws_ok($$select pg_temp.export_a()$$,'42501',null,'no service claim cannot bypass authorization');
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$select public.owner_export_snapshot(null,null)$$,'EX001',null,'missing owner/session denied');
select throws_ok($$select public.owner_export_snapshot('e3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000012')$$,
 'EX001',null,'foreign session cannot select another owner');
select throws_ok($$select public.owner_export_snapshot('e3600000-0000-4000-8000-000000000099','e3600000-0000-4000-8000-000000000011')$$,
 'EX001',null,'nonexistent owner denied');
select lives_ok($$select pg_temp.export_a()$$,'unknown age and pending authority do not gate owned data access');
select is(pg_temp.export_a()->>'schemaVersion','1','versioned export document');
select is(pg_temp.export_a()->>'accountId','e3600000-0000-4000-8000-000000000001','subject is the verified owner');
select is(pg_temp.export_a()->'account'->>'email','export-a@example.invalid','only explicit account email projection');
select is(jsonb_array_length(pg_temp.export_a()->'sections'->'public.habits'),1,'nonempty owner quest projected');
select ok(pg_temp.export_a()::text not like '%FOREIGN_EXPORT_SENTINEL%','foreign quest not disclosed');
select ok(pg_temp.export_a()::text not like '%e3600000-0000-4000-8000-000000000099%','mailbox challenge reference excluded');
select ok(pg_temp.export_a()::text not like '%e3600000-0000-4000-8000-000000000098%','administrative review reference excluded');
select is(jsonb_typeof(pg_temp.export_a()->'sections'->'private.processing_consent_events'->0->'id'),'string','large event ID is a lossless decimal string');
select is(pg_temp.export_a()->'sections'->'private.processing_consent_events'->0->>'id','9007199254740993','large event ID remains exact');
-- 34 sections before S02, plus private.tracker_input_provenance and
-- private.tracker_purpose_authority added by the tracker export manifest, plus
-- private.authority_review_requests (the owner's own review requests, 060) and
-- private.tracker_retention_state (the owner's own retention dates, 061).
select is((select count(*) from jsonb_object_keys(pg_temp.export_a()->'sections')),38::bigint,'all owner and indirect sections explicitly classified');
select is(public.owner_export_check('e3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000011',1),true,'fresh same-session proof permits confirmation');
select is(public.owner_export_check('e3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000011',2),false,'mismatched mailbox revision refuses confirmation');
update private.mailbox_state set verified_version=null where user_id='e3600000-0000-4000-8000-000000000001';
select throws_ok($$select pg_temp.export_a()$$,'EX002',null,'unproved current mailbox denied');
select is(public.owner_export_check('e3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000011',1),false,'proof withdrawal refuses confirmation');
update private.mailbox_state set verified_version=version where user_id='e3600000-0000-4000-8000-000000000001';
update auth.sessions set not_after=now()-interval '1 second' where id='e3600000-0000-4000-8000-000000000011';
select throws_ok($$select pg_temp.export_a()$$,'EX001',null,'expired session row denied');
update auth.sessions set not_after=null where id='e3600000-0000-4000-8000-000000000011';
select lives_ok($$select pg_temp.export_a()$$,'session without configured terminal time remains eligible');
delete from auth.sessions where id='e3600000-0000-4000-8000-000000000011';
select is(public.owner_export_check('e3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000011',1),false,'deleted session refuses an outstanding token');
insert into auth.sessions(id,user_id) values('e3600000-0000-4000-8000-000000000011','e3600000-0000-4000-8000-000000000001');
update auth.users set raw_user_meta_data=raw_user_meta_data||'{"unreviewed":"synthetic"}'::jsonb where id='e3600000-0000-4000-8000-000000000001';
select throws_ok($$select pg_temp.export_a()$$,'EX003',null,'unreviewed Auth metadata requires assisted review');
update auth.users set raw_user_meta_data=raw_user_meta_data-'unreviewed' where id='e3600000-0000-4000-8000-000000000001';
alter table public.profiles add column export_drift_sentinel text;
select throws_ok($$select pg_temp.export_a()$$,'EX003',null,'new schema column cannot expand disclosure silently');
alter table public.profiles drop column export_drift_sentinel;
select lives_ok($$select pg_temp.export_a()$$,'reviewed schema remains available after drift fixture removed');
alter table public.habits add constraint export_dependency_drift foreign key(id) references auth.users(id) not valid;
select throws_ok($$select pg_temp.export_a()$$,'EX003',null,'new foreign-key dependency requires review even without column drift');
alter table public.habits drop constraint export_dependency_drift;
insert into private.account_age(user_id,birth_date) values('e3600000-0000-4000-8000-000000000001','2020-01-01');
select lives_ok($$select pg_temp.export_a()$$,'retained under12 owner can obtain their data without AI consent');
delete from private.account_age where user_id='e3600000-0000-4000-8000-000000000001';
select is(public.owner_export_check('e3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000011',null),false,'missing proof revision is an explicit refusal');

-- Nonempty indirectly owned records, with a second owner's sentinel receipt.
insert into private.ai_logical_requests(request_id,user_id,action,request_class,account_date,week_start) values
 ('e3600000-0000-4000-8000-000000000201','e3600000-0000-4000-8000-000000000001','weekly-summary','initial',current_date,date_trunc('week',current_date)::date),
 ('e3600000-0000-4000-8000-000000000202','e3600000-0000-4000-8000-000000000002','weekly-summary','initial',current_date,date_trunc('week',current_date)::date);
insert into private.ai_provider_attempts(request_id,attempt_number,usage_date) values
 ('e3600000-0000-4000-8000-000000000201',1,current_date),('e3600000-0000-4000-8000-000000000202',1,current_date);
insert into private.ai_execution_details(execution_id,request_id,epoch,contract_version,state,authorized_attempt_mask,settled_at)
 select 'e3600000-0000-4000-8000-000000000301'::uuid,'e3600000-0000-4000-8000-000000000201'::uuid,epoch,1,'completed',1,now() from private.ai_admission_control;
select is(jsonb_array_length(pg_temp.export_a()->'sections'->'private.ai_provider_attempts'),1,'owned indirect attempt included');
select is(jsonb_array_length(pg_temp.export_a()->'sections'->'private.ai_execution_details'),1,'owned indirect execution included');
select ok(pg_temp.export_a()::text not like '%e3600000-0000-4000-8000-000000000202%','foreign indirect receipt not disclosed');
select ok(not ((pg_temp.export_a()->'sections'->'private.ai_execution_details'->0) ? 'epoch'),'global epoch omitted from subject execution');

create temporary table export_row_headroom as
 select 10000-1-sum(jsonb_array_length(value))::integer remaining from jsonb_each(pg_temp.export_a()->'sections');
insert into public.habit_progress(user_id,habit_id,progress_date,progress_count)
 select 'e3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000101',current_date+g,1
 from generate_series(1,(select remaining from export_row_headroom)) g;
select lives_ok($$select pg_temp.export_a()$$,'exact total record boundary is accepted');
insert into public.habit_progress(user_id,habit_id,progress_date,progress_count)
 values('e3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000101',current_date+20000,1);
select throws_ok($$select pg_temp.export_a()$$,'EX004',null,'one record over total bound is refused without truncation');
delete from public.habit_progress where habit_id='e3600000-0000-4000-8000-000000000101';
update public.habits set description=repeat('界',1800000) where id='e3600000-0000-4000-8000-000000000101';
select throws_ok($$select pg_temp.export_a()$$,'EX004',null,'multibyte bytes over limit refused before aggregation');
update public.habits set description=repeat('界',1200000) where id='e3600000-0000-4000-8000-000000000101';
select lives_ok($$select pg_temp.export_a()$$,'bounded multibyte content remains available');
update public.habits set description=null where id='e3600000-0000-4000-8000-000000000101';
-- One outer statement pins statement_timestamp while probing the exact encoding.
create function pg_temp.export_byte_probe() returns jsonb language plpgsql as $$
declare base bigint; exact boolean; over_rejected boolean:=false;
begin
 select octet_length(pg_temp.export_a()::text) into base;
 update public.habits set description=repeat('x',(5242880-base+2)::integer)
  where id='e3600000-0000-4000-8000-000000000101';
 exact:=octet_length(pg_temp.export_a()::text)=5242880;
 begin
  update public.habits set description=description||'x' where id='e3600000-0000-4000-8000-000000000101';
  perform pg_temp.export_a();
 exception when sqlstate 'EX004' then over_rejected:=true;
 end;
 update public.habits set description=null where id='e3600000-0000-4000-8000-000000000101';
 return jsonb_build_object('exact',exact,'overRejected',over_rejected);
end;$$;
create temporary table export_byte_result as select pg_temp.export_byte_probe() result;
select is((select (result->>'exact')::boolean from export_byte_result),true,'exact canonical UTF8 byte boundary accepted including envelope');
select is((select (result->>'overRejected')::boolean from export_byte_result),true,'one byte over canonical envelope refused');

-- Rollback-only Storage metadata fixtures, no files/API writes or permanent rows.
insert into auth.users(id,email,created_at) values
 ('e3600000-0000-4000-8000-000000000003','export-path@example.invalid',now()),
 ('e3600000-0000-4000-8000-000000000004','export-cleanup@example.invalid',now()),
 ('e3600000-0000-4000-8000-000000000005','export-dangling@example.invalid',now());
insert into auth.sessions(id,user_id) values
 ('e3600000-0000-4000-8000-000000000013','e3600000-0000-4000-8000-000000000003'),
 ('e3600000-0000-4000-8000-000000000014','e3600000-0000-4000-8000-000000000004'),
 ('e3600000-0000-4000-8000-000000000015','e3600000-0000-4000-8000-000000000005');
update private.mailbox_state set verified_version=version,verified_at=now()
 where user_id in('e3600000-0000-4000-8000-000000000003','e3600000-0000-4000-8000-000000000004','e3600000-0000-4000-8000-000000000005');
insert into storage.objects(bucket_id,name,owner_id) values
 ('gym-exercise-media','e3600000-0000-4000-8000-000000000002/foreign.gif','e3600000-0000-4000-8000-000000000002'),
 ('gym-exercise-media','e3600000-0000-4000-8000-000000000003/path-only.gif','e3600000-0000-4000-8000-000000000002');
select lives_ok($$select pg_temp.export_a()$$,'foreign media does not block the requesting owner');
select throws_ok($$select public.owner_export_snapshot('e3600000-0000-4000-8000-000000000003','e3600000-0000-4000-8000-000000000013')$$,
 'EX005',null,'subject path media cannot disappear behind foreign owner metadata');
insert into storage.objects(bucket_id,name,owner_id) values
 ('gym-exercise-media','unrelated-prefix/owned.gif','e3600000-0000-4000-8000-000000000001');
select throws_ok($$select pg_temp.export_a()$$,'EX005',null,'owned media requires assisted export');
insert into public.gym_media_cleanup(user_id,path) values('e3600000-0000-4000-8000-000000000004','e3600000-0000-4000-8000-000000000004/synthetic-cleanup.gif');
select throws_ok($$select public.owner_export_snapshot('e3600000-0000-4000-8000-000000000004','e3600000-0000-4000-8000-000000000014')$$,
 'EX005',null,'pending cleanup media requires assisted handling');
insert into public.gym_routines(id,user_id,name) values
 ('e3600000-0000-4000-8000-000000000501','e3600000-0000-4000-8000-000000000005','Synthetic media routine');
insert into public.gym_exercises(id,routine_id,user_id,name,position,sets,reps,rest_seconds,rir,media_path,media_mime) values
 ('e3600000-0000-4000-8000-000000000502','e3600000-0000-4000-8000-000000000501','e3600000-0000-4000-8000-000000000005','Synthetic dangling media',0,1,'1',30,1,'e3600000-0000-4000-8000-000000000005/missing-synthetic.gif','image/gif');
select throws_ok($$select public.owner_export_snapshot('e3600000-0000-4000-8000-000000000005','e3600000-0000-4000-8000-000000000015')$$,
 'EX005',null,'dangling media reference is not a completed text-only export');
select * from finish();
rollback;
