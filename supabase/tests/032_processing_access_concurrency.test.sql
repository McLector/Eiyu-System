create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path=public,extensions;
select no_plan();
select lives_ok($$select extensions.dblink_connect('processing_writer','dbname=postgres user=supabase_admin application_name=processing_writer options=-csearch_path=')$$,'connects independent processing writer');
select lives_ok($$select extensions.dblink_connect('processing_locker','dbname=postgres user=supabase_admin application_name=processing_locker options=-csearch_path=')$$,'connects independent consent locker');
select extensions.dblink_exec('processing_locker',$setup$
-- Test-only templates, embedded in rollback tests/owned dblink connections.
-- Exercise retained quota/processing policy beneath051, not live legacy ingress.
-- Real instrumented admission/legacy refusal is covered by033/034.
create function pg_temp.ai_policy_begin(p_user_id uuid,p_action text,p_request_id uuid,p_week_start date)
returns jsonb language sql security definer set search_path='' as $$
 select private.ai_begin_request_before_admission(p_user_id,p_action,p_request_id,p_week_start);
$$;
create function pg_temp.ai_policy_reserve(p_request_id uuid,p_attempt_number integer)
returns boolean language sql security definer set search_path='' as $$
 select private.ai_reserve_next_attempt_before_admission(p_request_id,p_attempt_number);
$$;
create function pg_temp.ai_policy_check(p_request_id uuid,p_age_version integer)
returns boolean language sql security definer set search_path='' as $$
 select private.ai_check_request_age_before_admission(p_request_id,p_age_version);
$$;
alter function pg_temp.ai_policy_begin(uuid,text,uuid,date) owner to postgres;
alter function pg_temp.ai_policy_reserve(uuid,integer) owner to postgres;
alter function pg_temp.ai_policy_check(uuid,integer) owner to postgres;
revoke all on function pg_temp.ai_policy_begin(uuid,text,uuid,date),pg_temp.ai_policy_reserve(uuid,integer),pg_temp.ai_policy_check(uuid,integer) from public,anon,authenticated;
grant execute on function pg_temp.ai_policy_begin(uuid,text,uuid,date),pg_temp.ai_policy_reserve(uuid,integer),pg_temp.ai_policy_check(uuid,integer) to service_role;

 insert into auth.users(id,email,raw_user_meta_data) values
  ('d3200000-0000-4000-8000-000000000001','processing-locks@example.invalid','{"birth_date":"2000-01-01"}');
 update private.mailbox_state set verified_version=version,verified_at=now() where user_id='d3200000-0000-4000-8000-000000000001';
 insert into private.processing_consent(user_id,age_granted,age_notice,ai_granted,ai_notice,version)
  values('d3200000-0000-4000-8000-000000000001',true,'2026-11-08-adult-v1',true,'2026-11-08-weekly-debrief-v2',2);
$setup$);
select extensions.dblink_exec('processing_locker',$sql$
 begin;set local role service_role;set local "request.jwt.claim.role"='service_role';
$sql$);
select is((select result->>'allowed' from extensions.dblink('processing_locker',$sql$
 select pg_temp.ai_policy_begin('d3200000-0000-4000-8000-000000000001','weekly-summary','d3200000-0000-4000-8000-000000000101',date_trunc('week',current_date)::date)
$sql$) as r(result jsonb)),'true','creates a real synthetic quota reservation, without provider traffic');
select extensions.dblink_exec('processing_locker',$sql$
 commit;
 insert into public.weekly_summaries(user_id,week_start,summary,age_version,consent_version,authority_version,mailbox_version)
 values('d3200000-0000-4000-8000-000000000001',date_trunc('week',current_date)::date,'Retained concurrency review',1,2,0,1);
 commit;
 begin;set local statement_timeout='8s';
 do $lock$begin perform 1 from auth.users where id='d3200000-0000-4000-8000-000000000001' for update;end$lock$;
$sql$);
select extensions.dblink_exec('processing_writer',$sql$
 begin;set local role authenticated;
 set local "request.jwt.claims"='{"sub":"d3200000-0000-4000-8000-000000000001","role":"authenticated"}';
 set local statement_timeout='8s';
$sql$);
select is(extensions.dblink_send_query('processing_writer',$sql$
 update public.weekly_summaries set summary='Synthetic held replacement'
 where user_id='d3200000-0000-4000-8000-000000000001'
$sql$),1,'starts content write while the owner is locked');
do $$begin for i in 1..100 loop
 exit when exists(select 1 from pg_stat_activity where application_name='processing_writer' and wait_event_type='Lock');
 perform pg_sleep(0.02);end loop;end$$;
select ok(exists(select 1 from pg_stat_activity where application_name='processing_writer' and wait_event_type='Lock'),'content write waits for the owner authorization lock');
select lives_ok($test$select extensions.dblink_exec('processing_locker',$remote$
 do $body$begin perform 1 from public.weekly_summaries
  where user_id='d3200000-0000-4000-8000-000000000001' for update nowait;end$body$;
$remote$)$test$,'writer waiting for owner has not locked summary first (prevents quota/write deadlock)');
select extensions.dblink_exec('processing_locker','rollback');

