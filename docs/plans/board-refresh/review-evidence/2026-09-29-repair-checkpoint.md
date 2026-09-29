# Repair checkpoint — 2026-09-29

Independent parent review of the interrupted working tree on `codex/board-refresh-repairs`, based on `aa793baf4eed94c0704f799f36c98d742853a9a4`. Changes are uncommitted; this is not acceptance evidence for a completed repair batch.

The designated implementer is gpt-5.6-luna with xhigh reasoning. The parent authored initial portions of A before handing implementation to Luna; the combined diff must not be represented as entirely Luna-authored. Luna previously stopped with a workspace credit error. A resume was requested after the user said continue.

Subsequent user authorization on 2026-09-29: "delegate it to sol medium. go". The parent interrupted the unresponsive Luna delegations and assigned Batch A to **gpt-6-sol, medium reasoning**, retaining independent parent review. Earlier changes retain their original mixed provenance. This explicit authorization supersedes the repair plan's Luna-only assignment for continued implementation.

## Executed regression checks

- Shared: `npm test --workspace @eiyu/shared -- --runInBand` — 23 suites passed, four failed; 205 tests passed and one failed. Three suites could not compile because `history.ts` references `deletedRows` before declaration. The board fixture failed on the relative ordering of `active-off-day` and `recovery-open`.
- Web: `npm test --workspace @eiyu/web` — 13 files, 41 tests passed.
- Mobile: `npm test --workspace @eiyu/mobile -- --runInBand` — 13 suites, 33 tests passed. The provider lifecycle harness emits React act environment and unwrapped update warnings.

Commands used the installed Node and npm executables under `C:\Program Files\nodejs`. These results describe the inspected working tree, not the base commit alone.

Follow-up after Luna's history edits: both `tsc --noEmit -p web/tsconfig.json` and `tsc --noEmit -p mobile/tsconfig.json` exited successfully. Shared rerun: 26 suites passed, one failed; 215 tests passed, one failed. The history declaration error is resolved; the board ordering assertion remains failing. The recurring-only History denominator was also restored in the inspected source. These updates supersede only the corresponding earlier findings, not the unexecuted acceptance checks.

## Open review findings

- History RPC path bypasses occurrence initialization and includes one-time scheduled rows in the denominator while using recurring rows for the numerator.
- History fallback catches errors by broad message matching, potentially hiding real RPC failures. The fallback retains multi-request visibility races.
- Weekly review, weekly summary, and weekly quest readers have not all moved to a single consistent database boundary. Paging alone does not establish snapshot consistency.
- Profile input handlers clip every changed value to 80 code points, risking truncation of grandfathered longer values during editing.
- Native dirty dismissal and complete web modal background isolation/focus return remain unfinished.
- Required transport, database concurrency/security/upgrade, browser geometry/accessibility, and Android acceptance checks have not been established by these suite runs.

All six repair batches remain open. Preserve existing user files and historical evidence. No migration application, commit, integration, or publication is recorded by this checkpoint.

## Independent browser follow-up under Sol implementation

Executed against `http://127.0.0.1:5173`, using process-level local Supabase configuration and a disposable account created by Sol's REST probe. No remote data was used. The browser exercised the actual application and authenticated transport, not mocked callbacks.

- Discovered board-card Delete still used `window.confirm` from the interrupted later-batch work. Sol replaced it with a controlled portal confirmation. Rechecked target name, History/Weekly Review/XP retention text, initial Cancel focus, Tab wrapping, Escape focus return, and Enter on initial Cancel preserving the archived quest.
- Restored archived one-time ID `e7626510-04fa-47dd-8d84-1d71da036bb3`; browser reload showed Archived 0 and One Time Quest 1. Completed it, observing WIS XP increase from 20 to 40, then rearchived it.
- Editor delete confirmation started on Cancel; background root had `inert` and `aria-hidden=true`. Escape returned focus to DELETE PERMANENTLY.
- Kept the first editor open while a second browser tab deleted the same definition. Second client returned to an empty board with WIS XP still 40. The stale first editor rejected a renamed save with: "This quest no longer exists or could not be updated. Reload the board before saving." It stayed open instead of claiming success.
- Rendered History after deletion listed both `Batch A transport lifecycle` and `Batch A browser archived one-time`, each with +20 XP. A screenshot was captured in the chat tool output; no durable screenshot file is claimed here.

