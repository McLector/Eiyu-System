begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- Local S02 Task 4: owner export covers the tracker purpose state and
-- provenance, omits trusted review references and counters, leaks no other owner.
insert into auth.users(id,email,raw_user_meta_data,created_at) values
 ('da230500-0000-4000-8000-000000000001','trk-export-a@example.invalid','{"display_name":"Tracker export A"}',now()),
 ('da230500-0000-4000-8000-000000000002','trk-export-b@example.invalid','{"display_name":"Tracker export B"}',now());
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values
 ('da230500-0000-4000-8000-000000000011','da230500-0000-4000-8000-000000000001',now(),now(),now()+interval '1 hour');
update private.mailbox_state set verified_version=version,verified_at=now(),challenge_id='da230500-0000-4000-8000-000000000099'
 where user_id in('da230500-0000-4000-8000-000000000001','da230500-0000-4000-8000-000000000002');
insert into private.processing_consent(user_id,age_granted,age_notice,custom_granted,custom_notice,fitness_granted,fitness_notice,version)
 values('da230500-0000-4000-8000-000000000001',true,'2026-10-20-age-v1',true,'2026-10-23-custom-tracker-v1',false,null,3)
 on conflict(user_id) do update set custom_granted=true,custom_notice='2026-10-23-custom-tracker-v1',version=3;
insert into private.tracker_purpose_authority(user_id,purpose,state,age_version,review_reference)
 values('da230500-0000-4000-8000-000000000001','custom-tracker','approved',1,'da230500-0000-4000-8000-000000000098'),
 ('da230500-0000-4000-8000-000000000002','fitness-tracking','pending',1,'da230500-0000-4000-8000-000000000097');
insert into private.tracker_input_provenance(object_kind,object_id,user_id,input_kind,ordinal,next_stage_ordinal) values
 ('habit','da230500-0000-4000-8000-000000000101','da230500-0000-4000-8000-000000000001','basic',1,1),
 ('chain','da230500-0000-4000-8000-000000000102','da230500-0000-4000-8000-000000000001','basic',1,7),
 ('habit','da230500-0000-4000-8000-000000000201','da230500-0000-4000-8000-000000000002','custom',1,1);
create function pg_temp.export_a() returns jsonb language sql as $$
 select public.owner_export_snapshot('da230500-0000-4000-8000-000000000001','da230500-0000-4000-8000-000000000011');
$$;
select set_config('request.jwt.claim.role','service_role',true);
select ok((select count(*) from jsonb_array_elements(private.owner_export_manifest()->'tables') e where e->>'table' in('private.tracker_input_provenance','private.tracker_purpose_authority'))=2,'manifest lists both new private tables');
select ok((select e->'export' from jsonb_array_elements(private.owner_export_manifest()->'tables') e where e->>'table'='private.processing_consent') @> '["custom_granted","custom_notice","fitness_granted","fitness_notice"]','consent export includes the new grant fields');
select lives_ok($$select pg_temp.export_a()$$,'export is not blocked by the new tables (no schema drift)');
select is(jsonb_array_length(pg_temp.export_a()#>'{sections,private.tracker_input_provenance}'),2,'owner provenance rows are exported');
select is((pg_temp.export_a()#>'{sections,private.tracker_purpose_authority,0,state}')#>>'{}','approved','owner authority disposition is exported');
select is((pg_temp.export_a()#>'{sections,private.processing_consent,0,custom_granted}')::text,'true','custom grant is exported');
select ok(not (pg_temp.export_a()::text like '%da230500-0000-4000-8000-000000000098%'),'trusted review reference is omitted');
select ok(not (pg_temp.export_a()::text like '%next_stage_ordinal%'),'internal stage counter is omitted');
select ok(not (pg_temp.export_a()::text like '%da230500-0000-4000-8000-000000000201%' or pg_temp.export_a()::text like '%da230500-0000-4000-8000-000000000097%'),'another owner is never exported');
-- Drift remains detected for the new tables too.
reset role;
alter table private.tracker_purpose_authority add column unreviewed_note text;
select throws_ok($$select pg_temp.export_a()$$,'EX003',null,'a new column on a tracker table requires review');
alter table private.tracker_purpose_authority drop column unreviewed_note;
-- Deleting the account removes the new owner rows.
delete from auth.users where id='da230500-0000-4000-8000-000000000002';
select is((select count(*)::integer from private.tracker_input_provenance where user_id='da230500-0000-4000-8000-000000000002')+(select count(*)::integer from private.tracker_purpose_authority where user_id='da230500-0000-4000-8000-000000000002'),0,'account deletion cascades to the tracker state');
select * from finish();
rollback;
