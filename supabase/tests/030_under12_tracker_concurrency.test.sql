create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path=public,extensions;
select no_plan();
-- Birthday correction vs tracker mutation, through the single tracker write
-- gateway. Needs the committed 053-056 bundle; fresh synthetic fixture (fixed
-- IDs, pre-cleaned) removed at the end. Run in race mode.
select lives_ok($$select extensions.dblink_connect('tracker_setup','dbname=postgres user=supabase_admin application_name=tracker_pause_setup options=-csearch_path=')$$,'opens the committed setup session');
select lives_ok($$select extensions.dblink_connect('tracker_writer','dbname=postgres user=supabase_admin application_name=tracker_pause_writer options=-csearch_path=')$$,'opens independent tracker writer');
select lives_ok($$select extensions.dblink_connect('tracker_birthday','dbname=postgres user=supabase_admin application_name=tracker_pause_birthday options=-csearch_path=')$$,'opens independent birthday writer');
create function pg_temp.begin_as(p_conn text) returns text language sql as $$
 select extensions.dblink_exec(p_conn,'begin; set local role authenticated; set local "request.jwt.claim.sub"=''d3000000-0000-4000-8000-000000000001''; set local statement_timeout=''10s''; set local lock_timeout=''10s''');
$$;
create function pg_temp.rev() returns jsonb language sql as $$
 select r::jsonb from extensions.dblink('tracker_setup',$q$select private.tracker_processing_access('d3000000-0000-4000-8000-000000000001')->'revision'::text$q$) as t(r text);
$$;
create function pg_temp.waiting(p_app text) returns boolean language plpgsql as $$
begin
 for i in 1..150 loop
  if exists(select 1 from pg_stat_activity where application_name=p_app and wait_event_type='Lock') then return true; end if;
  perform pg_sleep(0.02);
 end loop;
 return false;
end;$$;
-- A basic edit of the existing quest: only the difficulty changes.
create function pg_temp.edit_sql(p_difficulty text) returns text language sql as $$
 select format('select public.apply_tracker_write(''habit-save'',%L::jsonb,%L::jsonb)',
  jsonb_build_object('p_id','d3000000-0000-4000-8000-000000000101','p_create',false,'p_mode','basic',
   'p_input',jsonb_build_object('stat','INT','difficulty',p_difficulty,'time','08:00','days',jsonb_build_array(0,1,2,3,4,5,6)),
   'p_expected_targets',jsonb_build_array(jsonb_build_object('kind','habit','id','d3000000-0000-4000-8000-000000000101','inputKind','basic')))::text,
  pg_temp.rev()::text);
$$;
-- An aborted earlier run may have left only this exact synthetic account.
select extensions.dblink_exec('tracker_setup',$q$delete from auth.users where id='d3000000-0000-4000-8000-000000000001' and email='tracker-pause-race@example.invalid'$q$);
select extensions.dblink_exec('tracker_setup',$setup$
 insert into auth.users(id,email,raw_user_meta_data) values('d3000000-0000-4000-8000-000000000001','tracker-pause-race@example.invalid','{"birth_date":"2000-01-01"}');
 -- The birthday correction needs the accepted age notice, as the original fixture granted it.
 insert into private.processing_consent(user_id,age_granted,age_notice) values('d3000000-0000-4000-8000-000000000001',true,'2026-10-20-age-v1')
  on conflict(user_id) do update set age_granted=true,age_notice='2026-10-20-age-v1';
$setup$);
select pg_temp.begin_as('tracker_writer');
select count(*) from extensions.dblink('tracker_writer',$q$select public.initialize_account_time_zone('UTC')$q$) as t(x text);
select count(*) from extensions.dblink('tracker_writer',format('select public.apply_tracker_write(''habit-save'',%L::jsonb,%L::jsonb)',
 '{"p_id":"d3000000-0000-4000-8000-000000000101","p_create":true,"p_mode":"basic","p_input":{"stat":"INT","difficulty":"Easy","time":"08:00","days":[0,1,2,3,4,5,6]},"p_expected_targets":[]}',pg_temp.rev()::text)) as t(x text);
select extensions.dblink_exec('tracker_writer','commit');
select is((select d from extensions.dblink('tracker_setup',$q$select difficulty::text from public.habits where id='d3000000-0000-4000-8000-000000000101'$q$) as t(d text)),'Easy','the quest fixture exists through the gateway');
-- Writer first: its open tracker transaction holds the declaration.
select pg_temp.begin_as('tracker_writer');
select count(*) from extensions.dblink('tracker_writer',pg_temp.edit_sql('Hard')) as t(x text);
select pg_temp.begin_as('tracker_birthday');
select ok(extensions.dblink_send_query('tracker_birthday',$sql$select public.set_account_birthday(((statement_timestamp() at time zone 'Asia/Manila')::date-interval '11 years')::date)->>'trackerWritesPaused'$sql$)=1,'starts birthday correction while tracker transaction holds its declaration');
select ok(pg_temp.waiting('tracker_pause_birthday'),'birthday correction waits for the earlier tracker transaction');
select extensions.dblink_exec('tracker_writer','rollback');
select is((select value from extensions.dblink_get_result('tracker_birthday') as r(value text)),'true','birthday correction resumes with under12 pause');
select * from extensions.dblink_get_result('tracker_birthday') as r(value text);
-- Birthday first (still uncommitted): the tracker mutation must wait, then be refused.
select pg_temp.begin_as('tracker_writer');
select ok(extensions.dblink_send_query('tracker_writer',pg_temp.edit_sql('Hard'))=1,'starts tracker mutation while correction holds its declaration');
select ok(pg_temp.waiting('tracker_pause_writer'),'tracker mutation waits for the birthday decision');
select extensions.dblink_exec('tracker_birthday','commit');
select throws_ok($$select * from extensions.dblink_get_result('tracker_writer') as r(value text)$$,'ET003',null,'waiting mutation rechecks and refuses its stale pre-declaration tuple');
select * from extensions.dblink_get_result('tracker_writer') as r(value text);
select extensions.dblink_exec('tracker_writer','rollback');
select is((select d from extensions.dblink('tracker_setup',$q$select difficulty::text from public.habits where id='d3000000-0000-4000-8000-000000000101'$q$) as t(d text)),'Easy','denied racing mutation preserves saved content');
-- Negatives while paused: a fresh gateway write and a legacy direct write are both refused.
select pg_temp.begin_as('tracker_writer');
select throws_ok($$select count(*) from extensions.dblink('tracker_writer',pg_temp.edit_sql('Medium')) as t(x text)$$,'ET001',null,'a fresh-tuple gateway write is paused for the under12 declaration');
select extensions.dblink_exec('tracker_writer','rollback');
select pg_temp.begin_as('tracker_writer');
select throws_ok($$select count(*) from extensions.dblink('tracker_writer',$q$update public.habits set difficulty='Medium' where id='d3000000-0000-4000-8000-000000000101'$q$) as t(x text)$$,'42501',null,'a direct habit update is denied to authenticated');
select extensions.dblink_exec('tracker_writer','rollback');
-- Only this test's committed synthetic fixture is removed, never retained phone fixtures.
select extensions.dblink_exec('tracker_setup',$sql$delete from auth.users where id='d3000000-0000-4000-8000-000000000001'$sql$);
select is((select count(*) from auth.users where id='d3000000-0000-4000-8000-000000000001'),0::bigint,'ephemeral concurrency fixture cleaned up');
select extensions.dblink_disconnect('tracker_setup');
select extensions.dblink_disconnect('tracker_writer');
select extensions.dblink_disconnect('tracker_birthday');
select * from finish();
