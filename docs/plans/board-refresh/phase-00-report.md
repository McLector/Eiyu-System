# Phase 00 report — foundation, fixtures, and baseline

Phase / date / implementer: Phase 0 — Foundation, fixtures, and baseline / 2026-09-13 / Luna scope executed by Codex

Implementation model and reasoning: `gpt-5.6-luna`, `xhigh` (binding handoff requirement)

Plan: `docs/plans/2026-09-13-board-navigation-design-plan.md`

Handoff: `docs/plans/board-refresh/luna-handoff.md` (the user-mentioned `docs/plans/board-refresh-luna-handoff.md` does not exist; this repository-local path is the matching handoff)

Status: **REVIEW READY — AWAITING USER**

Continuation audit: 2026-09-21. The user's “continue” was treated as the handoff's explicit go-ahead to resume Phase 0 only. Phase 1 remains unauthorized.

Base main SHA: `b840bb723229ba34a19a8a73a07ff3da7e952d81`

Candidate SHA: not committed; tested working tree on `codex/board-refresh-phase-00`

Landed main SHA: not applicable; no user approval to land was recorded

## Scope and outcome

Phase 0 resumed only. The existing two test-only candidate files were reviewed and strengthened. The recovery fixture now stores the authoritative UTC deadline for a Sunday missed occurrence and the fixture test proves actual mutable-object independence. No runtime feature code, SQL, dependency, production data, or database migration changed.

The automated baseline is green, including the new fixture suite, shared/web/mobile tests, lint, all three TypeScript checks, web build, local database reset/lint/pgTAP, and Expo SDK 54 compatibility. The required runner preflight is now complete: a full disposable local Supabase/Auth stack was started, a synthetic local account reached the protected board route, the session survived a reload, and sign-out returned to authentication. No runtime feature code, SQL, dependency, production data, or database migration changed.

## Acceptance IDs -> tests -> exact result

| Acceptance ID | Test/evidence | Result |
| --- | --- | --- |
| P0-AC1 | `packages/shared/src/logic/__tests__/board-refresh-fixtures.test.ts`: four tests cover nine fixture categories, two owners, recovery date/deadline coherence, and actual mutations to a quest name and schedule array. `createBoardRefreshFixtureSet()` returns fresh arrays and quest objects on every call. | PASS |
| P0-AC2 | Same fixture suite characterizes `partitionBoardQuests()` before the refresh: due active recurring items and recovery are separated; the current one-time section includes the archived one-time item; current `allHabits` includes archived recurring and recovery items. The test comments explicitly identify the latter expectations as behavior Phase 3 replaces. | PASS |
| P0-AC3 | Shared 23 suites/205 tests; web 8 files/26 tests; mobile 7 suites/16 tests; lint; shared/web/mobile TypeScript checks; web production build; `db:verify`; Expo `install --check`. | PASS |
| P0-AC4 | Full disposable local Supabase/Auth stack, synthetic local account, Codex in-app browser, protected `/board` route, reload persistence, sign-out redirect, Chrome executable, Android SDK/ADB, Maestro, JDK 21, attached Android emulator, and durable scenario document were verified. | PASS |
| P0-AC5 | This report and the executive summary map all Phase 0 criteria and every later behavioral/acceptance ID to an intended boundary below. Runtime feature work is explicitly marked not started. | PASS |

All Phase 0 acceptance criteria pass. The phase gate is **REVIEW READY — AWAITING USER**; it must remain uncommitted and unintegrated until the user reviews and explicitly approves it.

## Test-first proof

No runtime feature implementation preceded the tests. The candidate began with the two test-only files named by the handoff.

