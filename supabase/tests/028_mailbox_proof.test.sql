begin;
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


create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_table('private','mailbox_state','mailbox proof is private');
select has_function('public','get_mailbox_status','self status exists');
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('d2800000-0000-4000-8000-000000000001','mailbox-a@example.invalid','{"birth_date":"2000-01-01","email_verified":true}',now()),
 ('d2800000-0000-4000-8000-000000000002','mailbox-other@example.invalid','{"birth_date":"2000-01-01"}',now());
-- This suite isolates mailbox proof after explicit synthetic processing grants.
insert into private.processing_consent(user_id,age_granted,age_notice,ai_granted,ai_notice,version) values
 ('d2800000-0000-4000-8000-000000000001',true,'2026-11-08-adult-v1',true,'2026-11-08-weekly-debrief-v2',2),
 ('d2800000-0000-4000-8000-000000000002',true,'2026-11-08-adult-v1',true,'2026-11-08-weekly-debrief-v2',2);
select ok(not has_table_privilege('authenticated','private.mailbox_state','UPDATE'),'client cannot grant proof');
select ok(not has_function_privilege('authenticated','public.mailbox_finish(uuid,uuid,uuid,text)','EXECUTE'),'proof writer is service only');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_mailbox_status()->>'verified','false','auto-confirmation and metadata grant no proof');
select lives_ok($$select public.get_habits_for_date(current_date)$$,'unproved account retains quest reads');
select throws_ok($$select public.reserve_weekly_summary_regen(current_date)$$,'EM001','Verify your email to access your weekly debrief.','legacy regen cannot bypass proof');
reset role;
insert into public.weekly_summaries(user_id,week_start,summary) values('d2800000-0000-4000-8000-000000000001',date_trunc('week',current_date)::date-7,'Retained');
set local role authenticated;
select is((select count(*) from public.weekly_summaries),0::bigint,'unproved cannot read saved content');
select throws_ok($$insert into public.weekly_summaries(user_id,week_start,summary) values('d2800000-0000-4000-8000-000000000001',current_date-7,'Bypass')$$,'EM001',null,'unproved direct write denied');
reset role;
create temp table challenge as select null::uuid id;
grant all on challenge to service_role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$select pg_temp.ai_policy_begin('d2800000-0000-4000-8000-000000000001','weekly-summary','d2800000-0000-4000-8000-000000000101',current_date)$$,'EM001','Verify your email to access your weekly debrief.','direct debrief spending denied before quota');
select is(pg_temp.ai_policy_begin('d2800000-0000-4000-8000-000000000001','easy-versions','d2800000-0000-4000-8000-000000000102',null)->>'allowed','true','mailbox proof does not gate ordinary adult suggestions');
update challenge set id=(public.mailbox_begin('d2800000-0000-4000-8000-000000000001')->>'challengeId')::uuid;
select is(public.mailbox_begin('d2800000-0000-4000-8000-000000000001')->>'allowed','false','resend cooldown enforced');
select is(public.mailbox_attempt('d2800000-0000-4000-8000-000000000001',(select id from challenge))->>'allowed','false','undelivered challenge cannot verify');
select is(public.mailbox_send_result('d2800000-0000-4000-8000-000000000001',(select id from challenge),true),true,'delivery marks current challenge ready');
select is(public.mailbox_attempt('d2800000-0000-4000-8000-000000000002',(select id from challenge))->>'allowed','false','another owner cannot consume challenge');
select is(public.mailbox_attempt('d2800000-0000-4000-8000-000000000001',(select id from challenge))->>'email','mailbox-a@example.invalid','recipient resolves current DB address');
select is(public.mailbox_finish('d2800000-0000-4000-8000-000000000001',(select id from challenge),'d2800000-0000-4000-8000-000000000002','mailbox-a@example.invalid'),false,'wrong Auth identity cannot grant proof');
select is(public.mailbox_finish('d2800000-0000-4000-8000-000000000001',(select id from challenge),'d2800000-0000-4000-8000-000000000001','mailbox-other@example.invalid'),false,'wrong evidence address cannot grant proof');
select is(public.mailbox_finish('d2800000-0000-4000-8000-000000000001',(select id from challenge),'d2800000-0000-4000-8000-000000000001','mailbox-a@example.invalid'),true,'matched trusted evidence grants current proof');
select is(public.mailbox_finish('d2800000-0000-4000-8000-000000000001',(select id from challenge),'d2800000-0000-4000-8000-000000000001','mailbox-a@example.invalid'),false,'challenge is single use');
-- Retained prior-week content must not accidentally select the regeneration path on Mondays.
select is(pg_temp.ai_policy_begin('d2800000-0000-4000-8000-000000000001','weekly-summary','d2800000-0000-4000-8000-000000000103',date_trunc('week',current_date)::date)->>'allowed','true','current-week request reserves before testing mailbox revisions');
select is(pg_temp.ai_policy_begin('d2800000-0000-4000-8000-000000000001','weekly-summary','d2800000-0000-4000-8000-000000000103',date_trunc('week',current_date)::date)->>'mailboxVersion','1','debrief request binds current email version');
select is(pg_temp.ai_policy_check('d2800000-0000-4000-8000-000000000103',1),true,'unchanged proof passes final check');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select is(public.get_mailbox_status()->>'verified','true','fresh self status reflects independently recorded proof');
select is((select count(*) from public.weekly_summaries),1::bigint,'proven adult can read retained debrief');
reset role;
update auth.users set email='mailbox-b@example.invalid' where id='d2800000-0000-4000-8000-000000000001';
update auth.users set email='mailbox-a@example.invalid' where id='d2800000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select is(public.get_mailbox_status()->>'verified','false','A to B to A does not revive proof');
select is(public.get_mailbox_status()->>'version','3','email changes advance authoritative revision');
select is((select count(*) from public.weekly_summaries),0::bigint,'old JWT cannot read after email ABA');
reset role;
select is((select count(*) from public.weekly_summaries where user_id='d2800000-0000-4000-8000-000000000001'),1::bigint,'saved content retained');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(pg_temp.ai_policy_check('d2800000-0000-4000-8000-000000000103',1),false,'inflight response denied after email ABA');
select throws_ok($$select pg_temp.ai_policy_reserve('d2800000-0000-4000-8000-000000000103',2)$$,'EM001','Verify your email to access your weekly debrief.','retry cannot spend after proof loss');
reset role;
update private.mailbox_state set last_sent_at=now()-interval '61 seconds' where user_id='d2800000-0000-4000-8000-000000000001';
set local role service_role;
update challenge set id=(public.mailbox_begin('d2800000-0000-4000-8000-000000000001')->>'challengeId')::uuid;
select is(public.mailbox_send_result('d2800000-0000-4000-8000-000000000001',(select id from challenge),false),true,'delivery failure invalidates challenge');
select is(public.mailbox_attempt('d2800000-0000-4000-8000-000000000001',(select id from challenge))->>'allowed','false','failed delivery cannot verify');
reset role;
update private.mailbox_state set last_sent_at=now()-interval '61 seconds' where user_id='d2800000-0000-4000-8000-000000000001';
set local role service_role;
update challenge set id=(public.mailbox_begin('d2800000-0000-4000-8000-000000000001')->>'challengeId')::uuid;
select public.mailbox_send_result('d2800000-0000-4000-8000-000000000001',(select id from challenge),true);
select is(public.mailbox_attempt('d2800000-0000-4000-8000-000000000001',(select id from challenge))->>'allowed','true','fresh challenge can attempt');
reset role;
update private.mailbox_state set challenge_expires_at=now()-interval '1 second' where user_id='d2800000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.mailbox_finish('d2800000-0000-4000-8000-000000000001',(select id from challenge),'d2800000-0000-4000-8000-000000000001','mailbox-a@example.invalid'),false,'expired challenge cannot persist evidence');
reset role;
update private.mailbox_state set challenge_expires_at=now()+interval '10 minutes',attempts=5 where user_id='d2800000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.mailbox_attempt('d2800000-0000-4000-8000-000000000001',(select id from challenge))->>'allowed','false','five attempt account window enforced');
reset role;
update private.mailbox_state set last_sent_at=now()-interval '61 seconds',sends=5 where user_id='d2800000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.mailbox_begin('d2800000-0000-4000-8000-000000000001')->>'allowed','false','send window cap enforced');
reset role;
select * from finish();
rollback;

