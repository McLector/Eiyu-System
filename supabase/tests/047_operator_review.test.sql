begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- Local S02 060: operator accounts, MFA gate, teen review queue. Synthetic users only; rolled back.
insert into auth.users(id,email,raw_user_meta_data) values
 ('da240000-0000-4000-8000-000000000001','adm-operator@example.invalid','{"birth_date":"1990-01-01"}'),
 ('da240000-0000-4000-8000-000000000002','adm-adult@example.invalid','{"birth_date":"2000-01-01"}'),
 ('da240000-0000-4000-8000-000000000003','adm-teen-a@example.invalid','{"birth_date":"2010-01-01"}'),
 ('da240000-0000-4000-8000-000000000004','adm-teen-b@example.invalid','{"birth_date":"2010-02-02"}'),
 ('da240000-0000-4000-8000-000000000006','adm-unknown@example.invalid','{}');
insert into private.operator_accounts(user_id) values('da240000-0000-4000-8000-000000000001');
-- Content that must never appear in console projections or audit.
insert into public.habits(id,user_id,name,easy_version,stat,difficulty) values
 ('da240000-0000-4000-8000-0000000000a1','da240000-0000-4000-8000-000000000003','SECRET-QUEST-NAME','tiny','INT','Easy');
insert into public.gym_routines(id,user_id,name,unit) values
 ('da240000-0000-4000-8000-0000000000a2','da240000-0000-4000-8000-000000000003','SECRET-ROUTINE','kg');
create function pg_temp.as_user(u uuid,a text) returns void language sql as $$
 select set_config('request.jwt.claims',case when a is null then json_build_object('sub',u)::text else json_build_object('sub',u,'aal',a)::text end,true),
  set_config('request.jwt.claim.sub',coalesce(u::text,''),true);
$$;
create function pg_temp.state_of(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end;$$;
grant execute on function pg_temp.state_of(text) to authenticated;
create function pg_temp.rid(u uuid,p text) returns uuid language sql security definer as $$
 select id from private.authority_review_requests where user_id=u and purpose=p and status='open';
$$;
grant execute on function pg_temp.rid(uuid,text) to authenticated;
create function pg_temp.acc() returns jsonb language sql as $$ select public.get_tracker_processing_access(); $$;
grant execute on function pg_temp.acc() to authenticated;

-- Structure and grants.
select ok((select relrowsecurity from pg_class where oid='private.operator_accounts'::regclass),'operator_accounts has RLS');
select ok((select relrowsecurity from pg_class where oid='private.authority_review_requests'::regclass),'review requests have RLS');
select ok((select relrowsecurity from pg_class where oid='private.operator_audit'::regclass),'audit has RLS');
select is((select count(*)::integer from (values('private.operator_accounts'),('private.authority_review_requests'),('private.operator_audit')) t(n),
 unnest(array['anon','authenticated','service_role']) r where has_table_privilege(r,t.n::regclass,'select,insert,update,delete')),0,'no client table access');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='private' and table_name='authority_review_requests'),
 array['id','user_id','purpose','note','status','created_at','decided_at','decided_by','age_version'],'review request has no attachment or id columns');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='private' and table_name='operator_audit'),
 array['id','operator_id','action','subject_user_id','purpose','reason_code','at'],'audit has no content columns');
select is((select count(*)::integer from (values('public.get_operator_status()'),('public.request_authority_review(text,text)'),('public.cancel_authority_review(text)'),
 ('public.operator_list_review_requests(text)'),('public.operator_decide_review(uuid,text)'),('public.operator_pause_purpose(uuid,text,text,text)'),('public.get_my_review_requests()')) f(n)
 where has_function_privilege('authenticated',f.n,'execute') and not has_function_privilege('anon',f.n,'execute')
 and not has_function_privilege('service_role',f.n,'execute')),7,'RPCs: authenticated only');
