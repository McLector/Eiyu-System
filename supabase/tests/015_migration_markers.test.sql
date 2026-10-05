begin;
select no_plan();

-- Migration 029: direct XP writes and internal trigger helpers stay private.
select ok(has_table_privilege('authenticated', 'public.stats', 'SELECT'),
  'authenticated can still read owned stats');
select ok(not has_table_privilege('authenticated', 'public.stats', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.stats', 'INSERT'),
  'authenticated cannot write XP stats directly');
select ok(not has_function_privilege('authenticated', 'public.increment_stat_xp(public.stat_key,integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.increment_stat_xp(public.stat_key,integer)', 'EXECUTE'),
  'XP helper is not callable by clients');
select ok(not has_function_privilege('authenticated', 'public.is_valid_time_zone(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.validate_profile_time_zone()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.set_habit_schedule_start()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_habit_schedule_version()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_habit_archive_interval()', 'EXECUTE'),
  'trigger helpers are not executable by authenticated clients');

-- Migration 030: quota state is isolated and Edge-only entry points are narrow.
select has_schema('private', 'private quota schema exists');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE')
    and not has_schema_privilege('anon', 'private', 'USAGE')
    and not has_schema_privilege('service_role', 'private', 'USAGE'),
  'private schema is not exposed to PostgREST roles');
select ok((select relrowsecurity from pg_class where oid = 'private.ai_logical_requests'::regclass)
    and (select relrowsecurity from pg_class where oid = 'private.ai_user_daily_usage'::regclass)
    and (select relrowsecurity from pg_class where oid = 'private.ai_provider_daily_usage'::regclass)
    and (select relrowsecurity from pg_class where oid = 'private.ai_provider_attempts'::regclass)
    and (select relrowsecurity from pg_class where oid = 'private.ai_pending_weekly_regenerations'::regclass),
  'every private quota ledger table has row-level security enabled');
select ok(has_function_privilege('service_role', 'public.ai_begin_request(uuid,text,uuid,date)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.ai_reserve_next_attempt(uuid,integer)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.ai_begin_request(uuid,text,uuid,date)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.ai_begin_request(uuid,text,uuid,date)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.ai_reserve_next_attempt(uuid,integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.ai_reserve_next_attempt(uuid,integer)', 'EXECUTE'),
  'only service_role can reserve AI logical requests and provider attempts');
select ok(has_column_privilege('authenticated', 'public.weekly_summaries', 'summary', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.weekly_summaries', 'regenerate_count', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.weekly_summaries', 'last_regenerated_date', 'UPDATE')
    and has_column_privilege('authenticated', 'public.weekly_summaries', 'summary', 'INSERT')
    and not has_column_privilege('authenticated', 'public.weekly_summaries', 'regenerate_count', 'INSERT'),
  'client weekly-summary writes cannot change server-owned quota counters');

-- Migration 031: the latest profile and quest validators must remain attached.
select ok(to_regprocedure('public.trim_profile_text(text)') is not null
    and to_regprocedure('public.validate_profile_edit_text()') is not null
    and to_regprocedure('public.update_profile(text,text)') is not null
    and to_regprocedure('public.validate_quest_name_edit()') is not null,
  'latest profile and quest validators exist');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_validate_edit_text' and not tgisinternal)
    and exists (select 1 from pg_trigger where tgrelid = 'public.habits'::regclass
      and tgname = 'habits_validate_name_length' and not tgisinternal)
    and exists (select 1 from pg_trigger where tgrelid = 'public.long_quests'::regclass
      and tgname = 'long_quests_validate_name_length' and not tgisinternal),
  'profile and both quest-name validation triggers are attached');
select ok(not has_function_privilege('anon', 'public.trim_profile_text(text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.trim_profile_text(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.update_profile(text,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.update_profile(text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.validate_quest_name_edit()', 'EXECUTE'),
  'validator helpers are not public trigger-call surfaces');

-- Prove the catalog body marker notices replacement with an older weak body,
-- while the nested exception block restores the latest definition on rollback.
create function pg_temp.weaker_name_body_is_rejected()
returns boolean language plpgsql as $test$
declare
  v_old_body_was_rejected boolean := false;
begin
  begin
    execute $ddl$create or replace function public.validate_quest_name_edit()
      returns trigger language plpgsql security definer set search_path = ''
      as $body$begin return new; end;$body$$ddl$;
    select pg_get_functiondef(p.oid) ilike '%80 characters or fewer%'
      into v_old_body_was_rejected
      from pg_proc p where p.oid = to_regprocedure('public.validate_quest_name_edit()');
    v_old_body_was_rejected := not coalesce(v_old_body_was_rejected, false);
    raise exception using errcode = 'P0001', message = 'rollback temporary marker mutation';
  exception when sqlstate 'P0001' then
    null;
  end;
  return v_old_body_was_rejected;
end
$test$;

-- SELECT emits the TAP result. PERFORM inside DO counts an assertion while
-- discarding its output, leaving the runner with an incomplete test plan.
select ok(pg_temp.weaker_name_body_is_rejected(),
  'a weaker replacement body fails the migration 031 catalog capability marker');
select ok(pg_get_functiondef(to_regprocedure('public.validate_quest_name_edit()'))
    ilike '%80 characters or fewer%',
  'the latest validator body is restored after the rollback-only marker probe');

