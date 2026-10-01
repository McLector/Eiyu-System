# 002 — Board and Gym Progress implementation handoff

Started 2026-10-01. Approved plan: `docs/plans/astra_opus_plans/011-board-gym-progress.md`.

## Starting context

Repository initially clean except existing untracked private `.mcp.json` (untouched). Canonical backend SQL through 031. Existing Vite web app, Expo 54 mobile app, shared data/logic package. Expo v54 docs reviewed before code. No commit/push/live deployment. Latest takeover: `001.2 - takeover.md`; its unresolved real-device, browser zoom, AI-provider and production rollout acceptance remains separate and is not assumed passed.

## Phase status

| Phase | Status |
|---|---|
| 1 — Quest creation | Passed |
| 2 — Board | Passed |
| 3 — Archive dialog | Passed |
| 4 — Rewards | Passed |
| 5 — Gym persistence | Passed |
| 6 — Gym page/media | Passed |
| 7 — Theme/density | Passed |
| 8 — Acceptance | Passed locally; release pending |

## Current continuation

All eight implementation phases passed local acceptance. Full context, problems, fixes, evidence and results are recorded below. Production rollout is separate: apply canonical 032–034 in order before releasing the clients. Existing personal DB on 55322 and private `.mcp.json` remain untouched.

## Phase 1 report — Passed

**Context:** Both creation flows previously used the same editor and type switch; one-time lane had no Add action. Plan 011 and this handoff are now saved.

**Changes:** Typed board callbacks/routes select habit or one_time. Editor locks creation to that type, existing IDs use saved type, and one-time creation omits recurring day/target/recovery fields. Existing lifecycle behavior remains.

**Problems:** An initial conditional JSX boundary was misplaced when removing the recurring day controls; tests and TypeScript reproduced the parse failure and it was corrected before passing.

**Verification:** `npm.cmd run test --workspace @eiyu/web -- --maxWorkers=2 WebQuestEditor WebBoard` passed 21 tests before the additional type-specific scenario; final `... WebQuestEditor` passed 13 tests including the new type/saved-type regression. `npx.cmd tsc --noEmit -p web/tsconfig.json` exited 0.

**Result:** Two Add flows now create their correct definitions without type switching. Existing save, validation, delete and edit scenarios pass. Visual acceptance is scheduled in Phase 8.

**Continuation:** Phase 2: compact profile column and height-aware board pagination. Relevant entrypoints: BoardPage, QuestEditorPage, WebQuestEditor and WebBoard. No database change yet.

## Phase 2 report — Behavioral checks passed; visual gate pending

**Context:** Overview was above four scrollable lanes, making the board tall and visually noisy.

**Changes:** Profile/attributes/date/status now occupy the first desktop column. Three paginated quest columns follow. Narrow screens use four tabs. Height-aware pagination keeps all definitions reachable; long notes open the existing details form. Recovery summary opens a focus-contained dialog. Archived definitions temporarily remain reachable through a profile-card dialog action until Phase 3 moves it to the account menu.

**Problems:** Existing tests assumed archived definitions and recovery details were always inline; updated them to assert the dialog behavior and preserve delete/restore/recovery coverage. CSS cascade initially placed new rules before legacy rules; moved them to the end. No credentials/private configuration read.

**Verification:** WebBoard: 9/9; PaginatedList overflow/removal: 1/1; web TypeScript exited 0. Actual browser geometry remains for Phase 8; no visual pass claimed.

**Result:** Behavioral pagination/recovery/lifecycle checks pass. Visual acceptance is pending. Continuing only independent implementation work; final phase gates cannot pass until runtime evidence exists.

**Continuation:** Phase 3 account archive overlay and success notifications. WSL container inspection initially denied by sandbox; escalated read succeeded but default docker-desktop distribution cannot expose Docker CLI. Locate Windows Docker binary before SQL verification; do not reset any existing DB.

## Phase 3 report — Automated checks passed

**Context:** Phase 2 temporarily exposed an archive dialog through the profile card. The requested destination is the top-right account menu.

