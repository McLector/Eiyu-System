# Board refresh post-landing review

Date: 2026-09-27. Reviewer: Codex. Reviewed revision: `aa793baf4eed94c0704f799f36c98d742853a9a4` on local `main`.
Diff scope: `b840bb7..aa793ba`, board-refresh Phases 0–6. Product code was not changed during this review.

**Verdict: committed and historically approved, but not fully compliant with the plan.** The existing suites pass, while the additional review probes expose acceptance failures. Prior user approvals and commits remain historical facts; they do not close the defects below. This review supersedes earlier blanket technical PASS conclusions for the affected criteria.

The user requested a review and a repair plan with Luna as implementer. This package supplies that plan; no repair implementation, remote push, or deployment was performed.

## Which plan has nine phases?

| Plan | Numbering | Count | Relationship to this review |
| --- | --- | --- | --- |
| `docs/plans/mobile-web-quest-design-plan.md` | 0–8 | Nine stages | Earlier quest project: scheduling, recovery, Penalty, board lists, ordered stages, descriptions, registration legal text, and final evaluation. |
| `docs/plans/2026-09-13-board-navigation-design-plan.md` | 0–6 | Seven stages, including foundation; six stages after foundation | The board/lifecycle/navigation refresh reviewed here. It has no Phase 7, 8, or 9. |

The earlier plan's Phase 7 is registration privacy/terms (plan line 294; commit `c5cdf97`), and Phase 8 is whole-product evaluation (line 310; commit `b840bb7`). Those commits precede this refresh. The earlier response that simply said “no Phase 7” omitted this useful distinction.

The refresh's phase headings are at lines 279, 299, 329, 356, 382, 412, and 438 of its plan. Section **9**, Rollout and rollback, is a document section, not an implementation phase.

| Refresh stage | Landed implementation/evidence commit |
| --- | --- |
| 0 — Foundation | `ace2a58` |
| 1 — Lifecycle persistence | `6918d03` |
| 2 — Lifecycle UI | `7004bcc` |
| 3 — Four-lane board | `01d47da` |
| 4 — Navigation/account overlays | `9681243` |
| 5 — Weekly review/layout | `87c370d` |
| 6 — Final acceptance | `d6c520f` |

Documentation landing records follow several phase commits; final bookkeeping is `aa793ba`. Seven phase commits exist, rather than six total commits or nine refresh phases.

## Verification performed in this review

| Check | Fresh result | Interpretation |
| --- | --- | --- |
| Existing shared Jest | 27 suites / 215 tests passed | Existing domain/data coverage remains green. |
| Existing web Vitest | 13 files / 39 tests passed | Existing UI coverage does not cover several required behaviors. |
| Existing mobile Jest | 12 suites / 24 tests passed | Existing native component coverage remains green. |
| Existing local SQL/security/concurrency suite | 10 files / 331 tests passed | Ran `scripts/local-db.ps1 test`; did not reset the local database. |
| Review web contract probes | 9 behavioral assertions failed | Corrected harness setup first; final failures are behavioral, not missing imports or malformed fixtures. |
| Review data probes | 4 assertions failed | Transport, row-cap, and transaction-interleaving models; not a substitute for real REST/concurrency tests. |
| Local SQL profile probes | Both suspected problems reproduced | Temporary table and synthetic account changes rolled back. |

Commands and machine-readable evidence: `review-evidence/README.md`, `review-evidence/audit-results.json`, the two `.audit.test` files, and `review-evidence/profile-compatibility.audit.sql`.

The review-only probes live outside normal workspace test discovery and intentionally expect the planned behavior. Their red results are repair inputs, not failures introduced into the product suites. They were authored while product HEAD remained `aa793ba`.

This was a source/contract review with fresh component/data/SQL checks. It did not rerun all builds, Android Maestro, rendered viewport stress, or screen-reader sessions. Existing device/browser artifacts were considered historical evidence, not presented as fresh observations. The user's three-page 200% zoom pass remains valid user-reported evidence. iOS remains excluded as requested.

## Findings

P1 means high-priority correctness/safety or a conditional upgrade blocker. P2 means an actionable correctness or acceptance gap. “Source-confirmed” is distinguished from freshly executed UI/device evidence.

### BR-01 — P1: archived one-time quests become unreachable

**Evidence:** `packages/shared/src/data/habits.ts:91–103`; `backend/supabase/022_habit_recovery_state_machine.sql:415–439`; probe D01.

