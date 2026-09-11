# Quest plan Phase 0 report

Phase / date / implementer: Phase 0 — repository map, baseline, and executable test foundation / 2026-09-11 / Codex

Requirements and decisions covered:

- The canonical product day starts at `00:00` in a persisted account IANA timezone. The initial value comes from the device timezone when the account first receives the capability. Mobile, web, and authoritative writes must use the same value. A later timezone change applies prospectively and cannot move historical occurrences or an open recovery deadline.
- Long Quests remain in the existing dedicated mobile tab and web route. They are not duplicated onto the board.
- The existing registration consent requirement and legal content remain the baseline for now. Phase 7 is limited to presentation, accessibility, navigation, and verified stale terminology unless an explicit later decision changes the content.
- “Penalty” is a presentation rename of the current Easy Version behavior. Current behavior is preserved: a normal completion awards 20 XP and an easy/recovery completion awards 4 XP.
- Freeze/recovery state is per habit in the current shared logic; no global-streak mismatch was found.

Base main revision / candidate revision / landed main revision: `f6af5880e77671ba2edb4f18d1a78005cf91ed57` / recorded in the final handoff after this report commit / recorded in the final handoff after main integration

## Repository and behavior map

| Concern | Current source of truth and observed baseline | Likely implementation surface |
| --- | --- | --- |
| Mobile shell and board | `mobile/app/_layout.tsx`, `mobile/app/(tabs)/board.tsx`, Expo Router 6 on Expo SDK 54 | Mobile board, editor, history, notifications, and root providers |
| Web shell and board | `web/src/pages/BoardPage.tsx`, `web/src/web/WebBoard.tsx`, `web/src/store/eiyu-store.ts` | Web board, editor, history, auth, query/cache wiring |
| Shared schedule/date contract | `packages/shared/src/logic/date-utils.ts`, `quest-recurrence.ts`, `packages/shared/src/data/habits.ts` | Phase 1 IANA-calendar helpers, eligibility, queries, and write validation |
| Current day policy | UTC date keys and `getUTCDay()` are used across recurrence, streaks, history, heatmaps, weekly features, and completion defaults | Phase 1 must migrate the whole date contract, not one weekday call |
| Daily query | `fetchTodayHabits` applies `todayQuestsFilter` and then loads only 90 days of completion history | Phase 1/2 query split so off-day recovery and long streaks do not disappear |
| Recovery | `packages/shared/src/logic/eiyu-logic.ts` derives active/frozen/broken client-side; recovery currently backdates an easy completion to the missed date | Phase 2 persisted/authoritative state machine and reconciliation |
| Completion boundary | `backend/supabase/014_server_side_xp.sql` exposes `complete_habit`, accepts a client-provided completion date, and does not enforce schedule/recovery eligibility | Phase 1/2 authoritative RPC checks, idempotency, and authorization tests |
| Board grouping | Daily and one-time items are split in shared logic, but displayed inside the current Daily Quests board container/count | Phase 4 Daily, Recovery, One-Time, and All Habits board sections |
| Habit catalog | `fetchAllActiveHabits` exists for reminder data, not a complete management catalog | Phase 4 catalog query/selector without an off-day completion bypass |
| Long Quests | Dedicated mobile tab and web route already exist. `packages/shared/src/data/long-quests.ts` directly updates stage `done` state | Phase 5 authoritative sequential-stage operation plus locked UI |
| Stage descriptions | Migration `016_long_quest_descriptions.sql`, shared transport, and display already support descriptions; editor inputs are incomplete | Phase 6 editor create/edit/clear validation and compatibility coverage |
| Registration/legal | `mobile/app/auth.tsx`, `web/src/web/WebAuth.tsx`, `web/src/pages/AuthPage.tsx`, and `packages/shared/src/logic/auth-copy.ts` | Phase 7 presentation/accessibility; content changes only when verified |
| Database layout | Canonical SQL remains `backend/supabase/001_*.sql` through `020_*.sql`. `supabase/config.toml` now provisions an isolated Postgres 17 stack and applies those files in filename order on reset | Use `npm run db:verify` before persistence work; do not target a linked or remote project |
| CI | No `.github/workflows` directory was found | A future CI decision is required; local commands below are the current reproducible gate |

