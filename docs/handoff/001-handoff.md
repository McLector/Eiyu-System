# 001 — Eiyu System remediation handoff

Prepared 2026-09-30. This document is the continuation brief for another AI. Read it together with the original plans and execution reports. The implementation is present in the uncommitted working tree; runtime and release verification are incomplete. Do not restart the implementation or declare the findings resolved solely from this handoff.

## 1. Objective and authorization

Finish the remaining authorized local implementation and verification for the E2E remediation roadmap. Inspect existing changes, run the missing checks when tooling is available, fix reproduced defects with meaningful failing tests first, and update the execution reports. Prepare concrete owner-side rollout instructions for work that the AI is not authorized to perform.

The original user constraints remain in force:

- Do not commit or push.
- Preserve existing uncommitted Maestro edits as the test baseline, including repaired launch/package selectors and fixture handling. Preserve the other implementation changes and staged evidence removals. Do not reset, clean, stash away, or overwrite the working tree to obtain a clean baseline.
- Do not run `scripts/local-db.ps1 verify`, invoke that script without an explicit action, run `npm.cmd run db:verify`, or reset the existing local database. The script defaults to `verify`, which resets it. Do not use `db:reset` or `supabase db reset` as a shortcut.
- Do not apply migrations to the live project, deploy Edge Functions, change dashboard settings or secrets, or use personal production sessions. These remain owner-side actions even when credentials/tools are available.
- Use disposable accounts and isolated development/test origins. Keep credentials in private environment variables, never in source, reports, command literals, or chat.
- Run Maestro flows individually on a device. Do not launch multiple flows against the same device concurrently.
- Keep raw logs, screenshots, hierarchy dumps, sensitive evidence, and personal notes in ignored paths such as `maestro-logs/`. Tracked reports may contain sanitized command names, outcomes, and unresolved checks, without raw private evidence.
- F-025 and F-029 are verification-first. Change product code only after their specified quiet release checks reproduce the defect.
- F-019 requires actual successful AI outputs and a cache revisit as well as failure tests. A mocked success or readable provider error does not close it.
- The user requested Luna 6 (`gpt-6-luna`) at extra-high (`xhigh`) effort for any sub-agent or implementor. Honor this when selecting an implementation agent. Give any delegated task its exact finding IDs. Follow the execution environment's separate delegation rules.

No commit, push, database migration application, live deployment, dashboard change, secret change, or production session was performed during the recorded work.

## 2. Required reading and source precedence

Before continuing, read:

1. `AGENTS.md` and `CLAUDE.md`.
2. All ten numbered files in `docs/plans/astra_opus_plans/`, starting with `001-roadmap.md`.
3. The complete local `maestro-logs/e2e-2026-09-29/FINDINGS.md`. It contains private local evidence; do not copy it into tracked documents.
4. `backend/supabase/README.md` and `mobile/maestro/README.md`.
5. Every relevant report in `docs/plans/plan_execution_report/`, including `010-evidence-removal-manifest.md`.
6. The exact Expo SDK 54 documentation at https://docs.expo.dev/versions/v54.0.0/ before writing Expo code. For the new audio dependency, also consult https://docs.expo.dev/versions/v54.0.0/sdk/audio/.

Original plans define acceptance criteria; execution reports describe what was actually done. Planning files still contain their original planning-only wording. That wording does not cancel the user's later implementation request. Re-read current source before editing because the plans' historical line numbers may have moved.

There are 32 supplied findings. F-008, F-010, F-011, and F-032 have no supplied finding details and remain deferred; do not invent requirements for them.

## 3. Existing implementation: inspect and preserve

