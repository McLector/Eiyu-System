# Quest plan Phase 1 report

Phase / date / implementer: Phase 1 — scheduled habit eligibility / 2026-09-11 / Codex

Requirements and decisions covered:

- The product day starts at `00:00` in a persisted account IANA timezone. The first capable client initializes the value from its device timezone; later devices read the persisted value instead of silently changing it.
- Existing completion and occurrence date keys are never rewritten. Explicit timezone changes and schedule edits are prospective.
- A new habit's schedule begins on its account-local creation date. Schedule edits become effective on the next account-local calendar day.
- Weekdays use JavaScript/Postgres Sunday `0` through Saturday `6` consistently.
- Daily Quests are supplied by an authoritative occurrence-backed database query. Off-day and future direct completion/progress writes are rejected.
- Long Quests, registration consent/legal content, and Expo SDK 54 remain unchanged in this phase.

Base main revision / candidate revision / landed main revision: `3f6aefcee166ef18fd23f1ea21dfdb9c8435f3d9` / recorded in the final handoff after this report commit / recorded in the final handoff after main integration

## Changed files and purpose

- `backend/supabase/021_scheduled_habit_eligibility.sql`: adds persisted account timezone state, immutable schedule versions and habit occurrences, authoritative retrieval/completion/progress validation, account-day weekly-summary limits, signup timezone capture, and restricted write privileges.
- `supabase/tests/002_scheduled_eligibility.test.sql`: 31 deterministic pgTAP assertions for timezone initialization, schedule/occurrence history, idempotency, write authorization, and creation/edit cutoffs.
- `packages/shared/src/logic/date-utils.ts`, `quest-recurrence.ts`, `eiyu-logic.ts`: account-calendar keys/arithmetic, DST-safe day boundaries, reminder instants, occurrence-based streak derivation, and account-weekday eligibility.
- `packages/shared/src/logic/__tests__/scheduled-eligibility.test.ts`, `quest-recurrence.test.ts`: seven-day schedule matrix, creation cutoff, cross-zone/year boundary, DST, rollover, reminders, off-day miss, and schedule-edit history tests.
- `packages/shared/src/data/habits.ts`, `history.ts`, `completions.ts`, `profile.ts`, `weekly-quest.ts`, `weekly-review.ts`, `weekly-summary.ts`: use persisted timezone and occurrence-backed authoritative dates across reads/writes/history/weekly features.
- `packages/shared/src/data/__tests__/habits.test.ts`, `history.test.ts`, `weekly-summary.test.ts`: data-adapter coverage for authoritative RPCs, stored timezone boundaries, occurrence history, and account-week calculations.
- `packages/shared/src/types/database.ts`, `types/eiyu.ts`: migration/RPC and profile timezone types.
- `mobile/contexts/auth-store.tsx`, `web/src/web/WebAuth.tsx`: capture the device IANA timezone as signup metadata.
- `mobile/contexts/eiyu-store.tsx`, `web/src/store/eiyu-store.tsx`: use stored timezone for daily keys and completion operations and invalidate data at account midnight.
- `mobile/lib/notifications.ts`: schedule one-time reminders at exact account-zone instants; use timezone-aware iOS calendar triggers and mapped Android weekly triggers, re-armed during sync and account-day rollover.
- Mobile/web board, status, history, heatmap, and editor files: display and create against the persisted account calendar date.
- `scripts/local-db.ps1`: force Supabase CLI 2.117 out of agent-mode command substitution, use its native Windows binary when available, preserve the dedicated Docker network for test containers, and use the supported `pretty` status output.
- `README.md`: documents canonical migrations through 021.

## Acceptance criterion -> test identifier -> result

