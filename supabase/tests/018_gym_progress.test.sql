begin;
set search_path=public,extensions;
select plan(16);
-- Fitness writes go through public.apply_tracker_write and need the owner's
-- fitness-tracking grant (S02 contract).
create function pg_temp.gw(op text,args jsonb,targets jsonb default '[]') returns jsonb
language sql set search_path='' as $$
 select public.apply_tracker_write(op,args||jsonb_build_object('p_expected_targets',targets),public.get_tracker_processing_access()->'revision');
$$;
insert into auth.users(id,email,raw_user_meta_data) values
('18000000-0000-4000-8000-000000000001','gym18@example.invalid','{"display_name":"Gym","birth_date":"2000-01-01"}'),
('18000000-0000-4000-8000-000000000099','gym18-other@example.invalid','{"display_name":"Other","birth_date":"2000-01-01"}');
set local role authenticated;
set local "request.jwt.claim.sub"='18000000-0000-4000-8000-000000000001';
select public.set_tracker_processing_consent('fitness-tracking',true,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
select pg_temp.gw('gym-routine-save','{"p_id":"18000000-0000-4000-8000-000000000002","p_create":true,"p_name":"Chest–Tricep–Shoulders","p_unit":"kg"}');
select pg_temp.gw('save_gym_exercise','{"p_id":"18000000-0000-4000-8000-000000000003","p_input":{"routine_id":"18000000-0000-4000-8000-000000000002","name":"Bench press","position":0,"sets":3,"reps":"8-12","rest_seconds":90,"rir":2,"notes":""}}');
select lives_ok($$select pg_temp.gw('reorder_gym_exercises','{"p_routine_id":"18000000-0000-4000-8000-000000000002","p_ids":["18000000-0000-4000-8000-000000000003"]}')$$,'atomic reorder accepts exact exercise set');
select lives_ok($$select pg_temp.gw('start_gym_session','{"p_routine_id":"18000000-0000-4000-8000-000000000002"}')$$,'starts draft');
select is(pg_temp.gw('start_gym_session','{"p_routine_id":"18000000-0000-4000-8000-000000000002"}')#>>'{}',(select id::text from public.gym_sessions where status='draft'),'start resumes same draft');
select is((select count(*) from public.gym_sessions),1::bigint,'one draft');
select lives_ok($$select pg_temp.gw('save_gym_session',jsonb_build_object('p_session_id',(select id from public.gym_sessions),'p_weights','[{"exercise_id":"18000000-0000-4000-8000-000000000003","weight":40}]'::jsonb,'p_finish',false))$$,'save draft weight');
select is((select weight from public.gym_entries),40.000::numeric,'weight persists');
select throws_ok($$select pg_temp.gw('save_gym_session',jsonb_build_object('p_session_id',(select id from public.gym_sessions),'p_weights','[{"exercise_id":"18000000-0000-4000-8000-000000000003","weight":-1}]'::jsonb,'p_finish',true))$$,'P0001',null,'negative weight rolls back finish');
select is((select status from public.gym_sessions),'draft','failed finish remains draft');
select lives_ok($$select pg_temp.gw('save_gym_session',jsonb_build_object('p_session_id',(select id from public.gym_sessions),'p_weights','[{"exercise_id":"18000000-0000-4000-8000-000000000003","weight":40}]'::jsonb,'p_finish',true))$$,'finishes session');
select lives_ok($$select pg_temp.gw('save_gym_session',jsonb_build_object('p_session_id',(select id from public.gym_sessions),'p_weights','[]'::jsonb,'p_finish',true))$$,'duplicate finish no-op');
select is((select count(*) from public.gym_sessions where status='completed'),1::bigint,'exactly one history session');
select pg_temp.gw('save_gym_exercise','{"p_id":"18000000-0000-4000-8000-000000000003","p_input":{"routine_id":"18000000-0000-4000-8000-000000000002","name":"Changed","position":0,"sets":4,"reps":"8-12","rest_seconds":90,"rir":2,"notes":""}}');
select pg_temp.gw('remove_gym_exercise','{"p_id":"18000000-0000-4000-8000-000000000003"}');
select is((select prescription->>'name' from public.gym_entries),'Bench press','history snapshot survives edit/removal');
select throws_ok($$update public.gym_entries set weight=500$$,'42501',null,'client cannot rewrite history');
set local "request.jwt.claim.sub"='18000000-0000-4000-8000-000000000099';
select public.set_tracker_processing_consent('fitness-tracking',true,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
select is((select count(*) from public.gym_sessions),0::bigint,'other account cannot read sessions');
-- The gateway refuses a routine the caller does not own before starting.
select throws_ok($$select pg_temp.gw('start_gym_session','{"p_routine_id":"18000000-0000-4000-8000-000000000002"}')$$,'42501','Tracker target unavailable.','other account cannot start');
select throws_ok($$insert into public.gym_exercises(routine_id,user_id,name,sets,reps,rest_seconds,rir) values('18000000-0000-4000-8000-000000000002',auth.uid(),'Foreign',3,'10',30,2)$$,'42501',null,'cannot attach own exercise to foreign routine');
select * from finish();
rollback;
