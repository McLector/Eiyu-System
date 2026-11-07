begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local timezone='UTC';
select no_plan();
-- Migration 066, "simplify age": one Terms acceptance per account, an "I'm 18 or older" box that only the AI weekly
-- review needs, and no stored birthdays. Synthetic users; rolled back.
-- Fixture accounts are privileged imports (they stand for accounts that existed before 066); fresh sign-ups are
-- exercised through the Auth database role further down.
insert into auth.users(id,email,raw_user_meta_data) values
 ('da270000-0000-4000-8000-000000000001','simple-legacy@example.invalid','{"display_name":"Legacy","time_zone":"Asia/Manila"}'),
 ('da270000-0000-4000-8000-000000000002','simple-flow@example.invalid','{}'),
 ('da270000-0000-4000-8000-000000000003','simple-residue@example.invalid','{}'),
 ('da270000-0000-4000-8000-000000000004','simple-nomailbox@example.invalid','{}'),
 ('da270000-0000-4000-8000-000000000005','simple-terms@example.invalid','{}'),
 ('da270000-0000-4000-8000-000000000006','simple-other@example.invalid','{}'),
 ('da270000-0000-4000-8000-000000000007','simple-noadult@example.invalid','{}'),
 ('da270000-0000-4000-8000-000000000008','simple-noai@example.invalid','{}'),
 ('da270000-0000-4000-8000-000000000009','simple-stale@example.invalid','{}');
update private.mailbox_state set verified_version=version,verified_at=now()
 where user_id in ('da270000-0000-4000-8000-000000000001','da270000-0000-4000-8000-000000000002',
  'da270000-0000-4000-8000-000000000003','da270000-0000-4000-8000-000000000007','da270000-0000-4000-8000-000000000008',
  'da270000-0000-4000-8000-000000000009');
-- A legacy account: a stored birthday and permissions given under the October notices.
-- The sign-up trigger strips a birthday from a new account, so a legacy one gets its metadata key by update, the way
-- accounts created before this change have it.
update auth.users set raw_user_meta_data=raw_user_meta_data||'{"birth_date":"2000-01-01"}'::jsonb where id='da270000-0000-4000-8000-000000000001';
insert into private.account_age(user_id,birth_date) values
 ('da270000-0000-4000-8000-000000000001','2000-01-01'),
 ('da270000-0000-4000-8000-000000000003','2020-01-01')
 on conflict(user_id) do nothing;
insert into private.processing_consent(user_id,age_granted,age_notice,ai_granted,ai_notice,version) values
 ('da270000-0000-4000-8000-000000000001',true,'2026-10-20-age-v1',true,'2026-10-20-weekly-debrief-v1',2),
 ('da270000-0000-4000-8000-000000000007',false,null,true,'2026-11-08-weekly-debrief-v2',1),
 ('da270000-0000-4000-8000-000000000008',true,'2026-11-08-adult-v1',false,null,1),
 ('da270000-0000-4000-8000-000000000009',true,'2026-11-08-adult-v1',true,'2026-10-20-weekly-debrief-v1',2);
create function pg_temp.consent(purpose text,granted boolean,notice text default null) returns jsonb
language plpgsql as $$declare s jsonb:=public.get_processing_access(); begin
 return public.set_processing_consent(purpose,granted,
  coalesce(notice,case when purpose='age-screening' then '2026-11-08-adult-v1' else '2026-11-08-weekly-debrief-v2' end),
  (s->>'userId')::uuid,(s->>'ageVersion')::integer,(s->>'consentVersion')::integer,
  (s->>'authorityVersion')::integer,(s->>'mailboxVersion')::integer);
end;$$;
grant execute on function pg_temp.consent(text,boolean,text) to authenticated;

-- A. The Terms table and who can touch it.
select has_table('private','terms_acceptance','terms acceptance has its own private table');
select ok(not has_table_privilege('authenticated','private.terms_acceptance','SELECT'),'signed-in clients cannot read the table directly');
select ok(not has_table_privilege('authenticated','private.terms_acceptance','INSERT'),'signed-in clients cannot write the table directly');
select ok(not has_table_privilege('anon','private.terms_acceptance','SELECT'),'anonymous cannot read the table');
select ok(not has_table_privilege('service_role','private.terms_acceptance','UPDATE'),'the service role cannot change acceptance rows');
select ok(has_function_privilege('authenticated','public.accept_terms(text)','execute'),'a signed-in person can accept the Terms');
select ok(not has_function_privilege('anon','public.accept_terms(text)','execute'),'anonymous cannot accept the Terms');
select ok(not has_function_privilege('anon','public.get_terms_status()','execute'),'anonymous cannot read a Terms status');

