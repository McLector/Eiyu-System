begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- Migration 067: get_mailbox_status() also reports a pending, delivered code (without the code or the email text), so
-- the email box can come back after a reload. Synthetic users; rolled back.
-- One user per scenario, because mailbox_begin allows only a few sends per window.
insert into auth.users(id,email,raw_user_meta_data) values
 ('da540000-0000-4000-8000-00000000000a','resume-a@example.invalid','{}'),
 ('da540000-0000-4000-8000-00000000000b','resume-b@example.invalid','{}'),
 ('da540000-0000-4000-8000-00000000000c','resume-c@example.invalid','{}'),
 ('da540000-0000-4000-8000-00000000000d','resume-d@example.invalid','{}'),
 ('da540000-0000-4000-8000-00000000000e','resume-e@example.invalid','{}'),
 ('da540000-0000-4000-8000-00000000000f','resume-f@example.invalid','{}'),
 ('da540000-0000-4000-8000-000000000010','resume-g@example.invalid','{}');

-- Grants first: the box is owner-only.
select ok(has_function_privilege('authenticated','public.get_mailbox_status()','execute'),'a signed-in person can read the status');
select ok(not has_function_privilege('anon','public.get_mailbox_status()','execute'),'anonymous cannot read the status');
select ok(not has_function_privilege('service_role','public.get_mailbox_status()','execute'),'the service role does not use the owner status');

-- 1. No challenge before any send. The key is present and null, and the three old keys are unchanged.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-00000000000a',true);
select ok(public.get_mailbox_status() ? 'challenge','the status carries a challenge key');
select is(public.get_mailbox_status()->'challenge','null'::jsonb,'no challenge before any send');
select is((select array_agg(k order by k) from jsonb_object_keys(public.get_mailbox_status()) k),
 array['challenge','userId','verified','version'],'the status holds the three old keys plus the challenge');
select is((public.get_mailbox_status()->>'userId')::uuid,'da540000-0000-4000-8000-00000000000a'::uuid,'the status names the caller');
reset role;

-- Send for users a (delivered), b (another person, no send), c (delivery failed), d (expired), e (email changes),
-- f (version bumped without the email trigger), g (finishes).
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('t.a',public.mailbox_begin('da540000-0000-4000-8000-00000000000a')->>'challengeId',true);
select set_config('t.c',public.mailbox_begin('da540000-0000-4000-8000-00000000000c')->>'challengeId',true);
select set_config('t.d',public.mailbox_begin('da540000-0000-4000-8000-00000000000d')->>'challengeId',true);
select set_config('t.e',public.mailbox_begin('da540000-0000-4000-8000-00000000000e')->>'challengeId',true);
select set_config('t.f',public.mailbox_begin('da540000-0000-4000-8000-00000000000f')->>'challengeId',true);
select set_config('t.g',public.mailbox_begin('da540000-0000-4000-8000-000000000010')->>'challengeId',true);
reset role;

-- 1b. A send that has begun but has not been delivered yet is not resumable.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-00000000000a',true);
select is(public.get_mailbox_status()->'challenge','null'::jsonb,'a send that has not been delivered yet is not returned');
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(public.mailbox_send_result('da540000-0000-4000-8000-00000000000a',current_setting('t.a')::uuid,true),true,'a: delivery recorded');
select is(public.mailbox_send_result('da540000-0000-4000-8000-00000000000c',current_setting('t.c')::uuid,false),true,'c: failed delivery recorded');
select is(public.mailbox_send_result('da540000-0000-4000-8000-00000000000d',current_setting('t.d')::uuid,true),true,'d: delivery recorded');
select is(public.mailbox_send_result('da540000-0000-4000-8000-00000000000e',current_setting('t.e')::uuid,true),true,'e: delivery recorded');
select is(public.mailbox_send_result('da540000-0000-4000-8000-00000000000f',current_setting('t.f')::uuid,true),true,'f: delivery recorded');
select is(public.mailbox_send_result('da540000-0000-4000-8000-000000000010',current_setting('t.g')::uuid,true),true,'g: delivery recorded');
reset role;

-- 2. Returned after a delivered send, with exactly three fields and nothing that could leak the code or the address.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-00000000000a',true);
select is(public.get_mailbox_status()->'challenge'->>'id',current_setting('t.a'),'challenge returned after a delivered send');
select is((select array_agg(k order by k) from jsonb_object_keys(public.get_mailbox_status()->'challenge') k),
 array['expiresAt','id','resendAfter'],'the challenge holds only id, expiresAt and resendAfter');
