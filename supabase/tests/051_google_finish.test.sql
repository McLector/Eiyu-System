begin;
-- S03: finishing a Google sign-up (migration 064). The finish screen saves the
-- birthday-notice permission and the birthday in one call, so a failure saves neither
-- and an account can never be left with permission but no birthday. An account that is
-- already in that state (from the earlier two-call screen) can still finish.
-- Fixtures are inserted as supabase_admin with no role set, the 050 privileged-import
-- path; a Google user with no birthday metadata gets no consent and no birthday rows.
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select ok(to_regprocedure('public.finish_google_signup(date,text,uuid,integer,integer,integer,integer)') is not null,
  'finish function exists');
select ok(coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
  where p.oid=to_regprocedure('public.finish_google_signup(date,text,uuid,integer,integer,integer,integer)')),false),
  'finish is security definer with an empty search_path');
select ok(coalesce(has_function_privilege('authenticated',
  to_regprocedure('public.finish_google_signup(date,text,uuid,integer,integer,integer,integer)'),'EXECUTE')
  and not has_function_privilege('anon',
  to_regprocedure('public.finish_google_signup(date,text,uuid,integer,integer,integer,integer)'),'EXECUTE'),false),
  'signed-in users can call finish, anonymous callers cannot');

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at) values
 ('d5100000-0000-4000-8000-000000000001','finish-new@example.invalid','{"provider":"google","providers":["google"]}','{}',now()),
 ('d5100000-0000-4000-8000-000000000002','finish-bad-date@example.invalid','{"provider":"google","providers":["google"]}','{}',now()),
 ('d5100000-0000-4000-8000-000000000003','finish-half@example.invalid','{"provider":"google","providers":["google"]}','{}',now()),
 ('d5100000-0000-4000-8000-000000000004','finish-other@example.invalid','{"provider":"google","providers":["google"]}','{}',now());

-- Calls finish with the caller's current revisions, as the app does.
create function pg_temp.fin(p_date date,p_notice text default '2026-10-20-age-v1',p_user uuid default null,
 p_age_bump integer default 0) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s jsonb:=public.get_processing_access(); begin
 return public.finish_google_signup(p_date,p_notice,coalesce(p_user,(s->>'userId')::uuid),
  (s->>'ageVersion')::integer+p_age_bump,(s->>'consentVersion')::integer,
  (s->>'authorityVersion')::integer,(s->>'mailboxVersion')::integer);
end;$$;
grant execute on function pg_temp.fin(date,text,uuid,integer) to authenticated;
create temp table kept(k text primary key,v jsonb);
grant all on kept to authenticated;

-- 1. Signed out: refused.
set local role anon;
select throws_ok($$select public.finish_google_signup(date '2000-01-01','2026-10-20-age-v1',
 'd5100000-0000-4000-8000-000000000001',0,0,0,0)$$,'42501',null,'anonymous callers are refused');
reset role;

