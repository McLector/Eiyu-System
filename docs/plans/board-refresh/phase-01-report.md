# Phase 01 report — safe lifecycle persistence and history preservation

Phase / date / implementer: Phase 1 — persistence / 2026-09-21 / Codex, continuing the Luna-scoped handoff

Plan: `docs/plans/2026-09-13-board-navigation-design-plan.md`

Handoff: `docs/plans/board-refresh/luna-handoff.md`

Status: **REVIEW READY — AWAITING USER**

Base main SHA: `ace2a58f8d8e926e0b9902ba6836bbabf3c7a964` — approved Phase 0 landing

Candidate: uncommitted working tree on `codex/board-refresh-phase-01`

No remote, production, deployment, or user-data action was performed. The local database was disposable and synthetic.

## Scope and outcome

Phase 1 adds the persistence boundary required before lifecycle UI work:

- Permanent delete removes the executable habit row and dependent executable state, while snapshotting dated scheduled and completion evidence into an owner-scoped immutable ledger.
- Archive and restore retain the same definition and ID, record account-timezone archive intervals, pause occurrence materialization, and preserve open recovery deadlines.
- Archive, restore, and delete use ownership-checked RPCs; direct authenticated habit DELETE and direct ledger writes are blocked.
- History, Weekly Review, recurring Weekly Quest progress, and AI summary inputs read archived/deleted evidence consistently.
- Generated database types and shared transport now expose the explicit lifecycle operations.

Visible lifecycle controls, stores, reminder reconciliation, board lanes, and cross-platform UI journeys remain intentionally **not implemented**; those are Phase 2+ work.

## Acceptance IDs -> evidence -> result

| Acceptance | Evidence | Result |
| --- | --- | --- |
| P1-AC1 / LIFE-01, LIFE-03 | `supabase/tests/008_habit_lifecycle_persistence.test.sql`: actual habit absence, dependent completion/progress/streak cleanup, retained scheduled and completion-only dates, XP preservation, idempotent retry. | PASS |
| P1-AC2 / LIFE-02, LIFE-03 | `008` ledger assertions plus `packages/shared/src/data/__tests__/lifecycle-readers.test.ts` and `lifecycle.test.ts`: History denominators/details, Weekly Review totals, recurring Weekly Quest counts, AI inputs, archived definitions, and deleted rows. | PASS at the Phase 1 data boundary; UI before/after journey is deferred to Phase 2. |
| P1-AC3 / LIFE-04 | `008`: authenticated owner/other-owner behavior, RLS, direct DELETE denial, forged-ledger denial, and account-deletion cascade. New ledger/interval policies use owner-scoped SELECT only. | PASS |
| P1-AC4 / LIFE-05 | `supabase/tests/009_habit_lifecycle_concurrency.test.sql`: two independent sessions race delete/delete and committed completion/delete; row locks serialize outcomes, XP is awarded once, and retained evidence is copied once. | PASS |
| P1-AC5 / LIFE-06–08 | `008`: same-day archive/restore, one-time archive/restore, legacy archive, off-day restore, account-timezone interval, open recovery deadline, stale writes, and no paused-day backfill. Existing schedule/timezone/recovery suites remain green. | PASS |
| P1-AC6 / R11, R13 | Fresh reset, schema lint, full pgTAP, populated upgrade rehearsal, shared/web/mobile tests, TypeScript, web build, Expo SDK 54 config/lint, advisor review, report, and summary. | PASS; review-ready stop |

## Test-first proof

The Phase 1 implementation began with failing tests:

1. The initial SQL lifecycle contract failed against the pre-Phase-1 schema because `deleted_habit_history`, `habit_archive_intervals`, `archive_habit`, `restore_habit`, and `delete_habit` did not exist.
2. The initial shared transport test failed with missing exports for `deleteHabit` and `restoreHabit`.
3. The additive SQL boundary, RPC transport, generated types, readers, and focused mocks were then implemented.
4. The focused shared lifecycle/readers tests passed: 2 suites / 5 tests, followed by the full shared suite.
5. The final SQL lifecycle tests passed: persistence 58 assertions and concurrency 37 assertions.

No failing assertion was removed or weakened to make the implementation pass. The existing scheduled-eligibility test had two date-sensitive total-count oracles that assumed the machine was still on 2026-09-13. They were made deterministic by asserting preservation of the three fixed historical date keys; its original fixed-date assertions remain intact.

## Changed files and why