`fetchTodayHabits` combines a recurring-only catalog with today's active one-time RPC results. The RPC excludes archived records, and the catalog filters `quest_type='habit'`. Consequently an archived one-time definition enters neither collection. Both editors allow archiving it, so after refresh it disappears from all four lanes and cannot be restored or deleted through the UI. The archived-one-time component fixture bypasses the broken fetch and therefore passes.

**Expected:** fetch archived definitions of both types, deduplicate by ID, retain original-type labels, and keep future active one-time entries outside today's actionable lane. Add a real archive → refresh → Archived → restore/delete journey on both clients. Affects R1/R2/R3, P2-AC1, P3-AC1/3.

### BR-02 — P1: permanent deletion starts with destructive focus

**Evidence:** `web/src/web/WebQuestEditor.tsx:74–89,358–376`; R01; existing lifecycle test explicitly asserts this wrong focus.

Opening confirmation focuses **Confirm permanent delete**, although the plan explicitly requires **Cancel**. Pressing Enter next can permanently delete the definition. Confirmation also omits the target's name and the explicit earned-XP assurance. It is an inline `aria-modal` region without focus isolation; Escape can dismiss it during an in-flight deletion.

**Expected:** labeled, isolated confirmation naming the target, initial Cancel focus, required retention copy, repeat-request protection, and safe handling of pending dismissal. Correct the test oracle rather than preserving its destructive-focus expectation. Affects R1/R2, UI-LIFE-03, P2-AC2/5.

### BR-03 — P1: retained-history readers silently accept the API row cap

**Evidence:** `supabase/config.toml:18` (`max_rows=1000`); `history.ts:44–50`; `weekly-review.ts:32–45`; `weekly-quest.ts:38–60`; `weekly-summary.ts:19–34`; D04.

The new ledger queries do not paginate or aggregate server-side. A date filter bounds time, not row count. At 1,100 retained completions the modeled API returns 1,000 and Weekly Review reports 1,000. Monthly History with 100 habits can exceed the cap in about eleven days. Weekly quest progress uses an exact count for live completions but array length for retained ones, allowing totals to drop following deletion at scale. Several live queries already share this older weakness; the newly added retained path perpetuates it despite plan section 5.1 explicitly requiring pagination.

**Expected:** a common owner-scoped reader/aggregation contract with stable pagination and exact totals. Test more than 1,000 live, retained, and mixed rows through actual local REST, including preservation of heatmap denominators and recurring-only weekly targets. Affects R10/R12, P1-AC2, P5-AC2, P6-AC2.

### BR-04 — P2: readers can miss or double-count evidence across a concurrent delete

**Evidence:** `history.ts:37–98`; independent reads in `weekly-review.ts`, `weekly-summary.ts`, and `weekly-quest.ts`; D03 deterministic transaction-interleaving model.

History reads definitions and the ledger, then occurrences and completions through separate requests. A delete can commit after the ledger read but before the live reads: the first sees no retained row and the latter see no live row. Stored evidence remains intact, but the returned day temporarily has zero completions/obligations. Parallel live/retained reads can also observe both sides of the move. A sequential delete-then-read test cannot expose this race.

**Expected:** read combined evidence with consistent database visibility, such as an owner-scoped server query, plus stable paging for BR-03. Validate real read/delete interleavings, not only mutation/mutation races. Affects R12, P1-AC2/4, P6-AC2. No actual history destruction is claimed by this finding.

### BR-05 — P2: saving a remotely deleted habit reports false success

**Evidence:** `packages/shared/src/data/habits.ts:267–271`; deletion guards in both stores; D02.

`updateHabit` checks only the request error and never checks affected rows. PostgREST's ordinary UPDATE of a missing ID succeeds with zero affected rows. The store guard knows only IDs deleted within that provider/session. An editor left open while another device deletes the habit can therefore close as though its changes saved; mobile can also attempt to schedule reminders for the missing ID. This does not recreate the database row, but violates the required stale-editor rejection.

**Expected:** an ownership-safe update boundary that confirms exactly one target, preserves the draft on a missing/deleted target, and never schedules a reminder after a zero-row write. Include a two-client deletion test. Affects R1/R12, UI-LIFE-05, P2-AC4.

### BR-06 — P2: web account dialogs do not implement the claimed modal behavior

**Evidence:** `web/src/web/AccountShell.tsx:30–49,118–136`; R02/R03; contrast `phase-04-report.md:25`.

Escape handling exists only while the account menu is open. Selecting Settings/Edit closes that menu and removes the handler; Escape then does nothing. Shift+Tab from the dialog's first control focuses background content. `aria-modal=true` supplies semantics but does not trap focus or make the background inert. The report's claim that web overlays support Escape is contradicted by the code and executed probes. Overlay state also has no explicit browser-history handling; Back/Forward needs a real follow-up test.