| Plan | Finding IDs | Work already present | Remaining qualification |
|---|---|---|---|
| 010 | F-005, F-006, F-007 | Expanded SQL drift markers through 031; credential-free Maestro setup/docs; ignore rules; 27 evidence paths removed from the Git index with ignored local copies retained | Owner must remediate the exposed account; historical Git data is unchanged; live marker query unverified |
| 002 | F-001, F-002, F-003 | Prepared SQL 029/030, server-owned XP/helper restrictions, private AI quota reservations, compatible summary contract, fail-closed proxy integration, pgTAP tests | SQL and Edge behavior not runtime verified; F-004 is an owner dashboard action |
| 004 | F-027, F-028, F-030, F-015, F-020 | Responsive editor actions, wrapping Board/header content, scrollable chooser and name containment | Device/release checks outstanding; F-029 code deliberately unchanged |
| 005 | F-012, F-013 | Accessible day/stat/difficulty state, full day labels, named close control and improved target | TalkBack/device verification outstanding |
| 006 | F-014, F-017, F-031, F-034, F-021 | Shared Unicode/name rules, field errors, unchanged legacy handling, all-days defaults, SQL 031 and pgTAP tests | Database and real platform boundary checks outstanding |
| 003 | F-019 | Bounded quota-aware retry/fallback core, failure handling, injectable tests, stronger Maestro success assertions and mocked UI success tests | Deno, quota runtime, successful live generation and persisted cache revisit outstanding |
| 007 | F-016, F-018, F-024 | Preserved delete state, one-use Board return intent, cached offline rows, friendly error/retry/reconnect | Device lifecycle/reconnect checks outstanding; F-025 code deliberately unchanged |
| 008 | F-033, F-026, F-022, F-023, F-035, F-009 | Latest-month heatmap scroll, narrow Board lanes, profile discard dialog, Settings version/theme polish, persisted Sound Effects preference and completion cue | Native rebuild, relaunch persistence and audible playback outstanding |
| 009 | F-036 | Phone-width web header/navigation and themed lane scrolling | Actual viewport, browser zoom and focus checks outstanding |

Key prepared artifacts:

- `backend/supabase/029_server_owned_xp_and_internal_helpers.sql`
- `backend/supabase/030_authoritative_ai_quotas.sql`
- `backend/supabase/031_profile_name_validation.sql`
- `supabase/tests/012_backend_security.test.sql`
- `supabase/tests/013_ai_quota.test.sql`
- `supabase/tests/014_profile_validation.test.sql`
- `supabase/tests/015_migration_markers.test.sql`
- `backend/supabase/functions/ai-proxy/ai-proxy-core.ts`, `ai-proxy_test.ts`, and the integrated `index.ts`
- `web/maestro/phone_layout_matrix.md`
- `mobile/lib/board-return-intent.ts`, `sound-effects-prefs.ts`, `completion-sound.ts`, and `mobile/assets/completion.wav`

`expo-audio ~1.1.1` and `expo-network ~8.0.8` were added using Expo's SDK-compatible installer. Rebuild the Android native client before treating their device behavior as verified. Do not reinstall dependencies or replace lockfiles without a specific reason.

## 4. Recorded checks and limits

These are recorded prior results, not a promise that the current environment is unchanged:

| Check | Recorded result |
|---|---|
| Mobile Jest | 23 suites / 91 tests passed |
| Shared Jest | 28 suites / 243 tests passed |
| Web tests | 18 files / 62 tests passed |
| Shared, mobile, web TypeScript | Passed |
| Web production build | Passed; bundle-size warning |
| Workspace lint | Exit 0; 40 mobile warnings, no errors |
| Git whitespace check | Exit 0; line-ending conversion warnings |
| Direct local Supabase schema lint | Passed against `127.0.0.1:55322`, with no schema errors |
| pgTAP tests 012–015 | Runner blocked before SQL execution: `EPERM: operation not permitted, uv_spawn 'docker'` |
| Deno Edge tests | Not run: Deno unavailable |
| Maestro/Android checks | Not run: Maestro, ADB and emulator unavailable |
| Real browser viewport/zoom | Not run |
| Successful live AI outputs/cache | Not run |

