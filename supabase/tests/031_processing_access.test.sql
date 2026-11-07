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

-- Privileged fixture imports represent retained accounts, not fresh Auth signup.
insert into auth.users(id,email,raw_user_meta_data) values
 ('d3100000-0000-4000-8000-000000000001','processing-adult@example.invalid','{}'),
 ('d3100000-0000-4000-8000-000000000002','processing-second@example.invalid','{}'),
 ('d3100000-0000-4000-8000-000000000003','processing-unticked@example.invalid','{}');
update private.mailbox_state set verified_version=version,verified_at=now()
 where user_id in ('d3100000-0000-4000-8000-000000000001','d3100000-0000-4000-8000-000000000002');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$select pg_temp.ai_policy_begin('d3100000-0000-4000-8000-000000000001','weekly-summary','d3100000-0000-4000-8000-000000000101',date_trunc('week',current_date)::date)$$,
 'EP001',null,'verified mailbox without the 18+ box and AI agreement cannot spend quota');
reset role;
select has_function('public','get_processing_access','self processing access exists');
select has_table('private','processing_consent','purpose records are private');
select has_table('private','processing_authority','authority records are private');
select ok(not has_table_privilege('authenticated','private.processing_authority','UPDATE'),'clients cannot approve authority');
select ok(not has_table_privilege('service_role','private.processing_authority','UPDATE'),'AI service cannot approve authority');

-- Real Auth's database role: a sign-up never grants an AI permission, whatever metadata it carries. The old
-- birthday consent keys are ignored (S03b), and only the Terms version is recorded.
grant usage on schema extensions to supabase_auth_admin;
set local role supabase_auth_admin;
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('d3100000-0000-4000-8000-000000000902','coerced-consent@example.invalid','{"processing_consent":{"age_screening":{"granted":true,"notice_version":"2026-11-08-adult-v1"},"weekly_debrief":{"granted":true}}}')$$,
 'a sign-up that claims both permissions in metadata is accepted');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('d3100000-0000-4000-8000-000000000904','terms-only@example.invalid','{"terms":{"version":"2026-11-08-terms-v2"}}')$$,
 'a sign-up with the Terms version is accepted');
reset role;
select is((select count(*) from private.processing_consent where user_id in ('d3100000-0000-4000-8000-000000000902','d3100000-0000-4000-8000-000000000904')),0::bigint,
 'neither sign-up created a consent row, so editable metadata cannot grant the 18+ box or the AI agreement');
select is((select count(*) from private.terms_acceptance where user_id='d3100000-0000-4000-8000-000000000904'),1::bigint,'the Terms version is recorded server side');
update auth.users set raw_user_meta_data='{"processing_consent":{"age_screening":{"granted":true,"notice_version":"2026-10-20-age-v1"}}}'
 where id='d3100000-0000-4000-8000-000000000003';
select is((select count(*) from private.processing_consent where user_id='d3100000-0000-4000-8000-000000000003'),0::bigint,'later editable metadata cannot grant an existing account permission');

create function pg_temp.consent(purpose text,granted boolean) returns jsonb
language plpgsql as $$declare s jsonb:=public.get_processing_access(); begin
 return public.set_processing_consent(purpose,granted,
  case when purpose='age-screening' then '2026-11-08-adult-v1' else '2026-11-08-weekly-debrief-v2' end,
  (s->>'userId')::uuid,(s->>'ageVersion')::integer,(s->>'consentVersion')::integer,
  (s->>'authorityVersion')::integer,(s->>'mailboxVersion')::integer);
end;$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d3100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is(public.get_processing_access()->>'contractVersion','1','explicit capability version');
select is(public.get_processing_access()->>'ageConsent','false','the Terms are not the 18+ box');
select is(public.get_processing_access()->>'authorityState','not-required','no authority review exists any more');
select is(pg_temp.consent('age-screening',true)->>'canReadDebrief','true','the 18+ box and a verified mailbox allow saved reads');
select is(public.get_processing_access()->>'canGenerateDebrief','false','the 18+ box alone does not allow inference');
select is(pg_temp.consent('weekly-debrief',true)->>'canGenerateDebrief','true','separate AI permission allows eligible generation');
select is(public.get_processing_access()->>'consentVersion','2','each changed purpose advances one revision');
select is(pg_temp.consent('weekly-debrief',true)->>'consentVersion','2','identical explicit grant is idempotent');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'old-notice','d3100000-0000-4000-8000-000000000001',1,2,0,1)$$,
 '22023',null,'unreviewed notice rejected');
