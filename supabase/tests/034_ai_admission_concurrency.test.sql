-- Only newly created test-owned metadata is restored; retained accounts untouched.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path=public,extensions;
select no_plan();
do $$begin
 if exists(select 1 from auth.users where id='d3400000-0000-4000-8000-000000000001')
  or exists(select 1 from private.ai_execution_epochs where outstanding_count>0)
  or exists(select 1 from private.ai_admission_control where is_open) then
  raise exception 'Concurrency fixture boundary unavailable.';
 end if;
end;$$;
create temporary table admission_control_before as select * from private.ai_admission_control;
create temporary table admission_epochs_before as select * from private.ai_execution_epochs;
create temporary table admission_provider_before as select coalesce((select attempt_count from private.ai_provider_daily_usage where usage_date=(statement_timestamp() at time zone 'UTC')::date),0) count;
create function pg_temp.admission_wait_lock(app text) returns boolean language plpgsql as $$
begin
 for i in 1..100 loop
  if exists(select 1 from pg_stat_activity where application_name=app and wait_event_type='Lock') then return true; end if;
  perform pg_sleep(0.02);
 end loop;
 return false;
end;$$;
select lives_ok($$select dblink_connect('admission_closer','dbname=postgres user=supabase_admin application_name=admission_closer options=-csearch_path=')$$,'connect operator');
select lives_ok($$select dblink_connect('admission_writer','dbname=postgres user=supabase_admin application_name=admission_writer options=-csearch_path=')$$,'connect separate writer');
-- dblink_exec refuses a SELECT result; use PERFORM inside DO for the operator transaction.
select dblink_exec('admission_closer',$sql$
 begin;set local statement_timeout='8s';
 update private.ai_admission_control set is_open=true,last_pruned_at=statement_timestamp();
 do $close$begin perform private.close_ai_admission();end$close$;
$sql$);
select dblink_exec('admission_writer',$sql$begin;set local statement_timeout='8s';set local role service_role;set local "request.jwt.claim.role"='service_role';$sql$);
select is(dblink_send_query('admission_writer',$sql$
 select public.ai_admit_execution('d3400000-0000-4000-8000-000000000001','weekly-summary',
 'd3400000-0000-4000-8000-000000000101',date_trunc('week',current_date)::date,
 'd3400000-0000-4000-8000-000000000201',1)
$sql$),1,'send admission behind uncommitted close');
select ok(pg_temp.admission_wait_lock('admission_writer'),'admission waits on actual maintenance row lock');
select dblink_exec('admission_closer','commit');
select is((select data->>'allowed' from dblink_get_result('admission_writer') as t(data jsonb)),'false','close-first admission denied after close commits');
select * from dblink_get_result('admission_writer') as t(data jsonb);
select dblink_exec('admission_writer','commit');
select is((select count(*) from private.ai_execution_details where execution_id='d3400000-0000-4000-8000-000000000201'),0::bigint,'close-first creates no running execution');

-- Admission-first: this wholly new synthetic account is refused if pre-existing.
insert into auth.users(id,email,raw_user_meta_data) values
 ('d3400000-0000-4000-8000-000000000001','admission-lock@example.invalid','{"birth_date":"2000-01-01"}');
update private.mailbox_state set verified_version=version,verified_at=now() where user_id='d3400000-0000-4000-8000-000000000001';
insert into private.processing_consent(user_id,age_granted,age_notice,ai_granted,ai_notice,version)
 values('d3400000-0000-4000-8000-000000000001',true,'2026-11-08-adult-v1',true,'2026-11-08-weekly-debrief-v2',2);
