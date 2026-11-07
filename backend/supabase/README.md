# Supabase migrations

**047–064 are the S02/S03 release; 065 is the follow-up that opens the tracker (see below).** Apply them to the live project only through the release procedure in `../../docs/plans/2026-11-07-s03-release-runbook.md` (step D1: a precheck that the target is the 046 base, 047–052 one by one, 053–056 as one transaction, 057–064 one by one, then pg_cron, the two schedules and opening AI admission). That procedure was rehearsed on a restored copy of the live database on 2026-11-07: 001–046 matched committed SQL (marker query 46/46) and 047–064 applied cleanly. Turn on the `before_user_created` hook only after 063 exists, or every sign-up fails. The "local only" and "not approved for deployment" notes below record each migration's state when it was written.
S01 investigation is COMPLETE under `../../docs/handoff/027-handoff.md`;
S02 and public release remain INCOMPLETE. See that handoff and
`../../docs/plans/2026-10-20-s02-continuation.md` for current contracts and
rollout prerequisites. The deployed baseline remains 001–046. Historical clean
seed verification covered 047–048; 049 has local application, transactional
reapplication and regression evidence, not a fresh clean-stack seed claim.
No production rollout was performed. The new
`mailbox-verification` Edge Function is also local only. Its typed-code flow
requires a suitable SMTP service and an approved Magic Link template containing
`{{ .Token }}` before release; this work changed only a disposable local template.

The shipped baseline requires **001–046** in filename order. The local seed
workflow's canonical globs include drafts through052.051–052 have retained-local application and rollback reconstruction evidence, not a fresh full-stack seed claim. The warning above governs deployment.

The approved tracker-consent work follows052 in canonical order053–056. While
implementation is incomplete,053 is tested only inside rollback transactions;
do not apply a partial prefix. Only the complete053–056 bundle may be applied
atomically to the guarded retained local stack after backend single-session
checks pass. Cross-session acceptance follows that local commit. This does not
authorize hosted application or activation. See
`../../docs/plans/2026-10-23-s02-tracker-consent-implementation.md`.
057 follows 056 in canonical order: a local-only plpgsql_check lint follow-up to 054 (STABLE argument validator, explicit casts). Not approved for deployment.

058 follows 057: independent-review fixes (an ID with retained history cannot be reused as a new root; media attachments bound to owner, routine and current tracker tuple; no client TRUNCATE on tracker tables). 059 follows 058: owner decision 14, days inside a custom-tracker pause are not scheduled for protected roots, so a regrant does not record them as missed. Both local-only; not approved for deployment.

060 follows 059: operator accounts (added by hand, no RPC adds one), the MFA-gated (AAL2) teen review queue and dispute pause, with a content-free audit; it also wraps the export manifest. 061 follows 060: automated 30-day retention after full withdrawal of custom-tracker or fitness permission (day-23 reminder, runbook-scope removal by `private.run_tracker_retention`), plus the operator retention list. Both local-only; not approved for deployment. pg_cron is scheduled on the local stack only and is not enabled on the live project; enabling it is a release step.

062 follows 061: fixes from the admin console and retention review. A review request records the age version it was made under and cannot be approved after a birthday correction; one failing account no longer stops the retention job and shows as `failed` in the console; removal always comes at least 30 full days after withdrawal; a missed reminder is sent before any removal; `operator_resume_purpose` lifts a pause without granting anything. It also wraps the export manifest.

063 is S03 groundwork (needs 048): a `BEFORE INSERT` trigger on `auth.identities` that refuses a Google identity (SQLSTATE `EG001`) unless the account holds the mailbox proof or is on the create path (no identity rows yet and `raw_app_meta_data.provider = 'google'`). An `AFTER INSERT OR UPDATE` trigger then grants the mailbox proof when Google reports the email verified and it matches the account's current email. It also replaces the 050 consent trigger so a Google-created account (`raw_app_meta_data.provider = 'google'`, never user metadata) may start with no age consent, and adds `public.s03_before_user_created`, a hook that rejects an unverified Google email on sign-up (not enabled in config yet). Local only: a trigger on `auth.identities` has not been tried on a hosted project, and if hosted refuses it, Google must not be enabled there.

