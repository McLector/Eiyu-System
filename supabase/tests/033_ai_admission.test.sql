begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local timezone='UTC';
select no_plan();
select has_function('public','ai_admit_execution',array['uuid','text','uuid','date','uuid','integer'],'instrumented admission exists');
-- Rollback-only deterministic epoch, preserving the real closed maintenance history.
do $$begin if exists(select 1 from private.ai_execution_epochs where outstanding_count>0)
 or exists(select 1 from private.ai_admission_control where is_open) then raise exception 'Admission fixture unavailable.';end if;end;$$;
update private.ai_admission_control set epoch=1,last_pruned_at=null;
-- All of this is rolled back. Retained completed details/closed epochs remain intact afterward.
delete from private.ai_execution_details;
delete from private.ai_execution_epochs;
insert into private.ai_execution_epochs(epoch) values(1);
insert into auth.users(id,email,raw_user_meta_data) values
 ('d3300000-0000-4000-8000-000000000001','admission@example.invalid','{"birth_date":"2000-01-01"}'),
 ('d3300000-0000-4000-8000-000000000002','admission-teen@example.invalid','{"birth_date":"2010-01-01"}'),
 ('d3300000-0000-4000-8000-000000000003','admission-unknown@example.invalid','{}'),
 ('d3300000-0000-4000-8000-000000000004','admission-retained-child@example.invalid','{"birth_date":"2000-01-01"}'),
 ('d3300000-0000-4000-8000-000000000005','admission-unproved@example.invalid','{"birth_date":"2000-01-01"}'),
 ('d3300000-0000-4000-8000-000000000006','admission-pending@example.invalid','{"birth_date":"2000-01-01"}');
update private.mailbox_state set verified_version=version,verified_at=now()
 where user_id::text like 'd3300000-%' and user_id<>'d3300000-0000-4000-8000-000000000005';
insert into private.processing_consent(user_id,age_granted,age_notice,ai_granted,ai_notice,version)
 select id,true,'2026-10-20-age-v1',true,'2026-10-20-weekly-debrief-v1',2 from auth.users where id::text like 'd3300000-%';