-- B. The access rule. A legacy account keeps its board and is simply not an AI user until it ticks the new box.
set local role authenticated;
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000001',true);
select is(public.get_tracker_processing_access()->>'canWriteBasic','true','legacy account: board writes are allowed');
select is(public.get_tracker_processing_access()->>'canWriteCustom','true','legacy account: custom writes are allowed');
select is(public.get_tracker_processing_access()->>'canWriteFitness','true','legacy account: Gym writes are allowed');
select is(public.get_processing_access()->>'ageConsent','false','legacy account: the October birthday permission is not the 18+ box');
select is(public.get_processing_access()->>'ageEligible','false','legacy account: adult is not declared');
select is(public.get_processing_access()->>'aiConsent','false','legacy account: the October AI agreement is not the new one');
select is(public.get_processing_access()->>'canGenerateDebrief','false','legacy account: the AI review is off');
select is(public.get_processing_access()->>'canReadDebrief','false','legacy account: saved reviews wait for the box');
reset role;
select ok(not private.adult_declared('da270000-0000-4000-8000-000000000001'),'adult_declared is false for the legacy account');
select ok(not private.adult_declared('da270000-0000-4000-8000-000000000003'),'a stored birthday no longer declares anyone adult');

-- C. Fixed contract fields for every account.
set local role authenticated;
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000001',true);
select is(public.get_processing_access()->>'ageVersion','1','legacy: ageVersion is the constant 1');
select is(public.get_processing_access()->>'authorityVersion','0','legacy: authorityVersion is 0');
select is(public.get_processing_access()->>'authorityState','not-required','legacy: authorityState is not-required');
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000002',true);
select is(public.get_processing_access()->>'ageVersion','1','new account: ageVersion is the constant 1');
select is(public.get_processing_access()->>'authorityVersion','0','new account: authorityVersion is 0');
select is(public.get_processing_access()->>'authorityState','not-required','new account: authorityState is not-required');
select is(public.get_processing_access()->>'contractVersion','1','the contract version is unchanged');
select is(public.get_processing_access()->>'mailboxVersion','1','the mailbox version is still reported');
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000003',true);
select is(public.get_processing_access()->>'ageVersion','1','an account with a leftover birthday row still reports ageVersion 1');
select is(public.get_processing_access()->>'authorityState','not-required','and still not-required');

-- D. Tracker writes are never paused by age.
select is(public.get_tracker_processing_access()->>'canWriteBasic','true','a leftover birthday of 2020-01-01 does not pause writes');
select is(public.get_tracker_processing_access()->>'canWriteCustom','true','and does not pause custom writes');
select is(public.tracker_writes_allowed()::text,'true','and tracker_writes_allowed agrees');
reset role;
select ok(not private.tracker_writes_paused('da270000-0000-4000-8000-000000000003'),'tracker_writes_paused is false with a 2020 birthday in account_age');
select ok(not private.tracker_writes_paused('da270000-0000-4000-8000-000000000001'),'tracker_writes_paused is false for the legacy account');
select ok(not private.tracker_writes_paused('da270000-0000-4000-8000-000000000002'),'tracker_writes_paused is false for a new account');