- `backend/supabase/025_habit_lifecycle_persistence.sql`: additive ledger, archive intervals, trigger compatibility, paused materialization, and lifecycle RPCs.
- `supabase/tests/008_habit_lifecycle_persistence.test.sql`: lifecycle, authorization, history, archive, recovery, stale-write, timezone, off-day, one-time, and account-isolation tests.
- `supabase/tests/009_habit_lifecycle_concurrency.test.sql`: independent-session locking and completion/delete race tests.
- `packages/shared/src/types/database.ts`: ledger/interval table types and lifecycle RPC signatures.
- `packages/shared/src/data/habits.ts`: explicit archive/restore/delete RPC transport.
- `packages/shared/src/data/history.ts`: deleted ledger rows merged into history details and denominators.
- `packages/shared/src/data/weekly-review.ts`, `weekly-quest.ts`, `weekly-summary.ts`: archived/deleted evidence included in weekly readers and AI inputs.
- `packages/shared/src/data/__tests__/lifecycle.test.ts`, `lifecycle-readers.test.ts`: RED/GREEN transport and reader contracts.
- Existing History/summary test mocks: empty retained-ledger responses for unchanged tests.
- `supabase/tests/002_scheduled_eligibility.test.sql`: date-independent historical-key oracle; no product behavior changed.
- `docs/plans/board-refresh/integration-ledger.md`: Phase 0 landed SHA and smoke evidence.

## GREEN commands and results

| Check | Result |
| --- | --- |
| Local Supabase reset + `db lint` + all tests | PASS — schema lint clean; 9 pgTAP files / 314 tests |
| Phase 1 persistence SQL | PASS — 58 assertions |
| Phase 1 concurrency SQL | PASS — 37 assertions |
| Populated upgrade rehearsal | PASS — synthetic pre-Phase-1 archived habit, occurrence, completion, and account survived migration; new delete retained history and removed executable rows; cleanup completed |
| Shared Jest | PASS — 25 suites / 210 tests |
| Shared TypeScript | PASS |
| Web Vitest | PASS — 8 files / 26 tests |
| Mobile Jest | PASS — 7 suites / 16 tests |
| Web TypeScript | PASS |
| Mobile TypeScript | PASS |
| Web production build | PASS — 742 modules transformed |
| Web ESLint | PASS — 0 errors |
| Expo SDK 54 lint | PASS — 0 errors; 23 incumbent duplicate-import warnings |
| Expo config | PASS — reports `sdkVersion: 54.0.0` |
| Supabase advisors | PASS at error threshold; incumbent WARN-level RLS init-plan recommendations remain |
| `git diff --check` | PASS |

The repository PowerShell npm launcher currently resolves to a missing roaming `npm-cli.js`; direct repository-local Jest/Vitest/TypeScript/Expo/Vite/ESLint binaries were used for reproducible checks. This is an environment/tooling warning, not a Phase 1 source failure.

Known non-blocking warnings: Vite’s incumbent native config-loader/large-chunk warnings; mobile’s incumbent duplicate-import warnings; Supabase’s existing WARN-level RLS init-plan recommendations. The new Phase 1 policies use `(select auth.uid())` and introduced no advisor error.

## Data and security review

- `source_habit_id` is deliberately not a foreign key, so deletion can preserve evidence after the executable definition is gone.
- Ledger uniqueness `(user_id, source_habit_id, historical_date)` makes repeated delete/retry and serialized races idempotent.
- Ledger and archive intervals have RLS enabled, owner-only SELECT grants, and no authenticated INSERT/UPDATE/DELETE grants.
- Lifecycle functions are `SECURITY DEFINER`, use fixed `search_path = ''`, require `auth.uid()`, lock the owner row, and are granted only to `authenticated`.
- Direct authenticated DELETE on `public.habits` is revoked; existing direct archive updates remain compatible through the tested archive-interval trigger.
- Account deletion cascades profile-owned ledger and interval rows through `auth.users`.
- Earned XP is not reversed by permanent deletion.

## Compatibility and limitations

- The migration is additive and was exercised both on a fresh reset and against a populated synthetic pre-Phase-1 schema rehearsal.
- Existing clients that still update `habits.archived` remain compatible with interval recording; new clients use explicit RPCs.
- This phase does not add UI action labels/confirmations, store cache invalidation, reminder cancellation/rescheduling, or web/Android lifecycle journeys.
- iOS native execution is unavailable on this Windows host and is not claimed.
- No production migration was applied. Phase 1 remains uncommitted pending user review.

## Gate and next boundary

Phase 1 is **REVIEW READY — AWAITING USER**. Do not commit or start Phase 2 until the user explicitly approves this package. The next phase is **NOT AUTHORIZED** by default.
