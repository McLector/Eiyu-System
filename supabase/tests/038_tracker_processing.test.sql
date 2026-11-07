begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('da230000-0000-4000-8000-000000000001','tracker-unknown@example.invalid','{}'),
 ('da230000-0000-4000-8000-000000000002','tracker-adult@example.invalid','{}'),
 ('da230000-0000-4000-8000-000000000003','tracker-second@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230000-0000-4000-8000-000000000001',true);
select ok((public.get_tracker_processing_access()->>'canWriteBasic')::boolean,'unknown legacy retains basic');
select is(public.get_tracker_processing_access()->>'customConsent','false','no invented custom grant');
select is(public.get_tracker_processing_access()->>'fitnessConsent','false','no invented fitness grant');
select is(public.get_tracker_processing_access()->>'canWriteCustom','true','open tracker: an unknown legacy account can write named quests with no grant');
select is(public.get_tracker_processing_access()->>'canWriteFitness','true','open tracker: an unknown legacy account can log Gym with no grant');
reset role;
select is((select count(*)::integer from private.tracker_input_provenance where user_id::text like 'da230000-%'),0,'existing roots not backfilled');
select is((select count(*)::integer from private.tracker_purpose_authority where user_id::text like 'da230000-%'),0,'no invented reviewed authority');
select ok(not has_table_privilege('authenticated','private.tracker_purpose_authority','INSERT'),'clients cannot record authority');
select ok(not has_table_privilege('service_role','private.tracker_purpose_authority','INSERT'),'service cannot record authority');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.set_tracker_processing_consent('custom-tracker',true,'old',public.get_tracker_processing_access()->'revision')$$,'22023',null,'stale notice refuses');
select throws_ok($$select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',jsonb_set(public.get_tracker_processing_access()->'revision','{userId}','"da230000-0000-4000-8000-000000000001"'))$$,'42501',null,'wrong owner refuses');
select is(public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',public.get_tracker_processing_access()->'revision')->>'canWriteCustom','true','specific adult grant without mailbox');
select is(public.get_tracker_processing_access()->>'canWriteFitness','true','open tracker: fitness follows basic whatever was granted');
select is(public.set_tracker_processing_consent('fitness-tracking',true,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision')->>'canWriteFitness','true','fitness independent grant');
select lives_ok($$select public.set_processing_consent('age-screening',true,'2026-11-08-adult-v1','da230000-0000-4000-8000-000000000002',
 (public.get_processing_access()->>'ageVersion')::integer,(public.get_processing_access()->>'consentVersion')::integer,
 (public.get_processing_access()->>'authorityVersion')::integer,(public.get_processing_access()->>'mailboxVersion')::integer)$$,'adult box setter operates');
select is(public.get_tracker_processing_access()->>'customConsent','true','old setter preserves custom');
select is(public.get_tracker_processing_access()->>'fitnessConsent','true','old setter preserves fitness');
select lives_ok($$select public.set_processing_consent('weekly-debrief',true,'2026-11-08-weekly-debrief-v2','da230000-0000-4000-8000-000000000002',
 (public.get_processing_access()->>'ageVersion')::integer,(public.get_processing_access()->>'consentVersion')::integer,
 (public.get_processing_access()->>'authorityVersion')::integer,(public.get_processing_access()->>'mailboxVersion')::integer)$$,'AI setter operates');
select is(public.get_tracker_processing_access()->>'customConsent','true','old AI setter preserves custom');
select is(public.get_tracker_processing_access()->>'fitnessConsent','true','old AI setter preserves fitness');
select throws_ok($$select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1','{"userId":"da230000-0000-4000-8000-000000000002","ageVersion":null,"consentVersion":0,"authorityVersion":0}')$$,'22023',null,'null revision refuses');
select throws_ok($$select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1','{"userId":"da230000-0000-4000-8000-000000000002","ageVersion":2147483648,"consentVersion":0,"authorityVersion":0}')$$,'22023',null,'out of range revision refuses');
select throws_ok($$select public.set_tracker_processing_consent('custom-tracker',false,'2026-10-23-custom-tracker-v1','{"userId":"da230000-0000-4000-8000-000000000002","ageVersion":0,"consentVersion":0,"authorityVersion":0}')$$,'ET003',null,'old intent cannot withdraw current revision');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'2026-10-20-weekly-debrief-v1','da230000-0000-4000-8000-000000000002',
 (public.get_processing_access()->>'ageVersion')::integer,(public.get_processing_access()->>'consentVersion')::integer,
 (public.get_processing_access()->>'authorityVersion')::integer,(public.get_processing_access()->>'mailboxVersion')::integer)$$,'22023',null,'the previous AI notice is refused');
select throws_ok($$select public.set_processing_consent('weekly-debrief',true,'2026-11-08-weekly-debrief-v2','da230000-0000-4000-8000-000000000002',
 1,(public.get_processing_access()->>'consentVersion')::integer-1,0,(public.get_processing_access()->>'mailboxVersion')::integer)$$,'EP002',null,'a stale consent revision is refused');
reset role;
select ok(not exists(select 1 from private.tracker_purpose_authority where user_id::text like 'da230000-%'),'the permission machinery records no authority rows any more');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230000-0000-4000-8000-000000000003',true);
select is(public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',public.get_tracker_processing_access()->'revision')->>'canWriteCustom','true','a second account can record the custom grant too');
select throws_ok($$select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',(public.get_tracker_processing_access()->'revision') || '{"canWriteCustom":true}')$$,'22023',null,'decision claims are not accepted');
select throws_ok($$select public.get_tracker_targets('habit',array['da230000-0000-4000-8000-000000000099']::uuid[])$$,'42501',null,'missing live root refuses generically');
reset role;
insert into public.habits(id,user_id,name,easy_version,stat) values ('da230000-0000-4000-8000-000000000020','da230000-0000-4000-8000-000000000002','Retained fixture','Small synthetic step','STR');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230000-0000-4000-8000-000000000002',true);
select is(public.get_tracker_targets('habit',array['da230000-0000-4000-8000-000000000020']::uuid[])#>>'{0,inputKind}','custom','unclassified live root is custom');
select throws_ok($$select public.get_tracker_targets('habit',array_fill('da230000-0000-4000-8000-000000000020'::uuid,array[101]))$$,'22023',null,'oversized target read refuses');
select throws_ok($$select public.get_tracker_targets('habit',array_fill('da230000-0000-4000-8000-000000000020'::uuid,array[2]))$$,'22023',null,'duplicate target read refuses');
select is(public.get_tracker_targets('habit',array[]::uuid[]),'[]'::jsonb,'empty target read stays empty');
reset role;
insert into private.tracker_input_provenance(object_kind,object_id,user_id,input_kind,ordinal) values
 ('habit','da230000-0000-4000-8000-000000000020','da230000-0000-4000-8000-000000000002','basic',1);
set local role authenticated;
select is(public.get_tracker_targets('habit',array['da230000-0000-4000-8000-000000000020']::uuid[])#>>'{0,inputKind}','basic','trusted provenance classifies actual root');
select set_config('request.jwt.claim.sub','da230000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.get_tracker_targets('habit',array['da230000-0000-4000-8000-000000000020']::uuid[])$$,'42501',null,'foreign root refuses without classification');
reset role;
delete from public.habits where id='da230000-0000-4000-8000-000000000020';
select is((select input_kind from private.tracker_input_provenance where object_id='da230000-0000-4000-8000-000000000020'),'basic','deleted root retains provenance');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230000-0000-4000-8000-000000000002',true);
select is(public.get_tracker_processing_access()->>'canWriteBasic','true','no birthday exists, so nothing pauses basic writes');
select is(public.get_tracker_processing_access()->>'canWriteCustom','true','no birthday exists, so nothing pauses custom writes');
select is(public.get_tracker_processing_access()->>'canWriteFitness','true','no birthday exists, so nothing pauses Gym writes');
reset role;
select ok(not has_function_privilege('authenticated','private.record_tracker_processing_authority(uuid,text,text,integer,uuid)','EXECUTE'),'client cannot invoke trusted authority');
select ok(not has_function_privilege('service_role','private.record_tracker_processing_authority(uuid,text,text,integer,uuid)','EXECUTE'),'service cannot invoke trusted authority');
select ok(not has_function_privilege('anon','public.get_tracker_processing_access()','EXECUTE'),'anonymous cannot read capability');
select lives_ok($$delete from auth.users where id='da230000-0000-4000-8000-000000000003'$$,'rollback fixture account cascade can remove authority');
select * from finish();
rollback;