select ok((public.get_mailbox_status()->'challenge'->>'expiresAt')::timestamptz>now(),'the challenge expires in the future');
select ok(position('resume-a' in public.get_mailbox_status()::text)=0,'the status never contains the email address');
select ok((public.get_mailbox_status()->'challenge'->>'resendAfter')::integer between 1 and 60,'resendAfter is within the 60 second window right after a send');
select is(jsonb_typeof(public.get_mailbox_status()->'challenge'->'resendAfter'),'number','resendAfter is a JSON number');
select is(public.get_mailbox_status()->>'verified','false','the person is still unverified');
reset role;

-- 3. Not returned when delivery failed.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-00000000000c","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-00000000000c',true);
select is(public.get_mailbox_status()->'challenge','null'::jsonb,'not returned when delivery failed');
reset role;

-- 4. Not returned after expiry.
update private.mailbox_state set challenge_expires_at=clock_timestamp()-interval '1 second'
 where user_id='da540000-0000-4000-8000-00000000000d';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-00000000000d","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-00000000000d',true);
select is(public.get_mailbox_status()->'challenge','null'::jsonb,'not returned after expiry');
reset role;

-- 5. Not returned after the email changed (the version is bumped).
update auth.users set email='resume-e2@example.invalid' where id='da540000-0000-4000-8000-00000000000e';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-00000000000e","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-00000000000e',true);
select is(public.get_mailbox_status()->'challenge','null'::jsonb,'not returned after the email changed');
select is((public.get_mailbox_status()->>'version')::integer,2,'the version moved on with the email');
reset role;
-- 5b. The function checks the version itself, even if a stale row were left behind.
update private.mailbox_state set version=version+1 where user_id='da540000-0000-4000-8000-00000000000f';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-00000000000f","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-00000000000f',true);
select is(public.get_mailbox_status()->'challenge','null'::jsonb,'not returned when the challenge belongs to an older version');
reset role;

-- 6. Not returned after mailbox_finish, and the person reads as verified.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(public.mailbox_attempt('da540000-0000-4000-8000-000000000010',current_setting('t.g')::uuid)->>'allowed','true','g: a code attempt is allowed');
select is(public.mailbox_finish('da540000-0000-4000-8000-000000000010',current_setting('t.g')::uuid,
 'da540000-0000-4000-8000-000000000010','resume-g@example.invalid'),true,'g: proof granted');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-000000000010","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-000000000010',true);
select is(public.get_mailbox_status()->'challenge','null'::jsonb,'not returned after mailbox_finish');
select is(public.get_mailbox_status()->>'verified','true','a verified person reads as verified');
reset role;

-- 7. resendAfter counts down and is 0 once the 60 seconds have passed.
update private.mailbox_state set last_sent_at=clock_timestamp()-interval '30 seconds'
 where user_id='da540000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-00000000000a',true);
select ok((public.get_mailbox_status()->'challenge'->>'resendAfter')::integer between 28 and 30,'resendAfter counts down after 30 seconds');
reset role;
update private.mailbox_state set last_sent_at=clock_timestamp()-interval '61 seconds'
 where user_id='da540000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-00000000000a',true);
select is((public.get_mailbox_status()->'challenge'->>'resendAfter')::integer,0,'resendAfter is 0 after 60 seconds');
select is(public.get_mailbox_status()->'challenge'->>'id',current_setting('t.a'),'the challenge is still pending when a resend is due');
reset role;

-- 8. Another person never sees my challenge.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da540000-0000-4000-8000-00000000000b","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','da540000-0000-4000-8000-00000000000b',true);
select is(public.get_mailbox_status()->'challenge','null'::jsonb,'another person has no challenge');
select ok(position(current_setting('t.a') in public.get_mailbox_status()::text)=0,'another person never sees my challenge id');
reset role;

-- 9. An anonymous call is refused, and a signed-in call with no subject is refused.
set local role anon;
select throws_ok('select public.get_mailbox_status()','42501',null,'an anonymous call is refused');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','',true);
select throws_ok('select public.get_mailbox_status()','42501','authentication required','a call with no subject is refused');
reset role;

select * from finish();
rollback;
