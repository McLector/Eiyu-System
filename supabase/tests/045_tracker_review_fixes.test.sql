begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- Local S02 review fixes (058): retained-history IDs cannot be reused as new
-- roots, media attachments are bound to owner/routine/current tuple, and
-- tracker tables carry no client TRUNCATE. Synthetic users only; rolled back.
insert into auth.users(id,email,raw_user_meta_data) values
 ('da230600-0000-4000-8000-000000000001','review-a@example.invalid','{"birth_date":"2000-01-01"}'),
 ('da230600-0000-4000-8000-000000000002','review-b@example.invalid','{"birth_date":"2000-01-01"}');
-- Retained history from before 053: deleted habits and deleted chains, no provenance rows.
insert into public.deleted_habit_history(source_habit_id,user_id,historical_date,habit_name,stat,quest_type,scheduled,completion_kind) values
 ('da230600-0000-4000-8000-0000000000d1','da230600-0000-4000-8000-000000000001',current_date-3,'Old custom habit','INT','habit',true,'full'),
 ('da230600-0000-4000-8000-0000000000d2','da230600-0000-4000-8000-000000000002',current_date-3,'Other owner habit','INT','habit',true,'full');
insert into public.long_quest_rewards(user_id,quest_id,reward_key,kind,stat,amount,active) values
 ('da230600-0000-4000-8000-000000000001','da230600-0000-4000-8000-0000000000e1','da230600-0000-4000-8000-0000000000f1','stage','WIS',20,true);
insert into private.long_quest_definition_receipts(user_id,request_id,quest_id,input) values
 ('da230600-0000-4000-8000-000000000001','da230600-0000-4000-8000-0000000000f2','da230600-0000-4000-8000-0000000000e2','{}');
create function pg_temp.cmd(op text,args jsonb,targets jsonb default '[]') returns jsonb
language sql security invoker set search_path='' as $$
 select public.apply_tracker_write(op,args||jsonb_build_object('p_expected_targets',targets),public.get_tracker_processing_access()->'revision');
$$;
grant execute on function pg_temp.cmd(text,jsonb,jsonb) to authenticated;
create function pg_temp.habit(id uuid) returns jsonb language sql as $$
 select jsonb_build_object('p_id',id,'p_create',true,'p_mode','basic','p_input',
  '{"stat":"STR","difficulty":"Easy","time":"08:00","days":[0,1,2,3,4,5,6]}'::jsonb);
$$;
grant execute on function pg_temp.habit(uuid) to authenticated;
create function pg_temp.chain(id uuid,req uuid) returns jsonb language sql as $$
 select jsonb_build_object('p_id',id,'p_request_id',req,'p_create',true,'p_mode','basic','p_input',
  '{"stat":"WIS","strictOrder":true,"stages":[{}]}'::jsonb);
$$;
grant execute on function pg_temp.chain(uuid,uuid) to authenticated;
create function pg_temp.tuple() returns text language sql security invoker as $$
 select (r->>'ageVersion')||'-'||(r->>'consentVersion')||'-'||(r->>'authorityVersion') from (select public.get_tracker_processing_access()->'revision' r) s;
$$;
grant execute on function pg_temp.tuple() to authenticated;
create function pg_temp.exercise(id uuid,routine uuid,path text) returns jsonb language sql as $$
 select jsonb_build_object('p_id',id,'p_input',jsonb_build_object('routine_id',routine,'name','Press','position',0,'sets',3,'reps','5',
  'rest_seconds',60,'rir',1,'notes','','media_path',path,'media_mime',case when path is null then null else 'image/gif' end));