Android remains unverified: the installed Medium_Phone emulator was started without wiping data; ADB shell commands hung. A cold boot and ADB reconnect/server restart did not recover shell access, and the last device listing reported offline. Unit tests are not substituted for this device acceptance gap. Native tests and reminder reconciliation work are still under Sol's review checkpoint.

Final parent follow-up: a third emulator attempt using its supported software graphics mode also failed to reach a usable shell. The task-owned emulator processes were stopped; AVD data was preserved. Diagnostic logs are `artifacts/repair-a/emulator-stdout.log` and `emulator-stderr.log`.

After the new board retry test, the parent independently reran the complete web suite: **14 files / 44 tests PASS**. Mobile TypeScript also passed after the subsequent reminder reconciliation changes. Review caught an additional stale-reminder cleanup gap: retry must cancel removed definitions as well as schedule active ones. Sol changed reconciliation to cancellation followed by rebuilding current active schedules, including future one-time reminders, and is recording its focused regressions in the Batch A implementation report.

## User-requested reattempt and continuation

The user requested another attempt and continued work. Sol (gpt-6-sol, medium) added native Cancel accessibility focus on modal show; reported focused native suites 7/7 and mobile TypeScript passing. Actual device focus remains unverified.

Parent created a separate `EiyuRepair` AVD under `artifacts/repair-a/isolated-avd`, preserving the original Medium_Phone data. The new emulator reached ADB `device` status, but `shell getprop sys.boot_completed` stalled. Inspection showed all 119 emulator threads in `Wait, Suspended`. Relaunch in persistent exec session 63140 also stalled: 120 threads were suspended and kernel output stopped around 19 seconds. Both task-created emulator processes were stopped. The reason for suspension was not established; this is an environment blocker, not proof of an application defect. Initial attempt logs remain in `artifacts/repair-a/isolated-emulator-stdout.log` and `isolated-emulator-stderr.log`; second attempt output is in the tool transcript. No Android acceptance is claimed.

Metro started at localhost:8081 for the intended device run. An earlier LAN-mode launch was rejected by automatic approval review because a localhost alternative was available; the localhost launch succeeded. No persistent environment file was changed. Work proceeds through B and later batches while device checks remain open.

Parent B focused rerun during implementation: shared `history.test.ts` and `weekly-summary.test.ts` passed (2 suites / 10 tests). The current SQL snapshot is a single statement combining occurrence-backed completions, unmatched live completions, and retained rows with owner filters. Weekly Quest uses its recurring aggregate. This source review and focused run do not replace the pending REST scale/concurrency checks.

Fresh C browser baseline against local Supabase: Edit details opens with Close focused, while its accessibility snapshot still exposes banner/navigation and the Board Add Quest button. After entering `Unsaved browser Back probe` in Display name, browser Back navigates to `about:blank` without protecting the draft. Browser Forward returns to the app. No profile save was submitted. Both reproductions were passed to Sol before C implementation.

## Empty-board layout baseline before final E repair

Parent measured the actual browser DOM on the local disposable A account (zero definitions), with the viewport API reporting the requested dimensions. These are baseline measurements of the partial working tree, not final stress acceptance. Screenshot at 1366x768 was emitted in the tool transcript; no durable image file is claimed.

| Viewport | Document scroll size | Daily heading top/bottom |
| --- | --- | --- |
| 390x768 | 390x869 | 661.67 / 681.00 |
| 768x768 | 768x896 | 496.33 / 515.67 |
| 1024x768 | 1024x896 | 496.33 / 515.67 |
| 1366x768 | 1366x844 | 381.67 / 401.00 |
| 1440x900 | 1440x976 | 381.67 / 401.00 |
| 1920x768 | 1920x844 | 381.67 / 401.00 |

No horizontal document overflow was observed for this empty dataset. At390 only the selected Daily lane is rendered visibly; other headings have zero bounding rectangles. This does not establish 1/30/100-card, many-recovery, theme, long-label, or enlarged-text acceptance.

## Independent B acceptance checkpoint

