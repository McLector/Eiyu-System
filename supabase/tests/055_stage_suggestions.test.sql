begin;
-- Part J (S03b): chain stage suggestions go through the same admission as the weekly review,
-- but count in their own 'stage-breakdown' daily bucket. Everything here is rolled back.
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local timezone='UTC';
select no_plan();

-- Same rollback-only admission fixture as 033: preserve the real closed history, start from epoch 1.
do $$begin if exists(select 1 from private.ai_execution_epochs where outstanding_count>0)
 or exists(select 1 from private.ai_admission_control where is_open) then raise exception 'Admission fixture unavailable.';end if;end;$$;
update private.ai_admission_control set epoch=1,last_pruned_at=null;
delete from private.ai_execution_details;
delete from private.ai_execution_epochs;
insert into private.ai_execution_epochs(epoch) values(1);

insert into auth.users(id,email,raw_user_meta_data) values
 ('d5500000-0000-4000-8000-000000000001','stage-ok@example.invalid','{}'),
 ('d5500000-0000-4000-8000-000000000002','stage-no-adult-box@example.invalid','{}'),
 ('d5500000-0000-4000-8000-000000000003','stage-no-ai-box@example.invalid','{}'),
 ('d5500000-0000-4000-8000-000000000004','stage-no-mailbox@example.invalid','{}'),
 ('d5500000-0000-4000-8000-000000000005','stage-versions@example.invalid','{}'),
 ('d5500000-0000-4000-8000-000000000006','stage-withdraws@example.invalid','{}');
update private.mailbox_state set verified_version=version,verified_at=now()
 where user_id::text like 'd5500000-%' and user_id<>'d5500000-0000-4000-8000-000000000004';
insert into private.processing_consent(user_id,age_granted,age_notice,ai_granted,ai_notice,version)
 select id,id::text<>'d5500000-0000-4000-8000-000000000002','2026-11-08-adult-v1',
  id::text<>'d5500000-0000-4000-8000-000000000003','2026-11-08-weekly-debrief-v2',2
 from auth.users where id::text like 'd5500000-%';

-- Run any statement, report its single text value or the SQLSTATE it raised, so one failure never aborts the file.
create function pg_temp.try(q text) returns text language plpgsql as $$
declare v text; begin execute q into v; return v; exception when others then return 'ERR:'||sqlstate; end;$$;
create function pg_temp.stage(u uuid,r uuid,e uuid,field text default 'allowed') returns text language plpgsql as $$
declare v jsonb; begin
 v:=public.ai_admit_execution(u,'stage-breakdown',r,null,e,1); return v->>field;
exception when others then return 'ERR:'||sqlstate; end;$$;
create function pg_temp.bucket(u uuid,a text) returns integer language sql as $$
 select coalesce((select sum(request_count)::integer from private.ai_user_daily_usage where user_id=u and action=a),0)$$;

-- Closed admission refuses stage suggestions before any charge, like the weekly review.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(pg_temp.stage('d5500000-0000-4000-8000-000000000001','d5500000-0000-4000-8000-000000000101','d5500000-0000-4000-8000-000000000201'),
 'false','closed admission refuses a stage suggestion');
reset role;
select is(pg_temp.bucket('d5500000-0000-4000-8000-000000000001','stage-breakdown'),0,'a refusal while closed charges nothing');
update private.ai_admission_control set last_pruned_at=statement_timestamp();
select is(private.open_ai_admission(),1::bigint,'operator opens the epoch');
set local role service_role;

-- The four conditions.
select is(pg_temp.stage('d5500000-0000-4000-8000-000000000002','d5500000-0000-4000-8000-000000000102','d5500000-0000-4000-8000-000000000202'),
 'ERR:EP001','no 18+ box: refused');
select is(pg_temp.stage('d5500000-0000-4000-8000-000000000003','d5500000-0000-4000-8000-000000000103','d5500000-0000-4000-8000-000000000203'),
 'ERR:EP001','no AI agreement: refused');
select is(pg_temp.stage('d5500000-0000-4000-8000-000000000004','d5500000-0000-4000-8000-000000000104','d5500000-0000-4000-8000-000000000204'),
 'ERR:EM001','unverified mailbox: refused');
reset role;
select is((select count(*) from private.ai_logical_requests where user_id::text in
 ('d5500000-0000-4000-8000-000000000002','d5500000-0000-4000-8000-000000000003','d5500000-0000-4000-8000-000000000004')),0::bigint,
 'refused requests leave no receipt');
select is((select count(*) from private.ai_user_daily_usage where user_id::text in
 ('d5500000-0000-4000-8000-000000000002','d5500000-0000-4000-8000-000000000003','d5500000-0000-4000-8000-000000000004')),0::bigint,
 'refused requests charge no bucket');
set local role service_role;

-- The admitted ticket carries all four access revisions, so the proxy can compare them.
select is(pg_temp.try($$select (r->>'allowed'='true' and r->>'ageVersion'='1' and (r->>'mailboxVersion')::int>=1
   and (r->>'consentVersion')::int>=1 and (r->>'authorityVersion')::int>=0 and r->>'executionId' is not null)::text
  from (select public.ai_admit_execution('d5500000-0000-4000-8000-000000000005','stage-breakdown',
   'd5500000-0000-4000-8000-000000000105',null,'d5500000-0000-4000-8000-000000000205',1) r) s$$),
 'true','an admitted stage request returns the four access revisions and an execution ticket');