The local endpoint became reachable after earlier connection failures. Catalog inspection found existing `public.stats` and `public.profiles`, but no new `public.ai_begin_request(uuid,text,uuid,date)` entry point. The successful lint describes the schema already present, not the unapplied prepared SQL. Do not report migrations 029–031 as validated from that lint.

The repository uses canonical numbered SQL directly under `backend/supabase/`, not a `backend/supabase/migrations/` directory. Root `supabase/config.toml` references those files as seed SQL. An empty `supabase migration list --local` is therefore not proof that the local application schema is empty. `supabase db push` does not consume these canonical files.

SQL and Deno pre-implementation red runs were blocked; do not invent historical red/green results. Recorded red-to-green cases include offline cached-list behavior, missing AI output selectors, and Sound Effects preference wiring. For any new fix, capture a meaningful failing test before implementation and its green result afterward.

## 5. Remaining work, in execution order

### A. Recheck tooling and safely prepare database verification — plans 010/002/006

1. Inspect `git status` and preserve its existing changes. Recheck Docker, Deno, Maestro, ADB, Node, and the local database endpoint; prior absence may have changed.
2. Read `scripts/local-db.ps1` before using it. Its explicit `lint` and `test` actions do not reset, but both require Docker. Its default action is unsafe for this task.
3. Establish an explicitly disposable local schema containing canonical SQL 001–028. Do not reset or repurpose the existing local DB merely because it is reachable. Discover a safe isolated setup and document its identity without publishing connection secrets.
4. Run the new authorization/quota/profile contracts against that baseline and record the expected failures. If a clean baseline cannot be safely prepared, record the missing red check rather than reverting existing implementation or applied schema.
5. Inspect the prepared SQL and tests against each owning plan. Fix any genuine missing coverage, including independent-connection quota races, PUBLIC ACL checks, direct XP denial, legitimate completion/undo/recovery, cross-account isolation, summary persistence, Unicode and unchanged legacy names. Test source existing on disk does not prove every acceptance item is covered.
6. Apply prepared 029, then 030, then 031 only to the confirmed disposable local schema, without reset. Run the root pgTAP suite and expanded README capability/body/grant markers after application. Never edit an applied migration to alter behavior; use the next unused number when required.
7. Check quota cleanup/retention, atomic caps and consistent lock order in SQL 030. Inspect test results rather than accepting a linter-only pass.

From the repository root, once the disposable schema and tooling are ready:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
npm.cmd run db:lint
npm.cmd run db:test
deno test backend/supabase/functions/ai-proxy/ai-proxy_test.ts
```

The telemetry environment setting was used to avoid attempted writes to the user-level Supabase telemetry file under the previous sandbox. Use the repository-local CLI and inspect command help before adapting CLI syntax. The last observed CLI version was 2.117.0.

The existing concurrency tests 005 and 009 commit dedicated fixtures through independent connections before cleaning them up. Run the full DB suite on a disposable schema, not against personal data. Tests 012–015 use transaction boundaries, but inspect their actual contents before execution.

### B. Complete Edge tests and F-019 verification — plans 002/003

- Run the deterministic Deno suite with no credentials/network. Confirm retry classification, malformed-output rejection, caller cancellation, per-attempt timeouts, a 16-second total budget, at most four provider attempts, and fail-closed quota errors.
- Confirm one logical request is reused across retries, each provider attempt reserves exactly one slot, a denied reservation never reaches fetch, and ambiguous provider attempts are not refunded.
- Check summary first-generation/regeneration classification and one-use pending authorization against SQL 030, preserving the existing integer-returning regen RPC and client insert/update shape.
- Confirm existing cache survives failed regeneration and controls become retryable; errors and empty results must not be cached as success.
- Prepare the staged owner rollout described in section 7. The current source integrates quota and retry behavior; do not assume a separate first-stage deployment artifact already exists. If the owner needs a guard-only rollout artifact or a switch that disables retries during initial rollout, inspect and prepare it locally with tests before handing it over. Do not deploy it yourself.
- After the owner completes the deployment and disposable test setup, verify actual successful output: three usable editable penalty choices, populated editable Long Quest stages, a non-empty weekly paragraph, and a second Status visit reading the persisted paragraph without another AI request. Also exercise the separate forced-outage/failure paths and quota denial.
- Verify current provider model documentation and model access privately before rollout. Do not assume a model mentioned in an old plan remains available. Do not broaden live CORS to accommodate the test origin; use native Android or the allowed `http://localhost:5173` origin with an isolated disposable session.

