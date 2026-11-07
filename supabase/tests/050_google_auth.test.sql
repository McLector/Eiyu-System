begin;
-- S03: the Google identity link gate (migration 063). GoTrue links a new Google
-- identity to any existing user with a matching email (identity match first, then a
-- user row with no identity at all). This gate refuses that link unless the user holds
-- the S02 mailbox proof, or this is the create path: no identity rows yet and
-- raw_app_meta_data.provider = 'google' (GoTrue sets it; the client cannot).
-- Fixtures are inserted as supabase_admin with no role set, the 050 privileged-import
-- path, so EP003 is skipped. auth.identities.email is generated from identity_data.
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

-- Structure first, written so a missing function fails the assertion instead of erroring.
select ok(to_regprocedure('private.gate_google_identity_link()') is not null,'gate function exists');
select is((select t.tgtype::integer from pg_trigger t where t.tgrelid='auth.identities'::regclass
  and t.tgname='gate_google_identity_link' and not t.tgisinternal),7,
  'gate is a row-level BEFORE INSERT trigger only, so a returning login (UPDATE) is never gated');
select ok(coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
  where p.oid=to_regprocedure('private.gate_google_identity_link()')),false),
  'gate is security definer with an empty search_path');
select ok(coalesce(not has_function_privilege('anon',to_regprocedure('private.gate_google_identity_link()'),'EXECUTE')
  and not has_function_privilege('authenticated',to_regprocedure('private.gate_google_identity_link()'),'EXECUTE')
  and not has_function_privilege('service_role',to_regprocedure('private.gate_google_identity_link()'),'EXECUTE'),false),
  'clients cannot execute the gate function');

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at) values
 ('d5000000-0000-4000-8000-000000000001','gate-unproved@example.invalid','{"provider":"email","providers":["email"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000003','gate-created@example.invalid','{"provider":"google","providers":["google"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000004','gate-noident-email@example.invalid','{"provider":"email","providers":["email"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000005','gate-noident-null@example.invalid','{}','{}',now()),
 ('d5000000-0000-4000-8000-000000000006','gate-google-twice@example.invalid','{"provider":"google","providers":["google"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000007','gate-forged@example.invalid','{"provider":"email","providers":["email"]}','{"provider":"google"}',now()),
 ('d5000000-0000-4000-8000-000000000008','gate-nongoogle@example.invalid','{"provider":"email","providers":["email"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000009','gate-returning@example.invalid','{"provider":"email","providers":["email"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000010','Gate-Case-Unproved@Example.Invalid','{"provider":"email","providers":["email"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000011','Gate-Case-Proved@Example.Invalid','{"provider":"email","providers":["email"]}','{}',now());
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('d5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','{"sub":"d5000000-0000-4000-8000-000000000001","email":"gate-unproved@example.invalid"}','email'),
 ('d5000000-0000-4000-8000-000000000008','d5000000-0000-4000-8000-000000000008','{"sub":"d5000000-0000-4000-8000-000000000008","email":"gate-nongoogle@example.invalid"}','email'),
 ('d5000000-0000-4000-8000-000000000009','d5000000-0000-4000-8000-000000000009','{"sub":"d5000000-0000-4000-8000-000000000009","email":"gate-returning@example.invalid"}','email'),
 ('d5000000-0000-4000-8000-000000000010','d5000000-0000-4000-8000-000000000010','{"sub":"d5000000-0000-4000-8000-000000000010","email":"gate-case-unproved@example.invalid"}','email'),
 ('d5000000-0000-4000-8000-000000000011','d5000000-0000-4000-8000-000000000011','{"sub":"d5000000-0000-4000-8000-000000000011","email":"gate-case-proved@example.invalid"}','email');

-- 1. Unproved password account plus a Google identity: refused, nothing kept, no proof.
select throws_ok($$insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-01','d5000000-0000-4000-8000-000000000001','{"sub":"g-sub-01","email":"gate-unproved@example.invalid","email_verified":true}','google')$$,
 'EG001',null,'unproved password account refuses a Google link');
