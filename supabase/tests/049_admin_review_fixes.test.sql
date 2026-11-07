begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- Local S02 062: fixes from the admin console and retention review. Synthetic users only; rolled back.
insert into auth.users(id,email,raw_user_meta_data) values
 ('da242000-0000-4000-8000-000000000001','fix-operator@example.invalid','{"birth_date":"1990-01-01"}'),
 ('da242000-0000-4000-8000-000000000002','fix-adult@example.invalid','{"birth_date":"1990-01-01"}'),
 ('da242000-0000-4000-8000-000000000003','fix-teen-a@example.invalid','{"birth_date":"2010-01-01"}'),
 ('da242000-0000-4000-8000-000000000004','fix-teen-b@example.invalid','{"birth_date":"2010-02-02"}'),
 ('da242000-0000-4000-8000-000000000005','fix-teen-c@example.invalid','{"birth_date":"2010-03-03"}'),
 ('da242000-0000-4000-8000-000000000006','Fix-Dup@example.invalid','{"birth_date":"1990-01-01"}'),
 ('da242000-0000-4000-8000-000000000007','fix-dup@example.invalid','{"birth_date":"1990-01-01"}'),
 ('da242000-0000-4000-8000-000000000011','fix-late@example.invalid','{"birth_date":"1990-01-01"}'),
 ('da242000-0000-4000-8000-000000000012','fix-early@example.invalid','{"birth_date":"1990-01-01"}'),
 ('da242000-0000-4000-8000-000000000013','fix-jump@example.invalid','{"birth_date":"1990-01-01"}'),
 ('da242000-0000-4000-8000-000000000014','fix-poison@example.invalid','{"birth_date":"1990-01-01"}'),
 ('da242000-0000-4000-8000-000000000015','fix-healthy@example.invalid','{"birth_date":"1990-01-01"}');
insert into private.operator_accounts(user_id) values('da242000-0000-4000-8000-000000000001');
create function pg_temp.as_user(u uuid,a text default 'aal1') returns void language sql as $$
 select set_config('request.jwt.claims',json_build_object('sub',u,'aal',a)::text,true),set_config('request.jwt.claim.sub',u::text,true);