### C. Android release, layout and accessibility checks — plans 004/005

- Discover the actual short-path checkout before building; do not assume a historical drive mapping. Ensure it contains these working-tree changes without overwriting a different checkout's work.
- Read Expo SDK 54 docs, rebuild the native dev client for audio/network changes, and separately build/install a release binary for release-only checks.
- Start long native builds/emulator operations detached with `Start-Process -WindowStyle Hidden`, redirect output to ignored logs, and poll progress in bounded calls. A debug/dev-client result is not a release result.
- Verify editor Save/Delete/Archive/Restore reachability, chooser containment/scroll, long names, headers and lanes at default font scale and 2.0. Include narrow 320–360 dp widths, keyboard open, both themes, and Board/Status/Long Quests/Settings/History.
- Verify TalkBack full day labels, selected/checked stat/difficulty/day state, named close control, touch target usability and focus behavior.

**F-029 decision rule:** On a quiet installed release build, start at font scale 1.0, run `e2e/_release_signin_board.yaml`, keep Board foregrounded, change to 2.0, then run `e2e/A10_release_fontscale_recheck.yaml` without relaunching. Restore the original font scale in `finally` and capture logcat privately. If no linking error/toast or route loss reproduces, record that result and make no navigation code change. If it reproduces, capture the failing regression before fixing and rerun the same release gate. Use plan 004's exact sequence.

### D. Lifecycle, offline and performance checks — plan 007

- Verify cancelled/failed deletion preserves the editor, successful one-time creation opens the intended Board lane once, offline completion rolls back correctly without hiding cached rows, Retry works, and reconnect triggers refetch.
- Include scheduled OFF DAY behavior and one-time 0/1 → 1/1 → 0/1 regression coverage around XP/schedule changes.

**F-025 decision rule:** Run `release_board_history_timing.yaml` three times individually on a quiet release surface. Capture cold/warm Board and History render checkpoints, API timings, and standalone endpoint latency from the same network. If both screens are under six seconds in all three runs and service latency is roughly 0.1–0.5 seconds, record an environmental finding and make no performance change. If either exceeds six seconds despite ordinary service latency, first write failing tests for independent-read/coalescing behavior, empty-list fast paths and error propagation. Then optimize only the reproduced bottleneck and rerun all three timing runs. Do not use dev-client launch helpers or Phase 6 fixtures as release timing evidence.

### E. Settings, navigation, audio and web checks — plans 008/009

- Verify latest-month heatmap positioning, all four Board lanes, stable Dark Theme label/state, configured Settings version, and dirty-profile Keep Editing/Discard behavior.
- Verify Sound Effects is off by default, persists across reopening/relaunch, and is audible only after successful completion, quantity target crossing, or recovery. Confirm failed actions, undo, disabled preference and playback failure do not break or incorrectly play completion feedback.
- Use `web/maestro/phone_layout_matrix.md` for real browser widths 320/390/768/1280 CSS pixels, both themes and actual 200% browser zoom. Verify brand/nav/account do not overlap, all routes/lanes remain reachable, no page-level horizontal overflow, themed scrollbar, keyboard focus, Escape and overlay focus restoration. An iframe/jsdom layout check does not establish browser zoom behavior.

## 6. Maestro flow inventory and execution