**Changes:** Account menu/URL now support Archived habits (`?account=archived`) on any authenticated page. Extracted paginated archive dialog retains edit, restore, pending locks, errors and nested Cancel-first permanent deletion. Board and editor dispatch an archive success notice only after their write resolves. Global notice has check icon, profile guidance, Open archived habits and dismiss action.

**Problems:** Archived definitions no longer exist in the board DOM, so lifecycle tests now render the archive dialog and assert the actual entry point. Nested dialogs require topmost-only keyboard handling; reusable Dialog manages stacked inert/focus state.

**Verification:** Combined WebBoard/AccountShell/WebQuestEditor/PaginatedList: 6 suites, 30 tests passed. Web TypeScript passed before tests; repeat at final gate. New account test covers URL, empty archive, Escape and focus restoration. Browser geometry remains pending.

**Result:** Requested account destination and archive feedback implemented; delete/history semantics preserved. Final runtime gate pending.

**Continuation:** Phase 4 server-owned rewards. Docker CLI located under LocalAppData Programs/DockerDesktop, started hidden with approval. Verified isolated container `supabase_db_supabase-luna-20260930` uses 54322; existing `supabase_db_eiyu-system` uses 55322 and must not be mutated. Use container-local psql with supabase_admin for isolated tests, never root reset.

## Phase 4 report — Database checks passed

**Context:** Stage completion only changed a boolean. Stats DML is intentionally revoked from clients by 029.

**Changes:** Canonical 032 adds RLS-protected, server-owned reward ledger and private trigger. Stage/bonus transitions execute under parent/stat locks, direct completion writes use the same boundary, undo/redo use original stat, legacy completions have zero-value exemptions, and ledger survives definition deletion. Web/mobile stage actions guard overlapping quest submissions and invalidate stats as well as Long Quests. Web confirms successful progress and attribute update.

**Problems:** Trusted fixture/service inserts have no account context; trigger deliberately awards nothing for those writes. Docker Desktop was initially stopped; started hidden with approval and verified correct isolated container. Existing concurrency fixture points at 55322; isolated copy changed only test routing to 54322, preserving that database.

**Verification:** Applied 032 to isolated 54322 container only. Rollback pgTAP: 18/18 including duplicate requests, direct completion, undo/redo, original stat, legacy and ownership. Two-session concurrency: 19/19; second stage blocks on parent lock and total is exactly 60 XP. Added portable container-local concurrency test 017. TypeScript checks were launched; collect their exit before final acceptance. Broader client regressions remain scheduled.

**Result:** Server reward contract verified against real Postgres. Production untouched; client rollout requires 032 first.

**Continuation:** Phase 5 Gym schema and atomic draft/session RPCs; append 033 and rollback tests. Isolated DB and canonical SQL workflow remain unchanged.

## Phase 5 report — Persistence checks passed

**Context:** No Gym records existed. Progress must persist and historical workouts must survive routine/exercise edits.

**Changes:** Canonical 033 defines owned routine/exercise/session/entry tables, composite ownership foreign keys, indexes and RLS. Sessions/entries are read-only to clients; authenticated owner-checked RPCs start/resume, save/finish, discard and atomically reorder. Draft uniqueness and row locks prevent repeated sessions. Entries snapshot prescriptions and retain stable exercise IDs after removal. Shared typed data API and validation/unit-conversion helpers added. No Gym XP.

**Problems:** Supabase schema inference needs mapped object rows, not raw interface rows; initial compile rejected the entire schema. Changed GymTable.Row to a mapped type and defined recursive Json arguments; shared TypeScript then passed.

**Verification:** Applied 033 only to isolated 54322 DB; 15/15 rollback assertions passed (draft resume, saved weight, invalid-finish rollback, idempotent finish, snapshot survival, denied history writes, isolation and foreign-parent rejection). Atomic reorder assertion added for next SQL pass. Shared gym validation/conversion tests 2/2; shared TypeScript exited 0. Portable reward concurrency 017 also passed 19/19.

**Result:** Real database persistence and ownership boundaries verified. No production changes.