## Changed files and purpose

- `docs/plans/mobile-web-quest-design-plan.md`: recorded the confirmed local-midnight, Long Quest placement, and legal-content decisions and updated later acceptance examples.
- `docs/plans/quest-phase-00-report.md`: this repository map and evidence log.
- `mobile/components/__tests__/component-harness.smoke.test.tsx`: accessible React Native render/interaction smoke test.
- `web/src/__tests__/component-harness.smoke.test.tsx`: accessible browser component render/interaction smoke test under jsdom.
- `mobile/package.json`, `web/package.json`, `package-lock.json`: added the component-test harness dependencies; pinned the two native dependencies to Expo SDK 54-compatible versions.
- `package.json`, `package-lock.json`: pinned Supabase CLI `2.117.0` and added local database lifecycle/verification commands.
- `mobile/scripts/windows-native-staging.init.gradle`: added a tracked, opt-in native build staging-directory workaround for Windows checkouts that exceed Ninja's path limit; generated Expo files and default CI/non-Windows behavior are unchanged.
- `scripts/local-db.ps1`: local-only Supabase wrapper that discovers Docker Desktop, attaches the stack to a dedicated Docker network, warns about Windows host exposure, exposes explicit start/reset/lint/test/verify/stop actions, and always stops the verification stack even when a gate fails.
- `supabase/config.toml`, `supabase/.gitignore`: reproducible local Supabase/Postgres 17 configuration using ports `55320`–`55329`, outside this Windows host's reserved `54290`–`54789` range; canonical SQL is referenced without duplication.
- `supabase/tests/001_phase_zero_foundation.test.sql`: deterministic two-user pgTAP fixtures and schema/RLS/RPC/idempotency checks.
- `README.md`: corrected the documented migration range from 001–014 to 001–020.

## Acceptance criterion -> test identifier -> result

| Criterion | Test/check | Result |
| --- | --- | --- |
| Mobile component runner can render and operate through accessibility semantics | `mobile component test harness > renders and interacts through the accessibility contract` | PASS |
| Web component runner can render and operate through accessibility semantics | `web component test harness > renders and interacts through the accessibility contract` | PASS |
| Existing shared behavior remains characterized | 17 shared suites / 159 tests | PASS |
| Existing mobile tests plus new harness pass | 2 suites / 5 tests | PASS |
| Existing web tests plus new harness pass | 3 files / 13 tests | PASS |
| Expo-native dependencies match SDK 54 | `expo install --check` | PASS after exact-version alignment |
| Android JavaScript/assets bundle | `expo export --platform android` | PASS |
| Native Android debug assembly | Gradle `assembleDebug` for the available emulator ABI | PASS using the opt-in short native staging directory |
| Isolated persistence/RLS/RPC test boundary | `npm run db:verify` and `001_phase_zero_foundation.test.sql` | PASS — clean reset applied 001–020, schema lint passed, 23 pgTAP checks passed |

## RED evidence recorded before feature code

- Mobile harness: `C:\Program Files\nodejs\npm.cmd run test --workspace=@eiyu/mobile -- --runInBand components/__tests__/component-harness.smoke.test.tsx` failed because `@testing-library/react-native` was not installed. This was an intentional infrastructure RED, not feature evidence.
- Web harness: `C:\Program Files\nodejs\npm.cmd run test --workspace=@eiyu/web -- src/__tests__/component-harness.smoke.test.tsx` failed because `@testing-library/react` could not be resolved. This was an intentional infrastructure RED, not feature evidence.
- SDK compatibility: `..\node_modules\.bin\expo.cmd install --check` reported installed `@react-native-community/datetimepicker@8.6.0` versus expected `8.4.4`, and `react-native-keyboard-controller@1.22.4` versus expected `1.18.5`.
- Database CLI foundation: the repository-local Supabase executable was absent before `supabase@2.117.0` was pinned.
- Database runner: `npm run db:test` initially failed with `ECONNREFUSED 127.0.0.1:54322`, proving the test did not silently target a remote database. After local provisioning, the same test reached pgTAP.
- Database test implementation: the first pgTAP execution failed because a data-modifying CTE was nested inside a test assertion. The assertions were corrected to execute the updates and independently verify that RLS left the underlying rows unchanged.
- No quest feature implementation was written in Phase 0, so feature RED evidence begins separately in Phase 1 after this gate is resolved.

