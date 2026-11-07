begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local timezone='UTC';
select no_plan();
-- Migration 065, "open tracker": custom quests, chains and Gym follow the basic write rule (066 later removed the
-- under-12 pause too); the day-pause applies only between go-live and the unblock; retention is off.
-- Synthetic users; rolled back.
insert into auth.users(id,email,raw_user_meta_data) values
 ('da260000-0000-4000-8000-000000000001','open-legacy@example.invalid','{}'),
 ('da260000-0000-4000-8000-000000000002','open-teen@example.invalid','{"birth_date":"2010-01-01"}'),
 ('da260000-0000-4000-8000-000000000003','open-under12@example.invalid','{"birth_date":"2000-01-01"}'),
 ('da260000-0000-4000-8000-000000000004','open-other@example.invalid','{}'),
 ('da260000-0000-4000-8000-000000000005','open-window@example.invalid','{}'),
 ('da260000-0000-4000-8000-000000000006','open-events@example.invalid','{}');
create function pg_temp.cmd(op text,args jsonb,targets jsonb default '[]') returns jsonb
language sql security invoker set search_path='' as $$
 select public.apply_tracker_write(op,args||jsonb_build_object('p_expected_targets',targets),public.get_tracker_processing_access()->'revision');
$$;
grant execute on function pg_temp.cmd(text,jsonb,jsonb) to authenticated;
create function pg_temp.occ(h uuid) returns date[] language sql as $$
 select coalesce(array_agg(occurrence_date order by occurrence_date),'{}') from public.habit_occurrences where habit_id=h;
$$;

-- A. The settings row: one row, written when the migration ran, never readable by clients.
select is((select count(*)::integer from private.tracker_open_settings),1,'exactly one settings row');
select ok((select go_live_at<=unblocked_at from private.tracker_open_settings),'go-live is never after the unblock');
select throws_ok($$insert into private.tracker_open_settings(singleton,go_live_at,unblocked_at) values(false,now(),now())$$,'23514',null,'the settings table accepts only its single row');
select throws_ok($$update private.tracker_open_settings set go_live_at=unblocked_at+interval '1 day'$$,'23514',null,'a go-live after the unblock is refused');
select ok(not has_table_privilege('authenticated','private.tracker_open_settings','SELECT'),'signed-in clients cannot read the settings');
select ok(not has_table_privilege('anon','private.tracker_open_settings','SELECT'),'anonymous cannot read the settings');
select ok(not has_table_privilege('service_role','private.tracker_open_settings','UPDATE'),'the service role cannot change the settings');

