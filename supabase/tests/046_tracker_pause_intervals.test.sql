begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local timezone='UTC';
select no_plan();
-- Local S02 decision 14 (059): days inside a custom-tracker pause are not
-- scheduled for protected roots, so a regrant does not turn them into misses.
-- Basic roots are unaffected. Synthetic user; rolled back.
insert into auth.users(id,email,raw_user_meta_data) values
 ('da230700-0000-4000-8000-000000000001','pause-days@example.invalid','{"birth_date":"2000-01-01"}');
create function pg_temp.cmd(op text,args jsonb,targets jsonb default '[]') returns jsonb
language sql security invoker set search_path='' as $$
 select public.apply_tracker_write(op,args||jsonb_build_object('p_expected_targets',targets),public.get_tracker_processing_access()->'revision');
$$;
grant execute on function pg_temp.cmd(text,jsonb,jsonb) to authenticated;
create function pg_temp.occ(h uuid) returns date[] language sql as $$
 select coalesce(array_agg(occurrence_date order by occurrence_date),'{}') from public.habit_occurrences where habit_id=h;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','da230700-0000-4000-8000-000000000001',true);
select public.initialize_account_time_zone('UTC');
select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',public.get_tracker_processing_access()->'revision');
select pg_temp.cmd('habit-save','{"p_id":"da230700-0000-4000-8000-000000000011","p_create":true,"p_mode":"custom","p_input":{"name":"Protected walk","easyVersion":"small","stat":"INT","difficulty":"Easy","time":"07:00","days":[0,1,2,3,4,5,6]}}');
select pg_temp.cmd('habit-save','{"p_id":"da230700-0000-4000-8000-000000000012","p_create":true,"p_mode":"basic","p_input":{"stat":"STR","difficulty":"Easy","time":"08:00","days":[0,1,2,3,4,5,6]}}');
select public.set_tracker_processing_consent('custom-tracker',false,'2026-10-23-custom-tracker-v1',public.get_tracker_processing_access()->'revision');
select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',public.get_tracker_processing_access()->'revision');
reset role;
-- Model the timeline: granted 10 days ago, withdrawn 6 days ago, regranted today.
-- Both quests started 10 days ago; the protected one was completed on its 4 days before the pause.
alter table public.habits disable trigger habits_set_schedule_start;
update public.habits set schedule_start_on=current_date-10 where user_id='da230700-0000-4000-8000-000000000001';
alter table public.habits enable trigger habits_set_schedule_start;
update private.processing_consent_events set changed_at=(current_date-10)::timestamp at time zone 'UTC'
 where user_id='da230700-0000-4000-8000-000000000001' and purpose='custom-tracker' and granted
 and version=(select min(version) from private.processing_consent_events where user_id='da230700-0000-4000-8000-000000000001' and purpose='custom-tracker');
update private.processing_consent_events set changed_at=(current_date-6)::timestamp at time zone 'UTC'
 where user_id='da230700-0000-4000-8000-000000000001' and purpose='custom-tracker' and not granted;
insert into public.habit_occurrences(habit_id,user_id,occurrence_date,time_zone,day_ends_at)
 select 'da230700-0000-4000-8000-000000000011','da230700-0000-4000-8000-000000000001',d::date,'UTC',(d::date+1)::timestamp at time zone 'UTC'
 from generate_series(current_date-10,current_date-7,interval '1 day') d;
insert into public.habit_completions(user_id,habit_id,completed_on,kind,xp_awarded)
 select 'da230700-0000-4000-8000-000000000001','da230700-0000-4000-8000-000000000011',d::date,'full',20
 from generate_series(current_date-10,current_date-7,interval '1 day') d;
update public.streaks set last_processed_on=current_date-11 where user_id='da230700-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','da230700-0000-4000-8000-000000000001',true);
select is(pg_temp.cmd('prepare-day','{}')->>'protectedPrepared','true','current permission prepares protected roots');
reset role;
select is(pg_temp.occ('da230700-0000-4000-8000-000000000011')::text,
 array[current_date-10,current_date-9,current_date-8,current_date-7,current_date]::date[]::text,
 'protected root gets no occurrence for the paused days, only before the pause and from the regrant day');
select is(cardinality(pg_temp.occ('da230700-0000-4000-8000-000000000012')),11,'basic root keeps every scheduled day');
select is((select count(*)::integer from public.habit_recovery_windows where habit_id='da230700-0000-4000-8000-000000000011'),0,'no recovery window opens for paused days');
select is((select current_streak from public.streaks where habit_id='da230700-0000-4000-8000-000000000011'),4,'the streak continues across the pause');
select ok((select recovery_armed from public.streaks where habit_id='da230700-0000-4000-8000-000000000011'),'recovery stays armed after the pause');
-- A day counts as paused only on or after the withdrawal and before the regrant.
select ok(not private.custom_purpose_paused_on('da230700-0000-4000-8000-000000000001',current_date-7,'UTC'),'the day before withdrawal is not paused');
select ok(private.custom_purpose_paused_on('da230700-0000-4000-8000-000000000001',current_date-6,'UTC'),'the withdrawal day is paused');
select ok(private.custom_purpose_paused_on('da230700-0000-4000-8000-000000000001',current_date-1,'UTC'),'the day before the regrant is paused');
select ok(not private.custom_purpose_paused_on('da230700-0000-4000-8000-000000000001',current_date,'UTC'),'the regrant day is not paused');
select ok(private.custom_purpose_paused_on('da230700-0000-4000-8000-000000000001',current_date-11,'UTC'),'days before any grant count as paused (legacy rollout)');
select ok(not has_function_privilege('authenticated','private.custom_purpose_paused_on(uuid,date,text)','execute'),'clients cannot call the pause helper');
select * from finish();
rollback;