064 is S03 groundwork (needs 047, 050 and 063): `public.finish_google_signup` saves the birthday-notice permission and the birthday in one transaction, so the Google finish screen can never leave an account with permission but no birthday. It calls the existing `set_processing_consent` and `set_account_birthday`, so their checks all still apply. Once a birthday is saved it accepts only the same date (a retry); a different one is refused with SQLSTATE `EG002`, so corrections still go through Profile. Local only.

065 is S03b phase 0, the "open tracker" (needs 053-064): custom quests, chains and Gym follow the basic write rule, so `private.tracker_processing_access` reports `canWriteCustom` and `canWriteFitness` equal to `canWriteBasic` and only the under-12 pause (049) still stops writes. It exists because every quest from before 053 has no provenance row and so counted as custom, which blocked people with existing quests until they saved a birthday and a permission. `private.custom_purpose_paused_on` (059) now pauses a day only between go-live and the unblock, and only for someone with no custom grant in force that day, so nobody gets a miss or a broken streak for days they could not complete; older gaps keep their pre-S02 behaviour. The go-live moment cannot be read from the database, so the operator passes it: run the file in a session that first did `set eiyu.go_live_at = '<timestamptz>';`. An empty database needs nothing; a database with users and no value makes the migration stop rather than guess. The unblock is recorded as the moment the file runs, in the one-row `private.tracker_open_settings`. Retention (061/062) is switched off: the withdrawal trigger is dropped, `private.run_tracker_retention` does nothing, and pending removals are cancelled (removals already done stay recorded). Unschedule the `tracker-retention` pg_cron job in the same step (`select cron.unschedule('tracker-retention');`). The settings table is listed in the export manifest as operational. Marker: `select to_regclass('private.tracker_open_settings') is not null and not exists(select 1 from pg_trigger where tgname='track_tracker_retention' and not tgisinternal);` should be true. Test with `supabase/tests/052_open_tracker.test.sql`; the older tests 019, 038-040, 042, 046-049 were rewritten to the new rule.

051 adds default-closed AI admission and separate execution accounting. Legacy
generation RPCs deny even after reopening; refunds do not settle executions.
Detailed execution metadata has a seven-day deletion target; account-unlinked
aggregate uncertainty survives expiry or account removal. Maintenance freshness
and overdue backlog fail closed. No schedule is installed by this migration,
and outages prevent an unconditional erasure guarantee. See
`../../docs/plans/2026-10-22-s02-request-drain-verification.md` for exact local
evidence and open scheduler, bootstrap, hosted parity and review gates.

052 adds service-only read-only owner export snapshot/fresh-check functions with
current account/session/mailbox proof, an explicit40-table/48-FK manifest,
security-field omissions, lossless bigint identifiers,10,000-record/5MiB bounds
and refusal when media needs assisted handling. The separate account-export
Edge source and existing Account/Profile controls are local only. No function
serving copy or deployment is included. Retain JWT checks for any future
separately authorized activation. Local37-file/1250-assertion SQL and real
Auth/RPC Node HTTP tests passed; browser/native receiving and independent
acceptance remain incomplete. See
`../../docs/plans/2026-10-22-s02-export-receiving-verification.md` before
repeating qualified checks. This is neither an account-deletion API nor a
promise about backups, vendor retention or unreachable client copies.

The export manifest grows with later migrations (056, 060, 061, 062, 065), so the TypeScript contract that `account-export` validates against is generated from `private.owner_export_manifest()`, never edited by hand: `node scripts/owner-export-contract.mjs --write --container <db container>` rewrites `scripts/fixtures/owner-export-manifest.json` and the `OWNER_EXPORT_SECTION_FIELDS` constant, and `--check` (also run by `npm run db:test` and `db:verify`) fails when they drift. Without this the function answers 503 to every download, because its validator rejects a snapshot with sections it does not know. After a migration that changes the manifest, regenerate, run the shared tests, and redeploy `account-export` (it imports the contract).

Paste each file into the **SQL Editor** on your Supabase dashboard and run it,
lowest number first.

