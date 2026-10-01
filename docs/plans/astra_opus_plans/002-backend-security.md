# 002 — Backend security and XP/AI quota integrity

This is a planning document for F-001, F-002, F-003 and F-004 from `maestro-logs/e2e-2026-09-29/FINDINGS.md`. No SQL, application code, dashboard settings, or live data are changed by this plan.

Every implementor uses Luna 6 (`gpt-6-luna`) at extra-high (`xhigh`) effort, as required by the task brief.

## Context and findings

| Finding | Severity | Evidence and status |
|---|---:|---|
| F-001 — signed-in users can write their own stat XP directly | S2 | Confirmed against the live project with both a direct stats PATCH and `increment_stat_xp` RPC call. |
| F-002 — weekly regeneration counters and the AI endpoint have no authoritative per-user cap | S2 | Source-evidenced in the findings. The current SQL and Edge Function source independently confirm the bypass; verify live grants and RPC responses on a disposable project/account before rollout. |
| F-003 — five helper/trigger functions have effective EXECUTE grants for `anon` and `authenticated` | S3 | Catalog/advisor evidence confirms the grants. The five functions are `is_valid_time_zone(text)`, `validate_profile_time_zone()`, `set_habit_schedule_start()`, `record_habit_schedule_version()` and `record_habit_archive_interval()`. Verify each actual REST call before describing it as executable behavior: PostgreSQL trigger-returning functions normally reject a direct call outside a trigger context. |
| F-004 — leaked-password protection is disabled | S3 | Confirmed in the project's Auth advisor. This is a dashboard setting, not a repository migration. |

## Verified root causes

**F-001:** backend/supabase/002_stats.sql:16 adds owner-scoped INSERT and UPDATE policies, while backend/supabase/009_increment_stat_xp_function.sql:5 defines an invoker function and explicitly grants it to `authenticated`. Migration 014 added the `abs(p_delta) <= 20` limit, but its comment says the grant is needed because `complete_habit` is an invoker (backend/supabase/014_server_side_xp.sql:8). That premise is stale: the last definitions in migrations 021 and 022 make completion and undo SECURITY DEFINER (backend/supabase/021_scheduled_habit_eligibility.sql:319, backend/supabase/022_habit_recovery_state_machine.sql:446). The current direct update policies/grants therefore let clients bypass the server-owned XP path, and the direct function grant permits repeated in-range deltas.

**F-002:** backend/supabase/015_weekly_summary_regen.sql:8 adds the two quota fields and a user UPDATE policy. Migration 021 redefines `reserve_weekly_summary_regen` as SECURITY DEFINER and bases its day on the profile timezone (backend/supabase/021_scheduled_habit_eligibility.sql:451), but the client can still directly edit the counter/date fields. The existing client intentionally inserts the first cached paragraph and updates only its `summary` column after successful regeneration (packages/shared/src/data/weekly-summary.ts:39, packages/shared/src/data/weekly-summary.ts:87). backend/supabase/functions/ai-proxy/index.ts:212 authenticates a JWT and dispatches each of three actions, but it does not reserve a per-user quota before calling Gemini. The server must distinguish the one cached first generation from an explicitly reserved regeneration; accepting a caller-supplied “initial” label or arbitrary week would leave a bypass.

