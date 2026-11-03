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
 ('d3100000-0000-4000-8000-000000000001','processing-adult@example.invalid','{"birth_date":"2000-01-01"}'),
 ('d3100000-0000-4000-8000-000000000002','processing-teen@example.invalid','{"birth_date":"2010-01-01"}'),
 ('d3100000-0000-4000-8000-000000000003','processing-unknown@example.invalid','{}'),
 ('d3100000-0000-4000-8000-000000000004','processing-correction@example.invalid','{"birth_date":"2000-01-01"}');
update private.mailbox_state set verified_version=version,verified_at=now()
 where user_id in ('d3100000-0000-4000-8000-000000000001','d3100000-0000-4000-8000-000000000002');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$select pg_temp.ai_policy_begin('d3100000-0000-4000-8000-000000000001','weekly-summary','d3100000-0000-4000-8000-000000000101',date_trunc('week',current_date)::date)$$,
 'EP001',null,'verified adult without specific permission cannot spend quota');
reset role;
select has_function('public','get_processing_access','self processing access exists');
select has_table('private','processing_consent','purpose records are private');
select has_table('private','processing_authority','authority records are private');
select ok(not has_table_privilege('authenticated','private.processing_authority','UPDATE'),'clients cannot approve authority');
select ok(not has_table_privilege('service_role','private.processing_authority','UPDATE'),'AI service cannot approve authority');

-- Real Auth's database role must not create fresh accounts from generic Terms
-- or coerced metadata. Privileged legacy fixture imports above remain distinct.
grant usage on schema extensions to supabase_auth_admin;
set local role supabase_auth_admin;
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('d3100000-0000-4000-8000-000000000901','missing-prior-consent@example.invalid','{"birth_date":"2000-01-01"}')$$,
 'EP003',null,'fresh Auth signup requires prior specific age consent');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('d3100000-0000-4000-8000-000000000902','coerced-consent@example.invalid','{"birth_date":"2000-01-01","processing_consent":{"age_screening":{"granted":"true","notice_version":"2026-10-20-age-v1"}}}')$$,
 'EP003',null,'text true is not an explicit boolean grant');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('d3100000-0000-4000-8000-000000000903','wrong-notice@example.invalid','{"birth_date":"2000-01-01","processing_consent":{"age_screening":{"granted":true,"notice_version":"old"}}}')$$,
 'EP003',null,'fresh signup cannot use a stale notice');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('d3100000-0000-4000-8000-000000000904','explicit-prior-consent@example.invalid','{"birth_date":"2000-01-01","processing_consent":{"age_screening":{"granted":true,"notice_version":"2026-10-20-age-v1"},"weekly_debrief":{"granted":true}}}')$$,
 'fresh signup captures only the explicit prior age-purpose grant');
reset role;
select is((select count(*) from auth.users where id in ('d3100000-0000-4000-8000-000000000901','d3100000-0000-4000-8000-000000000902','d3100000-0000-4000-8000-000000000903')),0::bigint,'rejected signups leave no Auth/profile/declaration transaction');
select is((select age_granted from private.processing_consent where user_id='d3100000-0000-4000-8000-000000000904'),true,'accepted initial age grant is server recorded');
select is((select ai_granted from private.processing_consent where user_id='d3100000-0000-4000-8000-000000000904'),false,'initial editable metadata cannot grant AI consent');
update auth.users set raw_user_meta_data='{"processing_consent":{"age_screening":{"granted":true,"notice_version":"2026-10-20-age-v1"}}}'
 where id='d3100000-0000-4000-8000-000000000003';
select is((select count(*) from private.processing_consent where user_id='d3100000-0000-4000-8000-000000000003'),0::bigint,'later editable metadata cannot grant a legacy account permission');

create function pg_temp.consent(purpose text,granted boolean) returns jsonb
language plpgsql as $$declare s jsonb:=public.get_processing_access(); begin
 return public.set_processing_consent(purpose,granted,
  case when purpose='age-screening' then '2026-10-20-age-v1' else '2026-10-20-weekly-debrief-v1' end,
  (s->>'userId')::uuid,(s->>'ageVersion')::integer,(s->>'consentVersion')::integer,
  (s->>'authorityVersion')::integer,(s->>'mailboxVersion')::integer);