Parent independently executed `scripts/integration/history-boundary-rest.cjs` against the existing loopback stack with fresh disposable accounts. Exit0: 1,201 rows / 1,080 recurring completions; all-live, mixed, read-during-delete, all-retained; actual History, Weekly Review, Weekly Quest, and AI-input functions; anonymous rejected, other owner empty, ledger update rejected. The row digest and uniqueness assertions passed. Source review confirms every historical consumer now uses the same owner-scoped snapshot. Batch B's repaired reader/scale/concurrency boundary is accepted locally; final full regression and remote028 rollout remain F/prerequisite work. A native device gap is unchanged.

Final emulator diagnostic used the documented `-feature -Vulkan` with software graphics on the isolated AVD. It exited1 before ADB exposed a device. Log: `artifacts/repair-a/no-vulkan-emulator.log`. Metro was stopped. No claim of Android success is made.

Parent independently ran `supabase/tests/011_history_read_boundary.test.sql` via local psql: all10 TAP assertions passed and the transaction rolled back. Full shared suite at the initial B checkpoint returned26 passed suites/1 failed,217 passed tests/1 failed: the retained-history test's mock did not recognize the new RPC. Sol updated that boundary adapter while preserving the original assertions; rerun pending at this point.

## Native build and SDK checks during C review

