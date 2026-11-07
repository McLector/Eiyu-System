begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local timezone='UTC';
select no_plan();
select has_function('private','prune_ai_execution_details',array[]::text[],'operator detail pruning exists');
-- Deterministic rollback-only lifecycle fixture; refuse any real open/outstanding work.
do $$begin if exists(select 1 from private.ai_execution_epochs where outstanding_count>0)
 or exists(select 1 from private.ai_admission_control where is_open) then raise exception 'Retention fixture unavailable.';end if;end;$$;
update private.ai_admission_control set epoch=1,last_pruned_at=null;
delete from private.ai_execution_details;
delete from private.ai_execution_epochs;
insert into private.ai_execution_epochs(epoch) values(1);
select ok(not has_function_privilege('service_role','private.prune_ai_execution_details()','EXECUTE'),'AI service cannot prune its own uncertainty');
select is((select count(*) from information_schema.columns where table_schema='private' and table_name='ai_execution_epochs'
 and column_name in('user_id','execution_id','request_id')),0::bigint,'aggregate has no account/execution/request identifier');
insert into auth.users(id,email,raw_user_meta_data) values
 ('d3500000-0000-4000-8000-000000000001','retention@example.invalid','{"birth_date":"2000-01-01"}');
update private.mailbox_state set verified_version=version,verified_at=now() where user_id='d3500000-0000-4000-8000-000000000001';
insert into private.processing_consent(user_id,age_granted,age_notice,ai_granted,ai_notice,version)
 values('d3500000-0000-4000-8000-000000000001',true,'2026-11-08-adult-v1',true,'2026-11-08-weekly-debrief-v2',2);
-- Give this rollback fixture headroom without rewriting any retained counts.
update private.ai_quota_config set max_user_requests_per_action=100,
 max_provider_attempts=coalesce((select attempt_count from private.ai_provider_daily_usage where usage_date=current_date),0)+20;
select private.prune_ai_execution_details();
select is(private.open_ai_admission(),1::bigint,'real successful maintenance warms admission');
create function pg_temp.retention_admit(r uuid,e uuid) returns jsonb language sql as $$
 select public.ai_admit_execution('d3500000-0000-4000-8000-000000000001','weekly-summary',r,date_trunc('week',current_date)::date,e,1);
$$;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is((pg_temp.retention_admit('d3500000-0000-4000-8000-000000000101','d3500000-0000-4000-8000-000000000201')->>'allowed')::boolean,true,'admit future expired unknown record');
select is((pg_temp.retention_admit('d3500000-0000-4000-8000-000000000102','d3500000-0000-4000-8000-000000000202')->>'allowed')::boolean,true,'admit future expired unresolved record');
select is(public.ai_authorize_execution_attempt('d3500000-0000-4000-8000-000000000202',1,1),true,'authorize synthetic no-network attempt');
select is(public.ai_settle_execution('d3500000-0000-4000-8000-000000000202',1,'unresolved'),true,'explicit uncertainty recorded');
select is((pg_temp.retention_admit('d3500000-0000-4000-8000-000000000103','d3500000-0000-4000-8000-000000000203')->>'allowed')::boolean,true,'admit future expired terminal record');
select is(public.ai_settle_execution('d3500000-0000-4000-8000-000000000203',1,'stopped-before-dispatch'),true,'known no-dispatch work is terminal');
select is((pg_temp.retention_admit('d3500000-0000-4000-8000-000000000104','d3500000-0000-4000-8000-000000000204')->>'allowed')::boolean,true,'admit record just inside cleanup threshold');
reset role;
update private.ai_execution_details set created_at=statement_timestamp()-interval '7 days' where execution_id in
 ('d3500000-0000-4000-8000-000000000201','d3500000-0000-4000-8000-000000000202','d3500000-0000-4000-8000-000000000203');