-- E. The adult box and the AI agreement, one account through the whole flow.
set local role authenticated;
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000002',true);
select is(public.get_processing_access()->>'canGenerateDebrief','false','flow: nothing ticked, the review is off');
select throws_ok($$select pg_temp.consent('age-screening',true,'2026-10-20-age-v1')$$,'22023',null,'the old birthday notice version is refused');
select throws_ok($$select pg_temp.consent('age-screening',true,'made-up')$$,'22023',null,'an unknown notice version is refused');
select throws_ok($$select pg_temp.consent('weekly-debrief',true)$$,'EP001',null,'the AI agreement is refused while the adult box is off');
select throws_ok($$select pg_temp.consent('authority',true)$$,'22023',null,'no other purpose can be set');
select is(pg_temp.consent('age-screening',true)->>'ageEligible','true','ticking the adult box makes ageEligible true');
select is(public.get_processing_access()->>'ageConsent','true','and ageConsent true');
select is(public.get_processing_access()->>'canReadDebrief','true','a verified mailbox plus the adult box can read saved reviews');
select is(public.get_processing_access()->>'canGenerateDebrief','false','but cannot generate without the AI agreement');
select throws_ok($$select pg_temp.consent('weekly-debrief',true,'2026-10-20-weekly-debrief-v1')$$,'22023',null,'the stale October AI notice is refused');
select is(public.get_processing_access()->>'consentVersion','1','the refusals changed nothing');
select is(pg_temp.consent('weekly-debrief',true)->>'canGenerateDebrief','true','adult box + AI agreement + verified mailbox turns the review on');
select is(public.get_processing_access()->>'aiConsent','true','aiConsent is true');
select is(public.get_processing_access()->>'consentVersion','2','each change advanced the revision once');
select is(pg_temp.consent('weekly-debrief',true)->>'consentVersion','2','repeating the same choice is idempotent');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'2026-11-08-weekly-debrief-v2','da270000-0000-4000-8000-000000000002',1,1,0,1)$$,'EP002',null,'a stale revision is refused');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'2026-11-08-weekly-debrief-v2','da270000-0000-4000-8000-000000000006',1,2,0,1)$$,'42501',null,'a call naming another account is refused');
select is(pg_temp.consent('age-screening',false)->>'canGenerateDebrief','false','unticking the adult box turns the review off');
select is(public.get_processing_access()->>'aiConsent','true','and leaves the AI agreement as it was');
select is(public.get_processing_access()->>'canReadDebrief','false','and closes saved reviews');
reset role;
select is((select count(*)::integer from private.processing_consent_events where user_id='da270000-0000-4000-8000-000000000002' and purpose='age-screening' and granted and notice_version='2026-11-08-adult-v1'),1,'ticking the adult box recorded one event with the new notice');
select ok((select changed_at is not null from private.processing_consent_events where user_id='da270000-0000-4000-8000-000000000002' and purpose='age-screening' and granted),'and the event carries a timestamp');
select is((select count(*)::integer from private.processing_consent_events where user_id='da270000-0000-4000-8000-000000000002' and purpose='age-screening' and not granted),1,'unticking recorded its own event');
-- A direct call without the box is refused for the AI purpose even though the clients hide it.
set local role authenticated;
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000004',true);
select throws_ok($$select pg_temp.consent('weekly-debrief',true)$$,'EP001',null,'a direct AI agreement call without the adult box is refused by the server');

-- F. canGenerateDebrief needs all three: three negatives, one positive.
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000007',true);
select is(public.get_processing_access()->>'canGenerateDebrief','false','AI agreement and mailbox but no adult box: off');
select is(public.get_processing_access()->>'aiConsent','true','that account does hold the new AI agreement');
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000008',true);
select is(public.get_processing_access()->>'canGenerateDebrief','false','adult box and mailbox but no AI agreement: off');
select is(public.get_processing_access()->>'canReadDebrief','true','and saved reviews can be read');
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000004',true);
select is(pg_temp.consent('age-screening',true)->>'canReadDebrief','false','adult box but no verified mailbox cannot read reviews');
reset role;
insert into private.processing_consent(user_id,age_granted,age_notice,ai_granted,ai_notice,version)
 values('da270000-0000-4000-8000-000000000006',true,'2026-11-08-adult-v1',true,'2026-11-08-weekly-debrief-v2',2);
set local role authenticated;
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000006',true);
select is(public.get_processing_access()->>'canGenerateDebrief','false','adult box and AI agreement but no verified mailbox: off');
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000009',true);
select is(public.get_processing_access()->>'canGenerateDebrief','false','adult box with a stale AI notice: off');
reset role;
update private.processing_consent set ai_notice='2026-11-08-weekly-debrief-v2' where user_id='da270000-0000-4000-8000-000000000009';
set local role authenticated;
select is(public.get_processing_access()->>'canGenerateDebrief','true','all three present (mailbox verified, adult box, current AI agreement): on');
reset role;
select ok(private.require_debrief_generation('da270000-0000-4000-8000-000000000009') is not null,'the server-side generation check passes for that account');
select throws_ok($$select private.require_debrief_generation('da270000-0000-4000-8000-000000000007')$$,'EP001',null,'the server-side generation check refuses without the adult box');
select throws_ok($$select private.require_debrief_generation('da270000-0000-4000-8000-000000000008')$$,'EP001',null,'the server-side generation check refuses without the AI agreement');
select throws_ok($$select private.require_debrief_generation('da270000-0000-4000-8000-000000000006')$$,'EM001',null,'the server-side generation check refuses without a verified mailbox');