1. Before the correction, the full shared baseline passed: 23 suites and 205 tests. The fixture test still expected the stale `2026-09-14T12:00:00.000Z` recovery deadline.
2. The fixture test oracle was changed first to the authoritative `2026-09-15T00:00:00.000Z` deadline. The targeted command failed with exit 1 and a behavior-level assertion showing expected Sep 15 midnight versus received Sep 14 noon.
3. The helper fixture was corrected. The targeted suite then passed: 1 suite and 4 tests.
4. Fresh-object mutation assertions were added to the fixture test. The targeted suite passed again: 1 suite and 4 tests.
5. No intentionally failing test was retained. The RED experiment was only the evidence for correcting the test fixture contract, not a fabricated failure for unchanged product behavior.

Candidate file SHA-256 values after the final test-first correction:

- `packages/shared/src/test-support/board-refresh-fixtures.ts`: `AA58A837D6C9F79A5BFCE2D8A35DEC45EC28554B4C9EEE504790998E0AE59778`
- `packages/shared/src/logic/__tests__/board-refresh-fixtures.test.ts`: `818629C64FB66E29E40950A9A7828DE3C044F9D038B69A06775E25A9C12AFBD3`

Runtime source diff: none. `git diff --check` exited 0. The candidate files remain untracked test-support/test files, as they were at handoff.

## Changed files and why

- `packages/shared/src/test-support/board-refresh-fixtures.ts`: corrected the recovery fixture’s persisted absolute deadline from noon on Monday to the next UTC calendar midnight after the Sunday miss.
- `packages/shared/src/logic/__tests__/board-refresh-fixtures.test.ts`: asserted the corrected deadline and added actual mutation checks proving a fresh fixture call and the secondary account do not change when the first fixture is mutated.
- `docs/plans/board-refresh/phase-00-report.md`: this evidence report.
- `docs/plans/board-refresh/phase-00-executive-summary.md`: standalone requirement-mapped review summary.

The plan, handoff, and unrelated untracked `skill-observations/` were preserved. No production source, SQL, dependency manifest, or configuration file was changed.

## GREEN commands and results

All commands used the repository’s explicit Node/npm launcher where applicable.

| Command/check | Exit | Result |
| --- | ---: | --- |
| `& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test --workspace @eiyu/shared -- --runInBand` | 0 | 23 suites, 205 tests passed |
| Same command with `src/logic/__tests__/board-refresh-fixtures.test.ts` | 0 | 1 suite, 4 tests passed after correction |
| `... npm-cli.js run test --workspace @eiyu/web` | 0 | 8 files, 26 tests passed |
| `... npm-cli.js run test --workspace @eiyu/mobile -- --runInBand` | 0 | 7 suites, 16 tests passed |
| `... npm-cli.js run lint` | 0 | 0 errors, 23 incumbent `import/no-duplicates` warnings |
| `node node_modules/typescript/bin/tsc --noEmit -p packages/shared/tsconfig.json` | 0 | passed |
| `node node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.json` | 0 | passed |
| `node node_modules/typescript/bin/tsc --noEmit -p mobile/tsconfig.json` | 0 | passed |
| `... npm-cli.js run build --workspace @eiyu/web` | 0 | Vite production build passed; 742 modules transformed |
| `... npm-cli.js run db:verify` | 0 | local reset, schema lint clean, 7 pgTAP files/219 tests passed; local stack stopped |
| `mobile/../node_modules/.bin/expo.cmd install --check` from `mobile` | 0 | `Dependencies are up to date` |
| `git diff --check` | 0 | no whitespace errors |

Known non-blocking warnings: Vite reported the incumbent `__dirname`/native config-loader warning and a large minified chunk; lint reported 23 warnings in unchanged source files. These were not converted to failures and were not fixed in Phase 0.

## Runner preflight and platform evidence

### Database

The direct local helper status preflight first confirmed there was no `supabase_db_eiyu-system` container. The required `db:verify` then started the disposable local stack, reset it, linted the public schema with no schema errors, ran all seven local pgTAP files for 219 tests, and stopped the stack. No production or personal data was used.

The first status invocation through npm (`npm run db:status`) was not a database check because the root manifest has no `db:status` script. The repository helper supports `status` directly and was used for the actual preflight.

### Web/browser