> `supabase db push` does *not* pick these up. The CLI reads migrations from
> `supabase/migrations/` at the repo root, which this project doesn't use — its
> schema lives here instead, applied by hand.

## Password recovery — local client work, incomplete rollout

The local web and mobile clients now request an explicit `auth/recovery` callback and expose a password-update screen. They retain the current implicit Auth flow; they do not enable automatic URL session detection or a new login provider. Recovery uses a separate Auth client with persistence and automatic refresh disabled. A different signed-in account denies the operation, and the normal quest session is never replaced with link credentials. Successful recovery does not grant private mailbox proof. Ordinary email-change and Magic Link callbacks are separate remaining checks.

October21 current-source local Dev acceptance passed both live A→B mailbox send/redemption response races and real recovery receiving (different-owner refusal, signed-out cold form, password save and normal sign-in), with zero inference attempts and compared synthetic histories retained. Final phone cleanup restored the preserved historical APK without data clear and direct USB. These are scoped local results, not hosted SMTP, release-origin/build parity, full callback timing, drain or public-release approval. See [qualified acceptance](../../docs/plans/2026-10-21-s02-current-device-acceptance.md). Other S02 gates remain open.

On Android, Expo SDK 54's native-intent hook validates the original variant-specific recovery URL before Router discards its fragment. The credentials pass once through module memory; the route contains only a nonsecret attempt revision. A new link replaces an already-open recovery form, and invalid, missing or consumed handoffs fail closed. No recovery bearer credentials are saved to navigation parameters or persistent storage. This receiving path needs a matching installed build; a unit test or direct Auth API redirect alone does not establish device acceptance.

Before activation, verify and allowlist exact callback URLs for the actual deployed web origin (`<verified-web-origin>/auth/recovery`) and each intended installed variant: `eiyusystem://auth/recovery`, `eiyusystem-preview://auth/recovery`, or `eiyusystem-dev://auth/recovery`. Do not infer a deployed web origin from domain ownership or use broad wildcard redirects. Confirm that the actual Recovery email template retains its Supabase confirmation link and delivers the requested callback, then test expired/consumed links, signed-out and already-signed-in states, password updates, and normal sign-in afterward on the matching clients. A direct Supabase Auth redirect/API test is not physical-device or hosted callback acceptance.

No hosted redirect, SMTP/template, confirmation setting or deployment was changed for this client work. The disposable test project alone has exact loopback-web and Dev callback allowlist entries; it retains eight-digit email OTPs and disabled signup confirmations. S01 investigation is complete; keep S02 and public release INCOMPLETE until the remaining release gates pass.

## Processing permission — local server draft 050

050 follows049 and adds the reviewed weekly-debrief processing contract. It keeps `adultDeclared` an18+ fact while computing separate12+ debrief eligibility with current accepted declaration, age-purpose grant, specific optional AI grant, applicable server-controlled authority and current-mailbox proof. Unknown/pending/under12 accounts remain AI-denied. Declining optional generation permits otherwise authorized saved-summary reads without inference. Teen eligibility in tests uses a synthetic reviewed disposition; real authority applicability and retention remain release gates.

Consent and authority revisions bind request reservation, provider attempts, final output and saved-content provenance. Owner serialization covers withdrawal/revocation and birthday changes. Initial Auth signup captures only the specific current age-purpose boolean grant; editable metadata cannot later grant AI or authority. The initial session can still contain the signup birthday, which the candidate notice discloses. Legacy accounts receive no affirmative backfill. Real local Auth and32 local SQL files/1068 assertions passed at the server checkpoint; this is not hosted deployment or physical acceptance.

Current client source adds separate signup/Profile choices and checks processing capability before the combined read/create helper. Missing capability fails closed for AI; ordinary name/class edits remain available. Specific AI withdrawal has its own control. This does not complete the broader sensitive-tracker consent branch, supported live-font repair, callbacks/build parity, old-client cache/drain mechanisms or actual authority/data-request operating procedures. See the current continuation and release review for exact test qualifications. Do not rerun canonical050 on the retained database or infer its deployment from local tests. Hosted ai-proxy was separately paused at v26; later local core changes require a new exact review before any separately authorized activation.