- Expo SDK54 `install --check` passed: Dependencies are up to date. Command used `CI=1`, `EXPO_NO_DOTENV=1`; initial sandboxed metadata fetch failed, escalated retry succeeded. No dependencies changed.
- Initial default-architecture Android Gradle debug build failed on the known Windows Ninja260-character generated C++ path limit.
- Rerun using existing `mobile/scripts/windows-native-staging.init.gradle`, `-PreactNativeArchitectures=x86_64`, `-Pandroid.cxxBuildStagingDirectory=C:\Temp\eiyu-cxx`, `:app:assembleDebug -x lint -x test --offline --console=plain` passed in58s:558tasks,36executed/522up-to-date. Used Android Studio bundled JBR, installed SDK, and EXPO_NO_DOTENV=1. The APK is `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Gradle deprecation warnings remain; no native configuration change was needed. This build does not establish device interaction acceptance.
- Parent independently reran the C legacy upgrade rehearsal: PASS in isolated database `eiyu_profile_rehearsal_1790654872124`. Fresh-install rerun follows after ordering the new-account fixture after026/027 to exercise the new insert trigger.

Parent shared regression after B adapter and C normalization updates:27suites/220tests PASS. Parent fresh profile rehearsal with `--fresh` also passed in isolated database `eiyu_profile_rehearsal_1790655088864`; this version creates its auth/profile fixture after canonical026/027, accepts80emoji and rejects81, and checks invalid Unicode whitespace/direct writes. The script bootstraps minimal auth.users/auth.uid structures in a new template0 database for schema testing; it is not a separate full GoTrue service rehearsal. Active database data remains untouched by these rehearsals.

## Independent C browser checkpoint

Parent exercised the local authenticated browser after the account repairs: opening the profile uses the query route, initial Close focus and Tab wrapping keep keyboard focus inside, and the background is inert/aria-hidden. Browser Back with a dirty draft prompts; cancel preserves the draft, accept closes and returns focus to the account trigger. Forward reopens persisted values. An 81-code-point compass-emoji name is rejected without truncating the draft; 80 saves and reloads exactly. The disposable fixture name was restored afterward. The emoji case exposed UTF-16 avatar slicing; Sol replaced it with a shared code-point helper (focused regression added; rendered follow-up pending).

Light Settings was inspected visually and both portal/root reported data-theme=light. VIEW navigated to /history and showed the two retained completions. Direct /settings redirected to /board?account=settings; Close returned to /board with no dialog. The screenshot was emitted in the browser tool conversation; no durable screenshot file was produced. Native keyboard, Back and TalkBack execution remain blocked by the emulator failure described above.

## Independent D/E rendered checkpoint

Parent browser checks on fresh local fixtures:
- One-time-only total: 0/1 -> complete 1/1 and +20 STR -> undo 0/1 and 0 STR. At390px editor Cancel preserves One Time selection. Archive preserves the now-empty One Time lane; Archived shows original one-time type and Restore/Delete without completion. Restore preserves Archived selection.
- Mixed30 quantity: Daily increment to1/5 is immediately reflected in All Habits; decrement restored0/5. Daily lane scrollTop4154.6665 was identical before/after editor Cancel.
- Unicode avatar follow-up: saved compass emoji plus Explorer renders the complete emoji initial, then the disposable profile name was restored.

Actual pre-E CSS stress measurements (all scrollY0): 100 definitions /30 recoveries at1366x768 produced document18423px, recovery1336.67px, lane top1751.67px and lane height16622.95px. At390/768/1024/1440/1920 widths, document heights were21608/19327/18872/18220/17911 respectively. The30-definition baseline at1366 was4890px; one-definition844px. Screenshots were inspected inline before sizing changes.

Final measured document heights, with document width equal to viewport width throughout (no horizontal document overflow):

| Viewport | 0 definitions | 1 one-time | 30 definitions | 100 definitions /30 recoveries | 100 lane top |
| --- | ---: | ---: | ---: | ---: | ---: |
| 390x768 | 838 | 890 | 5097 | 21521 | 4844 |
| 768x768 | 844 | 844 | 844 | 1041 | 627.30 |
| 1024x768 | 844 | 844 | 844 | 1041 | 627.30 |
| 1366x768 | 844 | 844 | 844 | 885 | 516.64 |
| 1440x900 | 976 | 976 | 976 | 1040 | 547 |
| 1920x768 | 844 | 844 | 844 | 885 | 516.64 |

At1366 stress: overview188px, recovery viewport177px with scrollHeight1337; first recovery action bottom467.67px; lane319px with body256px/scrollHeight16559. The first quest lifecycle/actions are visible near746px; its bottom border is773.90px. At1440 the first card fits within900px. Native-sized web uses natural page flow, hence large document heights. Desktop/tablet lanes and recovery areas have visible scrollbars; no claim that all stress content fits without scrolling.

The100 fixture was measured in both dark and light at all six widths, with identical geometry. Light recovery labels/actions initially failed visual contrast inspection; Sol replaced fixed pale colors with theme tokens. Recheck showed heading/action rgb(29,78,216) and metadata rgba(14,52,80,.72), visually readable in the inspected screenshot. Long quest names/notes were included. The0/1/30 final width matrix was dark; no full Cartesian theme/dataset acceptance is implied.

Actual200% browser zoom could not be set with the exposed IAB controls: Ctrl+0/fiveCtrl+= left innerWidth1440 and devicePixelRatio1 unchanged. A separately labelled720x450 reflow equivalent had no horizontal overflow and natural lane/recovery flow (document19359px); this is not actual200% text/zoom evidence. Native TalkBack, native enlarged text/keyboard, rendered long weekly summary/error states, and durable screenshot files remain unexecuted/missing. Browser screenshots were emitted inline and inspected, but the exposed screenshot API did not provide a file-saving option. Temporary viewport overrides were reset. No remote data or production account was used.

### E weekly follow-up (supersedes the rendered summary/error gap above)

Parent opened the empty local account's Weekly Review: all35 cells expose stat/date/value labels; dates are Wed September23 through Tue September29,2026 and visible date font is11px. At1366px matrix client/scroll widths are893/893; at390px they are358/650 with document width390, so overflow stays inside the matrix. The actual local Edge Function failure renders an alert and RETRY; retry was activated, but successful service recovery is not claimed.

Sol seeded a1982-character cached summary on the disposable30-definition account without calling AI. Parent verified the161-character collapsed preview, READ MORE and SHOW LESS. Expanded at390px: paragraph client/scroll width321/321, height832, document390x2026. Expanded at1366px: paragraph855/855, height312, document1366x985. No horizontal overflow or clipped text was observed. Full-page screenshot inspected inline. This closes rendered long-summary/error coverage only; actual200% zoom, durable screenshot files and native device gaps remain.

## Final independent review checkpoint

Parent verified the post-recovery reload:29 urgent recoveries remain, the selected recovered quest is absent from recovery cards and present in Daily with streak1, INT remains4/100, and today's total remains0/100. The earlier30-recovery geometry predates this deliberate mutation of the disposable fixture.

Final shared regression independently passed28 suites/224 tests. An initial mistaken Vitest-config invocation could not start because shared uses Jest; the repository's Jest command was then used successfully. Final diff whitespace check passed. Parent compared every source snapshot entry to current SHA-256:59 files, zero mismatches. The final review table contains all37 acceptance IDs from the governing plan, with no missing or extra IDs. These checks confirm traceability and named boundaries; they do not close the device/zoom/rollout gaps.