All paths below are relative to `mobile/maestro/flows/`. Read each flow's fixture requirements before running it. Some existing dev-client flows use launch helpers; the dedicated release flows deliberately do not.

| Purpose / finding | Flows to run individually |
|---|---|
| Release sign-in and F-029 | `e2e/_release_signin_board.yaml`, then the foreground font-scale sequence with `e2e/A10_release_fontscale_recheck.yaml` |
| Large-font layout | `e2e/A10_fontscale_prep.yaml` where fixture preparation is needed; `e2e/A10_fontscale_layout.yaml` |
| Editor accessibility/validation | `habit_create_validation.yaml`, `habit_edit_and_delete.yaml`; affected signup/profile/habit/Long Quest flows specified in plan 006 |
| One-time lifecycle | `one_time_quest_create_complete.yaml` |
| Offline/reconnect | `e2e/A9_offline_complete.yaml` |
| F-019 live success | `habit_ai_suggest_easy_version.yaml`, `longquest_ai_suggest_stages.yaml`, `status_weekly_summary_and_cache.yaml` |
| Status/Board/Settings | `e2e/status_heatmap_latest.yaml`, `e2e/board_lane_phone_visibility.yaml`, `settings_toggles_and_signout.yaml`, `e2e/A3_quantity.yaml` |
| F-025 quiet release timing | `release_board_history_timing.yaml`, three separate runs |
| Recovery | `e2e/A13_recovery_check.yaml`, only after confirming actual server-side fixture state |

Example pattern from repository root, with values already set privately:

```powershell
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/habit_ai_suggest_easy_version.yaml
```

Set `E2E_NAME` privately when the selected setup/signup flow requires it. Never hardcode replacements for the removed shared credential.

The original A13 account-local midnight has passed. Do not assume its old fixture is still valid and do not change device time to simulate server-side midnight. Inspect actual fixture state or prepare a new disposable fixture with the correct boundary. Preserve recovery accounts until their check is finished.

`phase6_reload_smoke.yaml` requires records and an active local session provisioned by `phase6_whole_product_acceptance.yaml`; it does not provision/login itself. Skip it when that fixture is absent. Generic E2E credentials are not proof that the Phase 6 fixture exists.

## 7. Owner-only actions and exact rollout order

The next AI prepares/reviews/tests artifacts and documents results. The owner performs the external actions below.

1. **F-006 containment:** Rotate or delete the exposed shared test account, revoke sessions and account for remaining access-token expiry. Keep replacements private. The 27 staged index removals preserve local evidence and do not remove historical public commits. Historical Git cleanup requires the owner's separate decision and authorization.
2. **Access/tooling:** Make Docker, Deno and Android tooling available, and identify a disposable DB/account and actual short-path Android checkout when they cannot be safely discovered. A tool being absent from PATH in the old session is not proof that it must be reinstalled.
3. **Before live SQL:** Review migration files/tests and run the read-only README drift query to establish current 001–028 capabilities. Review the proposed quotas: two daily requests per suggestion action, two manual weekly regenerations per account-local day, up to two initial-generation attempts/day until a summary persists, and 100 provider attempts/project/UTC day.
4. **First Edge rollout:** Deploy the compatible quota guard in fail-closed mode before SQL 030. Missing quota RPCs must produce a bounded 503 without a provider request. Expect temporary AI unavailability during this window. Review the prepared first-stage artifact/setting before deployment.
5. **Live SQL:** Apply reviewed `029_server_owned_xp_and_internal_helpers.sql`, then `030_authoritative_ai_quotas.sql`, then `031_profile_name_validation.sql` manually in the intended project's SQL Editor. Re-run the relevant README body/grant markers after each file. Do not replay obsolete definitions or use `supabase db push` for these canonical flat SQL files.
6. **Security/quota/profile probes:** Using only disposable accounts and private environment values, verify denied direct stats writes and XP-helper calls leave values unchanged; legitimate complete/undo/recovery works; cross-account access is denied; summary insert/update still works while counter writes/delete cannot bypass quotas; reservation races respect caps; valid Unicode/unchanged legacy profile values work and invisible-only edited values fail via direct writes and RPC.
7. **Retry/fallback rollout:** Once SQL 030 markers and quota/summary probes pass, verify fallback model availability, set approved model/quota configuration privately, and deploy/activate the bounded retry version. Run the three actual successful AI actions and cache revisit plus failure/denial smoke tests. Keep F-019 open if usable output is still unavailable.
8. **F-004:** Enable leaked-password protection in Auth settings and verify a disposable compromised-password signup is rejected and a valid disposable signup succeeds. If the tier lacks the feature, record the block and let the owner choose the tier/action. Never record the password values.
9. **Client/device release:** Complete the local and release checks above, then the owner decides and performs external client release. No automatic commit, push or deployment is authorized by this handoff.
10. **Fixture cleanup/missing IDs:** After verification, delete obsolete disposable test accounts; keep the recovery fixture until its check finishes. Provide the details of F-008/F-010/F-011/F-032 or confirm they are unused IDs.