## Under-12 tracker pause — local server draft 049

049 enforces the adopted existing-under12 write pause using accepted private birthday declarations in the existing Asia/Manila civil timezone. It preserves ordinary history reads and account recovery/correction/data-request boundaries. Unknown legacy birthdays keep existing tracker access; minor/unknown/pending AI denial is unchanged. A valid initial under12 declaration is rejected before Auth/profile creation. This does not replace the missing signup notice/consent or establish universal age assurance for Auth methods without a declaration.

Tracker-table mutation triggers cover quest/workout writes and their RPCs; restrictive Storage policies preserve the existing bucket/owner boundary. Read preparation skips materialization/rollover while paused. Writes lock the same owner row as birthday corrections; privileged operator deletion remains possible. `get_account_age()` now includes `trackerWritesPaused`; old servers may omit it, and absence is not proof of tracker-write permission. The self-scoped `tracker_writes_allowed()` RPC is authenticated-only.

This server boundary is applied only to the retained local test database. The mobile queue source now checks fresh owner-bound pause status, retains held actions for explicit Retry/reconciliation and preserves original dates. Missing old-server pause fields never establish queue-write permission, so compatible rollout/build parity is required. Client notice/disabled controls, signup preflight, complete widget handling, specific consent and conditional guardian authority remain unfinished. No real Auth signup or physical under12 client acceptance is claimed by SQL/queue tests. See `../../docs/plans/2026-10-20-s02-continuation.md` for fresh checks and limitations. Do not replay the whole migration to inspect its state or reset retained fixtures.

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
  union all select '039 gym: quick-log weights and the two newest weights per exercise', coalesce(
    has_function_privilege('authenticated',to_regprocedure('public.log_gym_weight(uuid,uuid,numeric)'),'EXECUTE')
    and not has_function_privilege('anon',to_regprocedure('public.log_gym_weight(uuid,uuid,numeric)'),'EXECUTE')
    and has_function_privilege('authenticated',to_regprocedure('public.recent_gym_weights(uuid)'),'EXECUTE')
    and not has_function_privilege('anon',to_regprocedure('public.recent_gym_weights(uuid)'),'EXECUTE'), false)
  union all select '040 profiles: the account colour palette', coalesce(
    has_function_privilege('authenticated',to_regprocedure('public.set_profile_palette(text)'),'EXECUTE')
    and not has_function_privilege('anon',to_regprocedure('public.set_profile_palette(text)'),'EXECUTE')
    and has_column_privilege('authenticated','public.profiles','palette','UPDATE'), false)
  union all select '041 profiles: the account theme', coalesce(
    has_function_privilege('authenticated',to_regprocedure('public.set_profile_theme(text)'),'EXECUTE')
    and not has_function_privilege('anon',to_regprocedure('public.set_profile_theme(text)'),'EXECUTE')
    and has_column_privilege('authenticated','public.profiles','theme','UPDATE'), false)
  union all select '042 quests: optional one-time date and upcoming quests', coalesce(
    exists (select 1 from pg_constraint where conrelid = 'public.habits'::regclass and conname = 'habits_one_time_time_needs_date')
    and exists (select 1 from pg_trigger where tgrelid = 'public.habits'::regclass and tgname = 'habits_one_time_date_guard' and not tgisinternal)
    and coalesce((select pg_get_functiondef(p.oid) ilike '%is already completed%' from pg_proc p where p.oid = to_regprocedure('public.complete_habit(uuid,date,public.completion_kind)')), false)
    and coalesce((select pg_get_functiondef(p.oid) ilike '%scheduled_date > v_today%' from pg_proc p where p.oid = to_regprocedure('public.get_habits_for_date(date)')), false)
    and not has_function_privilege('authenticated',to_regprocedure('public.guard_one_time_date_change()'),'EXECUTE'), false)
  union all select '043 chains: per-quest order mode', coalesce(
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'long_quests' and column_name = 'strict_order' and is_nullable = 'NO')
    and exists (select 1 from pg_trigger where tgrelid = 'public.long_quests'::regclass and tgname = 'validate_long_quest_order_mode' and not tgisinternal)
    and coalesce((select pg_get_functiondef(p.oid) ilike '%Mark the later done stages not done%' from pg_proc p where p.oid = to_regprocedure('public.save_long_quest_definition(uuid,uuid,jsonb,boolean)')), false)
    and coalesce((select pg_get_functiondef(p.oid) ilike '%coalesce(v_strict_order, true)%' from pg_proc p where p.oid = to_regprocedure('public.guard_long_quest_stage_sequence()')), false)
    and not has_function_privilege('authenticated',to_regprocedure('public.validate_long_quest_order_mode()'),'EXECUTE'), false)
  union all select '044 manual order: positions, top-of-lane triggers, reorder functions', coalesce(
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'habits' and column_name = 'position' and is_nullable = 'NO')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'long_quests' and column_name = 'position' and is_nullable = 'NO')
    and exists (select 1 from pg_trigger where tgrelid = 'public.habits'::regclass and tgname = 'habits_place_on_top' and not tgisinternal)
    and exists (select 1 from pg_trigger where tgrelid = 'public.long_quests'::regclass and tgname = 'long_quests_place_on_top' and not tgisinternal)
    and has_function_privilege('authenticated',to_regprocedure('public.reorder_quests(text,uuid[])'),'EXECUTE')
    and has_function_privilege('authenticated',to_regprocedure('public.reorder_long_quests(uuid[])'),'EXECUTE')
    and not has_function_privilege('anon',to_regprocedure('public.reorder_quests(text,uuid[])'),'EXECUTE')
    and not has_function_privilege('authenticated',to_regprocedure('public.backfill_manual_order(uuid)'),'EXECUTE'), false)
  union all select '045 AI providers: exhaustion ledger, configurable per-user cap', coalesce(
    exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'ai_quota_config' and column_name = 'max_user_requests_per_action')
    and to_regclass('private.ai_provider_exhaustion') is not null
    and has_function_privilege('service_role',to_regprocedure('public.ai_mark_provider_exhausted(uuid,text,text)'),'EXECUTE')
    and not has_function_privilege('authenticated',to_regprocedure('public.ai_mark_provider_exhausted(uuid,text,text)'),'EXECUTE')
    and coalesce((select pg_get_functiondef(p.oid) ilike '%exhaustedProviders%' from pg_proc p where p.oid = coalesce(to_regprocedure('private.ai_begin_request_before_age(uuid,text,uuid,date)'),to_regprocedure('public.ai_begin_request(uuid,text,uuid,date)'))), false), false)
  union all select '046 AI refund: a failed request gives its attempt back', coalesce(
    exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'ai_logical_requests' and column_name = 'refunded_at')
    and has_function_privilege('service_role',to_regprocedure('public.ai_release_request(uuid)'),'EXECUTE')
    and not has_function_privilege('authenticated',to_regprocedure('public.ai_release_request(uuid)'),'EXECUTE')
    and not has_function_privilege('anon',to_regprocedure('public.ai_release_request(uuid)'),'EXECUTE'), false)
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
re-run an old file over a newer definition. This query covers migrations 001–046
alongside their source files and tests.

