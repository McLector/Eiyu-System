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
set local search_path = public, extensions;
select no_plan();

select has_table('private', 'account_age', 'birthday declarations are private');
select has_function('public', 'get_account_age', 'owner age status RPC exists');
select has_function('public', 'set_account_birthday', array['date','uuid'], 'controlled birthday RPC exists');
insert into auth.users (id, email, raw_user_meta_data) values
 ('d2700000-0000-4000-8000-000000000001', 'age-unknown@example.invalid', '{}'),
 ('d2700000-0000-4000-8000-000000000002', 'age-adult@example.invalid', '{"birth_date":"2000-01-01"}'),
 ('d2700000-0000-4000-8000-000000000003', 'age-minor@example.invalid', '{"birth_date":"2014-01-01"}');
-- This suite exercises declarations after explicit synthetic age-purpose grants.
insert into private.processing_consent(user_id,age_granted,age_notice) values
 ('d2700000-0000-4000-8000-000000000001',true,'2026-10-20-age-v1'),
 ('d2700000-0000-4000-8000-000000000002',true,'2026-10-20-age-v1'),
 ('d2700000-0000-4000-8000-000000000003',true,'2026-10-20-age-v1');
select ok(not has_table_privilege('authenticated', 'private.account_age', 'SELECT'), 'clients cannot read the birthday table');
select ok(not has_table_privilege('service_role', 'private.account_age', 'UPDATE'), 'service API cannot edit declarations directly');
select ok(not has_function_privilege('anon', 'public.set_account_birthday(date,uuid)', 'EXECUTE'), 'anonymous edits are forbidden');
select is(private.adult_on('2008-10-11', '2026-10-11'), true, '18th birthday is eligible');
select is(private.adult_on('2008-10-12', '2026-10-11'), false, 'day before 18 is ineligible');
select is(private.adult_on('2008-02-29', '2026-02-28'), false, 'leap birthday waits until March 1');
select is(private.adult_on('2008-02-29', '2026-03-01'), true, 'leap birthday eligible on March 1');
select is(private.adult_on(null, '2026-10-11'), false, 'unknown age is ineligible');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2700000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.get_account_age()->>'birthDate', null, 'legacy accounts remain unknown');
select is(public.get_account_age()->>'adultDeclared', 'false', 'legacy unknown cannot access AI');
select throws_ok($$select public.set_account_birthday('2000-01-01','d2700000-0000-4000-8000-000000000002')$$,'42501','account changed','a stale editor cannot edit a different current account');
select throws_ok($$select public.set_account_birthday(null)$$, '22023', 'Enter a valid birthday.', 'missing birthday rejected');
select throws_ok($$select public.set_account_birthday(current_date + 10)$$, '22023', 'Enter a valid birthday.', 'future birthday rejected');
select is(public.set_account_birthday('2014-01-01')->>'adultDeclared', 'false', 'first minor declaration stays ineligible');
select is(public.set_account_birthday('2000-01-01')->>'adultDeclared', 'true', 'owner policy trusts a corrected adult declaration');
select is(public.get_account_age()->>'birthDate', '2000-01-01', 'correction replaces the accepted declaration');
select is(public.get_account_age()->>'correctionPending', 'false', 'trusted correction creates no pending recheck');
select is(public.get_account_age()->>'pendingBirthDate', null, 'trusted correction leaves no pending date');
select is(public.get_account_age()->>'version', '2', 'changed birthday invalidates older revisions');
select is(public.set_account_birthday('2000-01-01')->>'version', '2', 'unchanged declaration is idempotent');
select is(public.set_account_birthday('2014-01-01')->>'adultDeclared', 'false', 'declaring minor again revokes AI access');
select is(public.get_account_age()->>'correctionPending', 'false', 'correction back to minority creates no pending recheck');
select is(public.get_account_age()->>'pendingBirthDate', null, 'current minor declaration has no pending date');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select throws_ok($$select pg_temp.ai_policy_begin('d2700000-0000-4000-8000-000000000001','weekly-summary','d2700000-0000-4000-8000-000000000105',current_date)$$,'EP001','Debrief processing permission required.','unreviewed minor without purpose consent cannot spend debrief quota');
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"d2700000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.get_account_age()->>'adultDeclared', 'true', 'adult signup declaration captured');
select is(public.get_account_age()->>'correctionPending', 'false', 'new declaration has no correction');
select is(public.set_account_birthday('2014-01-01')->>'adultDeclared', 'false', 'age-decreasing correction immediately removes AI access');
select is(public.set_account_birthday('2000-01-01')->>'adultDeclared', 'true', 'correcting back to adult follows trusted declaration policy');
select lives_ok($$select public.update_profile('Age Tester', 'Explorer')$$, 'birthday restriction preserves presentation edits');
reset role;
update auth.users set raw_user_meta_data = '{"birth_date":"1900-01-01"}' where id = 'd2700000-0000-4000-8000-000000000003';
select is((select birth_date::text from private.account_age where user_id='d2700000-0000-4000-8000-000000000003'), '2014-01-01', 'later auth metadata cannot authorize age');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok($$select pg_temp.ai_policy_begin('d2700000-0000-4000-8000-000000000001','easy-versions','d2700000-0000-4000-8000-000000000101',null)$$, 'EA001', 'Adult AI eligibility required.', 'minor declaration denies proxy quota reservation');
select throws_ok($$select pg_temp.ai_policy_begin('d2700000-0000-4000-8000-000000000003','stage-breakdown','d2700000-0000-4000-8000-000000000102',null)$$, 'EA001', 'Adult AI eligibility required.', 'minor denies another AI action');
reset role;
select is((select count(*) from private.ai_logical_requests where user_id::text like 'd270%'), 0::bigint, 'denial charges no quota');
insert into public.weekly_summaries(user_id,week_start,summary) values ('d2700000-0000-4000-8000-000000000003',current_date,'Saved content retained');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2700000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.weekly_summaries), 0::bigint, 'minor cannot read a saved AI summary directly');
select throws_ok($$insert into public.weekly_summaries(user_id,week_start,summary) values ('d2700000-0000-4000-8000-000000000003',current_date-7,'Forged')$$, 'EP001', null, 'unreviewed minor cannot bypass processing permission through a direct write');
select throws_ok($$select public.reserve_weekly_summary_regen(current_date)$$, 'EP001', 'Debrief processing permission required.', 'unreviewed minor cannot reserve regeneration through security definer');
select is((select count(*) from public.profiles), 1::bigint, 'quest account profile remains accessible');
reset role;
select is((select count(*) from public.weekly_summaries where user_id='d2700000-0000-4000-8000-000000000003'), 1::bigint, 'saved content is retained in storage');
insert into auth.users(id,email,raw_user_meta_data) values('d2700000-0000-4000-8000-000000000004','age-inflight@example.invalid','{"birth_date":"2000-01-01"}');
insert into private.processing_consent(user_id,age_granted,age_notice)
 values('d2700000-0000-4000-8000-000000000004',true,'2026-10-20-age-v1');