**F-003:** the five listed helpers are SECURITY DEFINER in migrations 021 and 025, and none has a user-facing purpose as an RPC. Trigger wiring is in backend/supabase/021_scheduled_habit_eligibility.sql:37, backend/supabase/021_scheduled_habit_eligibility.sql:183, backend/supabase/021_scheduled_habit_eligibility.sql:218, and backend/supabase/025_habit_lifecycle_persistence.sql:123. `is_valid_time_zone` is a regular helper used internally by timezone validation, account timezone RPCs, and signup-trigger code, so removing caller grants must preserve owner-to-owner calls. Supabase documents that functions default to PUBLIC EXECUTE and recommends revoking from PUBLIC and the exposed roles for functions that should not be API endpoints ([Database Functions](https://supabase.com/docs/guides/database/functions)).

**F-004:** the finding is a live Auth configuration state. Supabase exposes leaked-password checks through Auth password-security settings; it is available on Pro and above ([Password security](https://supabase.com/docs/guides/auth/password-security)). No source change can enable it.

## Tests first

Add the tests below before writing either migration. Run them against a prepared disposable local Supabase schema. `npm run db:test` runs the existing schema without resetting it; the repo's `verify` wrapper resets the database and is prohibited for this work.

1. In `supabase/tests/012_backend_security.test.sql`, assert that `anon` and `authenticated` lack INSERT/UPDATE/DELETE on `public.stats`, and that neither role can execute `increment_stat_xp`. Inspect PUBLIC grants through `pg_proc.proacl` plus `aclexplode` (grantee OID 0), not `has_function_privilege('PUBLIC', ...)`, because PUBLIC is a pseudo-role rather than a role name. Under an authenticated JWT claim, assert that direct `UPDATE stats` and a direct in-range `increment_stat_xp` call raise permission errors. Include a negative out-of-range delta case so the prior bound cannot be mistaken for the authorization control.
2. In the same pgTAP file, prove the intended XP path still works: create/complete a due habit awards exactly 20 or 4 XP once, undo removes exactly the awarded amount, and the recovery completion path still awards its normal amount. Include a second user's habit/stat and assert owner-scoped completion remains denied. These are regression checks for the SECURITY DEFINER callers after the helper grant is removed.
3. Assert the five F-003 helper signatures are not executable by `anon` or `authenticated`, and inspect PUBLIC ACL entries with `aclexplode`. Exercise timezone initialization/validation and the profile/habit/archive triggers through their supported operations to prove that revoking direct EXECUTE does not break their internal callers. Add actual REST probes for each name; record the native trigger-context error for trigger-return functions if PostgREST reaches PostgreSQL but cannot invoke them directly.
4. In `supabase/tests/013_ai_quota.test.sql`, assert `weekly_summaries` retains authenticated SELECT, permits INSERT of only `(user_id, week_start, summary)`, permits UPDATE of only `summary`, and denies direct insert/update of `regenerate_count` or `last_regenerated_date`. Verify the allowed client insert/update shape used in `packages/shared/src/data/weekly-summary.ts` succeeds.
5. Test the existing manual regeneration policy at the database boundary: a current-week, owner-bound reservation succeeds twice per account-local date; the third is denied. SQL 030 keeps the existing `reserve_weekly_summary_regen(date) RETURNS integer` contract for old clients, adds a private one-use pending-regeneration record, and rejects arbitrary weeks. The Edge quota check consumes a pending record only for the verified user/current week with a cached summary; a caller-supplied body label cannot classify a request as a regeneration. A first-generation request is allowed only for the current account week while no summary row exists, with at most two logical attempts per account-local day until a successful summary persists. A cached summary cannot be deleted to reset the initial-generation ledger. Foreign/reused pending records and another user's row are denied.
6. Use independent database connections (`dblink`, following the pattern in `supabase/tests/009_habit_lifecycle_concurrency.test.sql`) to race more reservation attempts than the configured cap. Exactly the allowed count may reserve; every other request must be denied. Separately set a low test-only global limit and race provider-attempt reservations to prove the project-wide counter cannot exceed its limit.
7. First run the new tests against the prepared 001–028 disposable schema: the new authorization assertions must fail and quota tests must identify the absent quota contract. After implementing and applying 029/030 to that disposable schema, run `npm.cmd run db:test` again; all existing and new tests must pass without a reset. Record the red and green results. Do not run `npm run db:verify` or `scripts/local-db.ps1 verify`.
8. For F-004, write a manual verification step rather than a fake database test: the dashboard setting is visibly on, and a disposable signup using a known compromised test value is rejected by Auth without recording that value in this public plan or logs. Confirm an ordinary valid disposable signup still works.

## Fix approach and files for a later implementation

### F-001 and F-003 — migration 029

Create `backend/supabase/029_server_owned_xp_and_internal_helpers.sql`. Revoke table DML on `public.stats` from `PUBLIC`, `anon` and `authenticated`; explicitly keep `SELECT` for `authenticated` with the existing `stats_select_own` policy. Drop the now-obsolete `stats_insert_own` and `stats_update_own` policies. Revoke EXECUTE on `public.increment_stat_xp(public.stat_key, integer)` from PUBLIC, `anon` and `authenticated`. Do not change its arithmetic or the server-owned `complete_habit`, `undo_habit_completion`, and recovery functions. Their final SECURITY DEFINER definitions in migrations 021/022 continue to invoke it as the function owner.

In that same migration revoke EXECUTE on exactly the five trigger/helper functions listed above from PUBLIC, `anon` and `authenticated`. Do not revoke from the function owner. Preserve `is_valid_time_zone(text)` as an internal helper because migration 021 uses it from validation/timezone SECURITY DEFINER functions and signup initialization. Do not revoke all functions in `public`: the app intentionally calls other authenticated RPCs.

### F-002 — migration 030 and coordinated Edge/client changes

Create `backend/supabase/030_authoritative_ai_quotas.sql`. Add a non-Data-API `private` schema with server-owned quota and pending-regeneration tables; explicitly revoke schema/table access from PUBLIC, `anon` and `authenticated`. Expose only narrowly-scoped SECURITY DEFINER reservation functions, with `search_path = ''`, explicit schema qualification, authentication checks, fixed action allow-lists and grants limited to the trusted server role used by `ai-proxy`. Verify that the Edge runtime has the standard service-role environment variable before relying on it; never return or log that value. The Edge Function must first validate the caller JWT with the existing user-scoped client, then pass only the verified `user.id` to the server-side quota RPC.

The quota RPC must atomically reserve one **logical user request** per request ID and count provider attempts separately. Recommended logical limits are two requests per account-local day for each suggestion action (`easy-versions`, `stage-breakdown`), exactly two manual `weekly-summary` regenerations per account-local day, and at most two first-generation logical attempts per account-local day while the current-week summary is absent. Once one initial request persists a summary row, further unreserved `weekly-summary` calls are denied; manual regeneration still uses its separate two-per-day reservation. This allows a same-day retry after a failed initial generation without turning a cache miss into a manual regeneration. Do not trust a caller-supplied initial/regen label or week. Derive account date/week from the stored profile timezone, falling back to UTC only where the existing schema does, and reject a caller-supplied week that is not the current account week.

Redefine `reserve_weekly_summary_regen(date)` in SQL 030 with the same integer return type, preserving its current client signature. In the same transaction it validates that the requested Monday is the current week in the stored account timezone, updates the existing two-per-day counter and creates a private one-use pending-regeneration record bound to `auth.uid()`, the account-local date and week. The server-only Edge quota check consumes one pending record to classify a summary call as a regeneration, but only when the current-week cached summary exists. Without a pending record, the Edge may classify a request as the first-generation path only while the summary row is absent and the per-day initial-request cap permits it. A caller cannot choose its own initial/regeneration class, user ID, date or week. Reused, stale, cross-user or wrong-week pending records fail before Gemini is called. Deny authenticated DELETE on `weekly_summaries` so users cannot erase the cache to reset the initial-generation path. Failed regeneration never overwrites the last good summary.

Use two server-only operations: begin-request atomically records the logical request, consumes any pending regeneration authorization and reserves the **first** provider-attempt slot in one transaction; reserve-next-attempt reserves each subsequent retry/fallback slot against that request. Logical requests are idempotent on an Edge-generated request ID and update the user's account-local daily action bucket once. Each `(request_id, attempt_number)` must be unique so an RPC transport retry cannot double-charge a slot. Use a private UTC-date project counter with a recommended initial ceiling of **100 provider attempts/day**, shared across users/actions. Count each logical action once per user but each outbound fetch once globally. Fail closed if either operation errors; the Edge must never fetch without a confirmed slot. Do not refund a provider slot on timeout, network ambiguity, upstream error or client disconnect because Google may already have received the call.

Use atomic `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE count < limit RETURNING ...` or equivalent row locks. If the global cap prevents the first fetch, begin-request rolls back its new logical charge and pending-record consumption together; it cannot roll back a separate, previously committed client regeneration reservation. Keep that pending authorization available until its defined expiry, and document that the existing manual reservation counter counts accepted reservations even when later generation fails. Retries within a request reuse that authorization. Keep lock order consistent to avoid deadlocks. Expire old counters/pending rows through a tested scheduled cleanup or bounded retention procedure; specify that mechanism in migration 030 rather than leaving unbounded append-only history.

Tighten `weekly_summaries` grants without breaking its client contract: revoke table-level INSERT/UPDATE/DELETE from PUBLIC, `anon` and `authenticated`; regrant authenticated SELECT; regrant INSERT only on `(user_id, week_start, summary)` and UPDATE only on `summary`. Keep the existing owner RLS policies. This means default counter values are server-owned on the initial insert and `regenerate_count`/`last_regenerated_date` cannot be supplied or patched by PostgREST, while the current initial insert and successful regeneration update remain compatible. The server-owned reservation function updates the counter as its owner. Remove or revoke any superseded client-callable regen RPC that would permit an alternate reservation path.

Update `backend/supabase/functions/ai-proxy/index.ts` to reserve a logical request before generation and reserve every provider attempt through the same request ID. Reject invalid/oversized payloads before charging quota or calling Gemini; never accept a user ID or initial/regeneration classification from the body. Keep existing success shapes and return an explicit, stable quota response (`429` with a short “daily AI limit reached” message) for an exhausted user/project cap. `packages/shared/src/data/weekly-summary.ts` already calls the regen reservation before generation and updates only `summary` after success; preserve that ordering and signature. Column-level grants must preserve its current initial INSERT `(user_id, week_start, summary)` and regeneration UPDATE `{ summary }`, while denying direct counter INSERT/PATCH and DELETE. The last persisted summary stays available after failed regeneration.

Extend `backend/supabase/README.md`'s **Checking what is already applied** query through migrations 029 and 030. Include catalog checks for stats/table and helper-function privileges, and inspect the actual `pg_get_functiondef` body for the new quota/reservation functions (including owner, date/week derivation and atomic cap predicates), not only function existence. Check PUBLIC ACL entries with `aclexplode`; do not pass `PUBLIC` to `has_function_privilege`. This query must coexist with the fuller 001–028 capability markers being added in plan 010.

Add `supabase/tests/012_backend_security.test.sql` and `supabase/tests/013_ai_quota.test.sql`. Root `supabase/tests/` is the repository's test directory; `backend/supabase/tests/` does not exist and is not used by the runner. Wrap PostgreSQL's `has_table_privilege`, `has_column_privilege` and `has_function_privilege` results in pgTAP assertions, and use `throws_ok`/`lives_ok` with isolated fixtures. Inspect PUBLIC via `aclexplode(coalesce(proacl, acldefault('f', proowner)))` and ACL grantee OID 0; do not call privilege functions with `PUBLIC` as a role name. Do not add secrets or persistent evidence.

## Acceptance criteria

- **F-001:** With a disposable authenticated token, PATCHing the caller's own STR row to `xp=5000` and POSTing `increment_stat_xp` with an in-range delta both return permission-denied responses and leave all five XP values unchanged. Normal complete, undo, and recovery actions still award/reverse the expected amounts exactly once; cross-account completion remains denied.
- **F-002:** The caller cannot PATCH the regeneration count/date, insert client-supplied counter values, or delete its summary row. The existing weekly-summary first insert and summary-only update still work. Each suggestion action is capped at two logical requests per account-local day; an initial weekly summary is allowed only while the current-week row is absent and is capped at two logical attempts/day until one succeeds; manual regen remains exactly two/day, tracked separately by two private pending records. A pending record cannot be reused, replayed for another week/user, or supplied as a client-selected label. Under races the user caps hold; across all accounts provider attempts stop at the configured UTC-day ceiling, counting every retry/fallback attempt.
- **F-003:** The five helper signatures report no EXECUTE for `anon`, `authenticated` or PUBLIC. The actual REST tests document that `is_valid_time_zone` is denied and distinguish a permission denial from PostgreSQL's trigger-context rejection for the four trigger-return functions. Internal timezone, profile, schedule and archive trigger behavior remains intact.
- **F-004:** The project dashboard shows leaked-password protection enabled; an Auth signup using the test-only compromised password is rejected, and an ordinary disposable valid signup succeeds. Existing users and the shared test account are not used as the negative fixture.

## Verification commands and REST probes

Run from the repository root against a prepared disposable local DB schema:

```powershell
npm.cmd run db:lint
npm.cmd run db:test
```

Expected: lint exits 0; `db:test` runs the existing and new root `supabase/tests/` files with no failures and does not reset the local database. The test environment must already contain the ordered SQL schema; do not use `npm run db:verify`, `npm run db:reset`, or `scripts/local-db.ps1 verify`.

After the owner applies SQL 029 and 030 in the Supabase SQL Editor, first run the README drift/grant query and confirm every marker is true. Then use a **disposable** user's access token and the project's anon key supplied only through private shell environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `E2E_ACCESS_TOKEN`, `E2E_USER_ID`, `E2E_WEEK_START`). These examples deliberately contain no credentials:

```powershell
$base = $env:SUPABASE_URL.TrimEnd('/')
curl.exe -i -X PATCH "$base/rest/v1/stats?stat=eq.STR" `
  -H "apikey: $env:SUPABASE_ANON_KEY" `
  -H "Authorization: Bearer $env:E2E_ACCESS_TOKEN" `
  -H 'Content-Type: application/json' -H 'Prefer: return=representation' `
  --data '{"xp":5000}'
curl.exe -i -X POST "$base/rest/v1/rpc/increment_stat_xp" `
  -H "apikey: $env:SUPABASE_ANON_KEY" `
  -H "Authorization: Bearer $env:E2E_ACCESS_TOKEN" `
  -H 'Content-Type: application/json' `
  --data '{"p_stat":"INT","p_delta":20}'
```

Expected: both responses are non-2xx permission-denied errors; read back the test user's stats before/after and confirm neither value changed. `complete_habit`, undo and recovery RPCs for that fixture must continue to work. Do not repeat the attack probes against a personal account.

Run the existing complete/undo and rapid-tap Maestro regressions individually with the same disposable fixture:

```powershell
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/board_toggle_complete_and_easy.yaml
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/board_rapid_double_tap_edge_case.yaml
```

Expected: complete reaches 1/1, undo returns to 0/1, and rapid taps settle to one persisted final state with the corresponding XP applied once or reversed once. After the prepared recovery account `e2e0929r1@eiyu.test` crosses midnight Asia/Manila, run its pending recovery check once:

```powershell
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/e2e/A13_recovery_check.yaml
```

Expected: `RECOVERY REQUIRED` / `STREAK FROZEN` for the prepared fixture. If its date/account state has moved, record the actual result instead of claiming the original pending check passed.

For F-002, on the same disposable fixture, first read its current-week summary and record only whether the row exists. Probe counter modification and the existing integer-returning regeneration RPC:

```powershell
$weekQuery = "user_id=eq.$($env:E2E_USER_ID)&week_start=eq.$($env:E2E_WEEK_START)"
$counterPatch = '{"regenerate_count":0,"last_regenerated_date":null}'
curl.exe -i -X PATCH "$base/rest/v1/weekly_summaries?$weekQuery" `
  -H "apikey: $env:SUPABASE_ANON_KEY" -H "Authorization: Bearer $env:E2E_ACCESS_TOKEN" `
  -H 'Content-Type: application/json' -H 'Prefer: return=representation' --data $counterPatch
$counterInsert = @{ user_id = $env:E2E_USER_ID; week_start = $env:E2E_WEEK_START; summary = 'quota probe'; regenerate_count = 0; last_regenerated_date = $null } | ConvertTo-Json -Compress
curl.exe -i -X POST "$base/rest/v1/weekly_summaries" `
  -H "apikey: $env:SUPABASE_ANON_KEY" -H "Authorization: Bearer $env:E2E_ACCESS_TOKEN" `
  -H 'Content-Type: application/json' --data $counterInsert
$regenBody = @{ p_week_start = $env:E2E_WEEK_START } | ConvertTo-Json -Compress
1..3 | ForEach-Object {
  curl.exe -i -X POST "$base/rest/v1/rpc/reserve_weekly_summary_regen" `
    -H "apikey: $env:SUPABASE_ANON_KEY" -H "Authorization: Bearer $env:E2E_ACCESS_TOKEN" `
    -H 'Content-Type: application/json' --data $regenBody
}
```

Expected: the PATCH and counter-bearing INSERT are non-2xx permission-denied responses; read the row after each and confirm count/date are unchanged. The first two reservation calls return success; the third returns a quota error. The public RPC continues returning its existing integer shape. Its private pending-regeneration records are single-use and bound to the verified owner/current account week. An arbitrary week is denied. An INSERT limited to `user_id`, the current `week_start` and `summary`, and an UPDATE of `summary` only, remain permitted for the owner. Do not invoke the Edge Function from a personal account.

Probe the F-003 names through the anon REST role using the anon key only (no bearer token). Keep this in the disposable project because `is_valid_time_zone` is a helper, not a data-writing API:

```powershell
$helperProbes = @(
  @{ name = 'is_valid_time_zone'; body = '{"p_time_zone":"UTC"}' },
  @{ name = 'validate_profile_time_zone'; body = '{}' },
  @{ name = 'set_habit_schedule_start'; body = '{}' },
  @{ name = 'record_habit_schedule_version'; body = '{}' },
  @{ name = 'record_habit_archive_interval'; body = '{}' }
)
foreach ($probe in $helperProbes) {
  curl.exe -i -X POST "$base/rest/v1/rpc/$($probe.name)" `
    -H "apikey: $env:SUPABASE_ANON_KEY" -H 'Content-Type: application/json' --data $probe.body
}
```

Expected: `is_valid_time_zone` is denied. Trigger-returning functions may be omitted from PostgREST's API schema, denied by EXECUTE, or report PostgreSQL's trigger-context error; no helper can be used as a signed-out behavior endpoint or mutate data. Note the exact result for each instead of calling all five “exploitable” from ACL evidence alone.

Exercise all three Edge actions with a disposable account. A test-only/mock upstream should prove a third `easy-versions` call or third `stage-breakdown` call is rejected before any Gemini request; weekly summary should allow one initial cache miss and two separate manual reservations that day, then reject another regeneration. Repeat in parallel on an isolated local database and observe exactly the configured number of successful reservations. For the project ceiling, configure a small test-only value and confirm the next provider-attempt reservation is rejected; restore the migration's recommended 100/day value before deployment.

No live command in this plan deploys an Edge Function or applies a migration. The exact deploy command belongs to plan 003 and must run with `backend/` as the CLI project directory because the function source is `backend/supabase/functions/ai-proxy`.

## Risks and rollout order

1. Prepare and run test-first changes locally: SQL 029 security tests, SQL 030 quota/grant tests, and the Edge quota gate. Inspect each diff and the expanded migration-body drift query.
2. On a disposable project, deploy the Edge guard in fail-closed mode **before** SQL 030; a missing quota RPC must return 503 without any Gemini fetch. This temporarily pauses AI on old clients, but closes the uncapped spend window.
3. Apply SQL 029 then SQL 030 in the SQL Editor; never use `supabase db push` for these canonical files. Run the grant and body markers immediately after each migration. SQL 030 preserves the existing integer-returning regen RPC and summary insert/update contract, so no client token rollout is required.
4. After SQL 030 is active, verify read, insert-summary and update-summary behavior, all denial probes, race tests and cross-account isolation. Confirm the prior good weekly paragraph remains present when regeneration fails. Then proceed to plan 003's bounded retry release.
5. Enable leaked-password protection in the dashboard as a separate Auth action; see the user-side checklist below. The feature requires a supported plan tier.

Main risks: revoking table-level summary INSERT/UPDATE without regranting the exact client columns would break initial summary creation or regeneration persistence; revoking `increment_stat_xp` can regress completion if a last-definition security-invoker function is introduced later; an incorrectly classified weekly call can spend regeneration allowance on a first generation; exposing the quota table/RPC would re-open the bypass; overly low project limits can deny AI use for legitimate users. RLS continues to scope reads/updates, while grants decide which columns are writable. User quotas count logical requests; the shared project ceiling counts every external attempt and cannot undo a provider call that may already have arrived.

## Needs you (user-side actions)

- Apply the reviewed SQL 029 and SQL 030 files manually in Supabase SQL Editor, in order, after confirming the read-only markers match the live schema. Do not ask an implementor to apply them.
- Review the recommended quota values (2/day for each suggestion action, 2/day for weekly regenerations, up to 2 initial-generation attempts/day until the current-week summary persists, and a 100-provider-attempt UTC-day project ceiling) against expected users and acceptable Gemini spend before applying SQL 030.
- After SQL 030, run the disposable-account REST probes above and verify the row values were unchanged. Keep the credentials private and never paste them into plans, logs or chat.
- In Supabase Auth settings, enable leaked-password protection and verify it with a disposable signup. The official guide says the feature is available on Pro and above; if unavailable on the current tier, choose whether to upgrade or record F-004 as blocked.
- Deploy the compatible fail-closed Edge guard before SQL 030; expect temporary AI unavailability until the quota RPC exists. After SQL 029/030 and the quota/summary persistence checks pass, deploy plan 003's retry/fallback version and any compatible client changes. The implementor prepares source/tests only; you own live SQL, Auth dashboard and both deployment stages.