If the catalog shows an older function signature or body, do not drop or
re-run an applied migration to force it into place. Compare the current
definition with the newest compatible migration and prepare a new forward
migration if the deployed behavior needs correction. In particular, input
parameter-name drift is schema drift to resolve deliberately; dropping an RPC
can break active clients and dependent functions.

After running these, enable email/password auth in **Authentication → Providers** on your Supabase project (enabled by default on new projects). No other dashboard configuration is required — RLS policies are created by these migrations.

## Edge Functions

The current **local, unreleased** `functions/ai-proxy` entrypoint defaults to the strict Groq-only weekly-review route. Client code never receives provider credentials. Missing/invalid routing, keys, quota RPCs or eligibility revisions fail closed. No local implementation authorizes deployment. S01 and S02 remain INCOMPLETE; read their checkpoints before planning activation.

Only `GROQ_API_KEY` is read in the default Groq mode. Gemini implementation is retained for future deliberate code review; the release factory cannot select it through configuration or fallback. AI is denied for unknown/currently declared minor accounts and requires current-mailbox proof for weekly debriefs. Initial and corrected birthday declarations are trusted screening, not independently verified age. Explicit valid owner saves accept the date, clear earlier local pending state and advance the revision; unchanged accepted declarations remain idempotent. Unknown/currently declared minors and unresolved pending rows remain AI-ineligible. Missing/stale birthday revisions cannot reserve further provider attempts or release responses. Privacy/audience reconciliation remains an unmet release gate.