set local role service_role;
select is(pg_temp.ai_policy_begin('d2700000-0000-4000-8000-000000000004','easy-versions','d2700000-0000-4000-8000-000000000104',null)->>'ageVersion','1','a request binds the declaration revision');
select is(pg_temp.ai_policy_check('d2700000-0000-4000-8000-000000000104',1),true,'unchanged adult request passes final check');
select is(pg_temp.ai_policy_check('d2700000-0000-4000-8000-000000000104',99),false,'forged revision is denied');
select is(pg_temp.ai_policy_check('d2700000-0000-4000-8000-000000000199',1),false,'unknown request is denied');
reset role;
update private.ai_logical_requests set age_version=null where request_id='d2700000-0000-4000-8000-000000000104';
set local role service_role;
select throws_ok($$select pg_temp.ai_policy_reserve('d2700000-0000-4000-8000-000000000104',2)$$,'EA001','Adult AI eligibility required.','missing birthday revision cannot reserve another provider attempt');
reset role;
update private.ai_logical_requests set age_version=1 where request_id='d2700000-0000-4000-8000-000000000104';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"d2700000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select is(public.set_account_birthday('1999-01-01')->>'correctionPending','false','an earlier adult birthday is accepted without pending recheck');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select is(pg_temp.ai_policy_check('d2700000-0000-4000-8000-000000000104',1),false,'changed declaration invalidates an in-flight result even while adult');
select throws_ok($$select pg_temp.ai_policy_reserve('d2700000-0000-4000-8000-000000000104',2)$$,'EA001','Adult AI eligibility required.','changed declaration blocks provider retries bound to an older revision');
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select lives_ok($$select public.set_account_birthday('2014-01-01')$$,'age restriction during an in-flight request succeeds');
select is(public.get_account_age()->>'correctionPending','false','current minor declaration creates no pending recheck');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select is(pg_temp.ai_policy_check('d2700000-0000-4000-8000-000000000104',1),false,'in-flight result cannot be released after restriction');
select throws_ok($$select pg_temp.ai_policy_reserve('d2700000-0000-4000-8000-000000000104',2)$$,'EA001','Adult AI eligibility required.','restriction denies provider retries');
reset role;
-- Earlier local pending state stays denied until an explicit owner declaration.
update private.account_age set pending_birth_date='1900-01-01' where user_id='d2700000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"d2700000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_account_age()->>'adultDeclared','false','legacy pending state cannot grant adult access');
select is(public.set_account_birthday('2014-01-01')->>'correctionPending','false','explicit owner save clears earlier local pending state');
select is(public.get_account_age()->>'adultDeclared','false','clearing pending state does not make a minor adult');
select is(public.get_account_age()->>'pendingBirthDate',null,'explicit owner declaration removes earlier pending date');
reset role;
select ok(not has_function_privilege('authenticated','public.ai_check_request_age(uuid,integer)','EXECUTE'),'only the trusted service can check a request revision');
select * from finish();
rollback;

