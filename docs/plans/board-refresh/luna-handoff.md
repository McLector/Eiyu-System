# Luna implementation handoff

> **Current status (2026-09-29):** This is the historical 2026-09-13 handoff. Phases 0–6 later landed, and the user authorized Sol (`gpt-6-sol`, medium) to continue the reopened repairs. The HALTED instruction below applies to the old Phase 0 checkpoint, not the current authorized repair branch. See `2026-09-27-luna-repair-plan.md` and `review-evidence/2026-09-29-repair-final-review.md` for current findings and remaining checks.

Updated: 2026-09-13, after the user's halt and phase-review instructions.
**Status: HALTED — do not resume implementation until the user explicitly says go.**

## Binding contract

Read `docs/plans/2026-09-13-board-navigation-design-plan.md` fully, especially Current progress, section 6 (test-first/user approval), section 7 (phase acceptance tables), and section 8 (executive summary/review package). It supersedes the earlier autonomous phase-to-phase handoff and older archive-only product notes.

Implementation model: **`gpt-5.6-luna` with `xhigh` reasoning**. Do not silently substitute another implementation model. The user or a model they choose may review Luna's output against the plan, this handoff, executive summary, diff, and reproducible evidence.

User-confirmed deletion policy: **delete the actual habit definition permanently, preserve its past history/completions/Weekly Review and earned XP**. Hidden archiving or cascading history destruction is unacceptable.

## Current progress — resume from this checkpoint

- Branch: `codex/board-refresh-phase-00`.
- HEAD and local main: `b840bb723229ba34a19a8a73a07ff3da7e952d81`. No board-refresh commit or main integration exists.
- Plan/handoff are uncommitted. Phase 0 left two uncommitted test-only files:
  - `packages/shared/src/test-support/board-refresh-fixtures.ts`
  - `packages/shared/src/logic/__tests__/board-refresh-fixtures.test.ts`
- No runtime feature code or SQL changed. Phases 1–6 have not started.
- Parent review corrections present: helper moved outside `__tests__`, no-op type assertion removed, recovery schedule includes missed Sunday. The `2026-09-14T12:00:00.000Z` recovery deadline still needs checking against the authoritative rule before use as DB evidence.
- Pre-fixture baseline passed: shared 201 tests, web 26 tests, mobile 16 tests. This does **not** verify the new fixture tests or Phase 0 candidate. No completed new-fixture test result, full Phase 0 gate, DB/browser/Android result, or Phase 0 report was returned.
- `phase-00-report.md` and `phase-00-executive-summary.md` do not exist. Phase 0 is **INCOMPLETE**, not accepted or review-ready.
- Luna terminated with a workspace-credit error; the parent issued an interrupt after the user's halt and found it already errored. Restored credits do not authorize a restart. This document update is not a go-ahead.
- Preserve unrelated untracked `skill-observations/`; do not clean/reset/stash/discard current work.

## User-controlled execution rule

1. **Wait now.** The next user go-ahead may authorize resuming **Phase 0 only**. Do not dispatch/restart an implementation agent until then.
2. Once a phase is authorized, read its `Pn-AC*` acceptance table and behavioral test IDs. Write and run tests before each feature's implementation, save meaningful RED evidence, obtain test-quality review, implement and verify GREEN. Passing characterization tests are not RED proof.
3. Finish only the authorized phase and its entire test/review/evaluation gate. Missing required checks are BLOCKED, never PASS. Do not relax criteria or tailor expectations to implementation; changing the acceptance contract requires user agreement.
4. Produce **both** `docs/plans/board-refresh/phase-NN-report.md` and `docs/plans/board-refresh/phase-NN-executive-summary.md`. The summary maps work to requirement IDs, acceptance IDs, tests/evidence and results, including partial/not-started requirements. Follow plan section 8.
5. When all technical criteria pass, present the package with **REVIEW READY — AWAITING USER** and **STOP**. End the turn. Do not create later-phase tests/code/scaffolding, schedule continuation, or spawn another implementer while waiting.
6. The user may review personally or ask another AI. Parent/reviewer approval, silence, elapsed time, restored credits or passing tests is not user permission. Apply requested corrections only within that phase, repeat affected checks, update report/summary and stop again.
7. After user approval to land the phase, commit it and fast-forward local main only with all gates passed. Record the SHA/post-main smoke result. Then **stop unless the same user message explicitly authorized the next named phase**. Landing and continuation may be authorized together, but permission never extends automatically to later phases.

