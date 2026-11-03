# S02 shared lane handoff (running)

Lane: `packages/shared/src/**` (not `index.ts`, not `types/database.ts`). Contract: `2026-10-24-s02-parallel-contract.md`.

## Decisions
- parseTrackerAccess projects the contract fields (extra fields are dropped, never retained); unknown enum values, missing fields, contradictory grants and a foreign owner throw "Tracker access unavailable.".
- All tracker RPCs are pinned to the expected owner with `authorizationForOwner` + `.setHeader('Authorization', ...)`, as the weekly summary does.
- Shared test helper: `src/test-support/tracker-rpc.ts` (thenable rpc builder with setHeader).

- Contract re-read 2026-10-24 (Server facts block, custom chain name required): transport builds a fresh four-key p_expected literal; basic habit input never carries name/description/easyVersion/genre even as null; timeSet omitted rather than null; custom chain gateway requires name.

## Done
- tracker-access.ts + test: RED 95 failed/1 passed (96) -> GREEN 96/96.
- tracker-writes.ts + test: RED 57/57 failed -> GREEN 57/57. Snapshot ids must be UUID-shaped (validated).

- tracker-input.ts + test: RED 17 failed/3 passed (20) -> GREEN 20/20.
- habits.ts (+ new data/tracker-classify.ts helper, types/eiyu.ts inputKind/canWrite) + habits.test.ts + lifecycle.test.ts: RED = suite compile failure (new signatures) -> GREEN 30/30 and 3/3. createHabit no longer calls initializeAccountTimeZone (gateway/prepareDay owns it); habitColumns removed.
- completions.ts + test: RED compile failure -> GREEN 16/16.

- tracker-writes: added additive `TrackerWriteRefused` + `isRefusedBeforeSend(error)` (local pre-send refusal, so reconciliation callers do not report an uncertain save). Test added right after the helper (small test-first lapse, noted).
- long-quests.ts + 3 test files: RED compile failure -> GREEN 18/18, 9/9, 9/9. createLongQuest/updateLongQuest/reconcileLongQuestStages/setStageDone removed with their tests (name/stage-text negatives moved to saveAtomicLongQuest tests).

- gym.ts + gym-workspace/gym-ids tests: RED compile failure -> GREEN 24/24, 2/2. `attempt()` rethrows local refusals AND server tracker refusals (ET00x/22023/42501) without a landed-write lookup; EXERCISE_KEYS allow-list (server refuses extra keys).
- gym media: logic gymMediaPath (RED compile) -> GREEN 10/10; data uploadGymMediaBody test (new gym-media.test.ts) 4/4 (written after impl, not RED-first).

- weekly-quest fetchWeeklyQuest (RED compile -> GREEN 5/5 lifecycle-readers); generateWeeklySummary(weekStart, expected?) metadata-only body + gatherWeekData removed (RED: consent-access suite compile fail, weekly-summary 1 failed -> GREEN 18/18, 3/3, owner-race 5/5, mailbox 3/3, proxy-error 3/3). debrief-owner-race tests rewritten: history read no longer exists, owner switch now happens during provider dispatch.
- Contract section 8 (late server facts): deleteHabit settles a 42501 only after this session's own earlier uncertain (non-confirmed) attempt, once (RED 1 failed -> GREEN lifecycle 9/9). completeHabit validates date/kind locally, then treats 22023 as already recorded and resolves (RED 2 failed -> GREEN 18/18). Reorder refusals ET003/42501 surface unchanged, single call (tests added). Queue/UI lanes should also treat these as settled.

- legal-content TRACKER_PURPOSE_NOTICES (DRAFT comment) 11/11 (impl written with the test, RED not observed). native-unconfirmed.test.ts (skipped live suite) updated to compile; unverified against a live stack.
- FINAL: `npx.cmd tsc --noEmit -p packages/shared` exit 0, no output. Full shared run: 65 suites passed, 2 skipped; 990 tests passed, 8 skipped (998).

## In progress
nothing (lane complete)

## Remaining
 types/eiyu, legal-content notices, habits, completions, long-quests, gym, gym-media (data+logic), weekly-quest, weekly-summary, suggestions, tsc, full suite.

## Test evidence