**Continuation:** Phase 6 `/gym`, routine/exercise editors, session/history UI and private media bucket 034. Final tests must collect added reorder/concurrency assertions and exercise Storage HTTP behavior.

## Phase 6 report — UI flow checks passed; media/browser gate pending

**Context:** Gym persistence was verified; the new page needs routine editing, complete sessions, history and demonstrations.

**Changes:** Added authenticated Gym navigation and page, routine editor/archive/restore, exercise editor/order/remove, prescribed desktop columns and narrow cards, draft weights/save/finish/discard, latest-session previous weights with unit conversion, and snapshot history. Unsaved weights block navigation/refresh. GIF/MP4 upload appears first in exercise editor, with size/type/signature/decode validation, private 5-minute signed playback, retry and cleanup reporting. Full notes open a dialog. Account changes remount local Gym state.

**Problems:** Old navigation tests assumed exactly three routes/menu items; updated for Gym/Archive additions. Source-contract tests expected sequential invalidation; preserved that shape while adding stats refresh. An unused variable in an adjusted test caused lint failure, removed before final gate.

**Verification:** WebGym: 3/3 (complete session → next previous weight, empty demonstration, failed save retained values, early media rejection). Web TypeScript passed after initial UI wiring. Shared full suite: 29 suites/245 tests passed. Gym SQL including atomic reorder: 16/16. Private bucket/policies 034 applied only locally. Full web run identified the outdated assertions above; rerun is required.

**Result:** Routine/session UI and media pipeline implemented. Actual Storage HTTP/playback and browser layout remain pending; no production release claimed.

**Continuation:** Phase 7 density/rank/cursor/logo and browser setup. Playwright is installing under ignored `.temp/plan-011/browser`; no production dependency change. Verify all phases in final integrated pass.

## Phase 7 report — Implemented; visual acceptance in progress

**Changes:** Hero Rank copy replaces Hunter Rank. Remaining scrollbars use narrow themed thumbs/transparent tracks; selection, caret and focus themed. Static vector arrow/pointer cursors keep native text/disabled behavior. Eiyu mark gently glows without layout movement, with reduced-motion and forced-colors fallbacks. Compact authenticated spacing, narrow four-link navigation, Long Quest pagination and Gym cards added.

**Verification:** Web build passed with existing Vite config/chunk-size warnings. Root lint has existing 40 mobile warnings, no web errors after fixing an unused test variable. Mobile regressions: 23 suites/92 tests passed (existing act warnings). Latest web rerun and TypeScript are running; collect before final gates.

**Problems:** Dependency download was sandbox-denied; reran approved Playwright installation in ignored test folder and installed successfully. Existing SQL sequence test expected zero stage XP; updated it to 80 for three stages plus one bonus, preserving duplicate/rejection assertions.

**Result:** Visual changes are authored, not yet declared browser-verified. Continue Phase 8 actual browser matrix and integrated database tests; repair reproduced defects and record evidence before closing phases.

## Phase 2 final acceptance — Passed

**Context/result:** The old overview plus four scrollable lanes is replaced by Profile | Daily Quest | One Time Quest | All Habits at desktop widths. Profile includes attributes, date, quest count and board status. Smaller screens expose one lane at a time through four tabs. Every item remains reachable through pagination; lane bodies have no nested scrollbars.

**Problem/fix:** Real 390×844 capture showed the mobile lane ending too close to the viewport bottom once main padding was included. Reduced lane height by 20px; the corrected seven-size, two-theme browser matrix has no horizontal overflow, no lane-body overflow, and no document overflow at regular heights (720px and above). Very short screens and zoom retain necessary accessible scrolling rather than clipping controls.

**Evidence/continuation:** Automated recovery, list-clamping and lifecycle tests pass. Browser screenshots/report are under ignored `.temp/plan-011/browser-evidence`. Proceeded to close archive acceptance using the same real account.

## Phase 3 final acceptance — Passed

**Context/result:** Archive access lives in the upper-right account menu beside Edit details, Settings and Log out. Only successful archive writes show the check notice and profile guidance. The archive dialog supports details, restore and guarded permanent delete.