select is((select count(*) from auth.identities where user_id='d5000000-0000-4000-8000-000000000001' and provider='google'),0::bigint,
  'no Google identity remains on the refused account');
select is((select verified_version from private.mailbox_state where user_id='d5000000-0000-4000-8000-000000000001'),null,
  'the refused link grants no proof');

-- 2. The same account once proof is granted: the link is allowed.
update private.mailbox_state set verified_version=version,verified_at=now() where user_id='d5000000-0000-4000-8000-000000000001';
select lives_ok($$insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-02','d5000000-0000-4000-8000-000000000001','{"sub":"g-sub-02","email":"gate-unproved@example.invalid","email_verified":true}','google')$$,
 'proved account accepts a Google link');
select is((select count(*) from auth.identities where user_id='d5000000-0000-4000-8000-000000000001'),2::bigint,
  'the linked account keeps its email identity and gains the Google identity');

-- 3. Create path: GoTrue-set google provider, no identity rows, no proof. A plain proof
-- check would block every Google sign-up, so this must pass and must fail against it.
select lives_ok($$insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-03','d5000000-0000-4000-8000-000000000003','{"sub":"g-sub-03","email":"gate-created@example.invalid","email_verified":true}','google')$$,
 'create path: a new Google-created user gets its first Google identity');

-- 4. Users with no identity rows but a password provider (or none) are link targets in GoTrue.
select throws_ok($$insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-04','d5000000-0000-4000-8000-000000000004','{"sub":"g-sub-04","email":"gate-noident-email@example.invalid","email_verified":true}','google')$$,
 'EG001',null,'identity-less unproved user with an email provider refuses a Google link');
select throws_ok($$insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-05','d5000000-0000-4000-8000-000000000005','{"sub":"g-sub-05","email":"gate-noident-null@example.invalid","email_verified":true}','google')$$,
 'EG001',null,'identity-less unproved user with no provider refuses a Google link');

-- 5. A Google-created user that already has a Google identity and no proof (here the proof
-- is cleared by an email change, which bumps the mailbox version) cannot take a second
-- Google identity.
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-06a','d5000000-0000-4000-8000-000000000006','{"sub":"g-sub-06a","email":"gate-google-twice@example.invalid","email_verified":true}','google');
update auth.users set email='gate-google-twice-new@example.invalid' where id='d5000000-0000-4000-8000-000000000006';
select throws_ok($$insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-06b','d5000000-0000-4000-8000-000000000006','{"sub":"g-sub-06b","email":"gate-google-twice@example.invalid","email_verified":true}','google')$$,
 'EG001',null,'unproved Google-created user refuses a second Google identity');

-- 6. raw_user_meta_data is client-controlled and must never open the create path.
select throws_ok($$insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-07','d5000000-0000-4000-8000-000000000007','{"sub":"g-sub-07","email":"gate-forged@example.invalid","email_verified":true}','google')$$,
 'EG001',null,'user metadata claiming Google does not exempt an email-provider account');

-- 7. Non-Google identities are untouched, even for an unproved user.
select lives_ok($$insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('gh-sub-08','d5000000-0000-4000-8000-000000000008','{"sub":"gh-sub-08","email":"gate-nongoogle@example.invalid"}','github')$$,
 'a non-Google identity insert is not gated');

-- 8. A returning login is an UPDATE of the Google identity and is never blocked, even when
-- the proof has since been cleared.
update private.mailbox_state set verified_version=version,verified_at=now() where user_id='d5000000-0000-4000-8000-000000000009';
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-09','d5000000-0000-4000-8000-000000000009','{"sub":"g-sub-09","email":"gate-returning@example.invalid","email_verified":true}','google');
update private.mailbox_state set verified_version=null,verified_at=null where user_id='d5000000-0000-4000-8000-000000000009';
select lives_ok($$update auth.identities set identity_data=identity_data||'{"email_verified":true}'::jsonb,last_sign_in_at=now()
 where provider='google' and provider_id='g-sub-09'$$,'returning Google login (UPDATE) is not gated without proof');