| Criterion | Test/check | Result |
| --- | --- | --- |
| M/W/F presence and all four off-days absent | `scheduled-eligibility.test.ts > evaluates M/W/F for ...` (seven parameterized cases); pgTAP occurrence/result checks | PASS |
| No pre-creation occurrence | `does not create historical eligibility before the local creation date`; pgTAP server-owned `schedule_start_on` checks | PASS |
| Account midnight, cross-device, month/year, 23/25-hour days | account timezone/date-key/DST/rollover cases in `scheduled-eligibility.test.ts` | PASS |
| Schedule edits preserve history | shared occurrence-streak case plus pgTAP prospective-version/history assertions | PASS |
| Duplicate retrieval/resume is idempotent | repeated `ensure_habit_occurrences` and unique occurrence count | PASS |
| Off-day/future writes cannot bypass eligibility | pgTAP direct RPC/table-write rejection assertions | PASS |
| Daily reads use the persisted account date | `habits.test.ts > requests the account-local date returned by persisted timezone initialization` | PASS |
| History and weekly calculations use canonical account dates | shared history and weekly-summary suites | PASS |
| Mobile and web consume the same contract | shared adapter/logic suites, both platform type checks, mobile/web component suites | PASS |
| Reminder wall times use the account timezone | exact reminder-instant and next-weekday tests; mobile type/native build | PASS |

## RED evidence recorded before feature code

- The initial Phase 1 shared test failed to compile because `accountDateKey`, `isRecurringHabitEligible`, `weekdayForDateKey`, and `zonedDayBounds` did not exist.
- The initial Phase 1 pgTAP test failed because `profiles.time_zone`, schedule-version/occurrence tables, and eligibility RPCs did not exist.
- The schedule-edit streak test failed because `streakStateFromOccurrences` did not exist, demonstrating that the prior current-`days` calculation could reinterpret history.
- Reminder contract tests failed to compile because `zonedDateTimeInstant` and `nextAccountWeekdayInstant` did not exist.
- The hardened pgTAP run failed 8 of 31 assertions before the final security changes: caller-supplied and rewritten schedule starts generated thousands of false historical occurrences; direct profile timezone updates and direct quantity progress writes were accepted. The migration was then changed, not the expected behavior.

## GREEN evidence

Run environment: Windows x86_64, Node `22.18.0`, Expo SDK `54`, Docker Desktop Engine `29.7.2` (`linux/x86_64`), local Supabase/Postgres 17. No remote or production environment was used.

| Command/check | Result |
| --- | --- |
| Shared Jest suite | PASS — 18 suites, 177 tests |
| Mobile Jest suite | PASS — 2 suites, 5 tests |
| Web Vitest suite | PASS — 3 files, 13 tests |
| Shared/mobile/web TypeScript checks | PASS |
| Workspace lint | PASS — 0 errors; same 26 pre-existing mobile duplicate-import warnings |
| Web production build | PASS — pre-existing Vite native-loader and large-chunk warnings |
| Local schema lint | PASS — no public-schema errors |
| Local pgTAP | PASS — 2 files, 54 tests (23 Phase 0 + 31 Phase 1) |
| Expo `install --check` | PASS — dependencies are up to date; no upgrade performed |
| Expo Android export | PASS — Hermes bundle plus 63 assets, local output only |
| Gradle `assembleDebug` x86_64 | PASS — 783 tasks; debug build only, no install/deploy |
| `git diff --check` and credential-pattern review | PASS — no whitespace error or credential material found |

## Integration / migration / authorization / concurrency results

A clean local reset applied canonical migrations 001–021 in filename order. The schema linter passed. pgTAP proved first-writer-wins timezone initialization, valid IANA enforcement, immutable schedule starts, prospective schedule versions, exact M/W/F occurrence materialization, repeat/resume idempotency, authoritative daily retrieval, no off-day/future completion, one XP award, preserved history after schedule/timezone edits, RLS, and denial of direct occurrence/completion/progress/timezone writes.

`habit_occurrences` has a primary key on `(habit_id, occurrence_date)` and reconciliation uses `ON CONFLICT DO NOTHING`; repeated retrieval cannot duplicate an occurrence. Completion retains the existing unique `(habit_id, completed_on)` constraint and its XP mutation is in the same database transaction, so duplicate completion cannot double-award XP.

No migration was pushed and no Edge Function, remote database, or production service was changed. The Docker-backed stack was stopped after verification. Docker Desktop still publishes the local database port on all host interfaces despite the custom bridge option, so the wrapper retains its trusted-network warning and automatic verification cleanup.

## Mobile targets, web browsers, build and evaluation evidence

- Android JavaScript/Hermes export and the x86_64 native debug assembly passed on Expo SDK 54.
- Mobile and web component harnesses passed, and both platform stores/type checks compile against the same shared eligibility/RPC contract.
- Web production assets built successfully.
- No production-backed signed-in journey was run. The existing Maestro configuration depends on a shared remote account whose isolation is not established; using it would violate this phase's no-production-change constraint.
- An iOS native build was unavailable on this Windows host. iOS notification configuration is covered by the installed Expo SDK 54 types; Android native compilation exercises its adapter.