select lives_ok($$select * from extensions.dblink_get_result('processing_writer') as r(status text)$$,'content writer completes after owner unlock');
select * from extensions.dblink_get_result('processing_writer') as r(status text);
select extensions.dblink_exec('processing_writer','rollback');

-- A consent change must wait for the earlier request authorization transaction.
select extensions.dblink_exec('processing_locker',$sql$
 begin;set local role service_role;set local "request.jwt.claim.role"='service_role';
$sql$);
select is((select result from extensions.dblink('processing_locker',$sql$
 select pg_temp.ai_policy_check('d3200000-0000-4000-8000-000000000101',1)
$sql$) as r(result boolean)),true,'held final authorization initially allowed');
select extensions.dblink_exec('processing_writer',$sql$
 begin;set local role authenticated;
 set local "request.jwt.claims"='{"sub":"d3200000-0000-4000-8000-000000000001","role":"authenticated"}';
 set local statement_timeout='8s';
$sql$);
select is(extensions.dblink_send_query('processing_writer',$sql$
 select public.set_processing_consent('weekly-debrief',false,'2026-11-08-weekly-debrief-v2',
  'd3200000-0000-4000-8000-000000000001',1,2,0,1)->>'canGenerateDebrief'
$sql$),1,'starts concurrent withdrawal');
do $$begin for i in 1..100 loop
 exit when exists(select 1 from pg_stat_activity where application_name='processing_writer' and wait_event_type='Lock');
 perform pg_sleep(0.02);end loop;end$$;
select ok(exists(select 1 from pg_stat_activity where application_name='processing_writer' and wait_event_type='Lock'),'withdrawal waits for earlier final-authorization transaction');
select extensions.dblink_exec('processing_locker','commit');
select is((select result from extensions.dblink_get_result('processing_writer') as r(result text)),'false','withdrawal resumes and denies generation');
select * from extensions.dblink_get_result('processing_writer') as r(result text);
select extensions.dblink_exec('processing_writer','commit');
select extensions.dblink_exec('processing_locker',$sql$
 begin;set local role service_role;set local "request.jwt.claim.role"='service_role';
$sql$);
select is((select result from extensions.dblink('processing_locker',$sql$
 select pg_temp.ai_policy_check('d3200000-0000-4000-8000-000000000101',1)
$sql$) as r(result boolean)),false,'subsequent authorization rejects captured grant after withdrawal');
select extensions.dblink_exec('processing_locker','rollback');
-- Regrant purpose explicitly, reserve the unchanged existing regeneration
-- allowance, then hold a current request against operator authority revocation.
select extensions.dblink_exec('processing_writer',$sql$
 begin;set local role authenticated;
 set local "request.jwt.claims"='{"sub":"d3200000-0000-4000-8000-000000000001","role":"authenticated"}';
$sql$);
select is((select result from extensions.dblink('processing_writer',$sql$
 select public.set_processing_consent('weekly-debrief',true,'2026-11-08-weekly-debrief-v2',
  'd3200000-0000-4000-8000-000000000001',1,3,0,1)->>'consentVersion'
$sql$) as r(result text)),'4','purpose regrant has a new explicit revision');
select is((select result from extensions.dblink('processing_writer',
 $$select public.reserve_weekly_summary_regen(date_trunc('week',current_date)::date)$$) as r(result integer)),1,'first existing daily regeneration slot reserved');
select extensions.dblink_exec('processing_writer','commit');
select extensions.dblink_exec('processing_locker',$sql$
 begin;set local role service_role;set local "request.jwt.claim.role"='service_role';
$sql$);
select is((select result->>'allowed' from extensions.dblink('processing_locker',$sql$
 select pg_temp.ai_policy_begin('d3200000-0000-4000-8000-000000000001','weekly-summary','d3200000-0000-4000-8000-000000000102',date_trunc('week',current_date)::date)
$sql$) as r(result jsonb)),'true','new grant creates a current held request');
select extensions.dblink_exec('processing_writer', 'begin');
select is(extensions.dblink_send_query('processing_writer',$sql$
 select 'revoked' from (select private.record_processing_authority(
  'd3200000-0000-4000-8000-000000000001','revoked',array['age-screening','weekly-debrief'],1,
  'd3200000-0000-4000-8000-000000000201')) reviewed
$sql$),1,'starts trusted synthetic authority revocation');
do $$begin for i in 1..100 loop
 exit when exists(select 1 from pg_stat_activity where application_name='processing_writer' and wait_event_type='Lock');
 perform pg_sleep(0.02);end loop;end$$;