## GREEN evidence

Run environment: Windows, Node `22.18.0`, npm `10.9.3`, Expo CLI `54.0.27`, OpenJDK `21.0.10`, Android SDK compile/target 36. PowerShell resolves a broken user-level `npm.ps1`, so reproducible commands use `C:\Program Files\nodejs\npm.cmd` explicitly.

| Command | Result |
| --- | --- |
| `C:\Program Files\nodejs\npm.cmd run test --workspace=@eiyu/shared -- --runInBand` | PASS — 17 suites, 159 tests |
| `C:\Program Files\nodejs\npm.cmd run test --workspace=@eiyu/mobile -- --runInBand` | PASS — 2 suites, 5 tests |
| `C:\Program Files\nodejs\npm.cmd run test --workspace=@eiyu/web` | PASS — 3 files, 13 tests |
| `C:\Program Files\nodejs\npm.cmd run lint` | PASS — 0 errors; 26 pre-existing duplicate-import warnings in mobile |
| `.\node_modules\.bin\tsc.cmd --noEmit -p packages/shared/tsconfig.json` | PASS |
| `.\node_modules\.bin\tsc.cmd --noEmit -p mobile/tsconfig.json` | PASS |
| `.\node_modules\.bin\tsc.cmd --noEmit -p web/tsconfig.json` | PASS |
| `C:\Program Files\nodejs\npm.cmd run build --workspace=@eiyu/web` | PASS — Vite build; pre-existing native-config-loader and 500 kB chunk warnings |
| `C:\Program Files\nodejs\npm.cmd run db:verify` | PASS — local Postgres 17 reset; canonical SQL 001–020 applied; public-schema lint clean; 23 pgTAP checks passed; verification stack stopped automatically |
| `..\node_modules\.bin\expo.cmd install --check` from `mobile/` | PASS — dependencies are up to date |
| `..\node_modules\.bin\expo.cmd export --platform android --output-dir .expo\phase0-export --clear` from `mobile/` | PASS — Android Hermes bundle exported locally; no deployment |
| `.\gradlew.bat assembleDebug --init-script ..\scripts\windows-native-staging.init.gradle -PreactNativeArchitectures=x86_64 -Pandroid.cxxBuildStagingDirectory=C:\Temp\eiyu-cxx` from `mobile/android/` | PASS — debug APK assembled, then the tracked init-script form reproduced the pass in 22s; no deployment |

## Integration / migration / authorization / concurrency results

The pinned Supabase CLI started a local Postgres 17 container on a dedicated Docker network. A clean reset applied canonical SQL files 001–020 in filename order, and `supabase db lint --local --schema public --level error --fail-on error` reported no schema errors. The pgTAP suite passed 23 checks covering expected schema, RLS enabled on all ten application tables, two-user habit/stage read and update isolation, cross-user insert rejection, completion RPC ownership, duplicate completion rejection, and no duplicate/cross-user XP award. The suite uses deterministic UUID/date fixtures and rolls back its data.

On this Windows/Docker Desktop host, direct inspection showed that the current Supabase CLI publishes database port `55322` on `0.0.0.0` and `::` even though the custom bridge requests Docker's `127.0.0.1` default binding. The harness therefore warns before startup and `db:verify` stops the stack in a `finally` block on both success and failure. Manual `db:start` use is limited to a trusted network and must be followed by `db:stop`; localhost-only exposure is not claimed.

No feature write path changed in Phase 0, so a new concurrency behavior is not claimed. The duplicate-completion/idempotency baseline is covered; phase-specific race tests remain required before changing recovery, completion, or stage operations. The local commands used explicit `--local` behavior and did not access the repository's linked project metadata. No remote database, migration, Edge Function, or production service was changed.

## Mobile targets, web browsers, build and evaluation evidence

