create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path=public,extensions;
select no_plan();
-- Local S02 Task 3 races. Needs the complete 053-056 bundle committed (a second
-- session cannot see draft DDL). Fresh SQL-only synthetic fixture; cleaned up.
create temp table before_owners as select count(*)::bigint n from auth.users where id<>'da230300-0000-4000-8000-000000000001';
select lives_ok($$select extensions.dblink_connect('tk_setup','dbname=postgres user=supabase_admin application_name=tk_setup options=-csearch_path=')$$,'opens committed setup session');
select lives_ok($$select extensions.dblink_connect('tk_writer','dbname=postgres user=supabase_admin application_name=tk_writer options=-csearch_path=')$$,'opens tracker writer session');
select lives_ok($$select extensions.dblink_connect('tk_consent','dbname=postgres user=supabase_admin application_name=tk_consent options=-csearch_path=')$$,'opens consent session');
create function pg_temp.sel(p_conn text,p_sql text) returns bigint language sql as $$
 select count(*) from extensions.dblink(p_conn,p_sql) as t(x text);
$$;
create function pg_temp.begin_as(p_conn text) returns text language sql as $$
 select extensions.dblink_exec(p_conn,'begin; set local role authenticated; set local "request.jwt.claim.sub"=''da230300-0000-4000-8000-000000000001''; set local statement_timeout=''15s''; set local lock_timeout=''15s''');
$$;
create function pg_temp.rev() returns jsonb language sql as $$
 select r::jsonb from extensions.dblink('tk_setup',$q$select private.tracker_processing_access('da230300-0000-4000-8000-000000000001')->'revision'::text$q$) as t(r text);
$$;
create function pg_temp.waiting(p_app text) returns boolean language plpgsql as $$
begin
 for i in 1..150 loop
  if exists(select 1 from pg_stat_activity where application_name=p_app and wait_event_type='Lock') then return true; end if;
  perform pg_sleep(0.02);
 end loop;
 return false;
end;$$;
create function pg_temp.write_sql(p_op text,p_args jsonb,p_targets jsonb,p_rev jsonb) returns text language sql as $$
 select format('select public.apply_tracker_write(%L,%L::jsonb,%L::jsonb)',p_op,(p_args||jsonb_build_object('p_expected_targets',p_targets))::text,p_rev::text);
$$;
create function pg_temp.consent_sql(p_granted boolean,p_rev jsonb) returns text language sql as $$
 select format('select public.set_tracker_processing_consent(''custom-tracker'',%L::boolean,''2026-10-23-custom-tracker-v1'',%L::jsonb)',p_granted,p_rev::text);