select ok(not has_function_privilege('authenticated','private.require_operator()','execute')
 and not has_function_privilege('anon','private.require_operator()','execute')
 and not has_function_privilege('service_role','private.require_operator()','execute'),'require_operator is not client callable');
select is((select count(*)::integer from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace)
 and p.proname in ('get_operator_status','request_authority_review','cancel_authority_review','operator_list_review_requests','operator_decide_review','operator_pause_purpose','get_my_review_requests','require_operator')
 and 'search_path=""'<>all(coalesce(p.proconfig,'{}')) ),0,'search_path is empty on every new function');
select is((select count(*)::integer from information_schema.routine_privileges where grantee in ('anon','service_role')
 and routine_name in ('get_operator_status','request_authority_review','cancel_authority_review','operator_list_review_requests','operator_decide_review','operator_pause_purpose','get_my_review_requests','require_operator')),0,'nothing granted to anon or service_role');
select is((select count(*)::integer from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace)
 and p.prosrc ~* 'insert\s+into\s+private\.operator_accounts'),0,'no function adds operators');
select is((select count(*)::integer from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace)
 and p.prosrc ~* 'from\s+private\.operator_audit'),0,'no function reads the audit');

-- Refusal on every operator RPC: non-operator, operator at aal1, operator without aal, unauthenticated.
select pg_temp.as_user('da240000-0000-4000-8000-000000000002','aal2');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_list_review_requests('open')$$),'42501','non-operator aal2: list refused');
select is(pg_temp.state_of($$select public.operator_decide_review(gen_random_uuid(),'approved')$$),'42501','non-operator aal2: decide refused');
select is(pg_temp.state_of($$select public.operator_pause_purpose('da240000-0000-4000-8000-000000000003','custom-tracker','dispute')$$),'42501','non-operator aal2: pause refused');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal1');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_list_review_requests('open')$$),'42501','operator aal1: list refused');
select is(pg_temp.state_of($$select public.operator_decide_review(gen_random_uuid(),'approved')$$),'42501','operator aal1: decide refused');
select is(pg_temp.state_of($$select public.operator_pause_purpose('da240000-0000-4000-8000-000000000003','custom-tracker','dispute')$$),'42501','operator aal1: pause refused');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000001',null);
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_list_review_requests('open')$$),'42501','operator without aal claim: list refused');
select is(pg_temp.state_of($$select public.operator_pause_purpose('da240000-0000-4000-8000-000000000003','custom-tracker','dispute')$$),'42501','operator without aal claim: pause refused');
reset role;
select set_config('request.jwt.claims','',true),set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_list_review_requests('open')$$),'42501','unauthenticated: list refused');
select is(pg_temp.state_of($$select public.operator_decide_review(gen_random_uuid(),'approved')$$),'42501','unauthenticated: decide refused');
select is(pg_temp.state_of($$select public.operator_pause_purpose('da240000-0000-4000-8000-000000000003','custom-tracker','dispute')$$),'42501','unauthenticated: pause refused');
select is(pg_temp.state_of($$select public.get_operator_status()$$),'42501','unauthenticated: status refused');
select is(pg_temp.state_of($$select public.request_authority_review('custom-tracker',null)$$),'42501','unauthenticated: request refused');
select is(pg_temp.state_of($$select public.cancel_authority_review('custom-tracker')$$),'42501','unauthenticated: cancel refused');
reset role;
select is((select count(*)::integer from private.operator_audit),0,'refused calls write no audit');