$$;
create function pg_temp.op() returns void language sql as $$ select pg_temp.as_user('da242000-0000-4000-8000-000000000001','aal2'); $$;
create function pg_temp.state_of(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end;$$;
grant execute on function pg_temp.state_of(text) to authenticated;
create function pg_temp.bump_age(u uuid) returns void language sql as $$
 update private.account_age set version=version+1 where user_id=u;
$$;
create function pg_temp.open_id(u uuid,p text) returns uuid language sql as $$
 select id from private.authority_review_requests where user_id=u and purpose=p and status='open';
$$;
create function pg_temp.st(u uuid,p text) returns text language sql as $$ select private.review_purpose_state(u,p); $$;
-- A grant then a withdrawal at a chosen instant, written as the consent setter's event rows.
create function pg_temp.withdrawn(u uuid,p text,at timestamptz) returns void language plpgsql as $$
declare v integer;
begin
 select coalesce(max(version),0) into v from private.processing_consent_events where user_id=u;
 insert into private.processing_consent_events(user_id,purpose,granted,notice_version,version,changed_at) values
  (u,p,true,'fixture',v+1,at-interval '1 hour');
 insert into private.processing_consent_events(user_id,purpose,granted,notice_version,version,changed_at) values
  (u,p,false,'fixture',v+2,at);
end;$$;

-- Age binding: a request belongs to the declaration it was made under.
select pg_temp.as_user('da242000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok($$select public.request_authority_review('custom-tracker','please')$$,'teen requests a review');
reset role;
select is((select age_version from private.authority_review_requests where user_id='da242000-0000-4000-8000-000000000003'),
 (select version from private.account_age where user_id='da242000-0000-4000-8000-000000000003'),'the request records the age version it was made under');
select pg_temp.bump_age('da242000-0000-4000-8000-000000000003');
select pg_temp.op();
select is(pg_temp.state_of(format($$select public.operator_decide_review(%L,'approved')$$,pg_temp.open_id('da242000-0000-4000-8000-000000000003','custom-tracker'))),'ER003','approval refused after the birthday changed');
select is(pg_temp.st('da242000-0000-4000-8000-000000000003','custom-tracker'),'pending','the account stays pending');
select ok(pg_temp.open_id('da242000-0000-4000-8000-000000000003','custom-tracker') is not null,'the request stays open for a decision');
select is(pg_temp.state_of(format($$select public.operator_decide_review(%L,'denied')$$,pg_temp.open_id('da242000-0000-4000-8000-000000000003','custom-tracker'))),'ok','a stale request can still be denied');
select pg_temp.as_user('da242000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok($$select public.request_authority_review('custom-tracker','again')$$,'asking again under the new declaration works');
reset role;
select pg_temp.op();
select lives_ok(format($$select public.operator_decide_review(%L,'approved')$$,pg_temp.open_id('da242000-0000-4000-8000-000000000003','custom-tracker')),'a current request can be approved');
select is(pg_temp.st('da242000-0000-4000-8000-000000000003','custom-tracker'),'approved','and the approval applies');

-- A stale open request does not block asking again.
select pg_temp.as_user('da242000-0000-4000-8000-000000000004');
set local role authenticated;
select lives_ok($$select public.request_authority_review('fitness-tracking','first')$$,'first request');
select is(pg_temp.state_of($$select public.request_authority_review('fitness-tracking','same declaration')$$),'ER002','a current open request still blocks a duplicate');
reset role;
select pg_temp.bump_age('da242000-0000-4000-8000-000000000004');
select pg_temp.as_user('da242000-0000-4000-8000-000000000004');
set local role authenticated;
select lives_ok($$select public.request_authority_review('fitness-tracking','corrected birthday')$$,'a stale open request is replaced');
reset role;
select is((select string_agg(status,',' order by status) from private.authority_review_requests where user_id='da242000-0000-4000-8000-000000000004'),'open,withdrawn','the old one is withdrawn, one stays open');
select is((select age_version from private.authority_review_requests where user_id='da242000-0000-4000-8000-000000000004' and status='open'),
 (select version from private.account_age where user_id='da242000-0000-4000-8000-000000000004'),'the open one carries the new version');

-- Pause by email: any surrounding whitespace, and ambiguity refused.
select pg_temp.op();
select is(pg_temp.state_of(format($$select public.operator_pause_purpose(null,'custom-tracker','dispute',%L)$$,E'\t fix-teen-c@example.invalid\r\n')),'ok','a pasted tab or newline is trimmed');
select is(pg_temp.st('da242000-0000-4000-8000-000000000005','custom-tracker'),'revoked','and pauses that account');
select is(pg_temp.state_of($$select public.operator_pause_purpose(null,'custom-tracker','dispute','FIX-DUP@example.invalid')$$),'42501','an email matching two accounts is refused');
select ok(pg_temp.st('da242000-0000-4000-8000-000000000006','custom-tracker') is distinct from 'revoked' and pg_temp.st('da242000-0000-4000-8000-000000000007','custom-tracker') is distinct from 'revoked','neither account is paused');

-- Resume: operator only, only from a pause, back to the normal state for the age band.
select ok(has_function_privilege('authenticated','public.operator_resume_purpose(uuid,text,text)','execute')
 and not has_function_privilege('anon','public.operator_resume_purpose(uuid,text,text)','execute')
 and not has_function_privilege('service_role','public.operator_resume_purpose(uuid,text,text)','execute'),'resume: authenticated only');
select is((select count(*)::integer from pg_proc where proname='operator_resume_purpose' and 'search_path=""'<>all(coalesce(proconfig,'{}'))),0,'resume: empty search_path');
select pg_temp.as_user('da242000-0000-4000-8000-000000000002','aal2');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_resume_purpose('da242000-0000-4000-8000-000000000005','custom-tracker')$$),'42501','non-operator refused');
reset role;
select pg_temp.as_user('da242000-0000-4000-8000-000000000001','aal1');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_resume_purpose('da242000-0000-4000-8000-000000000005','custom-tracker')$$),'42501','operator at aal1 refused');
reset role;
select pg_temp.op();
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_resume_purpose('da242000-0000-4000-8000-000000000005','gym')$$),'22023','purpose must be known');
select is(pg_temp.state_of($$select public.operator_resume_purpose(null,'custom-tracker')$$),'22023','an account is required');
select is(pg_temp.state_of($$select public.operator_resume_purpose('da242000-0000-4000-8000-000000000005','custom-tracker','fix-teen-c@example.invalid')$$),'22023','only one way of naming the account');
select is(pg_temp.state_of($$select public.operator_resume_purpose(gen_random_uuid(),'custom-tracker')$$),'42501','unknown account refused');
select is(pg_temp.state_of($$select public.operator_resume_purpose(null,'custom-tracker','nobody@example.invalid')$$),'42501','unknown email refused');
select is(pg_temp.state_of($$select public.operator_resume_purpose('da242000-0000-4000-8000-000000000005','fitness-tracking')$$),'ER003','a purpose that is not paused cannot be resumed');
select lives_ok($$select public.operator_resume_purpose(null,'custom-tracker',' FIX-TEEN-C@example.invalid ')$$,'resume by email');
reset role;
select is(pg_temp.st('da242000-0000-4000-8000-000000000005','custom-tracker'),'pending','a teen returns to pending, so a review is still needed');
select pg_temp.as_user('da242000-0000-4000-8000-000000000005');
set local role authenticated;
select lives_ok($$select public.request_authority_review('custom-tracker','can ask again')$$,'and can ask for a review again');
reset role;
select pg_temp.op();
set local role authenticated;
select lives_ok($$select public.operator_pause_purpose('da242000-0000-4000-8000-000000000002','fitness-tracking','report')$$,'pause an adult');
reset role;
select is(pg_temp.st('da242000-0000-4000-8000-000000000002','fitness-tracking'),'revoked','adult is paused');
select pg_temp.op();
set local role authenticated;
select lives_ok($$select public.operator_resume_purpose('da242000-0000-4000-8000-000000000002','fitness-tracking')$$,'resume an adult');
select lives_ok($$select public.operator_pause_purpose('da242000-0000-4000-8000-000000000002','weekly-debrief','dispute')$$,'pause adult debrief');
reset role;
select is(pg_temp.st('da242000-0000-4000-8000-000000000002','fitness-tracking'),'not-required','an adult returns to not-required');
select is(pg_temp.st('da242000-0000-4000-8000-000000000002','weekly-debrief'),'revoked','debrief paused');
select pg_temp.op();
set local role authenticated;
select lives_ok($$select public.operator_resume_purpose('da242000-0000-4000-8000-000000000002','weekly-debrief')$$,'resume adult debrief');
reset role;
select is(pg_temp.st('da242000-0000-4000-8000-000000000002','weekly-debrief'),'not-required','debrief returns to not-required');
select is((select count(*)::integer from private.operator_audit where action='resume-purpose' and operator_id='da242000-0000-4000-8000-000000000001'),3,'resumes are audited');
select ok(not exists(select 1 from private.operator_audit a where a::text ~* 'example\.invalid'),'audit holds no email');

