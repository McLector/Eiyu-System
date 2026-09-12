# Quest plan Phase 8 report

Phase / date / implementer: Phase 8 — Whole-product evaluation and handoff / 2026-09-12–2026-09-13 / Codex

Requirements and decisions covered: all eight requested changes; the product day starts at 00:00 in the account's persisted IANA timezone; Long Quests remain on their dedicated route/tab; approved legal wording remains unchanged; Expo SDK 54 remains unchanged; no production deployment is part of this phase.

Base main revision / candidate revision / landed main revision: `c5cdf9726f58bbae75e288d9401bc9f2e6f205cd` / recorded by the Phase 8 commit / recorded after local main integration

## Changed files and purpose

- `packages/shared/src/logic/__tests__/whole-product-journey.test.ts` composes the cross-feature client model in one deterministic journey: legal documents, M/W/F eligibility, four-way board partitioning, independent one-time completion, recovery states, simultaneous normal completion plus recovery, and ordered Long Quest descriptions/completion.
- `supabase/tests/007_whole_product_journey.test.sql` runs the persisted journey through a fresh local account, authoritative date/recovery RPCs, rewards, direct-write guards, RLS account switching, reload/idempotency, and ordered Long Quest completion.
- `mobile/maestro/flows/phase8_cross_platform_persistence.yaml` verifies that records created and completed in the real web UI persist into the real Android client for the same disposable local account.
- `mobile/maestro/flows/_helpers/launch_fresh.yaml` reliably dismisses Expo's unlabeled developer-menu tutorial and allows a 60-second cold development-client launch.
- `mobile/maestro/README.md` documents the isolated local-only cross-platform flow and its environment inputs.

No runtime product code, dependency version, schema migration, production configuration, or legal wording changed in Phase 8.

## RED evidence recorded before stabilization changes

- The shared whole-product scenario was authored first against the Phase 7 baseline and passed immediately. It is characterization/regression evidence; it did not justify or require feature code.
- The first database run executed all 37 intended behavioral assertions successfully but failed the pgTAP harness because the declared plan was 36. The plan was corrected to 37 before the complete migration rehearsal passed.
- The first Android cross-platform run timed out at login. Its screenshot and accessibility hierarchy proved Expo's first-run developer-menu tutorial still covered the form; the shared launch helper's hardware-back assumption was false on the Android 35 AVD. The helper was corrected and the unchanged journey reached the board.
- The next Android run verified the complete 3/3 Long Quest and all descriptions, then failed only because the draft flow expected a nonexistent `COMPLETE` badge. The product's actual completion contract is 3/3 plus three accessibility-labelled completed stages. The flow now asserts that stronger contract explicitly.
- A later cold client launch exceeded 30 seconds on the headless emulator, so the helper's cold-start allowance was increased to 60 seconds. One retry was interrupted by a separate Maestro process locking its local session store; no product change was made for that external runner collision.

No deliberately failing test is included in the landed commit, and no product test was weakened to conceal behavior.

## Acceptance criterion -> test identifier -> result

| Criterion | Test/check | Result |
| --- | --- | --- |
| Registration exposes both legal documents before consent and reaches a fresh account | real local browser registration; Phase 7 mobile/web legal integration tests | PASS |
| Account-local product day begins at 00:00 in the persisted IANA timezone | `whole-product-journey.test.ts`; pgTAP fresh-profile timezone assertion; Phase 1 date/timezone suites | PASS |
| M/W/F habit appears in Daily only on scheduled days and remains in All Habits on off-days | shared journey Monday/Tuesday assertions; pgTAP date queries; Saturday web and Android UI journey | PASS |
| Recovery has one authoritative day, succeeds in-window, then resets/unfreezes after a later expiry | shared recovery state sequence; pgTAP open/recovered/expired/current-streak/active-recovery assertions | PASS |
| Normal completion and an outstanding recovery remain simultaneously reachable | shared `simultaneous` board-partition assertion; Phase 2 server regression suite | PASS |
| One-time quests remain separate and reward independently | shared partition assertion; pgTAP completion isolation and INT +20 reward; Sep 12 web completion; Sep 13 Android board exclusion plus Sep 12 history | PASS |
| Long Quests remain dedicated, preserve optional descriptions, reject skips, and complete in order | real web disabled Stage 2/3 state and ordered completion; pgTAP RPC and direct-write rejection; Android 3/3/completed-stage/description assertions | PASS |
| Reload, delayed resume, and account/platform switching preserve consistent state | browser reload at 100%; pgTAP repeat reconciliation/account RLS/idempotency; same-account web-to-Android Maestro journey | PASS |
| Existing rewards, history, authorization, and registration behavior do not regress | complete shared/mobile/web and pgTAP suites; Phase 7 registration tests | PASS |