with checks(marker, ok) as (
  select '032 long quest rewards: server-owned ledger and stage trigger',
    to_regclass('public.long_quest_rewards') is not null
    and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.long_quest_stages')
      and tgname = 'award_long_quest_stage' and not tgisinternal)
    and not has_table_privilege('authenticated',to_regclass('public.long_quest_rewards'),'INSERT')
    and not has_function_privilege('authenticated',to_regprocedure('private.award_long_quest_stage()'),'EXECUTE')
  union all select '033 gym: owned snapshots and authenticated atomic session RPCs',
    to_regclass('public.gym_routines') is not null
    and to_regclass('public.gym_exercises') is not null
    and to_regclass('public.gym_sessions') is not null
    and to_regclass('public.gym_entries') is not null
    and (select bool_and(c.relrowsecurity) from pg_class c where c.oid = any(array[to_regclass('public.gym_routines'),to_regclass('public.gym_exercises'),to_regclass('public.gym_sessions'),to_regclass('public.gym_entries')]))
    and not has_table_privilege('authenticated',to_regclass('public.gym_entries'),'UPDATE')
    and has_function_privilege('authenticated',to_regprocedure('public.start_gym_session(uuid)'),'EXECUTE')
    and not has_function_privilege('anon',to_regprocedure('public.start_gym_session(uuid)'),'EXECUTE')
    and has_function_privilege('authenticated',to_regprocedure('public.reorder_gym_exercises(uuid,uuid[])'),'EXECUTE')
  union all select '034 gym media: private bounded bucket and owner policies',
    exists (select 1 from storage.buckets where id = 'gym-exercise-media'
      and not public and file_size_limit = 20971520
      and allowed_mime_types @> array['image/gif','video/mp4'])
    and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'gym_media_read')
  union all select '035 gym: protected tombstones, cleanup and historical previous weights',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='gym_exercises' and column_name='rir_max')
    and not has_column_privilege('authenticated','public.gym_routines','deleted_at','UPDATE')
    and not has_table_privilege('authenticated','public.gym_exercises','INSERT')
    and not has_table_privilege('authenticated','public.gym_media_cleanup','SELECT')
    and has_function_privilege('authenticated','public.delete_gym_routine(uuid,boolean)','EXECUTE')
    and has_function_privilege('authenticated','public.previous_gym_weights(uuid)','EXECUTE')
    and not has_function_privilege('anon','public.save_gym_exercise(uuid,jsonb)','EXECUTE')
  union all select '036 rewards: private owner receipts and no client stats writes',
    to_regclass('private.long_quest_reward_receipts') is not null
    and (select relrowsecurity from pg_class where oid = to_regclass('private.long_quest_reward_receipts'))
    and not has_table_privilege('authenticated','private.long_quest_reward_receipts','SELECT')
    and not has_table_privilege('authenticated','public.stats','UPDATE')
    and has_function_privilege('authenticated','public.set_long_quest_stage_done_receipt(uuid,boolean,uuid)','EXECUTE')
    and not has_function_privilege('anon','public.set_long_quest_stage_done_receipt(uuid,boolean,uuid)','EXECUTE')
  union all select '037 quests: atomic definition saves and private reconciliation receipts',
    to_regclass('private.long_quest_definition_receipts') is not null
    and (select relrowsecurity from pg_class where oid = to_regclass('private.long_quest_definition_receipts'))
    and not has_table_privilege('authenticated','private.long_quest_definition_receipts','SELECT')
    and has_function_privilege('authenticated','public.save_long_quest_definition(uuid,uuid,jsonb,boolean)','EXECUTE')
    and not has_function_privilege('anon','public.save_long_quest_definition(uuid,uuid,jsonb,boolean)','EXECUTE')
)
select ok(ok, marker) from checks;

-- Migration 038: Backlog quests, genre, optional time and the server-owned moves.
select ok(coalesce(exists (select 1 from pg_constraint where conrelid = 'public.habits'::regclass
      and conname = 'habits_quest_type_check' and pg_get_constraintdef(oid) ilike '%backlog%')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'habits' and column_name = 'genre')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'habits' and column_name = 'time_set')
    and exists (select 1 from pg_constraint where conrelid = 'public.habits'::regclass
      and conname = 'habits_backlog_shape' and coalesce(pg_get_constraintdef(oid) ilike '%easy_version IS NULL%', false)
      and coalesce(pg_get_constraintdef(oid) ilike '%time_set%', false))
    and coalesce((select pg_get_functiondef(p.oid) ilike '%backlog%'
      from pg_proc p where p.oid = to_regprocedure('public.archive_habit(uuid)')), false)
    and to_regclass('private.backlog_rollover_settings') is not null
    and has_function_privilege('authenticated', to_regprocedure('public.move_backlog_to_one_time(uuid)'), 'EXECUTE')
    and has_function_privilege('authenticated', to_regprocedure('public.move_one_time_to_backlog(uuid)'), 'EXECUTE')
    and has_function_privilege('authenticated', to_regprocedure('public.rollover_unfinished_one_time_quests()'), 'EXECUTE')
    and not has_function_privilege('anon', to_regprocedure('public.move_backlog_to_one_time(uuid)'), 'EXECUTE')
    and coalesce((select pg_get_functiondef(p.oid) ilike '%rollover_unfinished_one_time_quests%'
      from pg_proc p where p.oid = to_regprocedure('public.get_habits_for_date(date)')), false), false),
  '038 Backlog quests, genre, optional time and server-owned moves are in place');

-- Migration 039: Gym quick-log weights and the two newest weights per exercise.
select ok(coalesce(
    has_function_privilege('authenticated', to_regprocedure('public.log_gym_weight(uuid,uuid,numeric)'), 'EXECUTE')
    and not has_function_privilege('anon', to_regprocedure('public.log_gym_weight(uuid,uuid,numeric)'), 'EXECUTE')
    and has_function_privilege('authenticated', to_regprocedure('public.recent_gym_weights(uuid)'), 'EXECUTE')
    and not has_function_privilege('anon', to_regprocedure('public.recent_gym_weights(uuid)'), 'EXECUTE'), false),
  '039 Gym quick-log weights and recent weights are in place');

select * from finish();
rollback;