## Plan 011 rollout

Apply 032, 033 and 034 in order after confirming the existing 001–031 capabilities. Deploy the updated clients afterward. No remote migration or release is performed by the implementation. Migration 032 records zero-value exemptions for already completed phases/quests; there is no retroactive XP. New phases award 20 XP each and final completion adds 20 XP. Undo/redo uses the original awarded stat.

033 persists Gym routines, exercises and immutable completed session snapshots. Gym does not award XP. 034 creates the private GIF/MP4 bucket (20 MiB per file); playback uses short-lived signed URLs. Uploaded media cleanup is best effort and failures remain visible to the user.

Run all 19 rollback/cleanup SQL test files in `supabase/tests` on a disposable local stack, including the connection-aware concurrency cases. Do not reset an existing personal database to test this release. Browser acceptance can be repeated with `scripts/verify-board-gym-browser.cjs` against its explicitly isolated local origins.

## Plan 012 Rollout

Verify prerequisites through 034, then apply **035 → 036 → 037** in order, verifying each phase before deploying the web client. Keep 036 immutable after application; atomic definitions are a separate 037 migration. Existing completion and mobile definition interfaces remain supported. 035 removes direct exercise-definition writes in favor of parent-locked RPCs; older web Gym clients must upgrade. Completed sessions are retained behind server-controlled routine tombstones.

Media cleanup uses an owner-only durable manifest. Acknowledge only successful deletion of confirmed unreferenced paths; failed cleanup remains queued. Never delete an upload whose definition save remains uncertain. Migration capability checks do not replace owner/concurrency/Storage acceptance on a confirmed disposable Supabase stack. No production rollout has been performed.

## Colour palette rollout (040)

Apply **040** (`040_profile_palette.sql`) and verify its marker. It is optional for the web client: the client reads the palette in a call that ignores a missing column, and a failed save keeps the choice in the browser, so deploying either side first breaks nothing. Until 040 is applied the palette simply stays per browser. Mobile reads and saves it the same way. Test with `supabase/tests/021_profile_palette.test.sql`.

## Theme rollout (041)

Apply **041** (`041_profile_theme.sql`) and verify its marker. Both clients treat it as optional: a failed save keeps the theme on the device and re-sends it on the next launch, so deploying either side first breaks nothing. Until 041 is applied the theme simply stays per device. Test with `supabase/tests/022_profile_theme.test.sql`.

## AI refund rollout (046)

Apply **046** (`046_ai_refund_failed_request.sql`) after 045 and verify its marker. It adds `private.ai_logical_requests.refunded_at` and `ai_release_request(request)` (service role only), which gives one attempt back to the caller's per-user daily counter (never below 0, and a second refund of the same request does nothing). `ai-proxy` calls it, best effort and on its own 3 s deadline, when a request ends in a busy, exhausted, timed-out or failed state; it never refunds a successful result or a per-user quota-denial 429 (provider 429 is mapped to retry-later 503 and refunded by the current local route), and a failed refund is logged and never changes the response. The project-wide provider-attempt ledger is not refunded (the calls were made). A regeneration charges no per-user bucket, so nothing is given back for it. Either order is safe: a function from before 046 never calls the RPC; one from after it logs a warning if the RPC is missing. Test with `supabase/tests/026_ai_release_request.test.sql`.

**Routing configuration and rollout:** The local strict route requires exactly the approved one-entry shape below. The existing hosted three-provider configuration remains unchanged. Deploying new code alone against that list deliberately disables AI. Coordinate authorized code/configuration activation after evidence/release checks. Never paste credentials or secret configuration values into chat, logs or tracked files.

