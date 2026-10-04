# Supabase migrations

Run **every** `.sql` file in this folder, in filename order — that is what the
`NNN_` prefixes are for. All of them are required: the app as it ships touches
each one, so skipping any leaves a feature broken at runtime.

Paste each file into the **SQL Editor** on your Supabase dashboard and run it,
lowest number first.

> `supabase db push` does *not* pick these up. The CLI reads migrations from
> `supabase/migrations/` at the repo root, which this project doesn't use — its
> schema lives here instead, applied by hand.

## Checking what is already applied

Re-running a file is the wrong way to find out whether it ran: `create or
replace` files (012, 013) always succeed and tell you nothing, and a file with
plain DDL aborts on its first statement without reporting on the rest.

Run this read-only query in the SQL Editor. Every returned marker should be
`true`. A marker checks the resulting capability, not whether a particular
historical file was executed; later migrations may replace the original
implementation while preserving its behavior.

```sql
with checks(marker, ok) as (
  select '001 profiles: owner-scoped RLS', coalesce(
    (select c.relrowsecurity and exists (
       select 1 from pg_policies p where p.schemaname = 'public'
         and p.tablename = 'profiles' and p.policyname = 'profiles_select_own'
         and p.cmd = 'SELECT')
     from pg_class c where c.oid = to_regclass('public.profiles')), false)
  union all select '002 stats: owner-scoped reads', coalesce(
    (select c.relrowsecurity and exists (
       select 1 from pg_policies p where p.schemaname = 'public'
         and p.tablename = 'stats' and p.policyname = 'stats_select_own'
         and p.cmd = 'SELECT')
     from pg_class c where c.oid = to_regclass('public.stats')), false)
  union all select '003 habits: owner-scoped RLS', coalesce(
    (select c.relrowsecurity and exists (
       select 1 from pg_policies p where p.schemaname = 'public'
         and p.tablename = 'habits' and p.policyname = 'habits_select_own'
         and p.cmd = 'SELECT')
     from pg_class c where c.oid = to_regclass('public.habits')), false)
  union all select '004 completion ledger: unique habit/date and RLS', coalesce(
    (select c.relrowsecurity and exists (
       select 1 from pg_constraint k where k.conrelid = c.oid
         and k.contype = 'u' and pg_get_constraintdef(k.oid) ilike '%habit_id%completed_on%')
     from pg_class c where c.oid = to_regclass('public.habit_completions')), false)
  union all select '005 streaks: owner-scoped RLS', coalesce(
    (select c.relrowsecurity and exists (
       select 1 from pg_policies p where p.schemaname = 'public'
         and p.tablename = 'streaks' and p.policyname = 'streaks_select_own')
     from pg_class c where c.oid = to_regclass('public.streaks')), false)
  union all select '006 Long Quests and stages: RLS',
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.long_quests')), false)
    and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.long_quest_stages')), false)
  union all select '007 weekly quests: user/week uniqueness and RLS', coalesce(
    (select c.relrowsecurity and exists (
       select 1 from pg_constraint k where k.conrelid = c.oid
         and k.contype = 'u' and pg_get_constraintdef(k.oid) ilike '%user_id%week_start%')
     from pg_class c where c.oid = to_regclass('public.weekly_quests')), false)
  union all select '008 signup: profile/stat trigger and handler',
    exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('auth.users')
      and t.tgname = 'on_auth_user_created' and not t.tgisinternal)
    and coalesce((select pg_get_functiondef(p.oid) ilike '%insert into public.profiles%'
        and pg_get_functiondef(p.oid) ilike '%insert into public.stats%'
      from pg_proc p where p.oid = to_regprocedure('public.handle_new_user()')), false)
  union all select '009 XP helper: bounded server award', coalesce(
    (select pg_get_functiondef(p.oid) ilike '%abs(p_delta) > 20%'
       from pg_proc p where p.oid = to_regprocedure('public.increment_stat_xp(public.stat_key,integer)')), false)
  union all select '010 weekly summaries: owner read/initial insert policies', coalesce(
    (select c.relrowsecurity
       and exists (select 1 from pg_policies p where p.schemaname = 'public'
         and p.tablename = 'weekly_summaries' and p.policyname = 'weekly_summaries_select_own')
       and exists (select 1 from pg_policies p where p.schemaname = 'public'
         and p.tablename = 'weekly_summaries' and p.policyname = 'weekly_summaries_insert_own')
     from pg_class c where c.oid = to_regclass('public.weekly_summaries')), false)
  union all select '011 quest types: columns, nullable easy version, constraint and current one-time index',
    exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'habits' and column_name = 'quest_type')
    and exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'habits' and column_name = 'description')
    and coalesce((select is_nullable = 'YES' from information_schema.columns
      where table_schema = 'public' and table_name = 'habits' and column_name = 'easy_version'), false)
    and coalesce((select pg_get_constraintdef(oid) ilike '%one_time%'
      from pg_constraint where conrelid = to_regclass('public.habits')
        and conname = 'habits_easy_version_present'), false)
    and to_regclass('public.habits_one_time_scheduled_idx') is not null
  union all select '012 complete_habit: current server-owned completion RPC', coalesce(
    (select p.prosecdef and pg_get_functiondef(p.oid) ilike '%v_xp := case p_kind%'
       from pg_proc p where p.oid = to_regprocedure('public.complete_habit(uuid,date,public.completion_kind)')), false)
  union all select '013 undo: atomic delete-returning XP reversal', coalesce(
    (select pg_get_functiondef(p.oid) ilike '%returning xp_awarded into%'
       from pg_proc p where p.oid = to_regprocedure('public.undo_habit_completion(uuid,date)')), false)
  union all select '014 server XP: caller-supplied award signature removed',
    to_regprocedure('public.complete_habit(uuid,date,public.completion_kind)') is not null
    and to_regprocedure('public.complete_habit(uuid,date,public.completion_kind,integer)') is null
  union all select '015 weekly quota: counters and integer reservation contract',
    exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'weekly_summaries' and column_name = 'regenerate_count')
    and exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'weekly_summaries' and column_name = 'last_regenerated_date')
    and coalesce((select p.prorettype = 'integer'::regtype
       from pg_proc p where p.oid = to_regprocedure('public.reserve_weekly_summary_regen(date)')), false)
  union all select '016 Long Quest descriptions: both tables',
    exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'long_quests' and column_name = 'description')
    and exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'long_quest_stages' and column_name = 'description')
  union all select '017 stage reconciliation: owner-bound JSON edit path', coalesce(
    (select pg_get_functiondef(p.oid) ilike '%jsonb_array_elements(p_stages)%'
        and pg_get_functiondef(p.oid) ilike '%user_id = auth.uid()%'
       from pg_proc p where p.oid = to_regprocedure('public.reconcile_long_quest_stages(uuid,jsonb)')), false)
  union all select '018 scheduled date: current-date reader uses one-time date',
    exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'habits' and column_name = 'scheduled_date')
    and coalesce((select pg_get_functiondef(p.oid) ilike '%scheduled_date%'
       from pg_proc p where p.oid = to_regprocedure('public.ensure_habit_occurrences(date)')), false)
  union all select '019 quantity progress: target, row lock and bounded count',
    exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'habits' and column_name = 'target_count')
    and to_regclass('public.habit_progress') is not null
    and coalesce((select pg_get_functiondef(p.oid) ilike '%for update%'
        and pg_get_functiondef(p.oid) ilike '%least(v_target%'
       from pg_proc p where p.oid = to_regprocedure('public.increment_habit_progress(uuid,date,integer)')), false)
  union all select '020 quantity/easy-version exemption: effective check constraint', coalesce(
    (select pg_get_constraintdef(k.oid) ilike '%one_time%'
        and pg_get_constraintdef(k.oid) ilike '%target_count is not null%'
       from pg_constraint k where k.conrelid = to_regclass('public.habits')
         and k.conname = 'habits_easy_version_present'), false)
  union all select '021 timezone/schedule: profile timezone, version and occurrence triggers',
    exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'profiles' and column_name = 'time_zone')
    and to_regclass('public.habit_schedule_versions') is not null
    and to_regclass('public.habit_occurrences') is not null
    and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.habits')
      and tgname = 'habits_record_schedule_version' and not tgisinternal)
    and to_regprocedure('public.initialize_account_time_zone(text)') is not null
  union all select '022 recovery state machine: owner recovery RPC and definer completion',
    to_regclass('public.habit_recovery_windows') is not null
    and coalesce((select p.prosecdef from pg_proc p
       where p.oid = to_regprocedure('public.complete_habit_recovery(uuid)')), false)
    and coalesce((select pg_get_functiondef(p.oid) ilike '%auth.uid()%'
        and pg_get_functiondef(p.oid) ilike '%user_id = v_user_id%'
        and pg_get_functiondef(p.oid) ilike '%v_window.status = ''recovered''%'
        and pg_get_functiondef(p.oid) ilike '%v_window.status = ''expired''%'
        and pg_get_functiondef(p.oid) ilike '%v_now >= v_window.deadline_at%'
       from pg_proc p where p.oid = to_regprocedure('public.complete_habit_recovery(uuid)')), false)
  union all select '023 Long Quest sequencing: ownership FK, predecessor guard and trigger',
    exists (select 1 from pg_constraint where conrelid = to_regclass('public.long_quest_stages')
      and conname = 'long_quest_stages_quest_owner_fkey')
    and coalesce((select pg_get_functiondef(p.oid) ilike '%complete earlier stages first%'
       from pg_proc p where p.oid = to_regprocedure('public.set_long_quest_stage_done(uuid,boolean)')), false)
    and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.long_quest_stages')
      and tgname = 'guard_long_quest_stage_sequence' and not tgisinternal)
  union all select '024 stage descriptions: 2000-character validator attached',
    coalesce((select pg_get_functiondef(p.oid) ilike '%2000 characters or fewer%'
       from pg_proc p where p.oid = to_regprocedure('public.normalize_long_quest_stage_description()')), false)
    and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.long_quest_stages')
      and tgname = 'normalize_long_quest_stage_description' and not tgisinternal)
  union all select '025 lifecycle persistence: history, archive intervals, triggers and RPCs',
    to_regclass('public.deleted_habit_history') is not null
    and to_regclass('public.habit_archive_intervals') is not null
    and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.habits')
      and tgname = 'habits_record_archive_interval' and not tgisinternal)
    and to_regprocedure('public.archive_habit(uuid)') is not null
    and to_regprocedure('public.restore_habit(uuid)') is not null
    and to_regprocedure('public.delete_habit(uuid)') is not null
  union all select '026 profile editing: changed-field RPC and limited column grants',
    to_regprocedure('public.update_profile(text,text)') is not null
    and coalesce((select count(*) = 3 and bool_and(
        (a.attname in ('display_name', 'user_class')
          and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE'))
        or (a.attname = 'time_zone'
          and not has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')))
      from pg_class c join pg_attribute a on a.attrelid = c.oid
      where c.oid = to_regclass('public.profiles') and a.attnum > 0
        and a.attname in ('display_name', 'user_class', 'time_zone')), false)
  union all select '027 profile compatibility: blocking constraints removed and trigger retained',
    not exists (select 1 from pg_constraint where conrelid = to_regclass('public.profiles')
      and conname in ('profiles_display_name_valid', 'profiles_user_class_valid'))
    and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.profiles')
      and tgname = 'profiles_validate_edit_text' and not tgisinternal)
    and coalesce((select pg_get_functiondef(p.oid) ilike '%chr(65279)%'
       from pg_proc p where p.oid = to_regprocedure('public.trim_profile_text(text)')), false)
  union all select '028 history boundary: half-open owner read, invoker and authenticated-only', coalesce(
    (select not p.prosecdef
        and pg_get_functiondef(p.oid) ilike '%historical_date < p_end_date%'
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE')
       from pg_proc p where p.oid = to_regprocedure('public.read_history_range(date,date)')), false)
  union all select '029 server XP: stats writes and internal helpers are not client-callable',
    coalesce(not has_table_privilege('authenticated', 'public.stats', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.stats', 'INSERT')
      and not has_function_privilege('authenticated', 'public.increment_stat_xp(public.stat_key,integer)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.increment_stat_xp(public.stat_key,integer)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.is_valid_time_zone(text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.validate_profile_time_zone()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.set_habit_schedule_start()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.record_habit_schedule_version()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.record_habit_archive_interval()', 'EXECUTE')
      and has_table_privilege('authenticated', 'public.stats', 'SELECT'), false)
  union all select '030 AI quota: private ledger and service-only reservation RPCs', coalesce(
    (select n.nspname = 'private' and c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.oid = to_regclass('private.ai_logical_requests')), false)
    and to_regclass('private.ai_user_daily_usage') is not null
    and to_regclass('private.ai_provider_daily_usage') is not null
    and to_regclass('private.ai_provider_attempts') is not null
    and coalesce(not has_schema_privilege('authenticated', 'private', 'USAGE')
      and not has_schema_privilege('anon', 'private', 'USAGE')
      and has_function_privilege('service_role', 'public.ai_begin_request(uuid,text,uuid,date)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.ai_reserve_next_attempt(uuid,integer)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.ai_begin_request(uuid,text,uuid,date)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.ai_begin_request(uuid,text,uuid,date)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.ai_reserve_next_attempt(uuid,integer)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.ai_reserve_next_attempt(uuid,integer)', 'EXECUTE'), false)
    and coalesce(has_table_privilege('authenticated', 'public.weekly_summaries', 'SELECT')
      and has_column_privilege('authenticated', 'public.weekly_summaries', 'summary', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.weekly_summaries', 'regenerate_count', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.weekly_summaries', 'last_regenerated_date', 'UPDATE'), false)
  union all select '031 profile and quest names: bounded changed-field validators and triggers',
    to_regprocedure('public.trim_profile_text(text)') is not null
    and coalesce((select pg_get_functiondef(p.oid) ilike '%chr(8203)%'
        and pg_get_functiondef(p.oid) ilike '%chr(8205)%'
        and pg_get_functiondef(p.oid) ilike '%chr(8288)%'
       from pg_proc p where p.oid = to_regprocedure('public.trim_profile_text(text)')), false)
    and coalesce((select pg_get_functiondef(p.oid) ilike '%80 characters or fewer%'
        and pg_get_functiondef(p.oid) ilike '%is distinct from old.display_name%'
       from pg_proc p where p.oid = to_regprocedure('public.validate_profile_edit_text()')), false)
    and coalesce((select not p.prosecdef and pg_get_functiondef(p.oid) ilike '%auth.uid()%'
       from pg_proc p where p.oid = to_regprocedure('public.update_profile(text,text)')), false)
    and coalesce((select pg_get_functiondef(p.oid) ilike '%80 characters or fewer%'
        and pg_get_functiondef(p.oid) ilike '%new.name is distinct from old.name%'
       from pg_proc p where p.oid = to_regprocedure('public.validate_quest_name_edit()')), false)
    and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.habits')
      and tgname = 'habits_validate_name_length' and not tgisinternal)
    and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.long_quests')
      and tgname = 'long_quests_validate_name_length' and not tgisinternal)
  union all select '032 long quest rewards: server-owned ledger and stage trigger',
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
  union all select '038 backlog: quest type, genre, optional time and server-owned moves', coalesce(
    exists (select 1 from pg_constraint where conrelid = 'public.habits'::regclass
      and conname = 'habits_quest_type_check' and pg_get_constraintdef(oid) ilike '%backlog%')
    and exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'habits' and column_name = 'genre')
    and exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'habits' and column_name = 'time_set')
    and exists (select 1 from pg_constraint where conrelid = 'public.habits'::regclass
      and conname = 'habits_backlog_shape' and coalesce(pg_get_constraintdef(oid) ilike '%easy_version IS NULL%', false)
      and coalesce(pg_get_constraintdef(oid) ilike '%time_set%', false))
    and coalesce((select pg_get_functiondef(p.oid) ilike '%backlog%'
      from pg_proc p where p.oid = to_regprocedure('public.archive_habit(uuid)')), false)
    and to_regclass('private.backlog_rollover_settings') is not null
    and has_function_privilege('authenticated',to_regprocedure('public.move_backlog_to_one_time(uuid)'),'EXECUTE')
    and has_function_privilege('authenticated',to_regprocedure('public.move_one_time_to_backlog(uuid)'),'EXECUTE')
    and has_function_privilege('authenticated',to_regprocedure('public.rollover_unfinished_one_time_quests()'),'EXECUTE')
    and not has_function_privilege('anon',to_regprocedure('public.move_backlog_to_one_time(uuid)'),'EXECUTE')
    and coalesce((select pg_get_functiondef(p.oid) ilike '%rollover_unfinished_one_time_quests%'
      from pg_proc p where p.oid = to_regprocedure('public.get_habits_for_date(date)')), false), false)
)
select marker, ok from checks order by marker;
```

