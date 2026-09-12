# Quest plan Phase 5 report

Phase / date / implementer: Phase 5 — Strict Long Quest stage sequence / 2026-09-12 / Codex

Requirements and decisions covered: requirement 6; Long Quests remain on their dedicated route/tab, ordered stage progress is authoritative, the first full completion is recorded once, and Expo SDK 54 remains unchanged.

Base main revision / candidate revision / landed main revision: `d2cc152` / recorded after this report commit / recorded after local main integration

## Implementation boundary

Long Quest stages now form a completed prefix. Only the first incomplete stage can be completed, and completed stages can be undone only in reverse order. The shared UI helper mirrors that rule for immediate feedback, but the PostgreSQL guard, row-level ownership checks, and per-quest row lock remain authoritative for direct, stale, repeated, concurrent, and cross-platform requests.

The client transition now uses `set_long_quest_stage_done` instead of a direct table update. Mobile and web disable locked controls, expose the reason to assistive technology, restore the exact cached snapshot after an optimistic failure, and then invalidate the query so server truth is reloaded. Stage editing still uses the existing reconcile RPC, now under the same quest lock and invariant.

`long_quests.completed_at` stores the immutable first time all required stages are complete. Undoing and recompleting the final stage does not create another completion event. Long Quest stages do not currently award XP; the database suite verifies retries and rejected requests leave stats unchanged.

Legacy policy: before enforcement is enabled, every predecessor of an already-completed later stage is marked complete. This preserves all recorded completions and removes no stages, rewards, or history. A legacy quest that is thereby fully complete receives its initial completion marker. The migration-only normalizer is not executable by clients.

## RED evidence recorded before implementation

- Shared sequence contract failed because `stageSequenceState` did not exist.
- Shared data contract failed because `setStageDone` still issued a direct table update instead of an authoritative RPC.
- Mobile and web source contracts failed because locked stages, explanations, and rollback-to-server behavior were absent.
- pgTAP sequence and concurrency suites failed because the transition RPC, legacy normalizer, completion marker, serialization lock, and direct-write protections did not exist.

No deliberately failing test was committed.

## Acceptance criterion -> evidence -> result

| Criterion | Test/check | Result |
| --- | --- | --- |
| Stage 1 unlocks Stage 2; Stage 3 cannot skip Stage 2 | shared `stageSequenceState` suite; pgTAP `004_long_quest_sequence` | PASS |
| Direct writes and unauthorized calls cannot bypass order | pgTAP direct-write and cross-user assertions | PASS |
| Concurrent, repeated, stale, and out-of-order calls serialize safely | two-connection dblink pgTAP `005_long_quest_sequence_concurrency`; idempotency and rejected-reorder assertions | PASS |
| Failed optimistic updates visibly roll back and reload server truth | mobile/web Long Quest source contracts; exact query snapshot restore and unconditional invalidation | PASS |
| Final completion occurs only after all stages and only once | shared completion-state assertion; pgTAP immutable `completed_at` assertions | PASS |
| Undo, reorder, and delete preserve the invariant | pgTAP reverse-undo, transactional reorder rollback, and completed-quest cascade-delete assertions | PASS |
| Legacy out-of-order history is preserved | pgTAP migration-policy assertions and restricted normalizer privilege assertion | PASS |
| Locked state is understandable and accessible on both platforms | mobile/web Long Quest contracts plus full type/lint/build gates | PASS |

## Verification evidence

| Command/check | Result |
| --- | --- |
| Shared Jest suite | PASS — 19 suites, 189 tests |
| Mobile Jest suite | PASS — 5 suites, 11 tests |
| Web Vitest suite | PASS — 6 files, 20 tests |
| Shared/mobile/web TypeScript checks | PASS |
| Workspace lint | PASS — 0 errors; same 26 pre-existing mobile duplicate-import warnings |
| Web production build | PASS — pre-existing Vite native-loader and large-chunk warnings |
| Local Supabase reset/schema lint/pgTAP | PASS — no schema errors; 5 files, 162 tests, including two real concurrent database connections |
| Local Supabase database advisors | PASS — no errors; pre-existing `auth_rls_initplan` performance warnings on older policies only |
| Expo `install --check` | PASS — dependencies current; no upgrade performed |
| Expo Android export | PASS — Hermes bundle plus 63 assets; temporary export removed |
| Gradle `assembleDebug` x86_64 | PASS — 783 tasks; local debug artifact only |

The concurrency test connects two independent PostgreSQL sessions through the isolated local Supabase Docker stack. One transaction holds the quest lock while completing Stage 1; the other waits, rechecks after commit, and completes Stage 2 exactly once. The local test password and published port are Supabase's disposable local defaults, not production credentials. All asynchronous dblink results are drained and the stack is stopped after verification.

The Android build used Android Studio's bundled JDK and a temporary short-path `Q:` mapping to avoid Windows' generated C++ path limit; the mapping was removed. No iOS native compilation is available on the Windows host. The authentication-gated UI was evaluated through deterministic rendered/source contracts rather than shared account data; no production credentials were used. Stateful Maestro remains unavailable without an isolated signed-in fixture.

Requirement review found no need to add a Long Quest reward system: enforcing the sequence while asserting stats remain unchanged preserves current behavior. Security review retained invoker rights for client RPCs, explicit authenticated execution grants, revoked internal helper execution, RLS ownership checks, a composite parent/owner foreign key, direct-write triggers, transactional reorder rollback, and server-managed immutable completion timestamps.

No Edge Function, remote database, signed build, production service, push, or deployment occurred. Expo SDK 54 and dependency versions are unchanged.

Gate verdict: **PASS** — Phase 5's authoritative sequencing, concurrency, idempotency, ownership, rollback/reload, completion-marker, migration-policy, accessibility, regression, and build gates pass. Local main integration and post-landing verification follow; Phase 6 must not begin unless those checks remain green.