## AI providers rollout (045)

Apply **045** (`045_ai_providers.sql`) after 044 and verify its marker; compare the live `ai_begin_request` with 030 first (the file header says what was compared). It moves the per-user daily AI cap (2 per action) into `private.ai_quota_config.max_user_requests_per_action`, adds the private `ai_provider_exhaustion` table, makes `ai_begin_request` also return `exhaustedProviders`, and adds `ai_mark_provider_exhausted(request, provider, time_zone)` (service role only). To raise the cap later: `update private.ai_quota_config set max_user_requests_per_action = 3 where singleton;`. Either order is safe: the new `ai-proxy` treats a missing field or a missing mark RPC as "nothing exhausted", and the old one ignores the extra field. Test with `supabase/tests/013_ai_quota.test.sql`.

**Approved local route shape (configuration example, no credential value):**

```json
[
  {"name":"groq","kind":"openai","baseUrl":"https://api.groq.com/openai/v1","model":"openai/gpt-oss-20b","keyEnv":"GROQ_API_KEY"}
]
```

Only this model/host/key reference is accepted. A trailing slash and optional `resetTimeZone: "UTC"` are accepted; other fields, hosts, models, extra entries and missing/malformed lists are denied before quota. Redirects are refused. Only weekly-summary actions are enabled. Groq 429 returns generic retry-later 503 (bounded Retry-After, default 60 seconds), makes no second call and refunds failed logical quota without refunding actual provider attempts. It does not infer a midnight reset. Transient failures can retry the same Groq provider once; there is no paid or other-provider fallback. Existing database exhaustion marks remain enforced until their stored expiry and need coordinated cutover review. Account Free/ZDR/training/model settings cannot be proven by this code.

**Gemini disabled in the release entry point (local source; not deployed):** `AI_PROVIDER_MODE` accepts only unset or `groq-only`, with the exact Groq singleton above. `gemini-only`, unknown/blank modes, mismatched lists or extra providers fail closed before quota or provider credential lookup. No configuration switch can enable Gemini through this entry point. Gemini and generic fallback implementations remain retained for deliberate future code review, not as an active or selectable release route. Groq 429 stops; transient retry stays on the same Groq provider once. No OpenRouter, other-provider or paid fallback is enabled.

After the owner's explicit October20 authorization, `AI_PROVIDER_MODE=disabled` was applied and only the tested strict ai-proxy replacement deployed. Fresh metadata reports **ACTIVE v26, JWT verification enabled**; mailbox-verification remains absent and other functions are unchanged. All five downloaded runtime files exactly match the tested canonical source. An unauthenticated non-inference POST returned401; no hosted authenticated503 or model request was exercised. Hosted debriefs remain paused; Groq is not enabled, current age/mailbox guards remain, and this cutover did not apply SQL or publish clients. An effective globally drained old-request state must not be inferred from metadata/source parity. See the [cutover and eligibility record](../../docs/plans/2026-10-20-s02-groq-only-eligibility-review.md). S02 remains INCOMPLETE.

Removing the blanket adult-only debrief rule was requested for review alongside Gemini exclusion. It has not been implemented or established as permitted for the intended younger users merely by changing provider. Groq's Cloud Services age clause and minor-accessible Customer Application provisions require a recorded applicability assessment; the model's Apache2.0 license is distinct from the hosting agreement. Preserve current age/mailbox controls while that question and the replacement eligibility/consent design are unresolved. This is not a claim that Gemini's app-audience restriction must be retained forever.

SQL 045/046 accounting contracts remain unchanged. SQL 047–049 are local incomplete S02 groundwork, not applied in production. S01 investigation is complete; S02/release remain incomplete. S04 still owns manual Generate/two-total-per-week changes. See `ai-proxy-route_test.ts`, `ai-proxy-policy_test.ts` and `../../docs/plans/2026-10-20-s02-continuation.md` for verification and outstanding release evidence.

## Manual order rollout (044)