-- get_operator_status reports only the caller.
select pg_temp.as_user('da240000-0000-4000-8000-000000000002','aal2');
set local role authenticated;
select is(public.get_operator_status(),'{"isOperator":false,"mfaRequired":false,"aal":"aal2"}'::jsonb,'non-operator status');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal1');
set local role authenticated;
select is(public.get_operator_status(),'{"isOperator":true,"mfaRequired":true,"aal":"aal1"}'::jsonb,'operator at aal1 needs MFA');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000001',null);
set local role authenticated;
select is(public.get_operator_status(),'{"isOperator":true,"mfaRequired":true,"aal":"aal1"}'::jsonb,'missing aal claim counts as aal1');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal2');
set local role authenticated;
select is(public.get_operator_status(),'{"isOperator":true,"mfaRequired":false,"aal":"aal2"}'::jsonb,'operator at aal2');
select is((select pronargs::integer from pg_proc where oid='public.get_operator_status()'::regprocedure),0,'status takes no subject argument');
select is(pg_temp.state_of($$insert into private.operator_accounts(user_id) values('da240000-0000-4000-8000-000000000002')$$),'42501','an operator cannot add operators over the API');
reset role;

-- request_authority_review.
select pg_temp.as_user('da240000-0000-4000-8000-000000000002','aal1');
set local role authenticated;
select is(pg_temp.state_of($$select public.request_authority_review('custom-tracker',null)$$),'ER003','adult (no pending state) cannot request');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000003','aal1');
set local role authenticated;
select is(pg_temp.state_of($$select public.request_authority_review('gym',null)$$),'22023','unknown purpose refused');
select is(pg_temp.state_of($$select public.request_authority_review(null,null)$$),'22023','null purpose refused');
select is(pg_temp.state_of($$select public.request_authority_review('custom-tracker',repeat('x',281))$$),'22023','note over 280 refused');
reset role;
select is((select count(*)::integer from private.authority_review_requests where user_id='da240000-0000-4000-8000-000000000003'),0,'refusals stored nothing');
set local role authenticated;
select is(public.request_authority_review('custom-tracker','  please review  ')->>'status','open','teen request opens');
reset role;
select is((select note from private.authority_review_requests where user_id='da240000-0000-4000-8000-000000000003' and purpose='custom-tracker'),'please review','note is trimmed');
set local role authenticated;
select is(pg_temp.state_of($$select public.request_authority_review('custom-tracker',null)$$),'ER002','one open request per purpose');
select is(public.request_authority_review('fitness-tracking',repeat('y',280))->>'status','open','a note of exactly 280 is accepted');
select is(public.request_authority_review('weekly-debrief','   ')->>'status','open','blank note accepted as none');
reset role;
select is((select note from private.authority_review_requests where user_id='da240000-0000-4000-8000-000000000003' and purpose='weekly-debrief'),null,'blank note stored as null');
set local role authenticated;
select is(public.cancel_authority_review('custom-tracker'),'{"cancelled":true}'::jsonb,'cancel withdraws own open request');
select is(public.cancel_authority_review('custom-tracker'),'{"cancelled":false}'::jsonb,'cancel with nothing open is a no-op');
select is(pg_temp.state_of($$select public.request_authority_review('custom-tracker',null)$$),'ER001','fourth request in a day hits the rate limit');
reset role;
update private.authority_review_requests set created_at=created_at-interval '2 days' where user_id='da240000-0000-4000-8000-000000000003';
set local role authenticated;
select is(public.request_authority_review('custom-tracker','again')->>'status','open','old requests leave the 3 per day window');
reset role;
select is((select count(*)::integer from private.authority_review_requests where user_id='da240000-0000-4000-8000-000000000003' and status='open' and purpose='custom-tracker'),1,'still one open per purpose');
select pg_temp.as_user('da240000-0000-4000-8000-000000000004','aal1');
set local role authenticated;
select is(public.cancel_authority_review('custom-tracker'),'{"cancelled":false}'::jsonb,'cannot cancel someone else''s request');
reset role;
select is((select status from private.authority_review_requests where user_id='da240000-0000-4000-8000-000000000003' and purpose='custom-tracker' and status<>'withdrawn'),'open','other owner request untouched');
select pg_temp.as_user('da240000-0000-4000-8000-000000000006','aal1');
set local role authenticated;
select is(public.request_authority_review('fitness-tracking','from unknown')->>'status','open','unknown-age legacy account may request');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000004','aal1');
set local role authenticated;
select is(public.request_authority_review('custom-tracker','b')->>'status','open','teen B request');
select is(public.request_authority_review('fitness-tracking','b')->>'status','open','teen B fitness request');
reset role;

