# Phase 06 FINAL-01 scenario — whole-product acceptance

Status: **EXECUTED — FINAL-01 PASSED AFTER FOCUSED RELOAD RETRY; SEE PHASE GATES BELOW**

Authored: 2026-09-25; execution: 2026-09-26  
Plan: `docs/plans/2026-09-13-board-navigation-design-plan.md`  
Base: `ab9bdd2` (`docs: record phase 5 landing and authorize phase 6`)  
Candidate branch: `codex/board-refresh-phase-06`

## Purpose and test identity

This is the final real-user journey for P6-AC1. It must run against one fresh, disposable account on the web and the Android development client, with a second disposable account only for the isolation/account-switch step. It must not use a personal account, production data, OS-clock manipulation, or a fake success path.

Required environment values:

- `PHASE6_EMAIL` / `PHASE6_PASSWORD`: primary disposable account used by both clients.
- `PHASE6_OTHER_EMAIL` / `PHASE6_OTHER_PASSWORD`: second disposable account for the account-switch isolation check.
- `PHASE6_METRO_URL`: the local Expo development-client server when the Android server picker is shown.
- `PHASE6_WEB_URL`: local Vite URL, normally `http://127.0.0.1:4173`.

The primary account starts with no Phase 6-named quests. The run records exact persisted IDs/values after every mutation rather than relying on a screenshot alone.

## Authored journey and evidence contract

| Step | Web action and expected persisted result | Android action and expected persisted result | Evidence ID |
| --- | --- | --- | --- |
| 1. Sign in | Sign in as `PHASE6_EMAIL`; reload `/board`; authenticated shell and empty/known board appear. | Launch/reconnect SDK 54 client; sign in as the same account; BOARD appears. | FINAL-01-AUTH |
| 2. Scheduled quest | Create `P6 Scheduled Penalty`, recurring M/W/F, with a non-empty Penalty and visible stat. Confirm it is present in the scheduled lane on an eligible day and remains in All Habits on an off-day fixture. | Reload the same account; confirm the same definition and schedule. | FINAL-01-SCHEDULED |
| 3. One-time quest | Create `P6 One-Time Quest` for the account-local current day. Confirm it appears only in One-time and completes once. | Reload Android; confirm its completion does not become a recurring habit. | FINAL-01-ONETIME |
| 4. Quantity quest | Create `P6 Quantity Quest` with target count 3. Increase progress to 3, verify exact `3/3`, then reload and verify the value and one reward. | Repeat the read/refresh check on Android; no over-target progress or duplicate reward. | FINAL-01-QUANTITY |
| 5. Penalty completion | Complete `P6 Scheduled Penalty` fully, undo it, then complete the Penalty/easy path through the real board control where the current date makes it available. Verify the persisted completion/reward semantics. | Verify the same completion and visible Penalty copy on Android. | FINAL-01-PENALTY |
| 6. Archive and restore | Archive the scheduled quest. Confirm it leaves active lanes and appears in Archived. Restore it; confirm it returns to the correct catalog lane without backfilling a missed off-day. | Repeat archive/restore from the native editor and reload. | FINAL-01-ARCHIVE |
| 7. Off-day/multi-day recovery | Use deterministic SQL fixtures/tests for an off-day miss, an open recovery window, a multi-day/expired window, and restore/recovery. Do not alter the host clock. Record before/after recovery status, completion date, streak, and XP. | UI only verifies the resulting state when a fixture is available; SQL is authoritative for simulated dates. | FINAL-02-RECOVERY |
| 8. Delete active and archived | Delete the completed one-time quest while active, and delete the restored scheduled quest after archiving it again. Confirm both definitions disappear and the confirmation copy states that history remains. | Repeat the destructive action only on the disposable account after capturing the confirmation and IDs. | FINAL-01-DELETE |
| 9. History and XP | Open History and Weekly Review; verify the deleted quest names, completion dates/types, exact weekly values, and reward totals remain visible after reload. | Open native History/Status and verify the same retained evidence. | FINAL-01-HISTORY |
| 10. Profile | Edit display name and class, save, reload, and confirm both values persist. | Edit the same profile in the account sheet and reload. | FINAL-01-PROFILE |
| 11. Settings | Toggle dark/light (and notification setting where supported), open Quest History, return to the board, and verify no overlay or navigation state is stranded. | Toggle native theme/settings, open history, return, and verify the account remains authenticated. | FINAL-01-SETTINGS |
| 12. All navigation | Visit Board, Status, Long Quests, Settings, History, and the quest editor; verify every page loads with its real account data and no blocking error. | Visit BOARD, STATUS, QUESTS, Settings, History, and return to BOARD. | FINAL-01-NAV |
| 13. Account switch | Sign out. Sign in as `PHASE6_OTHER_EMAIL`; assert the primary account’s named quests/history/profile are absent. Sign out and sign back in as the primary account. | Repeat on Android; assert query/cache isolation after the switch. | FINAL-01-ISOLATION |
| 14. Cross-platform reload | Reload the web app and force-restart Android without clearing the remote account. Confirm the primary profile, retained history/XP, and remaining catalog state are unchanged. | Same disposable account and same remote stack; capture final board/status/history evidence. | FINAL-01-RELOAD |