Apply **044** (`044_manual_order.sql`) after 043 and verify its marker. It adds `habits.position` and `long_quests.position`, numbers every existing row from today's auto-sort (so nothing moves the day it is applied), puts new quests and any quest that changes lane (menu move, drag, midnight rollover) at the top of its lane through triggers, and adds `reorder_quests(lane, ids)` and `reorder_long_quests(ids)`. Compare the triggers already on `habits` and `long_quests` first (the file header lists the expected ones). It is safe in either deploy order: a client from before 044 ignores the column and auto-sorts, a client from after it hides the reorder controls until positions arrive, but reordering only works once 044 is live. Test with `supabase/tests/025_manual_order.test.sql`.

## Chain order mode rollout (043)

Apply **043** (`043_long_quest_order_mode.sql`) and verify its marker **before** pushing the web app or shipping a mobile build. It adds `long_quests.strict_order` (default true, so every existing chain stays in order) and re-issues `assert_long_quest_stage_sequence`, `guard_long_quest_stage_sequence`, `set_long_quest_stage_done`, `reconcile_long_quest_stages` and `save_long_quest_definition`; compare the deployed bodies with 023 and 037 first. A chain set to any order skips the sequence rules; switching back to in order is refused while the done stages have a gap (the save gives a clear message, and a direct table write is stopped by a deferred trigger). Both clients tolerate the column being absent (the Chain page still loads, every chain reads as in order), but the toggle only takes effect once 043 is live. Test with `supabase/tests/024_long_quest_order_mode.test.sql`.

## One-time optional date rollout (042)

Apply **042** (`042_one_time_optional_date.sql`) after 041 and verify its marker. It re-issues `ensure_habit_occurrences`, `complete_habit`, `undo_habit_completion` and `get_habits_for_date`, so compare the deployed bodies with 025, 022 and 038 first. It first clears the set time on any one-time row that has no date (old rows can carry one), then adds a check that a time needs a date; those rows then show on the board as undated quests. Deploy order: apply 042 before the clients that offer "No date". Until the clients ship, the older web board shows a future-dated quest as "Today" because it does not know about upcoming quests. Test with `supabase/tests/023_one_time_optional_date.test.sql`.

## Gym quick-log rollout (039)

Apply **039** (`039_gym_quick_log.sql`) and verify its marker **before** deploying the web client that logs weights from the exercise. The new client calls `log_gym_weight` and `recent_gym_weights`; deployed ahead of the SQL it would fail on every log. 039 runs in one transaction. It retires the draft workflow in place: a draft holding at least one typed weight becomes a completed session under its own start date (its blank entries are dropped), and a draft with no weights is removed, so nothing the user typed is lost. `start_gym_session`, `save_gym_session` and `discard_gym_session` stay in place for browser tabs still running the previous client; a draft started from such a tab afterwards is not shown by the new client and is converted by re-running only the conversion statement at the top of 039. A log is stored as one completed single-exercise session whose id the client chooses, so retrying a log after an uncertain network failure is a no-op. Verify with `node scripts/verify-gym-quick-log-db.cjs` (PGlite) and the marker query above.

## Backlog rollout (038)

Verify prerequisites through 037, then apply **038** (`038_backlog_genre_optional_time.sql`) before deploying the web client that shows Backlog. 038 runs in one transaction: if the deployed schema has drifted, it rolls back without a partial change. It locates the original `quest_type` check by the column it constrains, not by name. Before applying it, compare the deployed `get_habits_for_date` and `archive_habit` bodies with 022 and 025; 038 re-issues both. The rollover only sweeps One-time quests dated on or after the day after 038 is applied (`private.backlog_rollover_settings.cutover`, the UTC apply date + 1, so accounts ahead of UTC are covered too); quests abandoned earlier stay where they are. Backlog rows hold no date, weekdays, count, penalty or set time; the moves and the rollover store untimed quests at 08:00. Installed mobile builds keep working: Backlog rows never appear in `get_habits_for_date` for today, and `reminder_time` stays NOT NULL. A past day can still show a quest that has since returned to Backlog, because its missed occurrence is kept for History.