-- Retention is off (065 open tracker): a withdrawal at any hour schedules no removal, and the job
-- reminds and removes nobody, whatever the date. The day-boundary and failure-handling rules of 062
-- are not exercised because nothing runs.
select pg_temp.withdrawn('da242000-0000-4000-8000-000000000011','custom-tracker','2026-11-01 23:00+08');
select pg_temp.withdrawn('da242000-0000-4000-8000-000000000012','custom-tracker','2026-11-01 00:30+08');
select pg_temp.withdrawn('da242000-0000-4000-8000-000000000013','custom-tracker','2026-11-01 12:00+08');
select is((select count(*)::integer from private.tracker_retention_state where user_id in ('da242000-0000-4000-8000-000000000011','da242000-0000-4000-8000-000000000012','da242000-0000-4000-8000-000000000013')),0,'a withdrawal at any hour schedules no removal');
-- A stray pending row (for example from before the unblock) is never reminded or removed.
insert into public.gym_routines(id,user_id,name,unit) values
 ('da242000-0000-4000-8000-0000000000a4','da242000-0000-4000-8000-000000000014','SECRET-kept','kg');
insert into private.tracker_retention_state(user_id,purpose,withdrawn_at,reminder_due_on,removal_due_on)
 values('da242000-0000-4000-8000-000000000014','fitness-tracking','2027-03-01 12:00+08','2027-03-25','2027-04-01');
select is(private.run_tracker_retention('2027-03-25 02:15+08'),'{"reminded":0,"removed":0}'::jsonb,'no reminder on the old reminder date');
select is(private.run_tracker_retention('2027-04-02 02:15+08'),'{"reminded":0,"removed":0}'::jsonb,'no removal on the old removal date');
select is(private.run_tracker_retention('2030-01-01 02:15+08'),'{"reminded":0,"removed":0}'::jsonb,'and none years later');
select is((select count(*)::integer from public.gym_routines where user_id='da242000-0000-4000-8000-000000000014'),1,'the data is kept');
select ok((select removed_at is null and reminded_at is null and last_failed_at is null from private.tracker_retention_state where user_id='da242000-0000-4000-8000-000000000014'),'and the stray row is untouched');
select pg_temp.op();
set local role authenticated;
select ok((select bool_or(e->>'email'='fix-poison@example.invalid' and e->>'status'='pending') from jsonb_array_elements(public.operator_list_retention()) e),'the console still lists the stray row as pending');
select ok(public.operator_list_retention()::text !~* 'SECRET','no content or error text in the list');
reset role;
select * from finish();
rollback;