-- G. Sign-up through the Auth database role: the Terms are recorded when sent and nothing ever refuses the sign-up.
grant usage on schema extensions to supabase_auth_admin;
set local role supabase_auth_admin;
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('da270000-0000-4000-8000-000000000101','simple-signup@example.invalid','{"display_name":"New","terms":{"version":"2026-11-08-terms-v2"}}')$$,'sign-up with the Terms metadata succeeds');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('da270000-0000-4000-8000-000000000102','simple-nometa@example.invalid','{}')$$,'sign-up with no metadata still succeeds');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
 ('da270000-0000-4000-8000-000000000103','simple-google@example.invalid','{}','{"provider":"google"}')$$,'a Google sign-up with no metadata succeeds');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('da270000-0000-4000-8000-000000000104','simple-badstring@example.invalid','{"terms":"yes"}')$$,'terms metadata that is a string does not raise');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('da270000-0000-4000-8000-000000000105','simple-badversion@example.invalid','{"terms":{"version":"2020-01-01-old"}}')$$,'terms metadata with a wrong version does not raise');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('da270000-0000-4000-8000-000000000106','simple-badnumber@example.invalid','{"terms":{"version":5}}')$$,'terms metadata with a numeric version does not raise');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('da270000-0000-4000-8000-000000000107','simple-oldflow@example.invalid','{"birth_date":"2000-01-01","processing_consent":{"age_screening":{"granted":true,"notice_version":"2026-10-20-age-v1"}}}')$$,'an old client sending the October consent metadata is not refused');
reset role;
select is((select version from private.terms_acceptance where user_id='da270000-0000-4000-8000-000000000101'),'2026-11-08-terms-v2','the sent Terms version is recorded');
select ok((select accepted_at is not null from private.terms_acceptance where user_id='da270000-0000-4000-8000-000000000101'),'with a timestamp');
select is((select count(*)::integer from private.terms_acceptance where user_id in ('da270000-0000-4000-8000-000000000102','da270000-0000-4000-8000-000000000103','da270000-0000-4000-8000-000000000104','da270000-0000-4000-8000-000000000105','da270000-0000-4000-8000-000000000106','da270000-0000-4000-8000-000000000107')),0,'no Terms row for missing, malformed or wrong-version metadata');
select is((select count(*)::integer from private.processing_consent where user_id::text like 'da270000-0000-4000-8000-0000000001%'),0,'sign-up no longer records any consent row');
select ok(exists(select 1 from public.profiles where user_id='da270000-0000-4000-8000-000000000102'),'the profile is still created for a sign-up without metadata');