-- Operator list projection.
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal2');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_list_review_requests('bogus')$$),'22023','invalid status filter refused');
select is((select jsonb_agg(distinct k order by k) from jsonb_array_elements(public.operator_list_review_requests('open')) e,jsonb_object_keys(e) k),
 '["ageBand","createdAt","email","note","purpose","requestId","status","userId"]'::jsonb,'projection keys are exactly the allowed fields');
select is((select count(*)::integer from jsonb_array_elements(public.operator_list_review_requests('open'))),6,'six open requests across accounts');
select is((select e->>'ageBand' from jsonb_array_elements(public.operator_list_review_requests('open')) e where e->>'email'='adm-teen-a@example.invalid' limit 1),'teen','teen band');
select is((select e->>'ageBand' from jsonb_array_elements(public.operator_list_review_requests('open')) e where e->>'email'='adm-unknown@example.invalid'),'unknown','unknown band');
select ok(public.operator_list_review_requests('open')::text !~* 'SECRET|2010-01-01|2010-02-02|1990-01-01|birth','no quest, gym or birthday content in the list');
select is((select count(*)::integer from jsonb_array_elements(public.operator_list_review_requests('withdrawn'))),1,'withdrawn filter works');
reset role;
select is((select count(*)::integer from private.operator_audit where action='list-review-requests' and operator_id='da240000-0000-4000-8000-000000000001'),6,'each list is audited (6 calls)');

-- Decide: approve custom for teen A.
select pg_temp.as_user('da240000-0000-4000-8000-000000000003','aal1');
set local role authenticated;
select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',pg_temp.acc()->'revision');
select public.set_tracker_processing_consent('fitness-tracking',true,'2026-10-23-fitness-tracking-v1',pg_temp.acc()->'revision');
select is(pg_temp.acc()->>'canWriteCustom','true','open tracker: a pending authority does not close custom writes');
select set_config('adm.stale',(pg_temp.acc()->'revision')::text,true);
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal2');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_decide_review(gen_random_uuid(),'approved')$$),'ER004','unknown request id refused');
select is(pg_temp.state_of($$select public.operator_decide_review(pg_temp.rid('da240000-0000-4000-8000-000000000003','custom-tracker'),'maybe')$$),'22023','invalid decision refused');
reset role;
create temp table req_custom as select id from private.authority_review_requests where user_id='da240000-0000-4000-8000-000000000003' and purpose='custom-tracker' and status='open';
grant select on req_custom to authenticated;
set local role authenticated;
select is(public.operator_decide_review((select id from req_custom),'approved')->>'status','approved','approve custom');
reset role;
select is((select status||':'||(decided_by='da240000-0000-4000-8000-000000000001')::text||':'||(decided_at is not null)::text from private.authority_review_requests where id=(select id from req_custom)),'approved:true:true','decision recorded with operator and time');
select is((select count(*)::integer from private.processing_authority_events where user_id='da240000-0000-4000-8000-000000000003' and review_reference=(select id from req_custom) and state='approved' and purposes=array['custom-tracker']),1,'request id is the review reference');
select pg_temp.as_user('da240000-0000-4000-8000-000000000003','aal1');
set local role authenticated;
select is(pg_temp.acc()->>'canWriteCustom','true','teen gains custom permission only after approval');
select is(pg_temp.acc()->>'canWriteFitness','true','open tracker: fitness follows basic whatever the custom approval');
select is(pg_temp.state_of(format($$select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1','%s'::jsonb)$$,current_setting('adm.stale'))),'ET003','stale pre-approval revision still ET003');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal2');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_decide_review((select id from req_custom),'approved')$$),'ER004','already decided request refused');
select is(public.operator_decide_review(pg_temp.rid('da240000-0000-4000-8000-000000000003','fitness-tracking'),'approved')->>'status','approved','approve fitness');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000003','aal1');
set local role authenticated;
select is(pg_temp.acc()->>'canWriteFitness','true','fitness approved');
reset role;
-- Debrief approval.
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal2');
set local role authenticated;
select is(public.operator_decide_review(pg_temp.rid('da240000-0000-4000-8000-000000000003','weekly-debrief'),'approved')->>'status','approved','approve debrief');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000003','aal1');
set local role authenticated;
select is(public.get_processing_access()->>'authorityState','approved','debrief authority approved');
reset role;
-- get_my_review_requests: own rows only, open plus the latest decided per purpose, no note.
select pg_temp.as_user('da240000-0000-4000-8000-000000000003','aal1');
set local role authenticated;
select is((select jsonb_agg(distinct k order by k) from jsonb_array_elements(public.get_my_review_requests()) e,jsonb_object_keys(e) k),
 '["createdAt","purpose","requestId","status"]'::jsonb,'my requests: keys, no note');