- Android SDK has one AVD named `Medium_Phone`; no device was connected during the baseline probe.
- The Android JavaScript/assets export passed.
- The initial `assembleDebug` failed because Ninja rejected a generated `react-native-keyboard-controller` object path longer than 260 characters. An NTFS short-name attempt was normalized back to the long path, and a temporary `Q:` mapping was incompatible with React Native codegen's single-root checks. The tracked Gradle init script uses the Android plugin's supported `buildStagingDirectory` setting to move only native staging to `C:\Temp\eiyu-cxx`; the x86_64 debug APK then assembled successfully without moving the repository, editing generated native sources, or changing Expo SDK 54.
- No Maestro flow was run: it requires an installed dev client and uses a shared remote test account whose backend isolation was not established.
- Web component behavior and production build passed. No browser E2E flow changed in Phase 0, and no browser automation suite currently exists.

## Requirement/test review findings and resolutions

- The original UTC planning default conflicted with the owner's local-midnight decision. The plan now requires a complete persisted-IANA-timezone migration in Phase 1 and explicitly covers 23-hour/25-hour days and cross-device behavior.
- The original board list included Long Quests. It now preserves the dedicated tab/route and tests navigation without duplicating Long Quest data onto the board.
- Stage descriptions are partly implemented already; Phase 6 must extend the editor/validation path rather than add a duplicate database column.
- Phase 1 and Phase 2 require genuine feature RED tests; the harness installation failures recorded here cannot substitute for those tests.

## Code/data/security review findings and resolutions

- `complete_habit` currently trusts the client-supplied completion date and lacks authoritative schedule/recovery validation. This is a known Phase 1/2 security gap and must be covered by direct invalid-write tests before implementation.
- Long Quest stage completion is a direct table update, so UI-only stage locking would be bypassable. Phase 5 must replace or guard this write at the authoritative boundary.
- The 90-day history slice can make long-streak/recovery derivation incomplete. Phase 1/2 must stop relying on a truncated client history for authoritative state.
- `npm audit` after adding the pinned local database CLI reports 34 transitive advisories (25 moderate, 9 high). Suggested automatic fixes include breaking upgrades such as Expo 57. The owner explicitly directed that SDK 54 not be changed for now, so this is recorded as deferred baseline debt rather than modified in this delivery.
- No credentials or personal production data were logged, and no production deployment occurred.

## UX/accessibility evaluation findings and resolutions

- The new mobile and web component probes select and activate controls through role/name contracts, establishing an executable accessibility-oriented component harness.
- No product screen changed in Phase 0, so screen-level large-text, keyboard, screen-reader, loading/error/offline, or responsive evaluations are not claimed.

## Regression and static/build results

All shared/mobile/web unit and component suites, the isolated database reset/lint/23-test suite, lint, three TypeScript checks, the web production build, Expo SDK dependency validation, the Android JS bundle, and the Android x86_64 debug assembly pass. Existing warnings are recorded above. Real-device/browser journeys are not claimed.

## Skipped/unavailable checks and blocking reasons

1. Stateful Maestro flows were skipped because Phase 0 changes only test infrastructure and no product journey. The isolated backend and x86_64 debug APK prerequisites now exist for later feature phases.
2. No iOS native build ran because this is a Windows host. Shared/mobile tests and Android native/export checks are the available mobile baseline.
3. The current SDK 54 dependency advisories are recorded but intentionally deferred under the owner's explicit instruction not to change SDK 54 for now.

## Migration, compatibility, rollback notes

- Phase 0 made no schema or production-data changes.
- The test dependencies, pinned local Supabase CLI, local configuration, and SDK-compatible native dependency pins can be reverted through the package manifest/lockfile and Phase 0 harness files; no production runtime-data rollback is involved.
- Phase 1 must add a backward-compatible persisted timezone contract, define how existing accounts receive an initial timezone, preserve historical date keys, and reject/handle old clients that omit timezone-aware data. That design must be tested against an isolated database before any migration is applied remotely.
- Production deployment remains the existing manual process. The new local rehearsal path references `backend/supabase/*.sql` directly, so it detects filename-order compatibility without moving or duplicating canonical migrations.

Gate verdict: **PASS** — the repository map, component harnesses, isolated persistence/RLS/RPC environment, static checks, web build, Android export, and Android native build all pass. SDK 54 audit remediation remains explicitly deferred by the owner.

Main integration and post-landing verification occur after this report is committed. Their resulting revisions and outcome are recorded in the final handoff. Phase 1 must not begin until that integration gate passes.
