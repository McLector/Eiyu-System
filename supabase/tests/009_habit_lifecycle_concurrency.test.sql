create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;
select no_plan();
-- Cross-session lifecycle races through the single tracker write gateway. Needs
-- the committed 053-056 bundle; fresh synthetic fixture (fixed IDs, pre-cleaned)
-- removed at the end. Run in race mode.
-- Contract change: a repeated delete of an already deleted habit is no longer a
-- silent success; the waiting retry is refused 42501 'Tracker target unavailable.'
select lives_ok($$select extensions.dblink_connect('lifecycle_s','dbname=postgres user=supabase_admin application_name=lifecycle_s options=-csearch_path=')$$,'opens the committed setup session');
select lives_ok($$select extensions.dblink_connect('lifecycle_a','dbname=postgres user=supabase_admin application_name=lifecycle_a options=-csearch_path=')$$,'opens the first independent lifecycle connection');
select lives_ok($$select extensions.dblink_connect('lifecycle_b','dbname=postgres user=supabase_admin application_name=lifecycle_b options=-csearch_path=')$$,'opens the second independent lifecycle connection');
create function pg_temp.sel(p_conn text,p_sql text) returns bigint language sql as $$
 select count(*) from extensions.dblink(p_conn,p_sql) as t(x text);
$$;
create function pg_temp.begin_as(p_conn text) returns text language sql as $$
 select extensions.dblink_exec(p_conn,'begin; set local role authenticated; set local "request.jwt.claim.sub"=''88888888-8888-4888-8888-888888888888''; set local statement_timeout=''15s''; set local lock_timeout=''15s''');
$$;
create function pg_temp.rev() returns jsonb language sql as $$
 select r::jsonb from extensions.dblink('lifecycle_s',$q$select private.tracker_processing_access('88888888-8888-4888-8888-888888888888')->'revision'::text$q$) as t(r text);
$$;
create function pg_temp.waiting(p_app text) returns boolean language plpgsql as $$
begin
 for i in 1..150 loop
  if exists(select 1 from pg_stat_activity where application_name=p_app and wait_event_type='Lock') then return true; end if;
  perform pg_sleep(0.02);
 end loop;
 return false;
end;$$;
create function pg_temp.write_sql(p_op text,p_args jsonb,p_targets jsonb) returns text language sql as $$
 select format('select public.apply_tracker_write(%L,%L::jsonb,%L::jsonb)',p_op,(p_args||jsonb_build_object('p_expected_targets',p_targets))::text,pg_temp.rev()::text);
$$;
create function pg_temp.target(p_id text) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('kind','habit','id',p_id,'inputKind','basic'));
$$;
create function pg_temp.today() returns text language sql as $$
 select to_char((statement_timestamp() at time zone 'UTC')::date,'YYYY-MM-DD');
$$;
-- An aborted earlier run may have left only this exact synthetic account.
select extensions.dblink_exec('lifecycle_s',$q$delete from auth.users where id='88888888-8888-4888-8888-888888888888' and email='phase1-race@example.invalid'$q$);
select lives_ok($$select extensions.dblink_exec('lifecycle_s',$sql$
 insert into auth.users(id,email,raw_user_meta_data) values('88888888-8888-4888-8888-888888888888','phase1-race@example.invalid','{"display_name":"Phase 1 Race","birth_date":"2000-01-01"}')
$sql$)$$,'commits the synthetic age-eligible account outside the pgTAP session');
-- Committed baseline: the time zone and the first completed habit, via the gateway.
select pg_temp.begin_as('lifecycle_a');
select pg_temp.sel('lifecycle_a',$q$select public.initialize_account_time_zone('UTC')$q$);
select pg_temp.sel('lifecycle_a',pg_temp.write_sql('habit-save','{"p_id":"88888888-8888-4888-8888-888888888881","p_create":true,"p_mode":"basic","p_input":{"stat":"STR","difficulty":"Medium","time":"08:00","days":[0,1,2,3,4,5,6]}}','[]'));
select extensions.dblink_exec('lifecycle_a','commit');
select pg_temp.begin_as('lifecycle_a');
select lives_ok($$select pg_temp.sel('lifecycle_a',pg_temp.write_sql('complete_habit',jsonb_build_object('p_habit_id','88888888-8888-4888-8888-888888888881','p_completed_on',pg_temp.today(),'p_kind','full'),pg_temp.target('88888888-8888-4888-8888-888888888881')))$$,'commits a completed habit fixture through the gateway');
select extensions.dblink_exec('lifecycle_a','commit');
select is((select n from extensions.dblink('lifecycle_s',$q$select count(*) from public.habit_completions where habit_id='88888888-8888-4888-8888-888888888881'$q$) as t(n bigint)),1::bigint,'the completion fixture is committed');