-- 9. Case and whitespace in the identity email do not change either outcome.
select throws_ok($$insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-10','d5000000-0000-4000-8000-000000000010','{"sub":"g-sub-10","email":"  Gate-Case-Unproved@Example.Invalid ","email_verified":true}','google')$$,
 'EG001',null,'mixed-case padded email on an unproved account is still refused');
update private.mailbox_state set verified_version=version,verified_at=now() where user_id='d5000000-0000-4000-8000-000000000011';
select lives_ok($$insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-11','d5000000-0000-4000-8000-000000000011','{"sub":"g-sub-11","email":"  Gate-Case-Proved@Example.Invalid ","email_verified":true}','google')$$,
 'mixed-case padded email on a proved account is still allowed');

-- T3: a verified Google email that matches the account's current email counts as mailbox
-- proof. The trigger runs AFTER insert or update, so by timing it can never grant proof
-- before the gate above has looked.
select ok(to_regprocedure('private.grant_google_mailbox_proof()') is not null,'proof function exists');
select is((select t.tgtype::integer from pg_trigger t where t.tgrelid='auth.identities'::regclass
  and t.tgname='grant_google_mailbox_proof' and not t.tgisinternal),21,
  'proof is a row-level AFTER INSERT OR UPDATE trigger, so it runs after the gate');
select ok(coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
  where p.oid=to_regprocedure('private.grant_google_mailbox_proof()')),false),
  'proof function is security definer with an empty search_path');
select ok(coalesce(not has_function_privilege('anon',to_regprocedure('private.grant_google_mailbox_proof()'),'EXECUTE')
  and not has_function_privilege('authenticated',to_regprocedure('private.grant_google_mailbox_proof()'),'EXECUTE')
  and not has_function_privilege('service_role',to_regprocedure('private.grant_google_mailbox_proof()'),'EXECUTE'),false),
  'clients cannot execute the proof function');

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at) values
 ('d5000000-0000-4000-8000-000000000012','proof-ok@example.invalid','{"provider":"google","providers":["google"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000013','proof-unverified@example.invalid','{"provider":"google","providers":["google"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000014','proof-noclaim@example.invalid','{"provider":"google","providers":["google"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000015','proof-mismatch@example.invalid','{"provider":"google","providers":["google"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000016','proof-nongoogle@example.invalid','{"provider":"email","providers":["email"]}','{}',now()),
 ('d5000000-0000-4000-8000-000000000017','proof-repeat@example.invalid','{"provider":"google","providers":["google"]}','{}',now());

-- Verified claim with a matching email (case and padding ignored) grants proof.
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-12','d5000000-0000-4000-8000-000000000012','{"sub":"g-sub-12","email":"  Proof-OK@Example.Invalid ","email_verified":true}','google');
select is(private.mailbox_verified('d5000000-0000-4000-8000-000000000012'),true,'verified matching Google email grants mailbox proof');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d5000000-0000-4000-8000-000000000012","role":"authenticated"}',true);
select is(public.current_mailbox_verified(),true,'the debrief gate sees the Google proof');
reset role;

-- Unverified, absent and mismatched claims grant nothing.
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-13','d5000000-0000-4000-8000-000000000013','{"sub":"g-sub-13","email":"proof-unverified@example.invalid","email_verified":false}','google'),
 ('g-sub-14','d5000000-0000-4000-8000-000000000014','{"sub":"g-sub-14","email":"proof-noclaim@example.invalid"}','google'),
 ('g-sub-15','d5000000-0000-4000-8000-000000000015','{"sub":"g-sub-15","email":"someone-else@example.invalid","email_verified":true}','google');
select is(private.mailbox_verified('d5000000-0000-4000-8000-000000000013'),false,'email_verified false grants no proof');
select is(private.mailbox_verified('d5000000-0000-4000-8000-000000000014'),false,'a missing email_verified claim grants no proof');
select is(private.mailbox_verified('d5000000-0000-4000-8000-000000000015'),false,'a Google email that differs from the account email grants no proof');

-- A non-Google identity never grants proof, even when it carries a verified claim.
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('gh-sub-16','d5000000-0000-4000-8000-000000000016','{"sub":"gh-sub-16","email":"proof-nongoogle@example.invalid","email_verified":true}','github');
select is(private.mailbox_verified('d5000000-0000-4000-8000-000000000016'),false,'a non-Google identity grants no proof');