## GREEN evidence

| Command/check | Result |
| --- | --- |
| Shared Jest suite | PASS — 22 suites, 201 tests |
| Mobile Jest/RNTL suite | PASS — 7 suites, 16 tests |
| Web Vitest/Testing Library suite | PASS — 8 files, 26 tests |
| Shared/mobile/web TypeScript checks | PASS |
| Workspace lint | PASS — 0 errors; 23 pre-existing mobile duplicate-import warnings in untouched files |
| Web production build | PASS — existing Vite native-loader and large-chunk warnings only |
| Local Supabase reset/schema lint/pgTAP | PASS — migrations 001–024; 7 files, 219 assertions |
| Expo SDK 54 dependency check | PASS — dependencies up to date; no versions changed |
| Expo Android export | PASS — Hermes bundle plus 63 assets; temporary export removed |
| Gradle `app:assembleDebug` x86_64 | PASS — 558 tasks; local debug artifact only |
| Real web journey | PASS — Codex in-app browser against disposable local Supabase/Auth |
| Real Android journey | PASS — Android 35 `Medium_Phone` AVD, local SDK 54 development client, Maestro |

The database run used the Docker-backed disposable local stack and exercised migrations, authorization, direct writes, authoritative timestamps, rewards, recovery, account isolation, and idempotency. The web and Android clients used the same local account and persisted records; credentials were synthetic, local-only, and are not recorded here. The platform switch crossed midnight in Asia/Manila: Android showed Sunday Sep 13, kept the M/W/F habit as an off-day catalog item, excluded the Sep 12 one-time quest from today's board, and retained its completion in Sep 12 history. Android remote push remains outside Expo Go on SDK 54, so final native evaluation used the locally compiled development client. No notification behavior was required by this journey.

## Review findings and resolutions

Requirements/test review: every requested behavior maps to executable shared or database evidence and, where presentation/persistence matters, real web and Android interaction. The deterministic test owns time-dependent recovery cases, while the live UI journey uses the host date and verifies the expected Saturday off-day state.

Code/data/security review: Phase 8 adds tests and documentation only. Server-authoritative recovery and Long Quest transitions, authenticated execution grants, RLS ownership, direct-write triggers, immutable completion markers, and reward isolation all passed. Switching to a second database account exposed none of the first account's habits or Long Quest and could not mutate its stage.

UX/accessibility review: the browser exposed independent legal buttons, a consent checkbox, labelled dialogs, distinct board headings, disabled locked stages with explanations, the dedicated Long Quest route, and persisted completion after reload. Android exposed the same separate board sections, `OFF DAY`, dedicated Quests tab, 3/3 state, completed-stage accessibility labels, and all descriptions. One existing editor-copy oddity remains: the Penalty field is still displayed for a one-time quest even though it is labelled as required only for habits and does not block creation. This was not introduced by Phase 8 and does not violate the requested behavior.

No iOS native build is available on this Windows host. Android native compilation and stateful E2E are the applicable native gates. No signed release build, remote service, production database, push, or deployment was run.

## Migration, compatibility, and rollback notes

- Migrations 001–024 rehearse cleanly in order. Phase 8 adds no migration.
- Existing accounts without an initialized timezone retain the tested UTC compatibility boundary until a capable client persists an IANA timezone. Historical date keys are not reinterpreted.
- Old clients may omit Long Quest descriptions; `null` remains valid. Old clients may still use the compatibility `easy_version` field now presented as Penalty.
- Old normal-completion calls remain valid only for eligible current occurrences. Missed-date recovery must use the authoritative recovery RPC; forged or late recovery writes remain rejected.
- Direct or stale Long Quest writes cannot bypass ordering. Clients receive the server state after rejected optimistic attempts.
- Because recovery windows, occurrence history, and completion markers are persisted, a forward repair is safer than destructive rollback after real use. Any rollback must restore earlier RPC bodies/grants and triggers before removing dependent columns or tables. The Phase 7 presentation-only legal change can be rolled back independently.
- No rollback or production rollout was attempted. A local main commit is not a deployment.

Gate verdict: **PASS** — all eight requested changes are traced to passing deterministic, database, real browser, Android, static, bundle, and native-build evidence. No unresolved release gate remains on the supported Windows/Android/web evaluation surface.

Main integration and post-landing verification: recorded after the Phase 8 candidate is committed and fast-forwarded to local main. No remote push or production deployment is authorized.