The markers deliberately inspect current constraints, trigger attachments,
function signatures/bodies, RLS and effective grants. In particular, the
013 check requires the `DELETE ... RETURNING` form that prevents overlapping
undo calls from both decrementing XP. Markers 029–031 also inspect effective
write grants, private quota-ledger isolation, latest validator bodies, and
both quest-name triggers. A false marker is a cue to inspect the
latest compatible migration and the catalog state; it is not an instruction to
re-run an old file over a newer definition. This query covers migrations 001–038
alongside their source files and tests.

If the catalog shows an older function signature or body, do not drop or
re-run an applied migration to force it into place. Compare the current
definition with the newest compatible migration and prepare a new forward
migration if the deployed behavior needs correction. In particular, input
parameter-name drift is schema drift to resolve deliberately; dropping an RPC
can break active clients and dependent functions.

After running these, enable email/password auth in **Authentication → Providers** on your Supabase project (enabled by default on new projects). No other dashboard configuration is required — RLS policies are created by these migrations.

## Edge Functions

`functions/ai-proxy` is the only place the Gemini API key is read (R-63) — the
client never sees it, and every response it returns is a suggestion the user can
edit or ignore, never auto-saved (R-64). SQL 030 adds the server-owned quota
RPCs; the Edge Function fails closed if those RPCs or the service-role
environment value are missing. Review the matching migration markers before
enabling the function.