-- 2. New Google user: permission and birthday both saved by one call.
set local role authenticated;
select set_config('request.jwt.claim.sub','d5100000-0000-4000-8000-000000000001',true);
select lives_ok($$insert into kept values('new',pg_temp.fin(date '2000-01-01'))$$,'a new Google user finishes');
select is((select v#>>'{access,ageConsent}' from kept where k='new'),'true','the result reports the permission');
select is((select v#>>'{age,birthDate}' from kept where k='new'),'2000-01-01','the result reports the birthday');
select is((select v#>>'{age,userId}' from kept where k='new'),'d5100000-0000-4000-8000-000000000001','the result is for the caller');
reset role;
select is((select age_granted from private.processing_consent where user_id='d5100000-0000-4000-8000-000000000001'),true,
  'the permission row is saved');
select is((select count(*) from private.processing_consent_events where user_id='d5100000-0000-4000-8000-000000000001'
  and purpose='age-screening' and granted),1::bigint,'one permission event is recorded');
select is((select birth_date from private.account_age where user_id='d5100000-0000-4000-8000-000000000001'),date '2000-01-01',
  'the birthday is saved');

-- 3. A retry with the same birthday (the first answer was lost) succeeds and changes nothing.
select is((select version from private.account_age where user_id='d5100000-0000-4000-8000-000000000001'),1,'birthday version before retry');
set local role authenticated;
select set_config('request.jwt.claim.sub','d5100000-0000-4000-8000-000000000001',true);
select lives_ok($$select pg_temp.fin(date '2000-01-01')$$,'a retry with the same birthday succeeds');
-- 4. Finish is not a correction path: a different birthday is refused once one is saved.
select throws_ok($$select pg_temp.fin(date '1999-05-05')$$,'EG002',null,'a different birthday after finishing is refused');
reset role;
select is((select version from private.account_age where user_id='d5100000-0000-4000-8000-000000000001'),1,
  'the retry did not bump the birthday version');
select is((select birth_date from private.account_age where user_id='d5100000-0000-4000-8000-000000000001'),date '2000-01-01',
  'the refused change left the birthday alone');
select is((select pending_birth_date from private.account_age where user_id='d5100000-0000-4000-8000-000000000001'),null,
  'the refused change left no pending correction');
select is((select count(*) from private.processing_consent_events where user_id='d5100000-0000-4000-8000-000000000001'),1::bigint,
  'retries recorded no further permission events');

-- 5. The birthday step fails after the permission step: neither is kept.
set local role authenticated;
select set_config('request.jwt.claim.sub','d5100000-0000-4000-8000-000000000002',true);
select throws_ok($$select pg_temp.fin(date '2999-01-01')$$,'22023',null,'a future birthday is refused');
select throws_ok($$select pg_temp.fin(null)$$,'22023',null,'a missing birthday is refused');
-- 6. Wrong notice, another account, stale revisions: refused.
select throws_ok($$select pg_temp.fin(date '2000-01-01','2020-01-01-old')$$,'22023',null,'an old notice version is refused');
select throws_ok($$select pg_temp.fin(date '2000-01-01',p_user=>'d5100000-0000-4000-8000-000000000004')$$,'42501',null,
  'a call naming another account is refused');
select throws_ok($$select pg_temp.fin(date '2000-01-01',p_age_bump=>1)$$,'EP002',null,'stale revisions are refused');
reset role;
select is((select count(*) from private.processing_consent where user_id='d5100000-0000-4000-8000-000000000002'),0::bigint,
  'no permission was kept after any refused finish');
select is((select count(*) from private.processing_consent_events where user_id='d5100000-0000-4000-8000-000000000002'),0::bigint,
  'no permission event was kept after any refused finish');
select is((select count(*) from private.account_age where user_id='d5100000-0000-4000-8000-000000000002'),0::bigint,
  'no birthday was kept after any refused finish');
select is((select count(*) from private.processing_consent where user_id='d5100000-0000-4000-8000-000000000004'),0::bigint,
  'the other account was not touched');

-- 7. Half-finished by the old screen (permission saved, no birthday): finish completes it.
set local role authenticated;
select set_config('request.jwt.claim.sub','d5100000-0000-4000-8000-000000000003',true);
select public.set_processing_consent('age-screening',true,'2026-10-20-age-v1','d5100000-0000-4000-8000-000000000003',
 (public.get_processing_access()->>'ageVersion')::integer,(public.get_processing_access()->>'consentVersion')::integer,
 (public.get_processing_access()->>'authorityVersion')::integer,(public.get_processing_access()->>'mailboxVersion')::integer);
select lives_ok($$select pg_temp.fin(date '2001-02-03')$$,'a half-finished account finishes');
reset role;
select is((select birth_date from private.account_age where user_id='d5100000-0000-4000-8000-000000000003'),date '2001-02-03',
  'the half-finished account now has its birthday');
select is((select count(*) from private.processing_consent_events where user_id='d5100000-0000-4000-8000-000000000003'),1::bigint,
  'the existing permission was not recorded twice');

select * from finish();
rollback;