select is((select jsonb_agg(e->>'status' order by e->>'purpose') from jsonb_array_elements(public.get_my_review_requests()) e),'["approved","approved","approved"]'::jsonb,'my requests: latest decided per purpose; withdrawn hidden');
reset role;
-- Deny keeps teen B pending.
select pg_temp.as_user('da240000-0000-4000-8000-000000000004','aal1');
set local role authenticated;
select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',pg_temp.acc()->'revision');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal2');
set local role authenticated;
select is(public.operator_decide_review(pg_temp.rid('da240000-0000-4000-8000-000000000004','custom-tracker'),'denied')->>'status','denied','deny custom');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000004','aal1');
set local role authenticated;
select is(pg_temp.acc()->>'canWriteCustom','true','open tracker: a denied review does not close custom writes');
select is(pg_temp.acc()->>'customAuthorityState','pending','denied keeps the purpose pending');
select is((select jsonb_agg(e->>'purpose'||':'||(e->>'status') order by e->>'purpose') from jsonb_array_elements(public.get_my_review_requests()) e),'["custom-tracker:denied","fitness-tracking:open"]'::jsonb,'my requests: only my own, open and decided');
reset role;
select set_config('request.jwt.claims','',true),set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select is(pg_temp.state_of($$select public.get_my_review_requests()$$),'42501','my requests need sign-in');
reset role;
select is((select status from private.authority_review_requests where user_id='da240000-0000-4000-8000-000000000004' and purpose='custom-tracker'),'denied','request recorded as denied');

-- Pause: revokes, keeps history, other purposes untouched.
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal2');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_pause_purpose('da240000-0000-4000-8000-000000000003','custom-tracker','free text with details')$$),'22023','reason must be a code');
select is(pg_temp.state_of($$select public.operator_pause_purpose('da240000-0000-4000-8000-000000000003','gym','dispute')$$),'22023','purpose must be known');
select is(pg_temp.state_of($$select public.operator_pause_purpose(gen_random_uuid(),'custom-tracker','dispute')$$),'42501','unknown account refused');
select lives_ok($$select public.operator_pause_purpose('da240000-0000-4000-8000-000000000003','custom-tracker','dispute')$$,'pause custom');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000003','aal1');
set local role authenticated;
select is(pg_temp.acc()->>'canWriteCustom','true','open tracker: a paused purpose does not close custom writes');
select is(pg_temp.acc()->>'customAuthorityState','revoked','state is revoked');
select is(pg_temp.acc()->>'canWriteFitness','true','other purpose unaffected');
reset role;
select ok((select count(*) from private.processing_authority_events where user_id='da240000-0000-4000-8000-000000000003' and purposes=array['custom-tracker'] and state='approved')=1
 and (select count(*) from private.processing_authority_events where user_id='da240000-0000-4000-8000-000000000003' and purposes=array['custom-tracker'] and state='revoked')=1,'history kept: approval and pause both retained');