-- H. accept_terms and get_terms_status.
set local role authenticated;
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000005',true);
select is(public.get_terms_status()->>'accepted','false','no row: not accepted');
select is(public.get_terms_status()->>'userId','da270000-0000-4000-8000-000000000005','the status names its owner');
select ok(public.get_terms_status()->'version'='null'::jsonb,'and has a null version');
select throws_ok($$select public.accept_terms('2026-10-20-terms-v1')$$,'22023',null,'the earlier Terms version cannot be accepted now');
select throws_ok($$select public.accept_terms('')$$,'22023',null,'an empty version is refused');
select throws_ok($$select public.accept_terms(null)$$,'22023',null,'a null version is refused');
select is(public.get_terms_status()->>'accepted','false','refusals recorded nothing');
select is(public.accept_terms('2026-11-08-terms-v2')->>'accepted','true','accepting records the Terms');
select is(public.get_terms_status()->>'version','2026-11-08-terms-v2','and the status shows the version');
reset role;
create temp table first_accept as select accepted_at from private.terms_acceptance where user_id='da270000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000005',true);
select is(public.accept_terms('2026-11-08-terms-v2')->>'accepted','true','a second acceptance succeeds');
reset role;
select is((select accepted_at from private.terms_acceptance where user_id='da270000-0000-4000-8000-000000000005'),(select accepted_at from first_accept),'and keeps the first timestamp');
select is((select count(*)::integer from private.terms_acceptance where user_id='da270000-0000-4000-8000-000000000005'),1,'and keeps one row');
set local role authenticated;
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000006',true);
select is(public.get_terms_status()->>'accepted','false','another account is not affected by that acceptance');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.accept_terms('2026-11-08-terms-v2')$$,'42501',null,'anonymous accept is refused');
select throws_ok($$select public.get_terms_status()$$,'42501',null,'anonymous status is refused');
reset role;
-- A signed-in session whose claim names no account (a role switch with no sub) is refused too.
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.accept_terms('2026-11-08-terms-v2')$$,'42501',null,'a signed-in role with no account is refused');
reset role;
-- An account that already accepted the earlier Terms moves to the new version when it accepts them again.
insert into private.terms_acceptance(user_id,version,accepted_at) values('da270000-0000-4000-8000-000000000006','2026-10-20-terms-v1',now()-interval '30 days');
set local role authenticated;
select set_config('request.jwt.claim.sub','da270000-0000-4000-8000-000000000006',true);
select is(public.get_terms_status()->>'version','2026-10-20-terms-v1','an earlier acceptance is reported as it was stored');
select is(public.accept_terms('2026-11-08-terms-v2')->>'version','2026-11-08-terms-v2','accepting the new Terms moves the row to the new version');
reset role;
select ok((select accepted_at>now()-interval '1 minute' from private.terms_acceptance where user_id='da270000-0000-4000-8000-000000000006'),'and the timestamp is the new acceptance');

-- I. Existing accounts are backfilled with the earlier Terms. Accounts older than the backfill moment (the earliest
-- backfilled row among real, non-fixture accounts) must each have a row; an empty database passes with nothing to check.
select is((select count(*)::integer from auth.users u
 where u.id::text not like 'da270000-%'
  and u.created_at<(select min(t.accepted_at) from private.terms_acceptance t where t.version='2026-10-20-terms-v1' and t.user_id::text not like 'da270000-%')
  and not exists(select 1 from private.terms_acceptance t where t.user_id=u.id)),0,'every account that existed before the migration has a Terms row');
select is((select count(*)::integer from private.terms_acceptance t where t.version='2026-10-20-terms-v1' and t.user_id::text not like 'da270000-%'
 and t.user_id not in (select id from auth.users)),0,'no backfilled row points at a missing account');

-- J. The rows go with the account.
delete from auth.users where id='da270000-0000-4000-8000-000000000005';
select is((select count(*)::integer from private.terms_acceptance where user_id='da270000-0000-4000-8000-000000000005'),0,'deleting an account deletes its Terms row');

-- K. The old sign-up consent trigger is gone and the new one is in place.
select is((select count(*)::integer from pg_trigger where tgname='capture_initial_processing_consent' and not tgisinternal),0,'the birthday-consent sign-up trigger is gone');
select is((select count(*)::integer from pg_trigger where tgname='capture_initial_terms' and tgrelid='auth.users'::regclass and not tgisinternal),1,'the Terms sign-up trigger exists');
select hasnt_function('private','capture_initial_processing_consent',array[]::text[],'and its function is gone');
-- L. No birthdays: the functions and triggers that handled them are gone and a sign-up with a birthday stores nothing.
select hasnt_function('public','get_account_age','get_account_age is gone');
select hasnt_function('public','set_account_birthday','set_account_birthday is gone');
select hasnt_function('public','finish_google_signup','finish_google_signup is gone');
select hasnt_function('public','adult_ai_declared','adult_ai_declared is gone');
select is((select count(*)::integer from pg_trigger where tgrelid='auth.users'::regclass and tgname in ('capture_initial_birthday','reject_initial_under12') and not tgisinternal),0,'no birthday triggers remain on auth.users');
grant usage on schema extensions to supabase_auth_admin;
set local role supabase_auth_admin;
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('da270000-0000-4000-8000-000000000108','simple-child@example.invalid','{"birth_date":"2020-01-01"}')$$,'a sign-up that still sends a birthday of 2020-01-01 succeeds');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('da270000-0000-4000-8000-000000000109','simple-garbage@example.invalid','{"birth_date":"not a date"}')$$,'a sign-up that sends garbage as a birthday succeeds');
reset role;
select is((select count(*)::integer from private.account_age where user_id in ('da270000-0000-4000-8000-000000000107','da270000-0000-4000-8000-000000000108','da270000-0000-4000-8000-000000000109')),0,'and nothing is stored in account_age for any of them');
-- The birthday is not kept in the account's metadata either, so it can never be exported or read back.
select is((select count(*)::integer from auth.users where id in ('da270000-0000-4000-8000-000000000107','da270000-0000-4000-8000-000000000108','da270000-0000-4000-8000-000000000109')
 and raw_user_meta_data ?| array['birth_date','processing_consent']),0,'and none of them keeps a birth_date or processing_consent key in its metadata');