$$;
grant execute on function pg_temp.exercise(uuid,uuid,text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','da230600-0000-4000-8000-000000000001',true);
select public.initialize_account_time_zone('UTC');

-- H1: an ID with retained history cannot become a new (basic) root, for any owner.
select throws_ok($$select pg_temp.cmd('habit-save',pg_temp.habit('da230600-0000-4000-8000-0000000000d1'))$$,'42501',null,'own deleted habit ID cannot be reused as a basic quest');
select throws_ok($$select pg_temp.cmd('habit-save',pg_temp.habit('da230600-0000-4000-8000-0000000000d2'))$$,'42501',null,'another owner''s deleted habit ID cannot be reused');
select throws_ok($$select pg_temp.cmd('chain-save',pg_temp.chain('da230600-0000-4000-8000-0000000000e1','da230600-0000-4000-8000-0000000000f3'))$$,'42501',null,'deleted chain ID with retained rewards cannot be reused');
select throws_ok($$select pg_temp.cmd('chain-save',pg_temp.chain('da230600-0000-4000-8000-0000000000e2','da230600-0000-4000-8000-0000000000f4'))$$,'42501',null,'deleted chain ID with a retained definition receipt cannot be reused');
select is((select count(*)::integer from public.habits where id in('da230600-0000-4000-8000-0000000000d1','da230600-0000-4000-8000-0000000000d2')),0,'refused reuse creates no live habit');
select is((select count(*)::integer from public.long_quests where id in('da230600-0000-4000-8000-0000000000e1','da230600-0000-4000-8000-0000000000e2')),0,'refused reuse creates no live chain');
select lives_ok($$select pg_temp.cmd('habit-save',pg_temp.habit('da230600-0000-4000-8000-000000000011'))$$,'a fresh habit ID still works');
select lives_ok($$select pg_temp.cmd('chain-save',pg_temp.chain('da230600-0000-4000-8000-000000000021','da230600-0000-4000-8000-000000000022'))$$,'a fresh chain ID still works');
select lives_ok($$select pg_temp.cmd('chain-save',pg_temp.chain('da230600-0000-4000-8000-000000000021','da230600-0000-4000-8000-000000000022'))$$,'the same creation retry is still idempotent');
reset role;
select is((select input_kind from private.tracker_input_provenance where object_id='da230600-0000-4000-8000-0000000000d1'),null,'no provenance was recorded for the refused retained ID');

-- M1: attachments must use the owner, the routine and the current tracker tuple.
set local role authenticated;
select set_config('request.jwt.claim.sub','da230600-0000-4000-8000-000000000001',true);
select public.set_tracker_processing_consent('fitness-tracking',true,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
select pg_temp.cmd('gym-routine-save','{"p_id":"da230600-0000-4000-8000-000000000031","p_create":true,"p_name":"Routine A","p_unit":"kg"}');
select pg_temp.cmd('gym-routine-save','{"p_id":"da230600-0000-4000-8000-000000000032","p_create":true,"p_name":"Routine B","p_unit":"kg"}');
insert into storage.objects(bucket_id,name) values('gym-exercise-media',
 'da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/'||pg_temp.tuple()||'/da230600-0000-4000-8000-0000000000a1.gif');
reset role;
insert into storage.objects(bucket_id,name) values
 ('gym-exercise-media','da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/0-0-0/da230600-0000-4000-8000-0000000000a2.gif'),
 ('gym-exercise-media','da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/da230600-0000-4000-8000-0000000000a3.gif');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230600-0000-4000-8000-000000000001',true);
select lives_ok($$select pg_temp.cmd('save_gym_exercise',pg_temp.exercise('da230600-0000-4000-8000-000000000041','da230600-0000-4000-8000-000000000031',
 'da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/'||pg_temp.tuple()||'/da230600-0000-4000-8000-0000000000a1.gif'))$$,'current-tuple upload for the same routine attaches');
select throws_ok($$select pg_temp.cmd('save_gym_exercise',pg_temp.exercise('da230600-0000-4000-8000-000000000042','da230600-0000-4000-8000-000000000031',
 'da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/0-0-0/da230600-0000-4000-8000-0000000000a2.gif'))$$,'42501',null,'an old-tuple object cannot be attached');
select throws_ok($$select pg_temp.cmd('save_gym_exercise',pg_temp.exercise('da230600-0000-4000-8000-000000000043','da230600-0000-4000-8000-000000000031',
 'da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/da230600-0000-4000-8000-0000000000a3.gif'))$$,'42501',null,'a legacy-path object cannot be newly attached');
select throws_ok($$select pg_temp.cmd('save_gym_exercise',pg_temp.exercise('da230600-0000-4000-8000-000000000044','da230600-0000-4000-8000-000000000032',
 'da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/'||pg_temp.tuple()||'/da230600-0000-4000-8000-0000000000a1.gif'))$$,'42501',null,'another routine''s object cannot be attached');
select throws_ok($$select pg_temp.cmd('save_gym_exercise',pg_temp.exercise('da230600-0000-4000-8000-000000000045','da230600-0000-4000-8000-000000000031',
 'da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/'||pg_temp.tuple()||'/da230600-0000-4000-8000-0000000000a9.gif'))$$,'42501',null,'a never-uploaded path cannot be attached');
select lives_ok($$select pg_temp.cmd('save_gym_exercise',pg_temp.exercise('da230600-0000-4000-8000-000000000046','da230600-0000-4000-8000-000000000031',null))$$,'an exercise without media still saves');
reset role;
-- A retained legacy attachment stays valid when an edit leaves it unchanged.
insert into public.gym_exercises(id,routine_id,user_id,name,position,sets,reps,rest_seconds,rir,notes,media_path,media_mime) values
 ('da230600-0000-4000-8000-000000000047','da230600-0000-4000-8000-000000000031','da230600-0000-4000-8000-000000000001','Legacy',1,3,'5',60,1,'',
  'da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/da230600-0000-4000-8000-0000000000a3.gif','image/gif');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230600-0000-4000-8000-000000000001',true);
select lives_ok($$select pg_temp.cmd('save_gym_exercise',jsonb_set(pg_temp.exercise('da230600-0000-4000-8000-000000000047','da230600-0000-4000-8000-000000000031',
 'da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/da230600-0000-4000-8000-0000000000a3.gif'),'{p_input,name}','"Legacy renamed"'))$$,'an unchanged legacy attachment survives an edit');
-- Withdrawal then regrant: the old-tuple object is still refused.
select public.set_tracker_processing_consent('fitness-tracking',false,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
select public.set_tracker_processing_consent('fitness-tracking',true,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
select throws_ok($$select pg_temp.cmd('save_gym_exercise',pg_temp.exercise('da230600-0000-4000-8000-000000000048','da230600-0000-4000-8000-000000000031',
 'da230600-0000-4000-8000-000000000001/da230600-0000-4000-8000-000000000031/'||((select (r->>'ageVersion')||'-'||((r->>'consentVersion')::integer-2)||'-'||(r->>'authorityVersion') from (select public.get_tracker_processing_access()->'revision' r) s))||'/da230600-0000-4000-8000-0000000000a1.gif'))$$,'42501',null,'an upload from before withdrawal and regrant cannot be attached');
reset role;

-- Low: clients hold no TRUNCATE on tracker tables.
select ok(not has_table_privilege(r,'public.'||t,'TRUNCATE'),r||' has no TRUNCATE on '||t)
 from unnest(array['habits','habit_completions','stats','streaks','long_quests','long_quest_stages','weekly_quests','habit_progress','habit_schedule_versions','habit_occurrences',
  'habit_recovery_windows','deleted_habit_history','habit_archive_intervals','long_quest_rewards','gym_routines','gym_exercises','gym_sessions','gym_entries','gym_media_cleanup']) t,
 unnest(array['anon','authenticated']) r;
select * from finish();
rollback;