select is((select count(*)::integer from public.habits where user_id='da240000-0000-4000-8000-000000000003')+(select count(*)::integer from public.gym_routines where user_id='da240000-0000-4000-8000-000000000003'),2,'pause removes no user data');
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal2');
set local role authenticated;
select lives_ok($$select public.operator_pause_purpose('da240000-0000-4000-8000-000000000003','weekly-debrief','report')$$,'pause debrief');
reset role;
select is((select state from private.processing_authority where user_id='da240000-0000-4000-8000-000000000003'),'revoked','debrief revoked');
-- A pending request cannot override a pause: approve refused, request stays open.
select pg_temp.as_user('da240000-0000-4000-8000-000000000004','aal1');
set local role authenticated;
select public.request_authority_review('weekly-debrief',null);
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal2');
set local role authenticated;
select public.operator_pause_purpose('da240000-0000-4000-8000-000000000004','weekly-debrief','dispute');
select is(pg_temp.state_of($$select public.operator_decide_review(pg_temp.rid('da240000-0000-4000-8000-000000000004','weekly-debrief'),'approved')$$),'ER003','approval cannot override a pause');
select is(pg_temp.state_of($$select public.operator_decide_review(pg_temp.rid('da240000-0000-4000-8000-000000000004','weekly-debrief'),'denied')$$),'ok','denial closes the request without touching the pause');
reset role;
select is((select state from private.processing_authority where user_id='da240000-0000-4000-8000-000000000004'),'revoked','pause survives denial');

-- Pause by email: case-insensitive exact match, generic refusal when unknown.
select pg_temp.as_user('da240000-0000-4000-8000-000000000002','aal2');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_pause_purpose(null,'fitness-tracking','dispute',' ADM-Teen-B@Example.invalid ')$$),'42501','non-operator cannot pause by email');
reset role;
select pg_temp.as_user('da240000-0000-4000-8000-000000000001','aal2');
set local role authenticated;
select is(pg_temp.state_of($$select public.operator_pause_purpose(null,'fitness-tracking','dispute','nobody@example.invalid')$$),'42501','unknown email refused generically');
select is(pg_temp.state_of($$select public.operator_pause_purpose(null,'fitness-tracking','dispute','adm-teen')$$),'42501','partial email does not match');
select is(pg_temp.state_of($$select public.operator_pause_purpose(null,'fitness-tracking','dispute',null)$$),'22023','neither id nor email refused');
select is(pg_temp.state_of($$select public.operator_pause_purpose('da240000-0000-4000-8000-000000000004','fitness-tracking','dispute','adm-teen-b@example.invalid')$$),'22023','both id and email refused');
select lives_ok($$select public.operator_pause_purpose(null,'fitness-tracking','dispute',' ADM-Teen-B@Example.invalid ')$$,'pause by email');
reset role;
select is((select state from private.tracker_purpose_authority where user_id='da240000-0000-4000-8000-000000000004' and purpose='fitness-tracking'),'revoked','email pause revoked the right account');
-- Audit: content-free, one row per operator action.
select is((select array_agg(distinct action order by action) from private.operator_audit),
 array['decide-approved','decide-denied','list-review-requests','pause-purpose'],'audit actions');
select is((select count(*)::integer from private.operator_audit where action='pause-purpose' and reason_code in ('dispute','report')),4,'pauses audited with codes');
select ok(not exists(select 1 from private.operator_audit a where a::text ~* 'SECRET|please review|birth|example\.invalid'),'audit holds no note, email, birthday or quest text');
select ok(not exists(select 1 from private.operator_audit where operator_id<>'da240000-0000-4000-8000-000000000001' or at is null),'audit rows carry operator and time');
-- Cascade: deleting a user removes their requests.
delete from auth.users where id='da240000-0000-4000-8000-000000000006';
select is((select count(*)::integer from private.authority_review_requests where user_id='da240000-0000-4000-8000-000000000006'),0,'account deletion removes requests');
select * from finish();
rollback;