end;$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d3100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is(public.get_processing_access()->>'contractVersion','1','explicit capability version');
select is(public.get_processing_access()->>'ageConsent','false','old Terms/birthday are not consent');
select is(public.get_processing_access()->>'authorityState','not-required','ordinary adult declaration needs no extra identity evidence');
select is(pg_temp.consent('age-screening',true)->>'canReadDebrief','true','age permission and existing mailbox allow saved reads');
select is(public.get_processing_access()->>'canGenerateDebrief','false','age permission alone does not allow inference');
select is(pg_temp.consent('weekly-debrief',true)->>'canGenerateDebrief','true','separate AI permission allows eligible generation');
select is(public.get_processing_access()->>'consentVersion','2','each changed purpose advances one revision');
select is(pg_temp.consent('weekly-debrief',true)->>'consentVersion','2','identical explicit grant is idempotent');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'old-notice','d3100000-0000-4000-8000-000000000001',1,2,0,1)$$,
 '22023',null,'unreviewed notice rejected');
select throws_ok($$select public.set_processing_consent('authority',true,'2026-10-20-weekly-debrief-v1','d3100000-0000-4000-8000-000000000001',1,2,0,1)$$,
 '22023',null,'purpose input cannot grant authority');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'2026-10-20-weekly-debrief-v1','d3100000-0000-4000-8000-000000000002',1,2,0,1)$$,
 '42501',null,'captured wrong account rejected');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'2026-10-20-weekly-debrief-v1','d3100000-0000-4000-8000-000000000001',1,1,0,1)$$,
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

-- Reviewed synthetic operating disposition, not proof for a real child/guardian.
select private.record_processing_authority('d3100000-0000-4000-8000-000000000002','not-required',
 array['age-screening','weekly-debrief'],1,'d3100000-0000-4000-8000-000000000201');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d3100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(pg_temp.consent('age-screening',true)->>'ageEligible','true','accepted teen meets12+ age condition');
select is(pg_temp.consent('weekly-debrief',true)->>'canGenerateDebrief','true','reviewed applicable teen consent can enable debriefs');
select is(public.get_account_age()->>'adultDeclared','false','adult fact still means18+');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(pg_temp.ai_policy_begin('d3100000-0000-4000-8000-000000000002','weekly-summary','d3100000-0000-4000-8000-000000000102',date_trunc('week',current_date)::date)->>'allowed','true','no nested adult wrapper blocks reviewed teen');
reset role;
select private.record_processing_authority('d3100000-0000-4000-8000-000000000002','revoked',
 array['age-screening','weekly-debrief'],1,'d3100000-0000-4000-8000-000000000202');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select is(public.get_processing_access()->>'canReadDebrief','false','authority revocation denies protected access');
select throws_ok($$select private.record_processing_authority('d3100000-0000-4000-8000-000000000002','approved',array['age-screening','weekly-debrief'],1,'d3100000-0000-4000-8000-000000000203')$$,
 '42501',null,'child cannot write trusted authority decision');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(pg_temp.ai_policy_check('d3100000-0000-4000-8000-000000000102',1),false,'held teen response cannot survive authority revocation');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"d3100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_processing_access()->>'ageEligible','false','legacy unknown remains AI denied');
select is(public.get_processing_access()->>'canGenerateDebrief','false','unknown age cannot infer consent');
select throws_ok($$select public.set_account_birthday('2000-01-01')$$,'EP001',null,'legacy Profile save requires specific prior birthday permission');
select is(public.get_account_age()->>'birthDate',null,'denied birthday save retains the unknown declaration');
select is(pg_temp.consent('age-screening',true)->>'ageConsent','true','legacy owner can explicitly grant the age purpose before declaring');
select lives_ok($$select public.set_account_birthday('2000-01-01')$$,'trusted valid correction remains available without an extra identity review');
select is(public.get_processing_access()->>'aiConsent','false','adult correction does not manufacture optional AI permission');
reset role;
update private.account_age set pending_birth_date=date '2001-01-01' where user_id='d3100000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d3100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(public.get_processing_access()->>'ageEligible','false','retained pending correction denies age eligibility');
reset role;
update private.account_age set pending_birth_date=null,birth_date=((statement_timestamp() at time zone 'Asia/Manila')::date-interval '12 years')::date
 where user_id='d3100000-0000-4000-8000-000000000004';
set local role authenticated;
select is(public.get_processing_access()->>'ageEligible','true','exact12 boundary accepted in adopted civil timezone');
reset role;
update private.account_age set birth_date=birth_date+1 where user_id='d3100000-0000-4000-8000-000000000004';
set local role authenticated;
select is(public.get_processing_access()->>'ageEligible','false','day before12 remains denied');
reset role;
select is((select count(*) from private.processing_consent_events where user_id='d3100000-0000-4000-8000-000000000001'),5::bigint,'audit records changed purposes only, not idempotent repeats');
select is((select count(*) from public.weekly_summaries where user_id='d3100000-0000-4000-8000-000000000001'),3::bigint,'withdrawal/correction/authority tests preserve saved histories');
select * from finish();
rollback;