- Web runner: `... npm-cli.js run dev --workspace @eiyu/web -- --host 127.0.0.1 --port 4173` started Vite successfully at `http://127.0.0.1:4173/` and was stopped after inspection.
- Browser path: Codex In-app Browser, local `/auth` form, synthetic account `phase0.browser@eiyu.test`, protected `/board` route, full reload, `/settings`, sign-out, and return to `/auth`.
- Local Auth path: the full local Supabase stack was started on `http://127.0.0.1:55321` with temporary Vite variables; the checked-in remote `.env` values were not used.
- Authenticated evidence: login reached the account-scoped shell and board content; reload remained on `/board` and rendered the board; sign-out returned to `/auth`. This was a runner/authentication preflight, not a lifecycle or board-refresh feature test.
- Installed desktop browser executable: `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- The browser viewport was not captured as a visual artifact; no screenshot/geometry acceptance was claimed in Phase 0.

### Android/native

- Android SDK ADB: `C:\Users\morad\AppData\Local\Android\Sdk\platform-tools\adb.exe`.
- ADB version: 37.0.0-14910828.
- Attached device: `emulator-5554` in `device` state.
- Maestro: `C:\Users\morad\.maestro\bin\maestro.bat`, version 2.8.0, runnable with `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` (JDK 21).
- Scenario assets already precede feature changes under `mobile/maestro/flows/`, including `phase8_cross_platform_persistence.yaml`; the README requires serial flow execution.
- No Maestro journey, Android export, or Android debug build was run in Phase 0 because no runtime feature changed. Those are later feature-phase evidence, not substitutes for the runner preflight.
- iOS native compilation is unavailable on this Windows host and is not claimed.

No screenshot/geometry matrix was run. Phase 0 only inspected the unauthenticated web landing/auth routes and identified native runner availability; the board’s desktop/mobile visual acceptance belongs to Phase 3 onward.

## Intended test boundaries for later phases

The following is the Phase 0 acceptance-to-test map. It is a plan for future phase evidence, not a claim that any later feature is implemented or verified.

| Phase / acceptance IDs | Intended boundary and oracle |
| --- | --- |
| P1-AC1 / LIFE-01, LIFE-03 | Real local SQL/pgTAP assertions prove actual habit-row absence, executable dependent cleanup, retained evidence, and no duplicate evidence on retry; shared data tests cover normalized reader output. |
| P1-AC2 / LIFE-02 | SQL plus shared data integration compares History, denominators, heatmap ratios, weekly review/quest counts, AI inputs, XP, and rank before/after deletion across mixed stats/dates. |
| P1-AC3 / LIFE-04 | Real role sessions, grants, RLS, owner checks, forged-ledger write rejection, direct-delete bypass rejection, and account-deletion cleanup. |
| P1-AC4 / LIFE-05 | Two real database sessions race completion/progress/recovery against delete and assert transactional outcomes, XP, and retained evidence. |
| P1-AC5 / LIFE-06–08 | Deterministic SQL/shared tests cover archive intervals, restore identity/eligibility, off-day and one-time behavior, legacy archives, timezone midnight, expired/open recovery, and stale writes. |
| P1-AC6 | Full persistence/security gate: all Phase 1 data suites, pgTAP, reset/upgrade rehearsal, types, and data-security review; UI remains explicitly not started. |
| P2-AC1 / UI-LIFE-01–02 | Real web and React Native Testing Library interactions assert Archive, Restore, Delete permanently, Cancel zero writes, archived action visibility, and active-view refresh. |
| P2-AC2 / UI-LIFE-03, UI-LIFE-05 | Deferred/rejected requests, double-click/tap suppression, retry, stale fetch, persisted cache, reload/focus, and account-switch isolation at store/component boundaries. |
| P2-AC3 / UI-LIFE-04 | Notification adapter and Android evidence for cancel/reschedule, disabled settings, permission denial, and post-DB reminder failure separation. |
| P2-AC4 / UI-LIFE-05–06 | Real disposable-account browser-to-Android journey with persisted lifecycle state and exact History/XP comparisons. |
| P2-AC5 | Keyboard/touch dialog accessibility plus full static/build/export and required browser/Android lifecycle evidence. |
| P3-AC1 / BOARD-01 | Shared selector tests with exact ID sets/counts over mixed due, off-day, archived, one-time, recovery, and duplicate-view fixtures. |
| P3-AC2 / BOARD-02, BOARD-04 | Actual web and RNTL card interactions for shared completion/quantity/Penalty/recovery state, off-day action denial, Undo, note expansion, edit, and lifecycle actions. |
| P3-AC3 / BOARD-03–04 | Component interaction tests for loading/empty/error/retry and keyboard/touch reachability with visible labels and no hover dependency. |
| P3-AC4 / BOARD-05 | Real browser geometry/scroll tests at desktop and narrow widths plus Android lane-selector/card scroll evidence for 0/1/30/100 records. |
| P3-AC5 | Dark/light, long title, 200% zoom/font scaling, mutation lane retention, screenshot review, Android evidence, and complete Phase 3 gate. |
| P4-AC1 / NAV-01, LAYOUT-01 | Router/semantic tests, rendered header/bottom-tab geometry, settings absence, people icon semantics, and protected-route width checks. |
| P4-AC2 / NAV-02 | Actual web/native identity-menu interactions assert exactly Edit details, Settings, Logout with keyboard/touch reachability. |
| P4-AC3 / NAV-03 | Router tests and real browser/native Back, Escape, outside-dismiss, focus restoration, lane/scroll preservation, and legacy Settings compatibility flow. |
| P4-AC4 / PROFILE-01–02 | Shared/profile SQL/RLS and store tests for trimmed Unicode code-point bounds, owner isolation, draft/cancel/dirty/pending/error/retry, cross-platform reload, and unchanged XP/rank. |
| P4-AC5 / SETTINGS-01, AUTH-01 | Existing settings component interactions in overlays plus logout success/failure/repeat suppression and cache isolation. |
| P4-AC6 | Full protected-route viewport matrix at 390/768/1024/1366/1440/1920, zoom/keyboard/safe-area screenshots, and all phase gates. |
| P5-AC1 / WEEK-01 | Fixed-time shared data tests and DOM table assertions for seven account-local oldest-to-newest dates, month/year/timezone boundaries, and zero-fill. |
| P5-AC2 / WEEK-02 | Exact 5x7 cells/totals over values 0/1/3/4/10, archived/deleted evidence, and common numerical scale; no saturation oracle. |
| P5-AC3 / WEEK-03–04 | Accessibility table semantics, numeric labels without color/tooltips, loading/empty/error/retry, and AI regeneration limit interactions. |
| P5-AC4 / LAYOUT-02 | Real screenshots/geometry at 1366x768 and 1440x900 plus long-content, empty/full, mobile, and 200% zoom reachability on Status, Long Quests, History, and editors. |
| P5-AC5 | Web/shared regression, Android shared-data smoke, complete static/build gate, and requirement-mapped summary. |
| P6-AC1 / FINAL-01 | E2E scenario authored before corrective runtime code; real web/Android disposable-account journey with persisted before/after artifacts. |
| P6-AC2 / FINAL-02 | Full SQL/security/concurrency regression including archive pauses, retained deleted history, rewards, authorization, and account isolation. |
| P6-AC3 / FINAL-03 | All suites, lint/types, production web build, Expo compatibility/export, Android debug build, and real Maestro; iOS unavailable stated. |
| P6-AC4 / FINAL-04 | Fresh dark/light desktop/narrow/native screenshots, geometry/accessibility/zoom/font scaling review, long-data/error-state checks, and resolved finding list. |
| P6-AC5 / FINAL-05 | Final R1–R13 matrix linked to files, tests, evidence, phase SHAs, approvals, reports, and no-deployment statement. |

## Review findings

| Severity | Finding | Resolution / verification |
| --- | --- | --- |
| Pass P0-AC4 | The authenticated local browser runner path was required before the phase could be reviewed. | Resolved on 2026-09-21 with a synthetic local account against the disposable local Supabase/Auth stack: `/auth` -> `/board`, reload on `/board`, `/settings` -> sign-out -> `/auth`. |
| Resolved | Recovery fixture stored noon on the recovery day as its absolute deadline, inconsistent with the authoritative next-calendar-midnight contract. | Test oracle failed first; fixture helper corrected; targeted and full shared suites passed. |
| Informational | Incumbent lint/Vite warnings remain. | No changed files are implicated; recorded, not silently treated as failures. |

Separate review passes:

1. Requirements/test-oracle review: fixture assertions are independent of Phase 3 implementation and explicitly preserve current pre-refresh characterization.
2. Correctness/security/data review: no Phase 1 persistence or SQL was changed; local DB baseline passed; production data was not touched.
3. UX/accessibility/responsive review: only unauthenticated landing/auth reachability was inspected; board/layout review is not started and remains future-phase work.

No independent external reviewer or background agent was used. Parent/reviewer approval and user acceptance remain separate states.

## Continuation audit — 2026-09-21

- The existing candidate tests and the Phase 0 green evidence were preserved; no runtime feature code or SQL was introduced.
- A disposable local-auth run used synthetic credentials only. The repository `.env` files point at the remote Supabase host, so those values were not used and no remote account or data was touched.
- Docker Desktop became healthy during the continuation. The repository `npm run db:start` wrapper was used for the DB-only preflight, then the full repository-local Supabase CLI stack was started so Auth/PostgREST were available for the browser scenario.
- A synthetic local account was created, and the Codex in-app browser completed `/auth` -> `/board`, reload persistence, `/settings`, and sign-out -> `/auth`. The durable scenario script is `docs/plans/board-refresh/phase-00-browser-native-scenarios.md`.
- The local full stack and Vite server were stopped after evidence capture. No reset, migration, remote request, or production data access occurred in this continuation.

## Data, compatibility, privacy, and rollback notes

- No migration, schema, RPC, client data reader, or production configuration changed.
- The only data-bearing executions were the disposable local Supabase reset under `db:verify` on 2026-09-13 and the synthetic local Auth account created on 2026-09-21; the local stack was stopped afterward.
- The fixture uses synthetic UUIDs and deterministic names; it is not a production or personal-data fixture.
- The deadline correction is test support only and has no compatibility effect on existing clients.
- Rollback is deleting the uncommitted test-support/test changes; no landed code or database state needs rollback. Do not reset/clean/stash the worktree because the handoff requires preserving current user work.

## Unexecuted checks and blockers

- Authenticated local browser runner scenario: **PASS** for local auth, protected-route reload, and sign-out. The browser-to-Android feature journey remains intentionally unexecuted because Phase 0 does not claim lifecycle or board feature behavior.
- Maestro feature journey: not executed in Phase 0; no feature behavior was changed.
- Android export/debug build: not executed in Phase 0; runner availability was verified instead.
- iOS native build: unavailable on Windows.
- Phase 1–6 implementation, SQL, lifecycle UI, four-lane board, navigation/account overlays, weekly matrix, and final journey: **NOT STARTED**.
- No remote push, production migration, deployment, or publishing occurred.

## Executive summary and gate

Executive summary: `docs/plans/board-refresh/phase-00-executive-summary.md` (now present)

Gate verdict: **REVIEW READY — AWAITING USER**. All Phase 0 criteria pass, including the authenticated local-browser runner evidence. The phase is not committed and local `main` is unchanged; user approval is required before landing or any later phase.

User approval text/reference: the user said “continue” on 2026-09-21 after the Phase 0 halt. Under the handoff, that authorizes this Phase 0-only attempt; it does not authorize landing, Phase 1, remote changes, or production work.

Next phase authorization: **NOT AUTHORIZED**. Phase 1 must not start unless the user explicitly authorizes it after Phase 0 is complete and accepted.