-- B. Access: custom and fitness equal basic, with no grant, a withdrawal, a revoked authority or a teen birthday.
set local role authenticated;
select set_config('request.jwt.claim.sub','da260000-0000-4000-8000-000000000001',true);
select public.initialize_account_time_zone('UTC');
select ok((public.get_tracker_processing_access()->>'canWriteBasic')::boolean,'legacy: basic writes are open');
select is(public.get_tracker_processing_access()->>'canWriteCustom','true','legacy with no grant: custom writes are open');
select is(public.get_tracker_processing_access()->>'canWriteFitness','true','legacy with no grant: Gym writes are open');
select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',public.get_tracker_processing_access()->'revision');
select public.set_tracker_processing_consent('custom-tracker',false,'2026-10-23-custom-tracker-v1',public.get_tracker_processing_access()->'revision');
select is(public.get_tracker_processing_access()->>'canWriteCustom','true','a withdrawn custom grant no longer closes custom writes');
select public.set_tracker_processing_consent('fitness-tracking',true,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
select public.set_tracker_processing_consent('fitness-tracking',false,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
select is(public.get_tracker_processing_access()->>'canWriteFitness','true','a withdrawn fitness grant no longer closes Gym writes');
select set_config('request.jwt.claim.sub','da260000-0000-4000-8000-000000000002',true);
select is(public.get_tracker_processing_access()->>'canWriteCustom','true','a teen birthday does not close custom writes');
select is(public.get_tracker_processing_access()->>'canWriteFitness','true','a teen birthday does not close Gym writes');
select is(public.get_tracker_processing_access()->'revision'->>'userId','da260000-0000-4000-8000-000000000002','the revision still names its owner');

-- C. An old named quest with no provenance row completes, and the day is prepared for it.
reset role;
insert into public.habits(id,user_id,name,easy_version,stat) values
 ('da260000-0000-4000-8000-000000000011','da260000-0000-4000-8000-000000000001','Old named quest','small','INT');
set local role authenticated;
select set_config('request.jwt.claim.sub','da260000-0000-4000-8000-000000000001',true);
select is(public.get_tracker_targets('habit',array['da260000-0000-4000-8000-000000000011']::uuid[])#>>'{0,inputKind}','custom','the legacy quest counts as custom');
select is(public.get_tracker_targets('habit',array['da260000-0000-4000-8000-000000000011']::uuid[])#>>'{0,canWrite}','true','and is writable with no grant');
select is(pg_temp.cmd('prepare-day','{}')->>'protectedPrepared','true','preparation covers custom quests with no grant');
select is(pg_temp.occ('da260000-0000-4000-8000-000000000011'),array[current_date]::date[],'today has an occurrence for the legacy quest');
select lives_ok($$select pg_temp.cmd('complete_habit',jsonb_build_object('p_habit_id','da260000-0000-4000-8000-000000000011','p_completed_on',current_date,'p_kind','full'),'[{"kind":"habit","id":"da260000-0000-4000-8000-000000000011","inputKind":"custom"}]')$$,'the legacy quest completes with no grant');
select is((select count(*)::integer from public.habit_completions where habit_id='da260000-0000-4000-8000-000000000011'),1,'and the completion is stored');
select lives_ok($$select pg_temp.cmd('undo_habit_completion',jsonb_build_object('p_habit_id','da260000-0000-4000-8000-000000000011','p_completed_on',current_date),'[{"kind":"habit","id":"da260000-0000-4000-8000-000000000011","inputKind":"custom"}]')$$,'and can be undone');
select lives_ok($$select pg_temp.cmd('habit-save','{"p_id":"da260000-0000-4000-8000-000000000011","p_create":false,"p_mode":"custom","p_input":{"name":"Renamed old quest","easyVersion":"small","questType":"habit","stat":"INT","difficulty":"Easy","time":"08:00","days":[0,1,2,3,4,5,6],"scheduledDate":null,"targetCount":null,"timeSet":true}}','[{"kind":"habit","id":"da260000-0000-4000-8000-000000000011","inputKind":"custom"}]')$$,'the legacy quest can be edited with no grant');
select is((select name from public.habits where id='da260000-0000-4000-8000-000000000011'),'Renamed old quest','and the edit is stored');
-- A "Quest 1" basic quest can still be renamed (basic to custom).
select pg_temp.cmd('habit-save','{"p_id":"da260000-0000-4000-8000-000000000012","p_create":true,"p_mode":"basic","p_input":{"stat":"STR","difficulty":"Easy","time":"08:00","days":[0,1,2,3,4,5,6]}}');
select lives_ok($$select pg_temp.cmd('habit-save','{"p_id":"da260000-0000-4000-8000-000000000012","p_create":false,"p_mode":"custom","p_input":{"name":"My own name","easyVersion":"small","questType":"habit","stat":"STR","difficulty":"Easy","time":"08:00","days":[0,1,2,3,4,5,6],"scheduledDate":null,"targetCount":null,"timeSet":true}}','[{"kind":"habit","id":"da260000-0000-4000-8000-000000000012","inputKind":"basic"}]')$$,'a Quest 1 basic quest can be renamed with no grant');
select is((select name from public.habits where id='da260000-0000-4000-8000-000000000012'),'My own name','and the new name is stored');
-- A new custom quest and chain need no grant either.
select lives_ok($$select pg_temp.cmd('habit-save','{"p_id":"da260000-0000-4000-8000-000000000013","p_create":true,"p_mode":"custom","p_input":{"name":"Fresh custom","easyVersion":"small","questType":"habit","stat":"WIS","difficulty":"Easy","time":"09:00","days":[1,3,5],"scheduledDate":null,"targetCount":null,"timeSet":true}}')$$,'a new custom quest needs no grant');

-- C2. An old chain with no provenance row: its stages toggle, it can be edited, and a new custom chain is accepted.
reset role;
insert into public.long_quests(id,user_id,name,stat) values('da260000-0000-4000-8000-000000000061','da260000-0000-4000-8000-000000000001','Old named chain','INT');
insert into public.long_quest_stages(id,long_quest_id,user_id,name,position) values
 ('da260000-0000-4000-8000-000000000062','da260000-0000-4000-8000-000000000061','da260000-0000-4000-8000-000000000001','First legacy stage',1),
 ('da260000-0000-4000-8000-000000000063','da260000-0000-4000-8000-000000000061','da260000-0000-4000-8000-000000000001','Second legacy stage',2);
set local role authenticated;
select set_config('request.jwt.claim.sub','da260000-0000-4000-8000-000000000001',true);
select is(public.get_tracker_targets('chain',array['da260000-0000-4000-8000-000000000061']::uuid[])#>>'{0,canWrite}','true','the legacy chain is writable with no grant');
select lives_ok($$select pg_temp.cmd('set_long_quest_stage_done_receipt',jsonb_build_object('p_stage_id','da260000-0000-4000-8000-000000000062','p_done',true,'p_request_id','da260000-0000-4000-8000-000000000064'),'[{"kind":"chain","id":"da260000-0000-4000-8000-000000000061","inputKind":"custom"}]')$$,'a legacy chain stage can be completed with no grant');
select ok((select done from public.long_quest_stages where id='da260000-0000-4000-8000-000000000062'),'and the stage is stored as done');
select lives_ok($$select pg_temp.cmd('chain-save','{"p_id":"da260000-0000-4000-8000-000000000061","p_request_id":"da260000-0000-4000-8000-000000000065","p_create":false,"p_mode":"custom","p_input":{"name":"Renamed old chain","stat":"INT","stages":[{"id":"da260000-0000-4000-8000-000000000062","name":"First legacy stage","description":null},{"id":"da260000-0000-4000-8000-000000000063","name":"Second legacy stage","description":null}]}}','[{"kind":"chain","id":"da260000-0000-4000-8000-000000000061","inputKind":"custom"}]')$$,'a legacy chain can be edited with no grant');
select is((select name from public.long_quests where id='da260000-0000-4000-8000-000000000061'),'Renamed old chain','and the new name is stored');
select lives_ok($$select pg_temp.cmd('chain-save','{"p_id":"da260000-0000-4000-8000-000000000066","p_request_id":"da260000-0000-4000-8000-000000000067","p_create":true,"p_mode":"custom","p_input":{"name":"Fresh custom chain","stat":"WIS","stages":[{"id":"da260000-0000-4000-8000-000000000068","name":"Only stage","description":null}]}}')$$,'a new custom chain needs no grant');

-- D. Gym logs a weight with no fitness grant.
select lives_ok($$select pg_temp.cmd('gym-routine-save','{"p_id":"da260000-0000-4000-8000-000000000021","p_create":true,"p_name":"Open routine","p_unit":"kg"}')$$,'a Gym routine needs no fitness grant');
select lives_ok($$select pg_temp.cmd('save_gym_exercise','{"p_id":"da260000-0000-4000-8000-000000000022","p_input":{"routine_id":"da260000-0000-4000-8000-000000000021","name":"Squat","position":0,"sets":3,"reps":"5","rest_seconds":90,"rir":2,"notes":""}}')$$,'a Gym exercise needs no fitness grant');
select lives_ok($$select pg_temp.cmd('start_gym_session','{"p_routine_id":"da260000-0000-4000-8000-000000000021"}')$$,'a Gym session starts with no grant');
select lives_ok($$select pg_temp.cmd('save_gym_session',jsonb_build_object('p_session_id',(select id from public.gym_sessions),'p_weights','[{"exercise_id":"da260000-0000-4000-8000-000000000022","weight":60}]'::jsonb,'p_finish',false))$$,'a weight is logged with no grant');
select is((select weight from public.gym_entries),60.000::numeric,'and the weight is stored');

-- E. The pause helper: only [go-live, unblock), only when no grant is in force that day.
reset role;
update private.tracker_open_settings set go_live_at=(current_date-4)::timestamp at time zone 'UTC',unblocked_at=current_date::timestamp at time zone 'UTC';
select ok(not private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000005',current_date-5,'UTC'),'no grant: the day before go-live is not paused');
select ok(private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000005',current_date-4,'UTC'),'no grant: the go-live day is paused');
select ok(private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000005',current_date-1,'UTC'),'no grant: the last blocked day is paused');
select ok(not private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000005',current_date,'UTC'),'no grant: the unblock day is not paused');
select ok(not private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000005',current_date+3,'UTC'),'no grant: later days are never paused');
select ok(not private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000005',current_date-400,'UTC'),'no grant: long before go-live is never paused');
-- Events: granted before go-live then withdrawn inside the window, and a user who granted inside the window.
insert into private.processing_consent_events(user_id,purpose,granted,notice_version,version,changed_at) values
 ('da260000-0000-4000-8000-000000000006','custom-tracker',true,'2026-10-23-custom-tracker-v1',1,(current_date-9)::timestamp at time zone 'UTC'),
 ('da260000-0000-4000-8000-000000000006','custom-tracker',false,'2026-10-23-custom-tracker-v1',2,(current_date-2)::timestamp at time zone 'UTC'),
 ('da260000-0000-4000-8000-000000000002','custom-tracker',true,'2026-10-23-custom-tracker-v1',1,(current_date-3)::timestamp at time zone 'UTC');
select ok(not private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000006',current_date-3,'UTC'),'a grant in force keeps a blocked-window day unpaused');
select ok(private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000006',current_date-2,'UTC'),'a withdrawal inside the window pauses from its day');
select ok(not private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000006',current_date,'UTC'),'but never on or after the unblock');
select ok(private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000002',current_date-4,'UTC'),'a grant made inside the window pauses the days before it');
select ok(not private.custom_purpose_paused_on('da260000-0000-4000-8000-000000000002',current_date-3,'UTC'),'and not the days from the grant on');
select ok(not has_function_privilege('authenticated','private.custom_purpose_paused_on(uuid,date,text)','execute'),'clients cannot call the pause helper');

-- F. A blocked-window day is not recorded as a miss and does not break the streak.
set local role authenticated;
select set_config('request.jwt.claim.sub','da260000-0000-4000-8000-000000000005',true);
select public.initialize_account_time_zone('UTC');
select pg_temp.cmd('habit-save','{"p_id":"da260000-0000-4000-8000-000000000031","p_create":true,"p_mode":"custom","p_input":{"name":"Blocked days walk","easyVersion":"small","stat":"INT","difficulty":"Easy","time":"07:00","days":[0,1,2,3,4,5,6]}}');
reset role;
alter table public.habits disable trigger habits_set_schedule_start;
update public.habits set schedule_start_on=current_date-5 where id='da260000-0000-4000-8000-000000000031';
alter table public.habits enable trigger habits_set_schedule_start;
delete from public.habit_occurrences where habit_id='da260000-0000-4000-8000-000000000031';
insert into public.habit_occurrences(habit_id,user_id,occurrence_date,time_zone,day_ends_at)
 values('da260000-0000-4000-8000-000000000031','da260000-0000-4000-8000-000000000005',current_date-5,'UTC',(current_date-4)::timestamp at time zone 'UTC');
insert into public.habit_completions(user_id,habit_id,completed_on,kind,xp_awarded)
 values('da260000-0000-4000-8000-000000000005','da260000-0000-4000-8000-000000000031',current_date-5,'full',20);
update public.streaks set last_processed_on=current_date-6 where user_id='da260000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','da260000-0000-4000-8000-000000000005',true);
select is(pg_temp.cmd('prepare-day','{}')->>'protectedPrepared','true','preparation runs for a user with no grant');
reset role;
select is(pg_temp.occ('da260000-0000-4000-8000-000000000031')::text,array[current_date-5,current_date]::date[]::text,'no occurrence for the blocked days, only before go-live and from the unblock day');
select is((select count(*)::integer from public.habit_recovery_windows where habit_id='da260000-0000-4000-8000-000000000031'),0,'no recovery window opens for the blocked days');
select is((select current_streak from public.streaks where habit_id='da260000-0000-4000-8000-000000000031'),1,'the streak is not broken by the blocked days');

-- G. Retention is off: no new rows, the job removes nothing, nothing is scheduled.
select is((select count(*)::integer from pg_trigger where tgname='track_tracker_retention' and not tgisinternal),0,'the retention trigger is gone');
select is((select count(*)::integer from private.tracker_retention_state where user_id::text like 'da260000-%'),0,'the withdrawals above scheduled no removal');
insert into private.tracker_retention_state(user_id,purpose,withdrawn_at,reminder_due_on,removal_due_on)
 values('da260000-0000-4000-8000-000000000001','custom-tracker',now()-interval '90 days',current_date-60,current_date-59);
select is(private.run_tracker_retention(now()+interval '90 days'),'{"reminded":0,"removed":0}'::jsonb,'the retention job reports nothing done');
select ok(exists(select 1 from public.habits where id='da260000-0000-4000-8000-000000000011'),'and the old quest is still there');
select ok((select removed_at is null and reminded_at is null from private.tracker_retention_state where user_id='da260000-0000-4000-8000-000000000001'),'and a stray row is left untouched');

-- H. Each person still sees only their own rows (the under-12 pause and authority review no longer exist; 053 covers that).
reset role;
insert into public.habits(id,user_id,name,easy_version,stat) values
 ('da260000-0000-4000-8000-000000000051','da260000-0000-4000-8000-000000000004','Other owner quest','small','STR');
set local role authenticated;
select set_config('request.jwt.claim.sub','da260000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.habits where user_id='da260000-0000-4000-8000-000000000004'),0,'another owner''s quests are invisible');
select throws_ok($$select public.get_tracker_targets('habit',array['da260000-0000-4000-8000-000000000051']::uuid[])$$,'42501',null,'another owner''s quest is refused as a target');
select throws_ok($$select pg_temp.cmd('complete_habit',jsonb_build_object('p_habit_id','da260000-0000-4000-8000-000000000051','p_completed_on',current_date,'p_kind','full'),'[{"kind":"habit","id":"da260000-0000-4000-8000-000000000051","inputKind":"custom"}]')$$,'42501',null,'and cannot be completed');
select * from finish();
rollback;