update private.account_age set pending_birth_date='2000-01-01' where user_id='d3300000-0000-4000-8000-000000000006';
-- Model a retained corrected declaration; fresh under12 signup must remain rejected.
update private.account_age set birth_date='2020-01-01' where user_id='d3300000-0000-4000-8000-000000000004';
select private.record_processing_authority('d3300000-0000-4000-8000-000000000002','not-required',array['age-screening','weekly-debrief'],1,'d3300000-0000-4000-8000-000000000902');
create function pg_temp.admit(r uuid default 'd3300000-0000-4000-8000-000000000101',e uuid default 'd3300000-0000-4000-8000-000000000201',v integer default 1)
returns jsonb language sql as $$select public.ai_admit_execution('d3300000-0000-4000-8000-000000000001','weekly-summary',r,date_trunc('week',current_date)::date,e,v)$$;
create function pg_temp.admit_user(u uuid) returns jsonb language sql as $$select public.ai_admit_execution(u,'weekly-summary',u,date_trunc('week',current_date)::date,u,1)$$;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is((pg_temp.admit()->>'allowed')::boolean,false,'default closed before quota');
reset role;
select is((select count(*) from private.ai_logical_requests where user_id='d3300000-0000-4000-8000-000000000001'),0::bigint,'closed admission charges no receipt');
select is((select count(*) from private.ai_execution_details where request_id='d3300000-0000-4000-8000-000000000101'),0::bigint,'closed admission registers no running execution');
select ok(not has_table_privilege('service_role','private.ai_admission_control','UPDATE'),'service cannot change maintenance');
select ok(not has_function_privilege('service_role','private.open_ai_admission()','EXECUTE'),'service cannot reopen');
select ok(not has_function_privilege('authenticated','public.ai_admit_execution(uuid,text,uuid,date,uuid,integer)','EXECUTE'),'client cannot admit');
select ok(not has_function_privilege('service_role','private.ai_begin_request_before_admission(uuid,text,uuid,date)','EXECUTE'),'moved quota helper privileges revoked');
select throws_ok('select private.open_ai_admission()','ED001',null,'missing maintenance health prevents opening');
update private.ai_admission_control set last_pruned_at=statement_timestamp();
select is(private.open_ai_admission(),1::bigint,'operator opens first healthy epoch');
set local role service_role;
select is((pg_temp.admit_user('d3300000-0000-4000-8000-000000000002')->>'allowed')::boolean,true,'new protocol admits eligible teen with specific consent and reviewed authority disposition');
select is(public.ai_settle_execution('d3300000-0000-4000-8000-000000000002',1,'stopped-before-dispatch'),true,'synthetic teen acceptance performs no provider call');
select throws_ok($$select pg_temp.admit_user('d3300000-0000-4000-8000-000000000003')$$,'EP001',null,'unknown age denied by actual new protocol');
select throws_ok($$select pg_temp.admit_user('d3300000-0000-4000-8000-000000000004')$$,'EP001',null,'retained under12 denied by actual new protocol');
select throws_ok($$select pg_temp.admit_user('d3300000-0000-4000-8000-000000000005')$$,'EM001',null,'actual new protocol still requires current mailbox proof');
select throws_ok($$select pg_temp.admit_user('d3300000-0000-4000-8000-000000000006')$$,'EP001',null,'retained pending correction denied by actual new protocol');
select is((public.ai_begin_request('d3300000-0000-4000-8000-000000000001','weekly-summary','d3300000-0000-4000-8000-000000000199',date_trunc('week',current_date)::date)->>'allowed')::boolean,false,'legacy begin denied even when open');
select is(public.ai_reserve_next_attempt('d3300000-0000-4000-8000-000000000199',1),false,'legacy retry denied');
select is(public.ai_check_request_age('d3300000-0000-4000-8000-000000000199',1),false,'legacy output gate denied');
select throws_ok($$select pg_temp.admit(v=>2)$$,'22023',null,'unreviewed execution contract rejected');
select throws_ok($$select pg_temp.admit(e=>null)$$,'22023',null,'missing execution id rejected');
select is((pg_temp.admit()->>'allowed')::boolean,true,'compatible valid request admitted');
select is((pg_temp.admit()->>'allowed')::boolean,false,'duplicate execution cannot generate twice');
select is((pg_temp.admit(e=>'d3300000-0000-4000-8000-000000000202')->>'allowed')::boolean,false,'existing receipt cannot create second execution');
select is(public.ai_authorize_execution_attempt('d3300000-0000-4000-8000-000000000201',1,1),true,'first dispatch must be authorized');
select is(public.ai_authorize_execution_attempt('d3300000-0000-4000-8000-000000000201',1,1),false,'dispatch authorization is one use');
select is(public.ai_authorize_execution_attempt('d3300000-0000-4000-8000-000000000201',1,3),false,'cannot skip attempt order');
select is(public.ai_authorize_execution_attempt('d3300000-0000-4000-8000-000000000201',1,2),true,'second attempt respects existing quota and processing');
select is(public.ai_prepare_execution_result('d3300000-0000-4000-8000-000000000201',1,1),true,'current epoch and processing permit output preparation');
reset role;
select is((select attempt_count from private.ai_logical_requests where request_id='d3300000-0000-4000-8000-000000000101'),2,'first attempt not charged twice');
select is((select outstanding_count from private.ai_execution_epochs where epoch=1),1::bigint,'one admitted execution accounted for');
update private.processing_consent set ai_granted=false,version=3 where user_id='d3300000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select public.ai_authorize_execution_attempt('d3300000-0000-4000-8000-000000000201',1,3)$$,'EP001',null,'withdrawal remains a processing denial, not quota exhaustion');
select throws_ok($$select public.ai_prepare_execution_result('d3300000-0000-4000-8000-000000000201',1,1)$$,'EP001',null,'output preserves purpose-specific processing denial');
reset role;
update private.processing_consent set ai_granted=true,version=2 where user_id='d3300000-0000-4000-8000-000000000001';
select is(private.close_ai_admission(),2::bigint,'close advances epoch');
select is(private.close_ai_admission(),2::bigint,'already closed does not keep advancing');
select throws_ok('select private.open_ai_admission()','ED001',null,'unsettled old work prevents reopening');
set local role service_role;
select is(public.ai_authorize_execution_attempt('d3300000-0000-4000-8000-000000000201',1,3),false,'close prevents later dispatch authorization');
select is(public.ai_prepare_execution_result('d3300000-0000-4000-8000-000000000201',1,1),false,'close fences stale output preparation');
select is(public.ai_settle_execution('d3300000-0000-4000-8000-000000000201',1,'stopped-before-dispatch'),false,'cannot pretend authorized dispatch never happened');
select is(public.ai_settle_execution('d3300000-0000-4000-8000-000000000201',1,'unresolved'),true,'ambiguous provider work remains unresolved');
select is(public.ai_settle_execution('d3300000-0000-4000-8000-000000000201',1,'unresolved'),true,'same unresolved acknowledgment is idempotent');
select is(public.ai_settle_execution('d3300000-0000-4000-8000-000000000201',1,'completed'),false,'uncertainty is not overwritten by a late conflicting acknowledgment');
reset role;
select is((select outstanding_count from private.ai_execution_epochs where epoch=1),1::bigint,'uncertain work still outstanding');
select is((select uncertain_count from private.ai_execution_epochs where epoch=1),1::bigint,'uncertainty increments once');
select throws_ok('select private.open_ai_admission()','ED001',null,'uncertainty prevents automatic reopen');
-- Isolated second branch tests successful settlement, without erasing prior real state.
update private.ai_execution_epochs set outstanding_count=0,uncertain_count=0 where epoch=1;
select is(private.open_ai_admission(),2::bigint,'trusted rollback branch opens next epoch');
set local role service_role;
select is((pg_temp.admit('d3300000-0000-4000-8000-000000000102','d3300000-0000-4000-8000-000000000203')->>'allowed')::boolean,true,'second valid request admitted');
select is(public.ai_authorize_execution_attempt('d3300000-0000-4000-8000-000000000203',2,1),true,'second execution dispatch authorized');
reset role;
select set_config('test.provider_cap',(select max_provider_attempts::text from private.ai_quota_config where singleton),true);
update private.ai_quota_config set max_provider_attempts=(select attempt_count from private.ai_provider_daily_usage where usage_date=(statement_timestamp() at time zone 'UTC')::date) where singleton;
set local role service_role;
select throws_ok($$select public.ai_authorize_execution_attempt('d3300000-0000-4000-8000-000000000203',2,2)$$,'EQ001',null,'retry quota denial is distinguishable from closed admission');
reset role;
update private.ai_quota_config set max_provider_attempts=current_setting('test.provider_cap')::integer where singleton;
set local role service_role;
select is(public.ai_settle_execution('d3300000-0000-4000-8000-000000000203',2,'completed'),true,'local success settles independently of refund');
select is(public.ai_settle_execution('d3300000-0000-4000-8000-000000000203',2,'completed'),true,'repeated completed acknowledgment idempotent');
select is(public.ai_authorize_execution_attempt('d3300000-0000-4000-8000-000000000203',2,2),false,'completed execution cannot dispatch again');
select is(public.ai_prepare_execution_result('d3300000-0000-4000-8000-000000000203',2,1),true,'settled current success can prepare output');
reset role;
select is((select outstanding_count from private.ai_execution_epochs where epoch=2),0::bigint,'success decrements exactly once');
select is((select refunded_at is null from private.ai_logical_requests where request_id='d3300000-0000-4000-8000-000000000102'),true,'settlement does not refund successful quota');
select * from finish();
rollback;