**Expected:** reusable dialog behavior with focus containment, inert background, Escape routed through dirty/pending guards, focus return, and explicit route/history tests. Affects R6/R7, NAV-02/03, P4-AC2/3/6.

### BR-07 — P2: profile drafts can be discarded or detached from pending saves

**Evidence:** `web/src/web/AccountShell.tsx:66–79`; `mobile/components/eiyu/account-header.tsx:42–56`; R04.

Web disables Cancel/Save while pending, but its close button and backdrop still call a close handler with no pending guard. A save of unchanged values can be dismissed immediately; a changed draft can be dismissed through the discard prompt while the write continues. The native close button and Android Back call `onClose` directly, even with unsaved edits or a pending write. There is no native discard choice. Late success/failure can then occur after the dialog has vanished.

**Expected:** one close policy across all dismissal paths, draft-preserving failures, and either blocked dismissal while saving or an explicit safe completed-save path. Test dirty Cancel/close/Back/backdrop and deferred success/failure. Native keyboard-aware layout is also a follow-up risk: this profile sheet uses plain Views rather than scroll/keyboard-aware content. Affects PROFILE-02, P4-AC4/6.

### BR-08 — P2: profile text limits/normalization differ across boundaries

**Evidence:** web `AccountShell.tsx:89,93`; native `account-header.tsx:50,52`; `backend/supabase/026_profile_editing.sql:7–26,59–75`; R06 and the SQL whitespace probe.

The shared validator counts Unicode code points, but web `maxLength=80` counts UTF-16 code units. Pasting 80 emoji produces 40 in the executed probe. Native also uses `maxLength=80`; its exact platform Unicode behavior needs a device check. Separately, PostgreSQL `btrim(text)` does not remove tabs/newlines like JavaScript `.trim()`. An authenticated local RPC call successfully saved a tab-only name while the client rejects it.

**Expected:** a single explicit Unicode/whitespace contract across inputs, shared validation, RPC, and permitted direct writes. Test ASCII, astral characters, 80/81 boundaries, whitespace-only values, and inert markup. Affects PROFILE-01, P4-AC4.

### BR-09 — P1, conditional upgrade blocker: profile constraints reject valid legacy accounts

**Evidence:** `backend/supabase/001_profiles.sql:2–5`; `026_profile_editing.sql:4–29`; local temporary-table upgrade probe.

Earlier schema allowed arbitrary-length names/classes. Migration 026 immediately validates new 1–80-character checks against every existing row. A formerly valid 81-character profile causes the constraint addition to fail, demonstrated with the exact check expression. The plan requires existing longer values to remain viewable and explain the limit when edited. This is not evidence that the current production database contains such a row; it is a reproducible upgrade failure when that allowed input exists.

**Expected:** a rehearsed compatibility strategy preserving legacy data and imposing limits on new edits without blocking ordinary reads/timezone initialization. A later migration alone cannot rescue an upgrade that fails first at 026; fix the upgrade path before that point. Do not silently truncate names or classes. Affects P4-AC4 and rollout readiness.

### BR-10 — P2: weekly date labels advance a day in positive-offset timezones

**Evidence:** `web/src/web/WeeklyReviewMatrix.tsx:8–16`; R05.

The data already contains an account-local calendar key. Formatting a fabricated noon-UTC instant in the account timezone shifts it again. `2026-12-31` becomes **January 1, 2027** in `Pacific/Kiritimati`, while the column's weekday and stored counts still belong to December 31. Offsets of +12 or greater are affected. The native matrix uses UTC for its date-only label and does not have this particular shift.

**Expected:** format the date key without applying a second timezone conversion. Cover +14, +13/+12, negative offsets, month/year boundaries, and date/weekday/accessibility agreement. Affects R10, WEEK-01, P5-AC1.

### BR-11 — P2: native daily progress excludes one-time quests

**Evidence:** `mobile/app/(tabs)/board.tsx:293–295`; compare web `WebBoard.tsx:190–193`.

Native derives completed/total only from `dailyQuests`, whereas web includes today's one-time lane. An account with one incomplete habit and one completed one-time quest shows native 0/1 instead of the planned 1/2; an account with only one-time quests shows 0/0. This is source-confirmed; no new device screenshot is claimed.

**Expected:** shared unique eligible-ID totals across Daily and today's One Time lane, excluding catalog duplicates and archived entries. Add actual native component assertions for mixed and one-time-only boards. Affects R3, BOARD-01, P3-AC1/2.