**Evidence:** Browser archived a real owned habit, saw its success notice, opened the archive dialog, restored it, and closed with Escape. Account tests cover URL/Back/Forward, focus containment/restoration, pending failures and menu reachability; archived-card tests preserve Cancel-first deletion and repeated-request guards. No history is deleted by archive/restore. Continued to reward acceptance.

## Phase 4 final acceptance — Passed

**Context/result:** Each newly completed phase awards 20 XP to its Long Quest stat; final completion adds 20 XP. Undo/redo reverses/restores the recorded stat. Legacy completions are exempt from backfill, and deletion preserves earned XP.

**Evidence:** Real browser completion of two WIS stages read 20 then 60 XP from Postgres. Reward rollback tests pass 18 assertions and two-connection concurrency passes 19; the integrated existing sequence assertions now expect the intentional stage reward. Full SQL suite passes. Web/mobile invalidate stats after stage completion. Late success/failure notices are guarded against account changes and notices reset on owner change. Continued to Gym persistence acceptance.

## Phase 5 final acceptance — Passed

**Context/result:** Owned routines and ordered exercises persist. One draft per routine resumes after refresh; atomic finish records immutable prescription/weight/unit snapshots. Exercise edits/removal cannot rewrite completed history. Latest completed-session weights are the next session's previous values; the current input starts blank. No Gym XP.

**Evidence:** Gym rollback suite passes 16 assertions, including complete-ID-set atomic reorder, draft reuse, invalid-weight rollback, duplicate Finish, snapshot survival, denied direct history writes and foreign-parent isolation. Shared validation/unit tests pass. Real browser saved 40kg, finished, started the next workout, saw previous 40kg/current blank and resumed after reload. Continued to media acceptance.

## Phase 6 final acceptance — Passed

**Context/result:** `/gym` has named routines, prescribed eight columns, narrow-screen cards, routine/exercise editing/archive/order/removal, workout draft actions and completed history. Exercise name opens an optional GIF/MP4 demonstration dialog; full notes remain accessible.

**Problems/fixes:** A first browser-generated MP4 test fixture was empty and correctly rejected by the application. Used a small local FFmpeg fixture for reproducibility; FFmpeg is a test prerequisite, not an app dependency. Signed-media retry was tested by simulating HTTP 410, not by waiting for five minutes of actual expiry.

**Evidence:** Browser uploaded/decoded a GIF, denied anonymous signed access, recovered from the simulated expired object, replaced it with a playable MP4, confirmed video starts paused, and confirmed the old object was removed. Storage SQL passes 6 assertions (private bucket, size/types, own upload, foreign denial/read isolation). Failed workout saves preserve entered values in WebGym tests. Bucket is private with 5-minute signed links; MIME/size/signature/browser decoding all validate before upload. Cleanup failures remain visible. Continued to final density/theme acceptance.

## Phase 7 final acceptance — Passed

**Context/result:** Hero Rank, themed arrow/pointer cursors, compact layout, themed remaining scrollbars, and soft upper-left logo glow are implemented. The established identity and rank calculation are retained. Status on phones uses HERO/STATS/WEEKLY REVIEW views so rank/radar and attributes/calendar no longer stack into a long page.

**Problems/fixes:** The first real Status capture reproduced the long phone layout. Split the narrow views and reduced radar height; corrected regular-height captures fit. Forms, expanded details, very short displays and zoom can scroll to retain legibility and access.

**Evidence:** Both themes, seven viewport sizes and reduced-motion logo passed browser checks. Screenshots were visually inspected for desktop board/Gym and phone Status. Impeccable detector ran once: only inherited Inter-font warnings and the existing Status stat-width transition were reported; no identity replacement was introduced to silence inherited findings. Continued to Phase 8 final validation and rollout preparation.

## Phase 8 report — Passed locally

**Context:** Implementation is locally complete; no live deployment is authorized or claimed. Canonical README now includes capability markers through 034 and ordered SQL/storage-before-client rollout instructions. Marker tests include the new capabilities.