$$;
-- An aborted earlier run may have left only this exact synthetic account.
select extensions.dblink_exec('tk_setup',$q$delete from auth.users where id='da230300-0000-4000-8000-000000000001' and email='tracker-race@example.invalid'$q$);
select extensions.dblink_exec('tk_setup',$setup$
 insert into auth.users(id,email,raw_user_meta_data) values('da230300-0000-4000-8000-000000000001','tracker-race@example.invalid','{"birth_date":"2000-01-01"}');
$setup$);
-- Committed baseline: time zone, grant, two basic habits.
select pg_temp.begin_as('tk_writer');
select pg_temp.sel('tk_writer',$q$select public.initialize_account_time_zone('UTC')$q$);
select pg_temp.sel('tk_writer',pg_temp.write_sql('habit-save','{"p_id":"da230300-0000-4000-8000-000000000010","p_create":true,"p_mode":"basic","p_input":{"stat":"STR","difficulty":"Easy","time":"08:00","days":[0,1,2,3,4,5,6]}}','[]',pg_temp.rev()));
select extensions.dblink_exec('tk_writer','commit');
select pg_temp.begin_as('tk_writer');
select pg_temp.sel('tk_writer',pg_temp.write_sql('habit-save','{"p_id":"da230300-0000-4000-8000-000000000012","p_create":true,"p_mode":"basic","p_input":{"stat":"DEX","difficulty":"Easy","time":"09:00","days":[0,1,2,3,4,5,6]}}','[]',pg_temp.rev()));
select extensions.dblink_exec('tk_writer','commit');
select pg_temp.begin_as('tk_consent');
select pg_temp.sel('tk_consent',pg_temp.consent_sql(true,pg_temp.rev()));
select extensions.dblink_exec('tk_consent','commit');
-- A. Writer-before-withdrawal: the write settles, then the withdrawal applies.
select pg_temp.begin_as('tk_writer');
create temp table cap(k text primary key,v jsonb);
insert into cap values('a',pg_temp.rev());
select lives_ok($$select pg_temp.sel('tk_writer',pg_temp.write_sql('habit-save','{"p_id":"da230300-0000-4000-8000-000000000011","p_create":true,"p_mode":"custom","p_input":{"name":"Race quest","easyVersion":"small","stat":"INT","difficulty":"Easy","time":"07:00","days":[0,1,2,3,4,5,6]}}','[]',(select v from cap where k='a')))$$,'writer holds an open custom write');
select pg_temp.begin_as('tk_consent');
select ok(extensions.dblink_send_query('tk_consent',pg_temp.consent_sql(false,(select v from cap where k='a')))=1,'withdrawal starts while the write is open');
select ok(pg_temp.waiting('tk_consent'),'withdrawal waits on the owner lock');
select extensions.dblink_exec('tk_writer','commit');
select ok((select count(*) from extensions.dblink_get_result('tk_consent') as r(value text))=1,'withdrawal resumes after the write settles');
select * from extensions.dblink_get_result('tk_consent') as r(value text);
select extensions.dblink_exec('tk_consent','commit');
select is((select n from extensions.dblink('tk_setup',$q$select count(*) from public.habits where id='da230300-0000-4000-8000-000000000011'$q$) as t(n bigint)),1::bigint,'the earlier write was settled, not retroactively undone');
select is((select g from extensions.dblink('tk_setup',$q$select custom_granted from private.processing_consent where user_id='da230300-0000-4000-8000-000000000001'$q$) as t(g boolean)),false,'withdrawal then applies');
-- B. Withdrawal-before-write: a captured custom intent is refused after it waits.
select pg_temp.begin_as('tk_consent');
select pg_temp.sel('tk_consent',pg_temp.consent_sql(true,pg_temp.rev()));
select extensions.dblink_exec('tk_consent','commit');
insert into cap values('b',pg_temp.rev());
select pg_temp.begin_as('tk_consent');
select pg_temp.sel('tk_consent',pg_temp.consent_sql(false,(select v from cap where k='b')));
select pg_temp.begin_as('tk_writer');
select ok(extensions.dblink_send_query('tk_writer',pg_temp.write_sql('complete_habit','{"p_habit_id":"da230300-0000-4000-8000-000000000011","p_completed_on":"2000-01-01","p_kind":"full"}','[{"kind":"habit","id":"da230300-0000-4000-8000-000000000011","inputKind":"custom"}]',(select v from cap where k='b')))=1,'custom intent starts while withdrawal is open');
select ok(pg_temp.waiting('tk_writer'),'custom intent waits for the withdrawal decision');
select extensions.dblink_exec('tk_consent','commit');
select throws_ok($$select * from extensions.dblink_get_result('tk_writer') as r(value text)$$,'ET003',null,'waiting custom intent is refused after the committed withdrawal');
select * from extensions.dblink_get_result('tk_writer') as r(value text);
select extensions.dblink_exec('tk_writer','rollback');
select is((select n from extensions.dblink('tk_setup',$q$select count(*) from public.habit_completions where habit_id='da230300-0000-4000-8000-000000000011'$q$) as t(n bigint)),0::bigint,'refused intent saved nothing');
-- C. Withdrawal then regrant still refuses the captured old tuple.
select pg_temp.begin_as('tk_consent');
select pg_temp.sel('tk_consent',pg_temp.consent_sql(true,pg_temp.rev()));
select extensions.dblink_exec('tk_consent','commit');
select pg_temp.begin_as('tk_writer');
select throws_ok($$select pg_temp.sel('tk_writer',pg_temp.write_sql('habit-save','{"p_id":"da230300-0000-4000-8000-000000000011","p_create":false,"p_mode":"custom","p_input":{"name":"Stale","easyVersion":"small","stat":"INT","difficulty":"Easy","time":"07:00","days":[1]}}','[{"kind":"habit","id":"da230300-0000-4000-8000-000000000011","inputKind":"custom"}]',(select v from cap where k='b')))$$,'ET003',null,'regrant cannot restamp the older captured tuple');
select extensions.dblink_exec('tk_writer','rollback');
-- D. Basic progress with an older optional revision survives an unrelated withdrawal.
select pg_temp.begin_as('tk_consent');
select pg_temp.sel('tk_consent',pg_temp.consent_sql(false,pg_temp.rev()));
select pg_temp.begin_as('tk_writer');
select ok(extensions.dblink_send_query('tk_writer',pg_temp.write_sql('complete_habit',jsonb_build_object('p_habit_id','da230300-0000-4000-8000-000000000010','p_completed_on',(statement_timestamp() at time zone 'UTC')::date,'p_kind','full'),'[{"kind":"habit","id":"da230300-0000-4000-8000-000000000010","inputKind":"basic"}]',(select v from cap where k='b')))=1,'basic intent starts with the older optional revision');
select ok(pg_temp.waiting('tk_writer'),'basic intent waits for the owner lock');
select extensions.dblink_exec('tk_consent','commit');
select ok((select count(*) from extensions.dblink_get_result('tk_writer') as r(value text))=1,'basic intent resumes and succeeds');
select * from extensions.dblink_get_result('tk_writer') as r(value text);
select extensions.dblink_exec('tk_writer','commit');
-- E. Concurrent personalization: a basic intent refuses once its root became custom.
select pg_temp.begin_as('tk_consent');
select pg_temp.sel('tk_consent',pg_temp.consent_sql(true,pg_temp.rev()));
select extensions.dblink_exec('tk_consent','commit');
insert into cap values('e',pg_temp.rev());
select pg_temp.begin_as('tk_consent');
select pg_temp.sel('tk_consent',pg_temp.write_sql('habit-save','{"p_id":"da230300-0000-4000-8000-000000000012","p_create":false,"p_mode":"custom","p_input":{"name":"Personalized","easyVersion":"small","stat":"DEX","difficulty":"Easy","time":"09:00","days":[0,1,2,3,4,5,6]}}','[{"kind":"habit","id":"da230300-0000-4000-8000-000000000012","inputKind":"basic"}]',(select v from cap where k='e')));
select pg_temp.begin_as('tk_writer');
select ok(extensions.dblink_send_query('tk_writer',pg_temp.write_sql('complete_habit','{"p_habit_id":"da230300-0000-4000-8000-000000000012","p_completed_on":"2000-01-01","p_kind":"full"}','[{"kind":"habit","id":"da230300-0000-4000-8000-000000000012","inputKind":"basic"}]',(select v from cap where k='e')))=1,'basic intent starts while personalization is open');
select ok(pg_temp.waiting('tk_writer'),'basic intent waits for personalization');
select extensions.dblink_exec('tk_consent','commit');
select throws_ok($$select * from extensions.dblink_get_result('tk_writer') as r(value text)$$,'ET003',null,'basic intent refuses after the root became custom');
select * from extensions.dblink_get_result('tk_writer') as r(value text);
select extensions.dblink_exec('tk_writer','rollback');
-- Cleanup: only this test's committed synthetic account; other owners compared.
select extensions.dblink_exec('tk_setup',$q$delete from auth.users where id='da230300-0000-4000-8000-000000000001'$q$);
select is((select count(*) from auth.users where id='da230300-0000-4000-8000-000000000001'),0::bigint,'ephemeral race fixture cleaned up');
select is((select count(*)::bigint from auth.users),(select n from before_owners limit 1),'every other owner is unchanged');
select extensions.dblink_disconnect('tk_setup');
select extensions.dblink_disconnect('tk_writer');
select extensions.dblink_disconnect('tk_consent');
select * from finish();