-- Other actions stay unsupported.
select is(pg_temp.try($$select (public.ai_admit_execution('d5500000-0000-4000-8000-000000000001','easy-versions',
  'd5500000-0000-4000-8000-000000000106',null,'d5500000-0000-4000-8000-000000000206',1))::text$$),
 'ERR:22023','easy-versions is still refused');

-- Full lifecycle for user 001: admit, retry, result, settle.
select is(pg_temp.stage('d5500000-0000-4000-8000-000000000001','d5500000-0000-4000-8000-000000000101','d5500000-0000-4000-8000-000000000201'),
 'true','a person with all four conditions is admitted');
select is(pg_temp.stage('d5500000-0000-4000-8000-000000000001','d5500000-0000-4000-8000-000000000101','d5500000-0000-4000-8000-000000000211'),
 'false','the same request id cannot start a second execution');
select is(pg_temp.try($$select public.ai_authorize_execution_attempt('d5500000-0000-4000-8000-000000000201',1,1)::text$$),'true','first dispatch authorized');
select is(pg_temp.try($$select public.ai_authorize_execution_attempt('d5500000-0000-4000-8000-000000000201',1,2)::text$$),'true',
 'a second provider attempt is authorized (retry after a provider failure)');
select is(pg_temp.try($$select public.ai_prepare_execution_result('d5500000-0000-4000-8000-000000000201',1,1)::text$$),'true',
 'the result can be released while access is current');
select is(pg_temp.try($$select public.ai_settle_execution('d5500000-0000-4000-8000-000000000201',1,'completed')::text$$),'true','settled');
reset role;
select is(pg_temp.bucket('d5500000-0000-4000-8000-000000000001','stage-breakdown'),1,'the request is counted in the stage-breakdown bucket');
select is(pg_temp.bucket('d5500000-0000-4000-8000-000000000001','weekly-summary-initial'),0,'and not in the weekly review bucket');
select is((select attempt_count from private.ai_logical_requests where request_id='d5500000-0000-4000-8000-000000000101'),2,
 'both provider attempts were counted on the request');
set local role service_role;

-- Own daily limit: 2 a day, and it does not touch the weekly review.
select is(pg_temp.stage('d5500000-0000-4000-8000-000000000001','d5500000-0000-4000-8000-000000000107','d5500000-0000-4000-8000-000000000207'),
 'true','second request of the day is admitted');
select is(pg_temp.stage('d5500000-0000-4000-8000-000000000001','d5500000-0000-4000-8000-000000000108','d5500000-0000-4000-8000-000000000208','reason'),
 'user_limit','the third request of the day hits the stage limit');
select is(pg_temp.try($$select (public.ai_admit_execution('d5500000-0000-4000-8000-000000000001','weekly-summary',
  'd5500000-0000-4000-8000-000000000109',date_trunc('week',current_date)::date,'d5500000-0000-4000-8000-000000000209',1)->>'allowed')$$),
 'true','using up the stage limit leaves the weekly review available');

-- A refund lowers the stage bucket, not the weekly one.
select is(pg_temp.try($$select public.ai_release_request('d5500000-0000-4000-8000-000000000101')::text$$),'true','a failed request can be refunded');
reset role;
select is(pg_temp.bucket('d5500000-0000-4000-8000-000000000001','stage-breakdown'),1,'the refund lowered the stage-breakdown bucket');
select is(pg_temp.bucket('d5500000-0000-4000-8000-000000000001','weekly-summary-initial'),1,'and left the weekly bucket alone');
set local role service_role;
select is(pg_temp.stage('d5500000-0000-4000-8000-000000000001','d5500000-0000-4000-8000-000000000110','d5500000-0000-4000-8000-000000000210'),
 'true','after the refund the person can ask again');

-- Withdrawing the AI agreement after admission stops the retry and the result.
select is(pg_temp.stage('d5500000-0000-4000-8000-000000000006','d5500000-0000-4000-8000-000000000111','d5500000-0000-4000-8000-000000000212'),
 'true','user 006 admitted');
select is(pg_temp.try($$select public.ai_authorize_execution_attempt('d5500000-0000-4000-8000-000000000212',1,1)::text$$),'true',
 'user 006 first dispatch authorized while access is current');
reset role;
update private.processing_consent set ai_granted=false,version=3 where user_id='d5500000-0000-4000-8000-000000000006';
set local role service_role;
select is(pg_temp.try($$select public.ai_authorize_execution_attempt('d5500000-0000-4000-8000-000000000212',1,2)::text$$),'ERR:EP001',
 'withdrawal stops the next dispatch');
select is(pg_temp.try($$select public.ai_prepare_execution_result('d5500000-0000-4000-8000-000000000212',1,1)::text$$),'ERR:EP001',
 'withdrawal stops the result being released');

-- The old, uninstrumented path stays shut for this action too.
select is(pg_temp.try($$select (public.ai_begin_request('d5500000-0000-4000-8000-000000000001','stage-breakdown',
  'd5500000-0000-4000-8000-000000000199',null)->>'allowed')$$),'false','legacy begin stays denied');
reset role;
select * from finish();
rollback;