-- A returning login (UPDATE) keeps the proof.
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-sub-17','d5000000-0000-4000-8000-000000000017','{"sub":"g-sub-17","email":"proof-repeat@example.invalid","email_verified":true}','google');
update auth.identities set identity_data=identity_data||'{"email_verified":true}'::jsonb,last_sign_in_at=now()
 where provider='google' and provider_id='g-sub-17';
select is(private.mailbox_verified('d5000000-0000-4000-8000-000000000017'),true,'a returning Google login keeps the proof');
select is((select verified_version=version from private.mailbox_state where user_id='d5000000-0000-4000-8000-000000000017'),true,
  'the proof is bound to the current mailbox version');

-- An email change clears the proof, and the old identity (old email in identity_data) does
-- not re-grant it on its next login. A Google claim for the new address does grant it.
update auth.users set email='proof-ok-new@example.invalid' where id='d5000000-0000-4000-8000-000000000012';
select is(private.mailbox_verified('d5000000-0000-4000-8000-000000000012'),false,'an email change clears the Google proof');
update auth.identities set identity_data=identity_data||'{"email_verified":true}'::jsonb,last_sign_in_at=now()
 where provider='google' and provider_id='g-sub-12';
select is(private.mailbox_verified('d5000000-0000-4000-8000-000000000012'),false,'the old Google identity does not re-grant proof after an email change');
update auth.identities set identity_data=identity_data||'{"email":"proof-ok-new@example.invalid","email_verified":true}'::jsonb
 where provider='google' and provider_id='g-sub-12';
select is(private.mailbox_verified('d5000000-0000-4000-8000-000000000012'),true,'a verified Google claim for the new address grants proof for it');

-- T3b (rewritten for S03b): sign-up is never refused over age or consent. The old EP003 rule is gone; every shape
-- that used to be refused or half-accepted is now accepted, and none of them stores a birthday or a consent row.
-- Users are inserted as supabase_auth_admin, the role real Auth uses, so the privileged-import shortcut in 050
-- cannot hide the result.
grant usage on schema extensions to supabase_auth_admin;
set local role supabase_auth_admin;
select lives_ok($$insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
 ('d5000000-0000-4000-8000-000000000020','ep3-password@example.invalid','{"provider":"email","providers":["email"]}','{"birth_date":"2000-01-01","processing_consent":{"age_screening":{"granted":true,"notice_version":"2026-10-20-age-v1"}}}')$$,
 'a password sign-up that still sends an old birthday is accepted');
select lives_ok($$insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
 ('d5000000-0000-4000-8000-000000000021','ep3-forged@example.invalid','{"provider":"email","providers":["email"]}','{"provider":"google"}')$$,
 'user metadata claiming Google is accepted and gains nothing from the claim');
select lives_ok($$insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
 ('d5000000-0000-4000-8000-000000000022','ep3-no-provider@example.invalid','{}','{}')$$,
 'an account with no provider in app metadata is accepted');
select lives_ok($$insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
 ('d5000000-0000-4000-8000-000000000023','ep3-google-bad-choice@example.invalid','{"provider":"google","providers":["google"]}','{"processing_consent":{"age_screening":{"granted":"true","notice_version":"2026-10-20-age-v1"}}}')$$,
 'a Google account that sends a malformed old consent choice is accepted');
select lives_ok($$insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
 ('d5000000-0000-4000-8000-000000000024','ep3-google@example.invalid','{"provider":"google","providers":["google"]}','{"full_name":"Test Person"}')$$,
 'a Google-created account with no metadata of ours is accepted');
select lives_ok($$insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
 ('d5000000-0000-4000-8000-000000000025','ep3-google-terms@example.invalid','{"provider":"google","providers":["google"]}','{"terms":{"version":"2026-11-08-terms-v2"}}')$$,
 'a Google-created account that sends the current Terms version is accepted');