update private.ai_admission_control set last_pruned_at=statement_timestamp();
select lives_ok('select private.open_ai_admission()','open healthy synthetic-only branch');
select dblink_exec('admission_writer',$sql$
 begin;set local statement_timeout='8s';set local role service_role;set local "request.jwt.claim.role"='service_role';
 create temporary table ticket as select public.ai_admit_execution(
 'd3400000-0000-4000-8000-000000000001','weekly-summary','d3400000-0000-4000-8000-000000000102',
 date_trunc('week',current_date)::date,'d3400000-0000-4000-8000-000000000202',1) data;
$sql$);
select is((select data->>'allowed' from dblink('admission_writer','select data from ticket') as t(data jsonb)),'true','first transaction admitted valid execution');
select is(dblink_send_query('admission_closer',$sql$select private.close_ai_admission()$sql$),1,'send close behind admission');
select ok(pg_temp.admission_wait_lock('admission_closer'),'close waits for quota plus execution registration transaction');
select dblink_exec('admission_writer','commit');
select ok((select epoch from dblink_get_result('admission_closer') as t(epoch bigint))>1,'close commits after admitted execution');
select * from dblink_get_result('admission_closer') as t(epoch bigint);
select is((select count(*) from private.ai_execution_details where execution_id='d3400000-0000-4000-8000-000000000202'),1::bigint,'admission-first execution cannot be lost between charge and close');
select is((select sum(outstanding_count) from private.ai_execution_epochs),1::numeric,'admission-first work blocks premature zero count');
select is((select attempt_count from private.ai_logical_requests where request_id='d3400000-0000-4000-8000-000000000102'),1,'quota and execution committed together');
select set_config('test.admission_epoch',(select epoch::text from private.ai_execution_details where execution_id='d3400000-0000-4000-8000-000000000202'),false);
set role service_role;
select is(public.ai_authorize_execution_attempt('d3400000-0000-4000-8000-000000000202',current_setting('test.admission_epoch')::bigint,1),false,'close prevents first dispatch after admission');
select is(public.ai_settle_execution('d3400000-0000-4000-8000-000000000202',current_setting('test.admission_epoch')::bigint,'stopped-before-dispatch'),true,'known no-dispatch execution can settle after close');
reset role;
select is((select sum(outstanding_count) from private.ai_execution_epochs),0::numeric,'no-dispatch settlement reconciles local count');
select dblink_disconnect('admission_writer');
select dblink_disconnect('admission_closer');
-- Cleanup only this run's newly created account/receipt/detail and temporary epochs.
-- One DO block is one transaction, so no top-level transaction control is needed.
do $cleanup$begin
-- This test authorized no provider fetch. Restore only its own reservation delta.
with owned as (select usage_date,count(*)::integer n from private.ai_provider_attempts
 where request_id='d3400000-0000-4000-8000-000000000102' group by usage_date)
update private.ai_provider_daily_usage d set attempt_count=d.attempt_count-owned.n from owned where d.usage_date=owned.usage_date;
delete from private.ai_execution_details where execution_id='d3400000-0000-4000-8000-000000000202' and state='stopped-before-dispatch';
delete from auth.users where id='d3400000-0000-4000-8000-000000000001';
delete from private.ai_execution_epochs e where not exists(select 1 from admission_epochs_before b where b.epoch=e.epoch) and outstanding_count=0;
update private.ai_execution_epochs e set opened_at=b.opened_at,closed_at=b.closed_at,outstanding_count=b.outstanding_count,uncertain_count=b.uncertain_count
 from admission_epochs_before b where e.epoch=b.epoch;
update private.ai_admission_control c set is_open=b.is_open,epoch=b.epoch,updated_at=b.updated_at,last_pruned_at=b.last_pruned_at from admission_control_before b where c.singleton=b.singleton;
end$cleanup$;
select is((select to_jsonb(c) from private.ai_admission_control c),(select to_jsonb(b) from admission_control_before b),'maintenance before-state restored');
select is(coalesce((select attempt_count from private.ai_provider_daily_usage where usage_date=(statement_timestamp() at time zone 'UTC')::date),0),
 (select count from admission_provider_before),'only test-owned provider reservation delta restored');
select * from finish();
