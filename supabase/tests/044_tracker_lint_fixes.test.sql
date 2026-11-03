begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('da230100-0000-4000-8000-0000000000a1','lint-adult@example.invalid','{"birth_date":"2000-01-01"}');
create temp table intent(revision jsonb);
grant all on intent to authenticated;

-- Catalog contract: owner, definer flag, search_path and exact grants stay as the applied 054 record.
select is(provolatile::text,'s','tracker_argument_types is STABLE (it casts text to date/uuid/enum)') from pg_proc where oid='private.tracker_argument_types(jsonb,text)'::regprocedure;
select is(provolatile::text,'i','tracker_object_keys stays IMMUTABLE (jsonb inspection only)') from pg_proc where oid='private.tracker_object_keys(jsonb,text[],text[])'::regprocedure;
select is(pg_get_userbyid(proowner),'supabase_admin','argument_types owner') from pg_proc where oid='private.tracker_argument_types(jsonb,text)'::regprocedure;
select is(pg_get_userbyid(proowner),'supabase_admin','save_tracker_chain owner') from pg_proc where oid='private.save_tracker_chain(uuid,uuid,boolean,text,jsonb)'::regprocedure;
select is(pg_get_userbyid(proowner),'supabase_admin','apply_tracker_write owner') from pg_proc where oid='public.apply_tracker_write(text,jsonb,jsonb)'::regprocedure;
select is(prosecdef,false,'argument_types stays SECURITY INVOKER') from pg_proc where oid='private.tracker_argument_types(jsonb,text)'::regprocedure;
select is(prosecdef,true,'save_tracker_chain stays SECURITY DEFINER') from pg_proc where oid='private.save_tracker_chain(uuid,uuid,boolean,text,jsonb)'::regprocedure;
select is(prosecdef,true,'apply_tracker_write stays SECURITY DEFINER') from pg_proc where oid='public.apply_tracker_write(text,jsonb,jsonb)'::regprocedure;
select is(proconfig::text,'{"search_path=\"\""}','argument_types keeps empty search_path') from pg_proc where oid='private.tracker_argument_types(jsonb,text)'::regprocedure;
select is(proconfig::text,'{"search_path=\"\""}','save_tracker_chain keeps empty search_path') from pg_proc where oid='private.save_tracker_chain(uuid,uuid,boolean,text,jsonb)'::regprocedure;
select is(proconfig::text,'{"search_path=\"\""}','apply_tracker_write keeps empty search_path') from pg_proc where oid='public.apply_tracker_write(text,jsonb,jsonb)'::regprocedure;
select is(proacl::text,'{supabase_admin=X/supabase_admin}','argument_types grants unchanged') from pg_proc where oid='private.tracker_argument_types(jsonb,text)'::regprocedure;
select is(proacl::text,'{supabase_admin=X/supabase_admin}','save_tracker_chain grants unchanged') from pg_proc where oid='private.save_tracker_chain(uuid,uuid,boolean,text,jsonb)'::regprocedure;
select is(proacl::text,'{supabase_admin=X/supabase_admin,postgres=X/supabase_admin,authenticated=X/supabase_admin}','apply_tracker_write grants unchanged') from pg_proc where oid='public.apply_tracker_write(text,jsonb,jsonb)'::regprocedure;

-- Lint fixes: typed initializers and no write-only variable.
select ok(prosrc like '%ids uuid[]:=''{}''::uuid[]%' and prosrc like '%result jsonb:=''null''::jsonb%','apply_tracker_write initializers are explicitly typed') from pg_proc where oid='public.apply_tracker_write(text,jsonb,jsonb)'::regprocedure;
select ok(prosrc like '%stages jsonb:=''[]''::jsonb%','save_tracker_chain initializer is explicitly typed') from pg_proc where oid='private.save_tracker_chain(uuid,uuid,boolean,text,jsonb)'::regprocedure;
select ok(prosrc not like '%ignored%','argument_types has no write-only variable') from pg_proc where oid='private.tracker_argument_types(jsonb,text)'::regprocedure;
-- The typed literals produce the same values the untyped ones did.
select is('{}'::uuid[],array[]::uuid[],'empty id list value');
select is(jsonb_typeof('null'::jsonb),'null','jsonb null stays a JSON null, not SQL null');
select is('[]'::jsonb,jsonb_build_array(),'empty stage list value');