## Requirement/test review findings and resolutions

- Changing only the weekday call would have left completion keys, history, heatmaps, weekly summaries, reminders, and server validation on UTC. All affected Phase 1 paths now derive from the persisted account timezone.
- The prior 90-day completion slice could truncate long streaks. Daily streak derivation now consumes all returned-habit completions and immutable eligible occurrences.
- Schedule edits now create next-day schedule versions and never mutate prior occurrences.
- Existing accounts use a UTC compatibility start boundary for already-created habits because their original device timezone is unknowable; first capable access then persists a timezone for future boundaries.

## Code/data/security review findings and resolutions

- New habit schedule starts are server-owned and immutable. Older clients may echo the column on update; the trigger preserves the stored value without breaking the request.
- Clients retain read access but cannot directly insert/update/delete occurrences, completions, or quantity progress. Timezone updates must use the prospective RPC.
- Security-definer functions pin an empty search path, resolve ownership from `auth.uid()`, and use authoritative server time for current-day/future validation.
- Backdated recovery completion remains an intentionally separate Phase 2 concern: the existing recovery UI sends the missed date, so Phase 2 must replace that ambiguity with the persisted recovery state machine and authoritative deadline validation before changing the RPC contract further.
- Existing pre-migration schedule edits cannot be reconstructed because no historical versions existed. Current habit schedules and completion keys are preserved; the migration does not fabricate unknown historical schedule changes.

## UX/accessibility evaluation findings and resolutions

- Board headers, history calendars, heatmaps, editors, weekly status, and both stores now agree on the account date across a UTC boundary.
- There is no timezone-settings UI in Phase 1; the explicit RPC exists for a later owner-approved surface. Initial timezone behavior is automatic and cross-device stable.
- Android Expo SDK 54 has no IANA timezone field on weekly triggers. The adapter maps the next account-zone occurrence to a device-local weekly trigger and re-arms on app sync/account midnight. If the app remains terminated across a DST or device-zone change, the OS-level weekly alarm may remain mapped to the prior offset until the next launch; data eligibility and authoritative writes remain correct. iOS uses a timezone-aware calendar trigger directly.

## Regression and static/build results

All shared/mobile/web tests, three type checks, lint, local migration/schema/authorization checks, web build, Expo dependency validation, Android export, and Android native debug build passed. Expo SDK 54 and application dependencies were not changed.

## Skipped/unavailable checks and blocking reasons

1. iOS native build: unavailable on Windows.
2. Stateful Maestro/signed-in browser flow: skipped because the repository flow uses a shared remote test account and no isolated full local auth journey is configured. Automated platform component/build and authoritative local-database evidence cover this phase; no production system was touched.
3. SDK audit upgrades: unchanged under the owner's explicit instruction not to touch Expo SDK 54.

## Migration, compatibility, rollback notes

- Migration 021 is additive for timezone, schedule-version, and occurrence storage, but replaces completion/progress/weekly-summary RPC definitions and tightens table privileges.
- New clients initialize missing profile timezones. Existing clients can still create/update habits; the database assigns/retains schedule starts and uses UTC only as a compatibility fallback when an account has not yet initialized its timezone.
- Existing completion keys are preserved. Existing active habits receive a schedule version beginning on their original UTC-derived creation key because the prior account timezone cannot be recovered reliably.
- Before any production deployment, rehearse rollback on a copy of representative data. A rollback would need to restore the prior RPC bodies/grants and user profile update privilege, remove the new triggers, and only then drop occurrence/version data and added columns. Once occurrence history is relied upon, a forward fix is safer than destructive rollback.
- No rollback was executed and no production deployment occurred.

Gate verdict: **PASS** — Phase 1's schedule matrix, account-calendar contract, occurrence persistence, authorization/idempotency checks, platform regressions, web build, and Android export/native build pass. The recorded Android OS reminder remapping limitation does not affect authoritative eligibility and is bounded by startup/account-midnight re-arming.

Main integration and post-landing verification occur after this report is committed. Their resulting revisions and outcome are recorded in the final handoff. Phase 2 must not begin until that integration gate passes.