-- Negatives before the race: legacy ingress and a foreign-looking target are refused.
select pg_temp.begin_as('lifecycle_a');
select throws_ok($$select pg_temp.sel('lifecycle_a',$q$select public.delete_habit('88888888-8888-4888-8888-888888888881')$q$)$$,'42501',null,'the legacy delete RPC is denied to authenticated');
select extensions.dblink_exec('lifecycle_a','rollback');
select pg_temp.begin_as('lifecycle_a');
select throws_ok($$select pg_temp.sel('lifecycle_a',$q$select public.complete_habit('88888888-8888-4888-8888-888888888881',current_date,'full')$q$)$$,'42501',null,'the legacy completion RPC is denied to authenticated');
select extensions.dblink_exec('lifecycle_a','rollback');
select pg_temp.begin_as('lifecycle_a');
select throws_ok($$select pg_temp.sel('lifecycle_a',pg_temp.write_sql('delete_habit','{"p_habit_id":"88888888-8888-4888-8888-888888888899"}','[]'))$$,'42501',null,'deleting an unknown habit is refused');
select extensions.dblink_exec('lifecycle_a','rollback');

-- A. Two concurrent deletes of the same completed habit.
select pg_temp.begin_as('lifecycle_a');
select pg_temp.begin_as('lifecycle_b');
select ok(extensions.dblink_send_query('lifecycle_a',pg_temp.write_sql('delete_habit','{"p_habit_id":"88888888-8888-4888-8888-888888888881"}',pg_temp.target('88888888-8888-4888-8888-888888888881')))=1,'starts the first delete');
select lives_ok($$select * from extensions.dblink_get_result('lifecycle_a') as result(value text)$$,'the first delete snapshots history while keeping its transaction open');
select lives_ok($$select * from extensions.dblink_get_result('lifecycle_a') as result(value text)$$,'drains the first asynchronous command status');
select ok(extensions.dblink_send_query('lifecycle_b',pg_temp.write_sql('delete_habit','{"p_habit_id":"88888888-8888-4888-8888-888888888881"}',pg_temp.target('88888888-8888-4888-8888-888888888881')))=1,'starts the second delete concurrently');
select ok(pg_temp.waiting('lifecycle_b'),'the second delete waits on the authoritative lock');
select lives_ok($$select extensions.dblink_exec('lifecycle_a','commit')$$,'commits the first delete and releases the lifecycle lock');
select throws_ok($$select * from extensions.dblink_get_result('lifecycle_b') as result(value text)$$,'42501',null,'the waiting retry is refused because the target no longer exists');
select * from extensions.dblink_get_result('lifecycle_b') as result(value text);
select lives_ok($$select extensions.dblink_exec('lifecycle_b','rollback')$$,'rolls the refused retry back');
select is((select n from extensions.dblink('lifecycle_s',$q$select count(*) from public.habits where id='88888888-8888-4888-8888-888888888881'$q$) as t(n bigint)),0::bigint,'the concurrent delete leaves no executable habit row');
select is((select n from extensions.dblink('lifecycle_s',$q$select count(*) from public.deleted_habit_history where source_habit_id='88888888-8888-4888-8888-888888888881'$q$) as t(n bigint)),1::bigint,'the concurrent delete pair writes one retained row per historical date');
select is((select n from extensions.dblink('lifecycle_s',$q$select count(*) from public.deleted_habit_history where source_habit_id='88888888-8888-4888-8888-888888888881' and completion_kind is not null$q$) as t(n bigint)),1::bigint,'the concurrent delete pair preserves the completion exactly once');
select is((select n from extensions.dblink('lifecycle_s',$q$select count(*) from public.habit_completions where habit_id='88888888-8888-4888-8888-888888888881'$q$) as t(n bigint)),0::bigint,'the executable completion is gone after the winning delete');
select pg_temp.begin_as('lifecycle_a');
select throws_ok($$select pg_temp.sel('lifecycle_a',pg_temp.write_sql('habit-save','{"p_id":"88888888-8888-4888-8888-888888888881","p_create":true,"p_mode":"basic","p_input":{"stat":"STR","difficulty":"Medium","time":"08:00","days":[0,1,2,3,4,5,6]}}','[]'))$$,'42501',null,'a retired habit ID cannot be recreated');
select extensions.dblink_exec('lifecycle_a','rollback');