-- Direct validator behaviour: valid values pass, each invalid kind is refused with 22023.
select lives_ok($$select private.tracker_argument_types('{"a":"da230100-0000-4000-8000-0000000000b1","b":"2026-02-28","c":"full","d":3,"e":true}','a:uuid,b:date,c:completion,d:integer,e:boolean')$$,'valid arguments pass');
select throws_ok($$select private.tracker_argument_types('{"a":"not-a-uuid"}','a:uuid')$$,'22023',null,'bad uuid refused');
select throws_ok($$select private.tracker_argument_types('{"a":"2026-02-30"}','a:date')$$,'22023',null,'impossible date refused');
select throws_ok($$select private.tracker_argument_types('{"a":"infinity"}','a:date')$$,'22023',null,'infinite date refused');
select throws_ok($$select private.tracker_argument_types('{"a":"bogus"}','a:completion')$$,'22023',null,'bad enum refused');
select throws_ok($$select private.tracker_argument_types('{"a":1.5}','a:integer')$$,'22023',null,'fractional integer refused');
select throws_ok($$select private.tracker_argument_types('{"a":99999999999}','a:integer')$$,'22023',null,'overflowing integer refused');
select throws_ok($$select private.tracker_argument_types('{"a":1}','a:string')$$,'22023',null,'wrong JSON type refused');
select throws_ok($$select private.tracker_argument_types('{}','a:uuid')$$,'22023',null,'missing key refused');
select throws_ok($$select private.tracker_argument_types('{"a":"x"}','a:mystery')$$,'22023',null,'unknown spec refused');

-- Smoke through the public boundary.
set local role authenticated;
select set_config('request.jwt.claim.sub','da230100-0000-4000-8000-0000000000a1',true);
select public.initialize_account_time_zone('UTC');
insert into intent values(public.get_tracker_processing_access()->'revision');
select lives_ok($$select public.apply_tracker_write('habit-save','{"p_id":"da230100-0000-4000-8000-0000000000c1","p_create":true,"p_mode":"basic","p_input":{"questType":"habit","stat":"STR","difficulty":"Easy","time":"08:00","days":[0,1,2,3,4,5,6],"scheduledDate":null,"targetCount":null,"timeSet":true},"p_expected_targets":[]}',(select revision from intent))$$,'valid habit-save passes');
select is((select count(*)::integer from public.habits where id='da230100-0000-4000-8000-0000000000c1'),1,'valid habit-save wrote the quest');
select throws_ok($$select public.apply_tracker_write('habit-save','{"p_id":"not-a-uuid","p_create":true,"p_mode":"basic","p_input":{},"p_expected_targets":[]}',(select revision from intent))$$,'22023',null,'malformed id refused with 22023');
select throws_ok($$select public.apply_tracker_write('habit-save','{"p_id":"da230100-0000-4000-8000-0000000000c2","p_create":"yes","p_mode":"basic","p_input":{},"p_expected_targets":[]}',(select revision from intent))$$,'22023',null,'non-boolean flag refused with 22023');
select throws_ok($$select public.apply_tracker_write('no-such-operation','{"p_expected_targets":[]}',(select revision from intent))$$,'22023',null,'unknown operation refused with 22023');
select lives_ok($$select public.apply_tracker_write('chain-save','{"p_id":"da230100-0000-4000-8000-0000000000d1","p_request_id":"da230100-0000-4000-8000-0000000000d2","p_create":true,"p_mode":"basic","p_input":{"stat":"INT","strictOrder":true,"stages":[{"id":"da230100-0000-4000-8000-0000000000d3"},{"id":"da230100-0000-4000-8000-0000000000d4"}]},"p_expected_targets":[]}',(select revision from intent))$$,'valid chain-save passes');
select is((select count(*)::integer from public.long_quest_stages where long_quest_id='da230100-0000-4000-8000-0000000000d1'),2,'valid chain-save wrote both stages');
select throws_ok($$select public.apply_tracker_write('chain-save','{"p_id":"da230100-0000-4000-8000-0000000000d5","p_request_id":"da230100-0000-4000-8000-0000000000d6","p_create":true,"p_mode":"basic","p_input":{"stat":"INT","strictOrder":true,"stages":[{"id":"nope"}]},"p_expected_targets":[]}',(select revision from intent))$$,'22023',null,'malformed stage id refused');
reset role;
select * from finish();
rollback;