### BR-12 — P2: lane cards omit required lifecycle actions and state

**Evidence:** web `WebBoard.tsx:35–132,299–306`; native `board.tsx:248–274,488–536`; R07.

Archived cards expose Edit/details only, with Restore/Delete buried in the editor. Active cards omit the specified Archive/Delete menu. Catalog cards do not reflect completion/quantity state of their Daily copies. Native Archived reuses the recurring catalog row and lacks the original quest-type label. Native actionable entries remain divider rows inside one shared GlassView, rather than the plan's separate card panels. These are visible delivery gaps, although editor-level lifecycle operations do exist.

**Expected:** lane-appropriate direct actions and pending states, type labels, shared state reflection, separate native cards, accessible note/details interactions, and no active completion controls on archive/off-day catalog cards. Affects R1/R2/R3, BOARD-02/04, P3-AC2/3/5.

### BR-13 — P2: returning from the web editor resets lane context

**Evidence:** `WebBoard.tsx:195`; `web/src/pages/BoardPage.tsx:12–15`; `QuestEditorPage.tsx:25`; R09.

Lane selection is component-local state. Editing navigates to another route, unmounting the board; Cancel/save/lifecycle success navigates to a new board instance defaulting to Daily. The All Habits selection becomes false in the executed route probe. Narrow-screen users archiving/restoring from another lane lose their place after each action.

**Expected:** preserve lane and relevant scroll context across editor navigation and mutations using stable route or shell state. Test actual route transitions rather than a mocked onEdit callback. Affects R3/R7, BOARD-05, P3-AC5.

### BR-14 — P2: deterministic lane ordering is not implemented

**Evidence:** `packages/shared/src/logic/quest-recurrence.ts:46–65`; catalog sort in `data/habits.ts:99–101`; R08.

The shared partition only filters. Catalog retrieval sorts archived/time but lacks name/ID tie-breakers; actionable lanes do not sort incomplete before complete. The review probe returns `[done,todo]` for that input. Equal-time records can reorder after refetch and completed cards stay ahead of unfinished work contrary to section 4.2.

**Expected:** shared, non-mutating lane comparators implementing the documented completion/time/name/ID ordering and archive name/ID ordering. Cover ties and stable cross-platform results. Affects R3, section 4.2, BOARD-01/05.

### BR-15 — P2: desktop overflow ownership and readable labels remain incomplete

**Evidence:** `web/src/index.css:95–98,433,579–636`; `WebBoard.tsx:259–278`; native `weekly-review-matrix.tsx:114–129`; Phase 3 report lines 35–36/106.

Lane bodies specify `overflow-y:auto`, but the desktop lane/grid/ancestor chain has no bounded height: lists grow with content instead of establishing the planned independent scroll areas. Recovery renders every item without the controlled expandable region. Global WebKit scrollbar suppression remains, and the tablet board lacks an override exposing a scroll affordance. Weekly date labels use 9px on web and 8px on native, below the explicit readable-label contract.

These are source-confirmed layout mechanisms and contract gaps; exact overflow dimensions and readability at 30/100 cards were not freshly rendered in this review. Previous reports explicitly say the stress dataset was never populated. The user's ordinary three-page zoom check does not supply that separate stress evidence.

**Expected:** measure 0/1/30/100 cards and many recoveries at required desktop/tablet/phone sizes; bound desktop lane bodies with stable headers, expose scrolling, allow natural page flow under zoom, and use readable labels. Do not merely add overflow clipping. Affects R3/R9/R10, BOARD-05, LAYOUT-01/02, P3-AC4/5, P5-AC4.

### BR-16 — P2: Restore can request OS notification permission

**Evidence:** `mobile/contexts/eiyu-store.tsx:273–284,512–523`; `mobile/lib/notifications.ts:46–51`.

Restore calls `syncAllReminders(true)`, which calls `requestNotificationPermissions`; when permission is absent it invokes the OS request API. The plan explicitly requires restore to reschedule only if permission already permits it, with no unsolicited permission prompt. Existing scheduler tests do not test the store's Restore-to-permission call chain.

**Expected:** separate passive permission inspection/reconciliation from the user's explicit permission-enable action. Restore while denied/undetermined must succeed in the database without requesting permission and report an actionable reminder warning. Affects R2/R12, UI-LIFE-04, P2-AC3.

### BR-17 — P2: Settings compatibility route and account ownership diverge from the plan