-- B. A committed completion wins cleanly against a waiting delete; the delete
-- then snapshots that completion exactly once, with its earned XP.
select pg_temp.begin_as('lifecycle_a');
select pg_temp.sel('lifecycle_a',pg_temp.write_sql('habit-save','{"p_id":"88888888-8888-4888-8888-888888888882","p_create":true,"p_mode":"basic","p_input":{"stat":"INT","difficulty":"Medium","time":"08:00","days":[0,1,2,3,4,5,6]}}','[]'));
select extensions.dblink_exec('lifecycle_a','commit');
select pg_temp.begin_as('lifecycle_a');
select pg_temp.begin_as('lifecycle_b');
select ok(extensions.dblink_send_query('lifecycle_a',pg_temp.write_sql('complete_habit',jsonb_build_object('p_habit_id','88888888-8888-4888-8888-888888888882','p_completed_on',pg_temp.today(),'p_kind','full'),pg_temp.target('88888888-8888-4888-8888-888888888882')))=1,'starts the authoritative completion');
select lives_ok($$select * from extensions.dblink_get_result('lifecycle_a') as result(value text)$$,'the completion succeeds before its transaction commits');
select lives_ok($$select * from extensions.dblink_get_result('lifecycle_a') as result(value text)$$,'drains the completion command status');
select ok(extensions.dblink_send_query('lifecycle_b',pg_temp.write_sql('delete_habit','{"p_habit_id":"88888888-8888-4888-8888-888888888882"}',pg_temp.target('88888888-8888-4888-8888-888888888882')))=1,'starts delete behind the uncommitted completion');
select ok(pg_temp.waiting('lifecycle_b'),'delete waits for the completion transaction');
select lives_ok($$select extensions.dblink_exec('lifecycle_a','commit')$$,'commits the completion and its server-awarded XP');
select lives_ok($$select * from extensions.dblink_get_result('lifecycle_b') as result(value text)$$,'delete resumes and snapshots the committed completion');
select lives_ok($$select * from extensions.dblink_get_result('lifecycle_b') as result(value text)$$,'drains the racing delete command status');
select lives_ok($$select extensions.dblink_exec('lifecycle_b','commit')$$,'commits the racing delete');
select is((select n from extensions.dblink('lifecycle_s',$q$select count(*) from public.habits where id='88888888-8888-4888-8888-888888888882'$q$) as t(n bigint)),0::bigint,'the completed habit is eventually removed');
select is((select n from extensions.dblink('lifecycle_s',$q$select count(*) from public.deleted_habit_history where source_habit_id='88888888-8888-4888-8888-888888888882' and completion_kind='full'$q$) as t(n bigint)),1::bigint,'the committed completion is retained once');
select is((select x from extensions.dblink('lifecycle_s',$q$select xp::text from public.stats where user_id='88888888-8888-4888-8888-888888888888' and stat='INT'$q$) as t(x text)),'20','the committed completion awards XP exactly once');
select is((select n from extensions.dblink('lifecycle_s',$q$select count(*) from public.habit_completions where habit_id='88888888-8888-4888-8888-888888888882'$q$) as t(n bigint)),0::bigint,'the racing delete leaves no executable completion');

-- Cleanup: only this test's committed synthetic account.
select extensions.dblink_exec('lifecycle_s',$q$delete from auth.users where id='88888888-8888-4888-8888-888888888888'$q$);
select is((select count(*) from auth.users where id='88888888-8888-4888-8888-888888888888'),0::bigint,'removes the committed concurrency fixture');
select lives_ok($$select extensions.dblink_disconnect('lifecycle_s')$$,'closes the setup connection');
select lives_ok($$select extensions.dblink_disconnect('lifecycle_a')$$,'closes the first lifecycle connection');
select lives_ok($$select extensions.dblink_disconnect('lifecycle_b')$$,'closes the second lifecycle connection');
select * from finish();