reset role;
select is((select count(*) from auth.users where id in ('d5000000-0000-4000-8000-000000000020','d5000000-0000-4000-8000-000000000021',
  'd5000000-0000-4000-8000-000000000022','d5000000-0000-4000-8000-000000000023','d5000000-0000-4000-8000-000000000024','d5000000-0000-4000-8000-000000000025')),6::bigint,'all six sign-ups left an account');
select is((select count(*) from private.processing_consent where user_id in ('d5000000-0000-4000-8000-000000000020','d5000000-0000-4000-8000-000000000021','d5000000-0000-4000-8000-000000000022','d5000000-0000-4000-8000-000000000023','d5000000-0000-4000-8000-000000000024','d5000000-0000-4000-8000-000000000025')),0::bigint,
  'no sign-up created a consent row, whatever old consent metadata it carried');
select is((select count(*) from private.account_age where user_id in ('d5000000-0000-4000-8000-000000000020','d5000000-0000-4000-8000-000000000021','d5000000-0000-4000-8000-000000000022','d5000000-0000-4000-8000-000000000023','d5000000-0000-4000-8000-000000000024','d5000000-0000-4000-8000-000000000025')),0::bigint,
  'and none stored a birthday');
select is((select count(*) from private.terms_acceptance where user_id='d5000000-0000-4000-8000-000000000025' and version='2026-11-08-terms-v2'),1::bigint,
  'the current Terms version sent with a Google sign-up is recorded');
select is((select count(*) from private.terms_acceptance where user_id='d5000000-0000-4000-8000-000000000024'),0::bigint,
  'a Google sign-up with no Terms metadata has no Terms row, so the finish screen will ask');


-- T3b: the narrowed before-user-created hook. Create path only; it never touches linking.
select ok(to_regprocedure('public.s03_before_user_created(jsonb)') is not null,'hook function exists');
select ok(coalesce((select p.proconfig @> array['search_path=""'] from pg_proc p
  where p.oid=to_regprocedure('public.s03_before_user_created(jsonb)')),false),'hook has an empty search_path');
select ok(coalesce(has_function_privilege('supabase_auth_admin',to_regprocedure('public.s03_before_user_created(jsonb)'),'EXECUTE')
  and not has_function_privilege('anon',to_regprocedure('public.s03_before_user_created(jsonb)'),'EXECUTE')
  and not has_function_privilege('authenticated',to_regprocedure('public.s03_before_user_created(jsonb)'),'EXECUTE')
  and not has_function_privilege('service_role',to_regprocedure('public.s03_before_user_created(jsonb)'),'EXECUTE'),false),
  'only the Auth role can execute the hook');
select is(public.s03_before_user_created('{"user":{"app_metadata":{"provider":"google"},"user_metadata":{"email_verified":true}}}'::jsonb),
  '{}'::jsonb,'verified Google email is allowed');
select is(public.s03_before_user_created('{"user":{"app_metadata":{"provider":"google"},"user_metadata":{"email_verified":false}}}'::jsonb)#>>'{error,http_code}',
  '403','unverified Google email is rejected with 403');
select is(public.s03_before_user_created('{"user":{"app_metadata":{"provider":"google"},"user_metadata":{"email_verified":false}}}'::jsonb)#>>'{error,message}',
  'Google says this email is not verified. Verify it with Google, then try again.','and the message is readable');
select is(public.s03_before_user_created('{"user":{"app_metadata":{"provider":"google"},"user_metadata":{}}}'::jsonb)#>>'{error,http_code}',
  '403','a missing email_verified claim is rejected');
select is(public.s03_before_user_created('{"user":{"app_metadata":{"provider":"google"},"user_metadata":{"email_verified":"false"}}}'::jsonb)#>>'{error,http_code}',
  '403','a text false claim is rejected');
select is(public.s03_before_user_created('{"user":{"app_metadata":{"provider":"email"},"user_metadata":{"email_verified":false}}}'::jsonb),
  '{}'::jsonb,'a non-Google sign-up passes through unchanged');
select is(public.s03_before_user_created('{}'::jsonb),'{}'::jsonb,'an empty event passes through unchanged');

select * from finish();
rollback;
