# Quest plan Phase 2 report

Phase / date / implementer: Phase 2 — one-day frozen streak recovery / 2026-09-11 / Codex

Requirements and decisions covered:

- A streak freezes only after an eligible occurrence ends incomplete. The recovery remains open through the following calendar day in the occurrence's persisted IANA timezone; its deadline is an immutable absolute instant.
- Recovery state, the preserved streak, reconciliation progress, and resolution are persisted and server-authoritative. Recovery accepts no client date or clock.
- Recovery remains visible on an off-day without creating a Daily Quest. If the habit is scheduled today, today's normal completion and recovery remain independent and can be completed in either order.
- Successful recovery uses the existing easy-version effect: one `easy` completion on the missed occurrence and 4 XP. Duplicate, stale, expired, forged, and unauthorized operations cannot duplicate or extend it.
- The product day remains account-local midnight. Long Quests, consent/legal content, and Expo SDK 54 remain unchanged.

Base main revision / candidate revision / landed main revision: `a4c09cf50a5ac45fe5b2c826233b0f106434228b` / recorded after this report commit / recorded after main integration

## Changed files and purpose

- `backend/supabase/022_habit_recovery_state_machine.sql`: pins occurrence timezones/end instants; adds persisted recovery windows and streak-reconciliation state; adds read/reconcile/recovery RPCs; separates normal today-only completion/undo/progress from server-owned recovery; preserves deadlines across schedule/timezone edits; tightens write privileges.
- `supabase/tests/003_recovery_state_machine.test.sql`: 57 pgTAP assertions covering freeze/open/recover/expire/reset, off-day access, idempotency, action ordering, absence/replay, deadline immutability, forged time/date, ownership, and direct-write denial.
- `supabase/tests/002_scheduled_eligibility.test.sql`: retains the Phase 1 rejection contract under the stricter today-only normal-operation boundary.
- Shared completion/habit adapters and database/domain types: expose authoritative recovery RPCs and merge recovery-only habit definitions without marking them Daily-eligible.
- Shared logic test/selector: keeps recovery visible after today's independent normal completion.
- Mobile/web stores and boards: call the recovery-specific RPC, show the persisted deadline/timezone, keep off-day recovery outside Daily counts/lists, and keep today's normal action usable while recovery is open.
- `mobile/lib/notifications.ts`: describes a one-day calendar recovery window instead of an inaccurate fixed 24-hour duration.
- `web/src/web/__tests__/WebBoard.recovery.test.tsx`: verifies recovery remains visible and actionable after today's normal completion.
- `README.md`: documents canonical migrations through 022.

## RED evidence recorded before feature code

- The recovery adapter tests failed to compile because `completeHabitRecovery` did not exist.
- The off-day adapter test returned an empty array because the prior early return discarded recovery whenever no habit was scheduled today.
- The initial Phase 2 pgTAP contract failed because the recovery table/state/RPCs did not exist.
- The hardened undo test proved the old RPC could delete a server-owned missed-day recovery completion; the migration was changed to enforce account-today-only undo.
- The selector test proved today's normal completion hid an otherwise-open recovery; the selector was changed so only server reconciliation clears recovery visibility.

## Acceptance criterion -> evidence -> result

| Criterion | Test/check | Result |
| --- | --- | --- |
| Freeze begins only after an eligible incomplete day ends and preserves the prior streak | Phase 2 pgTAP occurrence/window/preserved-streak assertions | PASS |
| Valid recovery and exact-deadline rejection | Phase 2 pgTAP recover/expire/completion/XP assertions | PASS |
| Reload, another miss, schedule edit, timezone edit, and duplicate submission do not extend or duplicate | Phase 2 pgTAP deadline/idempotency/replay assertions | PASS |
| Off-day recovery is accessible but not a Daily Quest | pgTAP query separation plus `habits.test.ts` recovery-only adapter case | PASS |
| Multi-day absence and repeated reconciliation converge | Phase 2 pgTAP absent-for-days/idempotency assertions | PASS |
| Normal completion and recovery work in either order exactly once | Phase 2 pgTAP normal-first/recovery-first completion and XP assertions | PASS |
| Client date/clock, stale/late delivery, other users, and direct writes cannot bypass state | RPC has no date/clock; pgTAP forged date, deadline, ownership, table-write, and undo assertions | PASS |
| Recovery remains visible after today's normal completion | shared `frozenQuests` test and web recovery component interaction | PASS |
| Mobile and web consume one authoritative recovery contract | shared adapter tests, three type checks, platform suites, Expo export, web/native builds | PASS |

