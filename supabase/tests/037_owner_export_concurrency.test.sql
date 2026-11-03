begin;
-- Wrapped form (run in test mode): the committed synthetic fixture is created and
-- removed only through the independent writer session, so no top-level
-- transaction control is needed. Fixed IDs, pre-cleaned; nothing is retained.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path=public,extensions;
select no_plan();
do $$begin
 if exists(select 1 from private.ai_admission_control where is_open)
 or exists(select 1 from private.ai_execution_epochs where outstanding_count<>0)
 then raise exception 'Closed idle local boundary required';end if;
end;$$;
create temporary table export_concurrent_fixture as select
 'd3700000-0000-4000-8000-000000000001'::uuid uid,'d3700000-0000-4000-8000-000000000002'::uuid sid,'d3700000-0000-4000-8000-000000000003'::uuid hid;
create temporary table export_manifest_definition as select pg_get_functiondef('private.owner_export_manifest()'::regprocedure) definition;
select lives_ok($$select dblink_connect('owner_export_writer','dbname=postgres user=supabase_admin application_name=owner_export_writer options=-csearch_path=')$$,
 'connect independent synthetic-only writer');
-- An aborted earlier run may have left only this exact synthetic account.
select dblink_exec('owner_export_writer',$q$delete from auth.users where id='d3700000-0000-4000-8000-000000000001' and email='s02-export-snapshot-concurrent@example.invalid'$q$);
create temporary table export_original_rows as select
 (select jsonb_agg(to_jsonb(p) order by p.user_id) from public.profiles p) profiles,
 (select jsonb_agg(to_jsonb(h) order by h.id) from public.habits h) habits;
select dblink_exec('owner_export_writer',$setup$
 insert into auth.users(id,email,raw_user_meta_data,created_at) values
  ('d3700000-0000-4000-8000-000000000001','s02-export-snapshot-concurrent@example.invalid','{"display_name":"Snapshot before"}',now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('d3700000-0000-4000-8000-000000000002','d3700000-0000-4000-8000-000000000001',now(),now());
 update private.mailbox_state set verified_version=version,verified_at=now() where user_id='d3700000-0000-4000-8000-000000000001';
 insert into public.habits(id,user_id,name,easy_version,stat,days) values
  ('d3700000-0000-4000-8000-000000000003','d3700000-0000-4000-8000-000000000001','Quest before','One step','INT','{1}');
$setup$);
-- The writer holds uncommitted "after" values; the barrier below commits them
-- mid-statement, after the export statement has already taken its snapshot.
select dblink_exec('owner_export_writer',
 'begin;set local statement_timeout=''8s'';update public.profiles set display_name=''Snapshot after'' where user_id=''d3700000-0000-4000-8000-000000000001''::uuid;update public.habits set name=''Quest after'' where id=''d3700000-0000-4000-8000-000000000003''::uuid and user_id=''d3700000-0000-4000-8000-000000000001''::uuid;');
select set_config('request.jwt.claim.role','service_role',true);
create temporary table export_manifest_literal as select private.owner_export_manifest() manifest;
grant select on export_manifest_literal to postgres;
-- This VOLATILE test-only barrier commits the writer after the outer snapshot
-- statement starts. It is restored from the captured definition below.
create or replace function private.owner_export_manifest() returns jsonb
language plpgsql volatile set search_path='' as $$declare m jsonb;begin
 perform extensions.dblink_exec('owner_export_writer','commit');
 select manifest into m from pg_temp.export_manifest_literal;
 return m;
end;$$;
create temporary table export_concurrent_observed as
 select public.owner_export_snapshot(uid,sid) document from export_concurrent_fixture;
-- Restore the production helper before asserting anything else.
do $$begin execute (select definition from export_manifest_definition);end;$$;
select is(pg_get_functiondef('private.owner_export_manifest()'::regprocedure),
 (select definition from export_manifest_definition),'test barrier helper restored to the production definition');
select is((select document->'sections'->'public.profiles'->0->>'display_name'='Snapshot before' from export_concurrent_observed),true,'profile snapshot consistency retained');
select is((select document->'sections'->'public.habits'->0->>'name'='Quest before' from export_concurrent_observed),true,'quest snapshot consistency retained');
select is((select display_name='Snapshot after' from public.profiles where user_id=(select uid from export_concurrent_fixture)),true,'independent profile commit actually occurred');
select is((select name='Quest after' from public.habits where id=(select hid from export_concurrent_fixture)),true,'independent quest commit actually occurred');

select set_config('request.jwt.claim.role','service_role',false);
select is(public.owner_export_check((select uid from export_concurrent_fixture),(select sid from export_concurrent_fixture),1),true,'current session initially confirms');
select dblink_exec('owner_export_writer',format('delete from auth.sessions where id=%L::uuid and user_id=%L::uuid;',
 (select sid from export_concurrent_fixture),(select uid from export_concurrent_fixture)));
select is(public.owner_export_check((select uid from export_concurrent_fixture),(select sid from export_concurrent_fixture),1),false,'fresh confirmation sees independently revoked session');
select is((select jsonb_agg(to_jsonb(p) order by p.user_id) from public.profiles p where p.user_id<>(select uid from export_concurrent_fixture)),
 (select profiles from export_original_rows),'all original profiles remain exact');
select is((select jsonb_agg(to_jsonb(h) order by h.id) from public.habits h where h.user_id<>(select uid from export_concurrent_fixture)),
 (select habits from export_original_rows),'all original quests remain exact');
-- Cleanup: only this test's committed synthetic account (sessions, profile and quest cascade).
select dblink_exec('owner_export_writer',format('delete from auth.users where id=%L::uuid;',(select uid from export_concurrent_fixture)));
select is((select count(*) from auth.users where id=(select uid from export_concurrent_fixture)),0::bigint,'new synthetic account removed');
select is((select count(*) from public.habits where id=(select hid from export_concurrent_fixture)),0::bigint,'new synthetic quest removed');
select is((select count(*) from public.profiles where user_id=(select uid from export_concurrent_fixture)),0::bigint,'new synthetic profile removed');
select lives_ok($$select dblink_disconnect('owner_export_writer')$$,'disconnect owned writer');
select * from finish();
rollback;