**Evidence:** `mobile/app/settings.tsx:6–9`; `mobile/components/eiyu/settings-content.tsx:42–44`; `web/src/web/WebSettings.tsx:91–111`.

The retained native `/settings` route renders a standalone screen instead of opening the shared overlay over Board. Both embedded Settings implementations also retain Sign Out even though the plan explicitly assigns Logout to the account menu and removes duplicates. The native settings title is duplicated by the sheet heading. The duplicate copy is lower severity than the route mismatch, but should be corrected in the same extraction pass.

**Expected:** one reusable Settings overlay controller, legacy URL compatibility that closes back to Board, and the three account actions owned by the menu. Preserve actual theme/reminder/History behavior. Affects R5/R6/R7, NAV-03, SETTINGS-01, P4-AC3/5.

### BR-18 — P2: acceptance evidence and current-status documents are inconsistent

**Evidence:** plan/handoff opening checkpoints; `integration-ledger.md:39,57`; Phase 2/3/4 reports; current Git tracked-file inventory.

- Plan and original Luna handoff still state HALTED at Phase 0/no commits. Both remain untracked, so cloning committed main alone does not recover the binding requirements. The originally mentioned `docs/plans/board-refresh-luna-handoff.md` does not exist; the actual file is `docs/plans/board-refresh/luna-handoff.md`.
- Phase 0/1/3 summaries still describe uncommitted candidates or awaiting approval. Phase 3's ledger says Phase 4 is unauthorized; Phase 5 says main “will be” fast-forwarded, despite later landings.
- Phase 2's focus test asserts the opposite of the plan. Phase 4 claims Escape support without an overlay Escape implementation. Native account testing says “exact” actions but uses array-containing assertions.
- Phase 3 marks required stress criteria PASS while explicitly omitting 30/100-card execution. Later font-scale/zoom evidence covers a different subset; blanket final PASS did not establish all missing criteria.
- Reports describing Codex executing “Luna scope” do not prove actual implementation by the specified Luna model. Do not present scope wording as model provenance.

**Expected:** preserve historical reports as dated evidence, add accurate current-status pointers and requirement-level reopened verdicts, version the governing plan/handoff intentionally, and correct test oracles. Every criterion must distinguish executed PASS, source-only assessment, user verification, failed behavior, and missing evidence. Affects R11/R13, P0-AC4/5, P6-AC4/5.

## Further checks and existing limitations

These are investigation items, not additional confirmed defects:

- Run Android profile editing with keyboard visible at 200% text, long errors, small/landscape height, dirty Back, and accessibility focus. The sheet currently lacks explicit keyboard-aware scrolling.
- Check TalkBack navigation through native WeeklyReviewMatrix: its outer accessible wrapper may group descendants and prevent reading individual cells. Actual assistive-technology behavior was not executed here.
- Exercise lifecycle/profile requests held in flight across logout and immediate account switch. Current query keys are user-scoped, but late callbacks and notification reconciliation deserve dedicated session-boundary tests. No cross-account data leak is asserted by this review.
- The configured remote's missing retained-history table was recorded in Phase 6; this review did not recheck or alter that remote. Treat database-before-client rollout as an unresolved release prerequisite, not as a request to deploy.
- Native sound/export settings are existing placeholders (local toggle / alert), rather than completed features. They predate this refresh; preserve that distinction and do not silently expand the repair into export/audio implementation.
- No P0 or new demonstrated RLS/XP-loss defect was found in the executed scope. Passing SQL tests support the exercised persistence/authorization cases; they do not prove complete coverage of every possible race/input.

## Reopened acceptance and handoff

| Stage | Current review assessment |
| --- | --- |
| 0 | Historical foundation landed; current traceability/status needs BR-18. |
| 1 | Mutation/RLS suites pass; reader completeness/concurrency and stale writes require BR-03/04/05. |
| 2 | Lifecycle controls exist; archived one-time reachability, deletion confirmation, and permission behavior require BR-01/02/16. |
| 3 | Lanes exist; totals, actions/cards, state preservation, sorting, and stress layout require BR-11–15, plus BR-01. |
| 4 | Navigation/profile persistence exists; modal, draft, validation, upgrade, and compatibility behavior require BR-06–09/17. |
| 5 | Matrix/layout exists; date accuracy, reader completeness, and readable stress layout require BR-03/10/15. |
| 6 | Reopen affected final acceptance until repairs and missing evidence pass; historical local landing remains recorded. |

Luna's concrete work order and acceptance checks are in `2026-09-27-luna-repair-plan.md`. This is a repair plan for the existing refresh, not a retroactive claim that its original plan contained nine stages.