update private.ai_execution_details set created_at=statement_timestamp()-interval '6 days 22 hours 59 minutes' where execution_id='d3500000-0000-4000-8000-000000000204';
select is((select outstanding_count from private.ai_execution_epochs where epoch=1),3::bigint,'terminal work removed from outstanding count before retention');
select is((select uncertain_count from private.ai_execution_epochs where epoch=1),1::bigint,'one explicit unresolved record before pruning');
set local role service_role;
select is((pg_temp.retention_admit('d3500000-0000-4000-8000-000000000105','d3500000-0000-4000-8000-000000000205')->>'allowed')::boolean,false,'overdue backlog fails admission closed');
reset role;
select lives_ok('select private.prune_ai_execution_details()','prune terminal and uncertain detail after cutoff');
select is((select count(*) from private.ai_execution_details),1::bigint,'only just-inside-cutoff detail remains');
select is((select outstanding_count from private.ai_execution_epochs where epoch=1),3::bigint,'deleting detail never declares work completed');
select is((select uncertain_count from private.ai_execution_epochs where epoch=1),2::bigint,'expired unacknowledged admission becomes aggregate uncertainty exactly once');
select lives_ok('select private.prune_ai_execution_details()','repeated pruning is idempotent');
select is((select uncertain_count from private.ai_execution_epochs where epoch=1),2::bigint,'repeat does not double uncertainty');
set local role service_role;
select is(public.ai_authorize_execution_attempt('d3500000-0000-4000-8000-000000000201',1,1),false,'expired ticket cannot authorize dispatch');
select is(public.ai_settle_execution('d3500000-0000-4000-8000-000000000201',1,'completed'),false,'expired ticket cannot decrement aggregate by late settlement');
reset role;
select is((select outstanding_count from private.ai_execution_epochs where epoch=1),3::bigint,'late settlement preserves aggregate count');
-- The retained quota routine's8-day receipt cleanup is independent of detail age.
set local role service_role;
select is((pg_temp.retention_admit('d3500000-0000-4000-8000-000000000105','d3500000-0000-4000-8000-000000000205')->>'allowed')::boolean,true,'admit future old receipt with fresh execution detail');
reset role;
update private.ai_logical_requests set created_at=statement_timestamp()-interval '9 days' where request_id='d3500000-0000-4000-8000-000000000105';
set local role service_role;
select is((pg_temp.retention_admit('d3500000-0000-4000-8000-000000000106','d3500000-0000-4000-8000-000000000206')->>'allowed')::boolean,true,'new real quota transaction exercises old receipt cleanup');
select is(public.ai_settle_execution('d3500000-0000-4000-8000-000000000206',1,'stopped-before-dispatch'),true,'extra cleanup-driving request made no provider call');
reset role;
select is((select count(*) from private.ai_logical_requests where request_id='d3500000-0000-4000-8000-000000000105'),0::bigint,'actual retained quota cleanup removes9-day receipt');
select is((select count(*) from private.ai_execution_details where execution_id='d3500000-0000-4000-8000-000000000205'),0::bigint,'receipt trigger removes fresh linked detail');
select is((select outstanding_count from private.ai_execution_epochs where epoch=1),4::bigint,'8-day receipt cleanup does not complete old execution');
select is((select uncertain_count from private.ai_execution_epochs where epoch=1),3::bigint,'8-day receipt cleanup retains aggregate uncertainty');
update private.ai_execution_details set created_at=statement_timestamp()-interval '7 days' where execution_id='d3500000-0000-4000-8000-000000000206';
select private.prune_ai_execution_details();
update private.ai_admission_control set last_pruned_at=statement_timestamp()-interval '2 hours';
set local role service_role;
select is((pg_temp.retention_admit('d3500000-0000-4000-8000-000000000105','d3500000-0000-4000-8000-000000000205')->>'allowed')::boolean,false,'stale maintenance health denies fresh work');
reset role;
select private.prune_ai_execution_details();
select ok((select last_pruned_at>=statement_timestamp()-interval '1 minute' from private.ai_admission_control),'successful maintenance refreshes health');
select is((select count(*) from private.ai_execution_details d join private.ai_logical_requests r using(request_id)
 where r.user_id='d3500000-0000-4000-8000-000000000001'),1::bigint,'target-only export join includes remaining own execution detail');
-- Catchable maintenance failures must roll back partial pruning and close admission.
create function pg_temp.reject_execution_prune() returns trigger language plpgsql as $$begin raise exception 'Synthetic pruning failure.';end;$$;
create trigger retention_test_failure before delete on private.ai_execution_details for each row execute function pg_temp.reject_execution_prune();
update private.ai_execution_details set created_at=statement_timestamp()-interval '7 days';
select is(private.prune_ai_execution_details(),-1::bigint,'catchable pruning failure returns explicit failure sentinel');
select is((select count(*) from private.ai_execution_details),1::bigint,'failed pruning does not partly remove detail');
select is((select uncertain_count from private.ai_execution_epochs where epoch=1),3::bigint,'failed pruning does not partly increment uncertainty');
select ok((select not is_open and last_pruned_at is null from private.ai_admission_control),'observed maintenance failure closes gate and clears health');
drop trigger retention_test_failure on private.ai_execution_details;
update private.ai_execution_details set created_at=statement_timestamp()-interval '6 days 22 hours 59 minutes';
select private.prune_ai_execution_details();
-- Owner removal is wholly inside the outer rollback, never a permanent fixture deletion.
delete from auth.users where id='d3500000-0000-4000-8000-000000000001';
select is((select count(*) from private.ai_execution_details),0::bigint,'owner cascade removes remaining linked detail');
select is((select outstanding_count from private.ai_execution_epochs where epoch=1),4::bigint,'owner deletion is not a provider completion acknowledgment');
select is((select uncertain_count from private.ai_execution_epochs where epoch=1),4::bigint,'owner cascade preserves formerly unacknowledged work as aggregate uncertainty');
select private.close_ai_admission();
select throws_ok('select private.open_ai_admission()','ED001',null,'detail expiry and account deletion cannot reopen uncertain epoch');
select * from finish();
rollback;
