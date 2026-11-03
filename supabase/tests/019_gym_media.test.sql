begin;
set search_path=public,extensions;
select plan(11);
-- S02 055: uploads must name the owner, an owned live routine and the current
-- tracker tuple (age-consent-authority versions), under a fitness grant.
insert into auth.users(id,email,raw_user_meta_data) values('19000000-0000-4000-8000-000000000001','gym-media-owner@example.invalid','{"birth_date":"2000-01-01"}');
create function pg_temp.media_path(routine uuid,file text,skew integer default 0) returns text
language sql set search_path='' as $$
 select auth.uid()::text||'/'||routine::text||'/'
  ||((a->'revision'->>'ageVersion')::integer+skew)||'-'||(a->'revision'->>'consentVersion')||'-'||(a->'revision'->>'authorityVersion')
  ||'/'||file
 from (select public.get_tracker_processing_access() a) x;
$$;
select is((select public from storage.buckets where id='gym-exercise-media'),false,'demonstrations are private');
select is((select file_size_limit from storage.buckets where id='gym-exercise-media'),20971520::bigint,'20 MiB enforced by bucket');
select is((select allowed_mime_types from storage.buckets where id='gym-exercise-media'),array['image/gif','video/mp4'],'only GIF and MP4 allowed');
set local role authenticated;
set local "request.jwt.claim.sub"='19000000-0000-4000-8000-000000000001';
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media','19000000-0000-4000-8000-000000000001/19000000-0000-4000-8000-000000000002/1-1-1/19000000-0000-4000-8000-000000000003.gif')$$,'42501',null,'upload is refused before the fitness grant and routine exist');
select public.set_tracker_processing_consent('fitness-tracking',true,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
select public.apply_tracker_write('gym-routine-save','{"p_id":"19000000-0000-4000-8000-000000000002","p_create":true,"p_name":"Media routine","p_unit":"kg","p_expected_targets":[]}',public.get_tracker_processing_access()->'revision');
select lives_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media',pg_temp.media_path('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000003.gif'))$$,'own folder upload for an owned routine and the current tuple is permitted');
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media','19000000-0000-4000-8000-000000000099/routine/demo.gif')$$,'42501',null,'foreign folder upload denied');
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media','19000000-0000-4000-8000-000000000001/routine/demo.gif')$$,'42501',null,'the legacy own-folder path without routine and tuple is refused');
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media',pg_temp.media_path('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000004.gif',1))$$,'42501',null,'a stale tuple cannot upload');
select public.set_tracker_processing_consent('fitness-tracking',false,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media',pg_temp.media_path('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000005.gif'))$$,'42501',null,'withdrawing the fitness grant refuses new uploads');
set local "request.jwt.claim.sub"='19000000-0000-4000-8000-000000000099';
select is((select count(*) from storage.objects where bucket_id='gym-exercise-media'),0::bigint,'foreign media cannot be read');
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media','19000000-0000-4000-8000-000000000099/deleted-owner.gif')$$,'42501',null,'a claim for a nonexistent account cannot upload');
select * from finish();
rollback;
