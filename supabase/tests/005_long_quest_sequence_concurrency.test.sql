create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;
select no_plan();
-- Cross-session race on the retained quest lock, now through the single tracker
-- write gateway. Needs the committed 053-056 bundle; fresh synthetic fixture
-- (fixed IDs, pre-cleaned) removed at the end. Run in race mode.
select lives_ok($$select extensions.dblink_connect('phase5_s','dbname=postgres user=supabase_admin application_name=phase5_s options=-csearch_path=')$$,'opens the committed setup session');
select lives_ok($$select extensions.dblink_connect('phase5_a','dbname=postgres user=supabase_admin application_name=phase5_a options=-csearch_path=')$$,'opens the first independent database connection');
select lives_ok($$select extensions.dblink_connect('phase5_b','dbname=postgres user=supabase_admin application_name=phase5_b options=-csearch_path=')$$,'opens the second independent database connection');
create function pg_temp.sel(p_conn text,p_sql text) returns bigint language sql as $$
 select count(*) from extensions.dblink(p_conn,p_sql) as t(x text);
$$;
create function pg_temp.begin_as(p_conn text) returns text language sql as $$
 select extensions.dblink_exec(p_conn,'begin; set local role authenticated; set local "request.jwt.claim.sub"=''55555555-5555-4555-8555-555555555001''; set local statement_timeout=''15s''; set local lock_timeout=''15s''');
$$;
create function pg_temp.rev() returns jsonb language sql as $$
 select r::jsonb from extensions.dblink('phase5_s',$q$select private.tracker_processing_access('55555555-5555-4555-8555-555555555001')->'revision'::text$q$) as t(r text);
$$;
create function pg_temp.waiting(p_app text) returns boolean language plpgsql as $$
begin
 for i in 1..150 loop
  if exists(select 1 from pg_stat_activity where application_name=p_app and wait_event_type='Lock') then return true; end if;
  perform pg_sleep(0.02);
 end loop;
 return false;
end;$$;
create function pg_temp.stage_sql(p_stage uuid,p_done boolean,p_request uuid,p_inputkind text default 'basic') returns text language sql as $$
 select format('select public.apply_tracker_write(''set_long_quest_stage_done_receipt'',%L::jsonb,%L::jsonb)',
  jsonb_build_object('p_stage_id',p_stage,'p_done',p_done,'p_request_id',p_request,
   'p_expected_targets',jsonb_build_array(jsonb_build_object('kind','chain','id','55555555-5555-4555-8555-555555556001','inputKind',p_inputkind)))::text,
  pg_temp.rev()::text);
$$;
-- An aborted earlier run may have left only this exact synthetic account.
select extensions.dblink_exec('phase5_s',$q$delete from auth.users where id='55555555-5555-4555-8555-555555555001' and email='phase5-concurrency@example.invalid'$q$);
select lives_ok($$select extensions.dblink_exec('phase5_s',$setup$
 insert into auth.users(id,email,raw_user_meta_data) values('55555555-5555-4555-8555-555555555001','phase5-concurrency@example.invalid','{"display_name":"Phase 5 Concurrency","birth_date":"2000-01-01"}')
$setup$)$$,'commits the synthetic age-eligible account outside the pgTAP session');
-- The quest and its two stages are created through the gateway, then committed.
select pg_temp.begin_as('phase5_a');
select pg_temp.sel('phase5_a',$q$select public.initialize_account_time_zone('UTC')$q$);
select lives_ok($$select pg_temp.sel('phase5_a',format('select public.apply_tracker_write(''chain-save'',%L::jsonb,%L::jsonb)',
 '{"p_id":"55555555-5555-4555-8555-555555556001","p_request_id":"55555555-5555-4555-8555-555555558001","p_create":true,"p_mode":"basic","p_input":{"stat":"STR","strictOrder":true,"stages":[{"id":"55555555-5555-4555-8555-555555557001"},{"id":"55555555-5555-4555-8555-555555557002"}]},"p_expected_targets":[]}',pg_temp.rev()::text))$$,'commits a two-stage ordered chain through the gateway');