## Run ordering and stop rules

1. Execute the web journey first and save browser screenshots plus persisted query results at the evidence IDs above.
2. Execute the Android flow `mobile/maestro/flows/phase6_whole_product_acceptance.yaml` against the same primary account and remote stack.
3. Run the deterministic SQL/security/concurrency suite separately for simulated dates and account isolation. It owns recovery and race outcomes; the UI run owns real controls and persistence.
4. Any missing element, wrong persisted value, cross-account leak, clipped blocking state, or unverified step is FAIL/BLOCKED, not PASS. Corrective runtime code may begin only after this authored scenario exists and the failing evidence is recorded.
5. The final report must attach per-step screenshots/artifact paths, exact before/after values, commands, and the unresolved limitation list. iOS remains excluded on Windows.

## Execution record

- The scenario and `phase6_whole_product_acceptance.yaml` existed before Phase 6 runtime corrections.
- The same disposable local stack was used for the web and Android lifecycle legs; a second disposable identity was used for isolation. No personal account, production data, or OS-clock manipulation was used.
- Android’s full-product run completed 128 actions. Its final `BOARD` selector was obscured by Expo’s development-client overlay; the screenshot showed the persisted board underneath. The focused relaunch flow then passed the board/profile/`3/3` checks and Board → Status → Quests → Board at 100% and 200% font scale.
- The 200% run initially exposed tab-label overlap with Android’s system navigation. The layout was corrected with a taller tab bar at large font scales while retaining stacked labels, and the final 200% flow passed. Evidence: `artifacts/phase-06/android-fontscale-200-final-safebar-verified-20260926/takeScreenshot/`.
- Local SQL lint and pgTAP passed 10 files / 331 tests, including retained-history, authorization, and concurrency tests. The reset-capable full `verify` command was not run against the existing DB state.
- Desktop/narrow browser, dark/light overlays, and error/retry states were reviewed. On 2026-09-27 the user reports completing the 200% browser-zoom review on Board, Status, and History and finding them good. No screenshots were supplied; see the Phase 6 report for the user-reported evidence qualification.

## Final evidence ledger

| Evidence ID | Result | Artifact/result |
| --- | --- | --- |
| FINAL-01-AUTH through FINAL-01-ISOLATION | PASS | Android flow screenshots: `artifacts/phase-06/android-maestro-final-20260926/2026-09-26_203759/phase6_whole_product_acceptance/takeScreenshot/`; browser journey was run on the local preview against the same disposable stack. |
| FINAL-01-RELOAD | PASS after focused retry | `artifacts/phase-06/android-fontscale-200-final-safebar-verified-20260926/takeScreenshot/` and `artifacts/phase-06/android-reload-smoke-standard-final-20260926/takeScreenshot/`. Profile and `3/3` persisted; Status and Quests remained navigable. |
| FINAL-02-RECOVERY and SQL/security/concurrency | PASS for executed local suites | Local SQL lint and pgTAP: 10 files / 331 tests. No host clock manipulation; reset-capable `verify` intentionally not run. |
| FINAL-03 | PASS for authorized non-iOS scope | Full shared/web/mobile suites, TypeScript/lint/build/export, Android debug APK, and real Maestro interaction; exact results in `phase-06-report.md`. iOS remains excluded. |
| FINAL-04 | PASS — user-verified | Desktop/narrow/dark/light/error states and Android 200% font scale passed agent review. User reports Board, Status, and History passed at 200% browser zoom; no screenshots or viewport measurements were supplied. |
| FINAL-05 | PASS — user authorized landing | R1–R13 matrix is in `phase-06-report.md`; the user authorized the Phase 6 local commit on 2026-09-27 and its SHA will be recorded after landing. No production deployment is claimed. |