**Problems/fixes:** PowerShell's default text decoding corrupted Unicode SQL fixtures, falsely failing the existing 80-code-point validator. Re-ran with `Get-Content -Encoding UTF8` and UTF-8 pipeline output. An initial unrestricted Vitest run timed out under simultaneous workload; the documented `--maxWorkers=2` run passes. New capability markers initially named two tables/policies incorrectly; corrected against actual catalog names, then all 19 test plans passed.

**Verification collected:** SQL: 19 files / 556 emitted assertions / complete TAP plans, no failures. Web: 20 suites / 68 tests. Shared: 29 suites / 245 tests. Mobile: 23 suites / 92 tests. Three TypeScript projects passed. Root lint passed with 40 existing mobile warnings and no web errors. Web build passed with existing Vite config/chunk-size warnings. `git diff --check` passed (line-ending notices only). Real browser: 56 measurements, no horizontal/lane-body overflow, regular-height pages fit, no page errors; separate creation forms, archive/restore, actual rewards, private media and workout journey passed.

**Zoom method:** Chrome's disposable profile preference sets page zoom to 200%, with zoom level `log(2)/log(1.2)`. This uses actual browser page zoom, not CSS scaling or CDP pinch zoom. Final native viewport run checks matching narrow media queries, DPR=2 and visualViewport.scale=1. Reference: [Chromium zoom preferences](https://chromium.googlesource.com/chromium/src/+/lkgr/chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc). Disposable browser storage is cleared before closing; test users and owned media are removed in finally. No credentials, signed URLs or user profile files are saved in tracked artifacts.

**Final result:** Final web rerun passed 20 suites/68 tests; web TypeScript/lint exited 0 after account-notice cleanup. Final build and diff checks passed. Actual Chrome 200% native-window run passed all four routes: effective width 629 CSS pixels, DPR=2, scale=1, narrow media queries active, all navigation controls within the viewport, no horizontal overflow. Raw compositor screenshots avoid the CSS-sized crop produced by Playwright at native zoom. Real routine dialog keyboard containment also passed. Final catalog markers and all 19 TAP plans passed after adding null-safe capability lookups and Gym RLS checks.

**Continuation / release pending:** Production: confirm capabilities 001–031, apply 032, 033, 034 in order, review markers, release clients. Do not reapply old SQL, reset existing DBs, or infer inherited AI-provider/real-device/production checks are passed. No commit/push/deployment performed.

## Final change map and operational notes

- Quest creation: BoardPage, QuestEditorPage, WebQuestEditor; saved IDs take precedence over creation query type.
- Board/archive: WebBoard, AccountShell, ProtectedLayout, ArchivedHabits, ArchiveNotice, Dialog and PaginatedList.
- Rewards: canonical 032, tests 016/017, existing sequence 004, web/mobile stores.
- Gym: canonical 033/034, tests 018/019, shared gym types/data/logic, WebGym, gym-media and router.
- Theme/density: index.css and WebStatus; pointer rules also cover portal dialogs and override existing inline pointer declarations, while text/disabled/native form cursors retain their affordances.
- Acceptance: scripts/verify-board-gym-browser.cjs (Playwright installed only in ignored test folder; FFmpeg fixture prerequisite). SQL logs and 56 matrix measurements/four zoom measurements/screenshots remain in ignored `.temp/plan-011`. No test credentials are in tracked files.
- Local Vite acceptance server was on 127.0.0.1:5175 against isolated API 54321/database 54322. Existing API/database 55321/55322 were not migrated or reset. No saved environment changes, dependency changes, commit, push or deployment.

The changes implement plan 011's web-first scope. Mobile receives shared reward/stat refresh behavior; a mobile Gym or matching mobile redesign was not part of the approved scope. Very short viewports, zoom, expanded content and editors/dialogs retain scrolling so nothing is hidden. Inherited real-device, AI-provider and production acceptance from takeover 001.2 remains separate. The new web 200% zoom acceptance does not certify mobile real-device behavior.