Get a free key at https://aistudio.google.com/apikey, then deploy and configure
the function once:

```
supabase functions deploy ai-proxy
supabase secrets set GEMINI_API_KEY=...
```

Run both commands yourself — never paste the API key into chat or a `.env` file.
`supabase secrets set` stores it as an encrypted project secret that only the
deployed function can read at runtime.

## Plan 011 rollout

Apply 032, 033 and 034 in order after confirming the existing 001–031 capabilities. Deploy the updated clients afterward. No remote migration or release is performed by the implementation. Migration 032 records zero-value exemptions for already completed phases/quests; there is no retroactive XP. New phases award 20 XP each and final completion adds 20 XP. Undo/redo uses the original awarded stat.

033 persists Gym routines, exercises and immutable completed session snapshots. Gym does not award XP. 034 creates the private GIF/MP4 bucket (20 MiB per file); playback uses short-lived signed URLs. Uploaded media cleanup is best effort and failures remain visible to the user.

Run all 19 rollback/cleanup SQL test files in `supabase/tests` on a disposable local stack, including the connection-aware concurrency cases. Do not reset an existing personal database to test this release. Browser acceptance can be repeated with `scripts/verify-board-gym-browser.cjs` against its explicitly isolated local origins.

## Plan 012 Rollout

Verify prerequisites through 034, then apply **035 → 036 → 037** in order, verifying each phase before deploying the web client. Keep 036 immutable after application; atomic definitions are a separate 037 migration. Existing completion and mobile definition interfaces remain supported. 035 removes direct exercise-definition writes in favor of parent-locked RPCs; older web Gym clients must upgrade. Completed sessions are retained behind server-controlled routine tombstones.