Every completed phase needs its own approved main commit. Keep intentionally failing RED experiments off main. No remote push, production data change, deployment or publishing is authorized. Do not amend landed commits to conceal later fixes. Use `codex/board-refresh-phase-NN` for subsequent authorized phases.

## Acceptance and executive-summary checklist

| Phase | Acceptance IDs | Requirements to map | Summary filename |
| --- | --- | --- | --- |
| 0 — Foundation | P0-AC1–5 | R11/R13; future features not started | `phase-00-executive-summary.md` |
| 1 — Persistence | P1-AC1–6; LIFE-01–08 | R1/R2/R12 at data boundary; R11/R13 | `phase-01-executive-summary.md` |
| 2 — Lifecycle UI | P2-AC1–5; UI-LIFE-01–06 | R1/R2/R12 end-to-end; R11/R13 | `phase-02-executive-summary.md` |
| 3 — Board | P3-AC1–5; BOARD-01–05 | R3; regressions R1/R2/R12; R11/R13 | `phase-03-executive-summary.md` |
| 4 — Navigation/account | P4-AC1–6; NAV/PROFILE/SETTINGS/AUTH/LAYOUT-01 | R4–R8, shell R9; R11/R13 | `phase-04-executive-summary.md` |
| 5 — Weekly/layout | P5-AC1–5; WEEK-01–04, LAYOUT-02 | Remaining R9, R10, R12 regression; R11/R13 | `phase-05-executive-summary.md` |
| 6 — Final acceptance | P6-AC1–5; FINAL-01–05 | R1–R13 | `phase-06-executive-summary.md` |

Each summary includes: concrete before/after outcome; requirement-to-delivery-to-acceptance-to-evidence matrix; test-first proof; test/build/platform results; resolved and unresolved findings; deviations/limitations; exact reviewer commands and diff; approval state and next phase **NOT AUTHORIZED** by default. Another model must be able to audit without chat history. The detailed report holds full evidence; the executive summary explains outcomes.

If halted or blocked before completion, report **INCOMPLETE/BLOCKED** and list remaining criteria. Never fabricate a completion summary or passing gate. Record actual commit SHAs in the integration ledger after landing rather than trying to embed a commit's own SHA in its contents.

## Technical restart notes

Only after authorization, resume existing Phase 0 files. Check recovery fixtures, verify fresh-object independence with actual mutation tests, run unfinished gates and prepare the review package. Do not start lifecycle implementation or Phase 1 tests while Phase 0 awaits acceptance.

Read AGENTS.md and exact [Expo SDK 54 docs](https://docs.expo.dev/versions/v54.0.0/) before code. Preserve the incumbent design/SDK; apply relevant Supabase/Postgres, native testing, Expo navigation and Impeccable guidance without a rebrand or framework migration.

Working npm launcher:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' <arguments>
```

Canonical SQL: `backend/supabase/*.sql`, loaded in filename order by local seed config; do not assume `supabase/migrations` exists. Reset only verified disposable local targets. Never use production/personal data as fixtures.

The old mobile board test scans source strings; Phase 3 requires actual RNTL interactions. Shared transport mocks do not prove persistence/RLS; Phase 1 requires SQL/security/concurrency execution. Android native E2E is the runnable native gate on Windows; an export is not interaction evidence. Explicitly state iOS native build unavailability.

**Remain halted until the user's go-ahead, then execute exactly one authorized phase and stop with its executive summary for review.**