select ok(exists(select 1 from pg_stat_activity where application_name='processing_writer' and wait_event_type='Lock'),'authority revocation waits for earlier request authorization');
select extensions.dblink_exec('processing_locker','commit');
select is((select result from extensions.dblink_get_result('processing_writer') as r(result text)),'revoked','authority revocation resumes');
select * from extensions.dblink_get_result('processing_writer') as r(result text);
select extensions.dblink_exec('processing_writer','commit');
select extensions.dblink_exec('processing_locker',$sql$
 begin;set local role service_role;set local "request.jwt.claim.role"='service_role';
$sql$);
select is((select result from extensions.dblink('processing_locker',
 $$select pg_temp.ai_policy_check('d3200000-0000-4000-8000-000000000102',1)$$) as r(result boolean)),false,'held response denied after authority revocation');
select extensions.dblink_exec('processing_locker','rollback');

select extensions.dblink_exec('processing_writer',$sql$
 do $body$begin perform private.record_processing_authority('d3200000-0000-4000-8000-000000000001','not-required',
  array['age-screening','weekly-debrief'],1,'d3200000-0000-4000-8000-000000000202');end$body$;
 begin;set local role authenticated;
 set local "request.jwt.claims"='{"sub":"d3200000-0000-4000-8000-000000000001","role":"authenticated"}';
$sql$);
select is((select result from extensions.dblink('processing_writer',
 $$select public.reserve_weekly_summary_regen(date_trunc('week',current_date)::date)$$) as r(result integer)),2,'second existing daily regeneration slot reserved without changing allowance');
select extensions.dblink_exec('processing_writer','commit');
select extensions.dblink_exec('processing_locker',$sql$
 begin;set local role service_role;set local "request.jwt.claim.role"='service_role';
$sql$);
select is((select result->>'allowed' from extensions.dblink('processing_locker',$sql$
 select pg_temp.ai_policy_begin('d3200000-0000-4000-8000-000000000001','weekly-summary','d3200000-0000-4000-8000-000000000103',date_trunc('week',current_date)::date)
$sql$) as r(result jsonb)),'true','reviewed disposition creates a current birthday-race request');
select extensions.dblink_exec('processing_writer',$sql$
 begin;set local role authenticated;
 set local "request.jwt.claims"='{"sub":"d3200000-0000-4000-8000-000000000001","role":"authenticated"}';
$sql$);
select is(extensions.dblink_send_query('processing_writer',
 $$select public.set_account_birthday('1999-01-01')->>'version'$$),1,'starts trusted birthday correction while request is held');
do $$begin for i in 1..100 loop
 exit when exists(select 1 from pg_stat_activity where application_name='processing_writer' and wait_event_type='Lock');
 perform pg_sleep(0.02);end loop;end$$;
select ok(exists(select 1 from pg_stat_activity where application_name='processing_writer' and wait_event_type='Lock'),'birthday correction waits for earlier request authorization');
select extensions.dblink_exec('processing_locker','commit');
select is((select result from extensions.dblink_get_result('processing_writer') as r(result text)),'2','trusted correction advances birthday revision after unlock');
select * from extensions.dblink_get_result('processing_writer') as r(result text);
select extensions.dblink_exec('processing_writer','commit');
select extensions.dblink_exec('processing_locker',$sql$
 begin;set local role service_role;set local "request.jwt.claim.role"='service_role';
$sql$);
select is((select result from extensions.dblink('processing_locker',
 $$select pg_temp.ai_policy_check('d3200000-0000-4000-8000-000000000103',1)$$) as r(result boolean)),false,'held response denied after accepted birthday correction');
select extensions.dblink_exec('processing_locker','rollback');
select is((select summary from public.weekly_summaries where user_id='d3200000-0000-4000-8000-000000000001'),
 'Retained concurrency review','rolled-back writer and withdrawal preserve summary text');
select extensions.dblink_exec('processing_locker',
 $cleanup$do $body$declare charge record;begin
 -- Remove only this no-provider-call fixture's own synthetic reserved attempts.
 -- Preserve all retained historical charges and other owners' accounting.
 for charge in select usage_date,count(*)::integer as amount from private.ai_provider_attempts
  where request_id in ('d3200000-0000-4000-8000-000000000101','d3200000-0000-4000-8000-000000000102',
   'd3200000-0000-4000-8000-000000000103') group by usage_date loop
  update private.ai_provider_daily_usage set attempt_count=attempt_count-charge.amount
   where usage_date=charge.usage_date and attempt_count>=charge.amount;
  if not found then raise exception 'Synthetic charge cleanup mismatch'; end if;
 end loop;
 delete from auth.users where id='d3200000-0000-4000-8000-000000000001';
 end$body$;$cleanup$);
select is((select count(*) from auth.users where id='d3200000-0000-4000-8000-000000000001'),0::bigint,'removes only this committed concurrency fixture');
select lives_ok($$select extensions.dblink_disconnect('processing_writer')$$,'disconnects writer');
select lives_ok($$select extensions.dblink_disconnect('processing_locker')$$,'disconnects locker');
select * from finish();

