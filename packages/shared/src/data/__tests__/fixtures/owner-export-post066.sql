-- Recipe for owner-export-post066.json (all values synthetic; nothing is committed, the transaction rolls back).
-- Rebuild it whenever the export manifest changes, because the contract test compares the fixture with the validator:
--   docker exec -i <db container> psql -U supabase_admin -d postgres -At -X -v ON_ERROR_STOP=1 < packages/shared/src/data/__tests__/fixtures/owner-export-post066.sql
-- Keep the one output line that starts with SNAPSHOT: and drop that prefix.
-- then pretty-print that JSON (2-space indent) into owner-export-post066.json.
-- Run it on a database that has migrations 066 applied (the local disposable stack), never on live data.
begin;
grant usage on schema extensions to supabase_auth_admin;
set local role supabase_auth_admin;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,created_at) values
 ('e5200000-0000-4000-8000-0000000000a1','synthetic-export@example.invalid','{"provider":"email","providers":["email"]}',
  '{"display_name":"Synthetic Person","time_zone":"Asia/Manila","terms":{"version":"2026-11-08-terms-v2"}}',now());
reset role;
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values
 ('e5200000-0000-4000-8000-0000000000a2','e5200000-0000-4000-8000-0000000000a1',now(),now(),now()+interval '1 hour');
update private.mailbox_state set verified_version=version,verified_at=now() where user_id='e5200000-0000-4000-8000-0000000000a1';
insert into public.habits(id,user_id,name,easy_version,stat,days) values
 ('e5200000-0000-4000-8000-0000000000a3','e5200000-0000-4000-8000-0000000000a1','Synthetic quest','A small step','INT','{1}');
select set_config('request.jwt.claim.role','service_role',true);
select 'SNAPSHOT:'||public.owner_export_snapshot('e5200000-0000-4000-8000-0000000000a1','e5200000-0000-4000-8000-0000000000a2')::text;
rollback;