Media cleanup uses an owner-only durable manifest. Acknowledge only successful deletion of confirmed unreferenced paths; failed cleanup remains queued. Never delete an upload whose definition save remains uncertain. Migration capability checks do not replace owner/concurrency/Storage acceptance on a confirmed disposable Supabase stack. No production rollout has been performed.

## Backlog rollout (038)

Verify prerequisites through 037, then apply **038** (`038_backlog_genre_optional_time.sql`) before deploying the web client that shows Backlog. 038 runs in one transaction: if the deployed schema has drifted, it rolls back without a partial change. It locates the original `quest_type` check by the column it constrains, not by name. Before applying it, compare the deployed `get_habits_for_date` and `archive_habit` bodies with 022 and 025; 038 re-issues both. The rollover only sweeps One-time quests dated on or after the day after 038 is applied (`private.backlog_rollover_settings.cutover`, the UTC apply date + 1, so accounts ahead of UTC are covered too); quests abandoned earlier stay where they are. Backlog rows hold no date, weekdays, count, penalty or set time; the moves and the rollover store untimed quests at 08:00. Installed mobile builds keep working: Backlog rows never appear in `get_habits_for_date` for today, and `reminder_time` stays NOT NULL. A past day can still show a quest that has since returned to Backlog, because its missed occurrence is kept for History.