The plan's owner-only Edge deployment command, from repository root after review, is:

```powershell
npx.cmd supabase --workdir backend functions deploy ai-proxy --project-ref $env:SUPABASE_PROJECT_REF
```

This command is documented here for the owner; the next AI must not run it under the existing authorization. API keys, model secrets, project references and test access tokens remain private.

## 8. Regression commands and recording completion

Run the affected tests after a fix. Broaden to integration regressions when changes or unresolved risks justify it. Previously passing counts are reference results, not target counts to preserve artificially.

From repository root:

```powershell
npm.cmd run test --workspace @eiyu/shared -- --runInBand
npm.cmd run test --workspace @eiyu/mobile -- --runInBand
npm.cmd run test --workspace @eiyu/web
npx.cmd tsc --noEmit -p packages/shared/tsconfig.json
npx.cmd tsc --noEmit -p mobile/tsconfig.json
npx.cmd tsc --noEmit -p web/tsconfig.json
npm.cmd run build --workspace @eiyu/web
npm.cmd run lint
git diff --check
```

If dependencies are missing, follow the repository's Node 22/dependency instructions. Do not replace the existing install/lockfile merely to rerun checks.

Update the owning `docs/plans/plan_execution_report/00N-*.md` and `001-roadmap.md` after each completed item. Record finding ID, change if any, exact command/flow, observed result, red/green status where actually captured, runtime surface (mock/dev/release/live), unresolved checks and owner actions. Do not copy raw logs, screenshots, personal notes or credentials into reports or this handoff.

Acceptance requires actual pgTAP and Deno execution, applicable 001–031 markers, denied unauthorized XP/quota writes, preserved legitimate lifecycle paths, reachable large-font controls, required accessibility/web checks, and successful AI/cache paths. Record F-025/F-029 as reproduced-and-fixed or release-checked-with-no-change as supported by their measurements; do not force a code change.

Real notification delivery, denied notification permission, timezone changes, forgot-password mail and iOS remain original coverage exclusions. Keep them explicitly unverified unless separately completed; Windows alone cannot verify an iOS native build, and sending real mail needs separate authorization.

## 9. Suggested starting instruction for the next AI

> Continue the Eiyu System remediation from `docs/handoff/001-handoff.md`. Read the required source documents and execution reports, preserve the uncommitted implementation and Maestro baseline, and finish the authorized local verification and any reproduced fixes. Recheck tooling rather than assuming the old blockers remain. Use Luna 6 at xhigh for implementation/delegation as requested. Do not reset databases, commit, push, apply live migrations, deploy, change dashboard settings/secrets, or use personal production sessions. Follow the verification-first conditions for F-025/F-029 and require actual successful AI outputs/cache verification for F-019. Update the execution reports as work completes and leave owner-only rollout steps concrete and reviewable.