## GREEN evidence

Run environment: Windows x86_64, Node `22.18.0`, Expo SDK `54`, Docker Desktop Engine `29.7.2` (`linux/x86_64`), local Supabase/Postgres 17. No remote or production environment was used.

| Command/check | Result |
| --- | --- |
| Shared Jest suite | PASS — 18 suites, 180 tests |
| Mobile Jest suite | PASS — 2 suites, 5 tests |
| Web Vitest suite | PASS — 4 files, 14 tests |
| Shared/mobile/web TypeScript checks | PASS |
| Workspace lint | PASS — 0 errors; same 26 pre-existing mobile duplicate-import warnings |
| Web production build | PASS — pre-existing Vite native-loader and large-chunk warnings |
| Local schema lint | PASS — no public-schema errors |
| Local pgTAP | PASS — 3 files, 111 tests (23 Phase 0 + 31 Phase 1 + 57 Phase 2) |
| Expo `install --check` | PASS — dependencies are up to date; no upgrade performed |
| Expo Android export | PASS — Hermes bundle plus 63 assets, local output removed after verification |
| Gradle `assembleDebug` x86_64 | PASS — Android Studio bundled JDK and temporary short-path mapping; debug build only |
| `git diff --check` and credential-pattern review | recorded by final gate |

## Persistence, migration, security, and race review

Recovery windows reference immutable `(habit_id, occurrence_date)` rows, allow one open window per habit, and persist `opened_at`, exclusive `deadline_at`, status, and resolution. Occurrence boundaries are backfilled from the profile timezone, falling back to UTC only when a legacy account has no recoverable timezone. There was no persisted frozen timestamp before migration 022; representative historical occurrence/completion data is deterministically replayed, expired opportunities close immediately, and current `best` values are retained.

The single-habit reconciler locks persisted streak state before changing a window. Recovery completion locks the same state/window path, uses the unique completion key, and awards XP only when its insert wins. Concurrent/repeated calls therefore resolve as one recovery plus idempotent `already_recovered`; normal completion has a distinct date key and can coexist. API roles can read their recovery/streak state but cannot forge recovery windows, persisted streak state, occurrences, completions, or progress. Normal completion, quantity progress, and undo are account-today-only.

No migration was pushed and no Edge Function, remote database, production service, signed build, installation, or deployment was performed.

## Platform and UX evaluation

- Mobile and web both show recovery outside the Daily eligibility/count calculation and include its absolute deadline rendered in the occurrence's original timezone.
- Web component interaction proves the recovery action remains present after today's normal completion; the shared adapter proves a recovery-only off-day still reaches both clients.
- Web production assets, Expo Android/Hermes assets, and the Android x86_64 native debug APK build successfully against Expo SDK 54.
- The first native build attempt selected system Java 8; explicitly using Android Studio's bundled JDK reached native compilation. The long repository path then exceeded Windows' C++ 260-character path limit, so the successful run used a temporary `Q:` mapping that was removed afterward. No source/config/dependency workaround was committed.
- Stateful signed-in Maestro/browser testing remains unavailable without an isolated local-auth fixture. The existing configured journey relies on a shared remote account, which was not used under the no-production-change rule. iOS native compilation is unavailable on this Windows host.

## Compatibility and rollback notes

- Migration 022 is additive for occurrence/recovery/streak storage and replaces recovery-sensitive RPC definitions. Existing habit/completion history remains intact.
- Old clients can still complete/undo today's eligible normal occurrence. Their former missed-date recovery call through `complete_habit` is rejected; updated clients must use `complete_habit_recovery`, preventing forged dates and late offline delivery.
- A rollback must restore the prior RPC bodies/grants before removing recovery state. Once windows have resolved and recovery completions exist, a forward repair is safer than deleting persisted state.
- Expo SDK and dependency versions were not changed.

Gate verdict: **PASS** — Phase 2's authoritative recovery state machine, off-day access, ordering/idempotency/security contracts, platform regressions, web build, Android export, and native debug build pass. Main integration and post-landing verification follow this report; Phase 3 must not begin unless that integration gate remains green.