select extensions.dblink_exec('phase5_a','commit');
select is((select n from extensions.dblink('phase5_s',$q$select count(*) from public.long_quest_stages where long_quest_id='55555555-5555-4555-8555-555555556001' and not done$q$) as t(n bigint)),2::bigint,'both stages start undone');

-- Negative: a stale or wrong target snapshot is refused before the lock race starts.
select pg_temp.begin_as('phase5_a');
select throws_ok($$select pg_temp.sel('phase5_a',pg_temp.stage_sql('55555555-5555-4555-8555-555555557001',true,'55555555-5555-4555-8555-555555558009','custom'))$$,'ET003',null,'a wrong protected-target snapshot is refused');
select extensions.dblink_exec('phase5_a','rollback');
select pg_temp.begin_as('phase5_a');
select throws_ok($$select pg_temp.sel('phase5_a',pg_temp.stage_sql('55555555-5555-4555-8555-555555557002',true,'55555555-5555-4555-8555-555555558008'))$$,'P0001',null,'strict order refuses Stage 2 before Stage 1');
select extensions.dblink_exec('phase5_a','rollback');
select pg_temp.begin_as('phase5_a');
select throws_ok($$select pg_temp.sel('phase5_a',format('select public.set_long_quest_stage_done(%L,true)','55555555-5555-4555-8555-555555557001'))$$,'42501',null,'the legacy stage toggle is denied to authenticated');
select extensions.dblink_exec('phase5_a','rollback');
select is((select n from extensions.dblink('phase5_s',$q$select count(*) from public.long_quest_stages where long_quest_id='55555555-5555-4555-8555-555555556001' and done$q$) as t(n bigint)),0::bigint,'refused attempts changed nothing');

-- Race: Stage 1 holds the owner and quest locks while Stage 2 waits.
select pg_temp.begin_as('phase5_a');
select pg_temp.begin_as('phase5_b');
select ok(extensions.dblink_send_query('phase5_a',pg_temp.stage_sql('55555555-5555-4555-8555-555555557001',true,'55555555-5555-4555-8555-555555558011'))=1,'starts Stage 1 completion on the first connection');
select lives_ok($$select * from extensions.dblink_get_result('phase5_a') as result(value text)$$,'the first transition succeeds while its transaction keeps the quest lock');
select lives_ok($$select * from extensions.dblink_get_result('phase5_a') as result(value text)$$,'drains the first asynchronous command status');
select ok(extensions.dblink_send_query('phase5_b',pg_temp.stage_sql('55555555-5555-4555-8555-555555557002',true,'55555555-5555-4555-8555-555555558012'))=1,'starts Stage 2 completion concurrently');
select ok(pg_temp.waiting('phase5_b'),'the second transition waits for the authoritative lock');
select lives_ok($$select extensions.dblink_exec('phase5_a','commit')$$,'commits Stage 1 and releases the lock');
select lives_ok($$select * from extensions.dblink_get_result('phase5_b') as result(value text)$$,'Stage 2 rechecks after the lock and succeeds against committed Stage 1');
select lives_ok($$select * from extensions.dblink_get_result('phase5_b') as result(value text)$$,'drains the second asynchronous command status');
select lives_ok($$select extensions.dblink_exec('phase5_b','commit')$$,'commits the serialized Stage 2 transition');
select is((select n from extensions.dblink('phase5_s',$q$select count(*) from public.long_quest_stages where long_quest_id='55555555-5555-4555-8555-555555556001' and done$q$) as t(n bigint)),2::bigint,'both concurrent transitions persist once in valid order');

-- Cleanup: only this test's committed synthetic account.
select extensions.dblink_exec('phase5_s',$q$delete from auth.users where id='55555555-5555-4555-8555-555555555001'$q$);
select is((select count(*) from auth.users where id='55555555-5555-4555-8555-555555555001'),0::bigint,'removes the committed concurrency fixtures');
select lives_ok($$select extensions.dblink_disconnect('phase5_s')$$,'closes the setup connection');
select lives_ok($$select extensions.dblink_disconnect('phase5_a')$$,'closes the first connection');
select lives_ok($$select extensions.dblink_disconnect('phase5_b')$$,'closes the second connection');
select * from finish();