set local role supabase_auth_admin;
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data) values
 ('da270000-0000-4000-8000-000000000110','simple-old-client@example.invalid','{"display_name":"Old client","time_zone":"Asia/Manila","birth_date":"2000-01-01","processing_consent":{"age_screening":{"granted":true,"notice_version":"2026-10-20-age-v1"}},"terms":{"version":"2026-11-08-terms-v2"}}')$$,
 'an old client that sends a birthday, old consent and the Terms together is accepted');
reset role;
select is((select raw_user_meta_data from auth.users where id='da270000-0000-4000-8000-000000000110'),
 '{"display_name":"Old client","time_zone":"Asia/Manila","terms":{"version":"2026-11-08-terms-v2"}}'::jsonb,
 'only the birthday and old consent keys are stripped; the name, time zone and Terms stay');
select is((select count(*)::integer from private.terms_acceptance where user_id='da270000-0000-4000-8000-000000000110'),1,'and the Terms row is still recorded');

-- M. The one-time cleanup. It stops unless the owner counted the birthdays first.
select ok(not has_function_privilege('authenticated','private.remove_stored_birthdays()','execute'),'clients cannot run the cleanup');
select ok(not has_function_privilege('service_role','private.remove_stored_birthdays()','execute'),'the service role cannot run the cleanup');
select ok((select count(*)>0 from private.account_age where user_id in ('da270000-0000-4000-8000-000000000001','da270000-0000-4000-8000-000000000003')),'fixture: stored birthdays exist before the cleanup');
select set_config('eiyu.birthdays_counted','',true);
select throws_ok($$select private.remove_stored_birthdays()$$,'22023',null,'the cleanup stops when the count was not confirmed');
select set_config('eiyu.birthdays_counted','no',true);
select throws_ok($$select private.remove_stored_birthdays()$$,'22023',null,'the cleanup stops when the setting is anything but yes');
select set_config('eiyu.birthdays_counted','YES',true);
select throws_ok($$select private.remove_stored_birthdays()$$,'22023',null,'the setting must be exactly yes');
select ok((select count(*)>0 from private.account_age where user_id='da270000-0000-4000-8000-000000000001'),'a refused cleanup removed nothing');
select ok(exists(select 1 from auth.users where id='da270000-0000-4000-8000-000000000001' and raw_user_meta_data ? 'birth_date'),'and kept the metadata key');
select set_config('eiyu.birthdays_counted','yes',true);
select ok((private.remove_stored_birthdays()->>'accountAgeRows')::integer>=2,'with the setting it reports the rows it removed');
select is((select count(*)::integer from private.account_age),0,'no account_age rows remain');
select is((select count(*)::integer from auth.users where raw_user_meta_data ?| array['birth_date','processing_consent']),0,'no account carries birth_date or processing_consent metadata');
select is((select raw_user_meta_data->>'display_name' from auth.users where id='da270000-0000-4000-8000-000000000001'),'Legacy','the display name is kept');
select is((select raw_user_meta_data->>'time_zone' from auth.users where id='da270000-0000-4000-8000-000000000001'),'Asia/Manila','the time zone is kept');
select is((select raw_user_meta_data->'terms'->>'version' from auth.users where id='da270000-0000-4000-8000-000000000101'),'2026-11-08-terms-v2','and the terms metadata of another account is untouched');
select is((select count(*)::integer from private.processing_consent where user_id='da270000-0000-4000-8000-000000000001'),1,'consent rows are not part of the cleanup');
select set_config('eiyu.birthdays_counted','',true);
select lives_ok($$select private.remove_stored_birthdays()$$,'with nothing left to remove the cleanup needs no setting');
select is(private.remove_stored_birthdays(),'{"accountAgeRows":0,"metadataKeys":0}'::jsonb,'and reports zeros');

select * from finish();
rollback;