select throws_ok($$select public.set_processing_consent('authority',true,'2026-11-08-weekly-debrief-v2','d3100000-0000-4000-8000-000000000001',1,2,0,1)$$,
 '22023',null,'purpose input cannot grant authority');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'2026-11-08-weekly-debrief-v2','d3100000-0000-4000-8000-000000000002',1,2,0,1)$$,
 '42501',null,'captured wrong account rejected');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'2026-11-08-weekly-debrief-v2','d3100000-0000-4000-8000-000000000001',1,1,0,1)$$,
 'EP002',null,'stale consent decision rejected');
reset role;
insert into public.weekly_summaries(user_id,week_start,summary)
 values('d3100000-0000-4000-8000-000000000001',date_trunc('week',current_date)::date-7,'Retained historical review');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(pg_temp.ai_policy_begin('d3100000-0000-4000-8000-000000000001','weekly-summary','d3100000-0000-4000-8000-000000000101',date_trunc('week',current_date)::date)->>'consentVersion','2','request captures consent revision');
select is(pg_temp.ai_policy_check('d3100000-0000-4000-8000-000000000101',1),true,'complete final authorization initially succeeds');
select throws_ok($$insert into public.weekly_summaries(user_id,week_start,summary,age_version,consent_version,authority_version,mailbox_version)
 values('d3100000-0000-4000-8000-000000000001',date_trunc('week',current_date)::date+14,'Unsupported service content write',1,2,0,1)$$,
 '42501',null,'provider service has no direct content persistence path');
reset role;
insert into public.weekly_summaries(user_id,week_start,summary)
 values('d3100000-0000-4000-8000-000000000001',date_trunc('week',current_date)::date,'Legacy current review');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok($$select public.reserve_weekly_summary_regen(date_trunc('week',current_date)::date)$$,
 'quota-only updates preserve a legacy summary without fabricating provenance');
select is(pg_temp.consent('weekly-debrief',false)->>'canReadDebrief','true','AI withdrawal retains otherwise permitted saved reading');
select is((select count(*) from public.weekly_summaries),2::bigint,'historical summary preserved and readable');
select throws_ok($$insert into public.weekly_summaries(user_id,week_start,summary) values('d3100000-0000-4000-8000-000000000001',current_date,'Bypass')$$,
 'EP001',null,'direct summary write cannot bypass withdrawal');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(pg_temp.ai_policy_check('d3100000-0000-4000-8000-000000000101',1),false,'old response denied after withdrawal');
select throws_ok($$select pg_temp.ai_policy_reserve('d3100000-0000-4000-8000-000000000101',2)$$,'EP001',null,'old request cannot retry after withdrawal');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select is(pg_temp.consent('weekly-debrief',true)->>'consentVersion','4','regrant advances revision');
select throws_ok($$insert into public.weekly_summaries(user_id,week_start,summary,age_version,consent_version,authority_version,mailbox_version)
 values('d3100000-0000-4000-8000-000000000001',date_trunc('week',current_date)::date+7,'Stale response',1,2,0,1)$$,
 'EP002',null,'regrant cannot save stale generation provenance');
select lives_ok($$insert into public.weekly_summaries(user_id,week_start,summary,age_version,consent_version,authority_version,mailbox_version)
 values('d3100000-0000-4000-8000-000000000001',date_trunc('week',current_date)::date+7,'Current response',1,4,0,1)$$,
 'current explicit provenance may be saved');
select is(pg_temp.consent('age-screening',false)->>'canReadDebrief','false','age-purpose withdrawal denies protected reads');
select lives_ok($$select public.get_habits_for_date(current_date)$$,'ordinary quest reads do not require AI permission');
reset role;

-- An account that never ticked the 18+ box: nothing opens by itself, and the server refuses the AI agreement.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"d3100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_processing_access()->>'ageEligible','false','an account without the 18+ box is not AI eligible');
select is(public.get_processing_access()->>'canGenerateDebrief','false','and cannot generate');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'2026-11-08-weekly-debrief-v2','d3100000-0000-4000-8000-000000000003',1,0,0,1)$$,
 'EP001',null,'the AI agreement is refused until the 18+ box is ticked');
select is(pg_temp.consent('age-screening',true)->>'ageConsent','true','ticking the 18+ box records it');
select is(public.get_processing_access()->>'aiConsent','false','ticking it does not manufacture the AI agreement');
select is(public.get_processing_access()->>'canReadDebrief','false','and saved reads still wait for a verified mailbox');
reset role;
select is((select count(*) from private.processing_consent_events where user_id='d3100000-0000-4000-8000-000000000001'),5::bigint,'audit records changed purposes only, not idempotent repeats');
select is((select count(*) from public.weekly_summaries where user_id='d3100000-0000-4000-8000-000000000001'),3::bigint,'withdrawal/correction/authority tests preserve saved histories');
select * from finish();
rollback;

