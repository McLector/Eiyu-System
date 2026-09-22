# Phase 02 report — honest lifecycle controls on mobile and web

Phase / date / implementer: Phase 2 — lifecycle UI / 2026-09-22 / Codex, continuing the Luna-scoped handoff

Plan: `docs/plans/2026-09-13-board-navigation-design-plan.md`

Handoff: `docs/plans/board-refresh/luna-handoff.md`

Status: **REVIEW READY — AWAITING USER** (iOS execution explicitly excluded by user authorization)

Base main SHA: `345a6e9` — local Phase 1 landing record; Phase 1 feature SHA is `6918d03`.

Candidate: uncommitted working tree on `codex/board-refresh-phase-02`.

User authorization: the user said **“phase 2”** on 2026-09-22. No Phase 3 work, remote push, production data change, deployment, or publishing was authorized or performed.

## Scope and outcome

Implemented in the candidate tree:

- Web and mobile stores now expose separate `archiveQuest`, `restoreQuest`, and `deleteQuest` operations backed by the Phase 1 RPC boundary.
- Lifecycle calls are single-flight per quest ID, so repeat taps share one pending request.
- Successful delete evicts cached quest rows and records a stale-editor guard; account changes clear user-scoped query/lifecycle state.
- Active editors expose Archive and Permanent Delete; archived editors expose Restore and Permanent Delete. Permanent Delete has an explicit confirmation dialog/modal with Cancel.
- Failed lifecycle requests retain the editor/confirmation context and display the error so retry remains possible.
- Mobile reminder cleanup/reconciliation is best-effort after DB success. Permission/scheduling failures appear as a separate board warning and never turn a successful DB mutation into a database error.
- Web confirmation focus is moved to the destructive action, Escape dismisses the dialog, and focus returns to the trigger.

## Acceptance IDs -> evidence -> result

| Acceptance | Evidence | Result |
| --- | --- | --- |
| P2-AC1 / UI-LIFE-01 | `web/src/web/__tests__/WebQuestEditor.lifecycle.test.tsx`; `mobile/components/__tests__/quest-editor.lifecycle.test.tsx`; archive calls archive only, permanent delete is separate, Cancel performs no write. | PASS in component tests |
| P2-AC1 / UI-LIFE-02 | Same component suites; archived records expose Restore/Delete and no completion action; restore calls restore only. | PASS in component tests |
| P2-AC2 / UI-LIFE-03 | Web lifecycle component suite covers one pending request and failed-delete retry context; `web/src/store/__tests__/eiyu-store.lifecycle.test.tsx` covers single-flight promise identity, one RPC, cache eviction, and stale-editor save rejection. Native archive/restore/delete journeys exercised the same RPC boundary. | PASS for the scoped web/mobile lifecycle journey |
| P2-AC2 / UI-LIFE-05 | Store code clears user-scoped cache/lifecycle state on account changes; delete filters cached rows. The browser created a second synthetic account, verified no first-account quest/history, then switched back and verified the first account’s retained `P2 Local Lifecycle` history. | PASS for the disposable two-account runner |
| P2-AC3 / UI-LIFE-04 | `mobile/lib/__tests__/notifications.lifecycle.test.ts` verifies reminder cancellation and denied permission; Android scheduled five Expo notification alarms for `P2 Notification Retry`, and archive removed all `com.mclector.eiyusystem` reminder alarms. The reversible reminder toggle flow also passed. | PASS for scheduling/cancellation and permission boundary; the emulator’s native switch-off was not treated as a separate Expo permission result |
| P2-AC4 / UI-LIFE-06 | Browser restored `P2 Local Lifecycle`, recorded `+20 INT XP`, permanently deleted the definition, verified the board was empty while History retained `P2 Local Lifecycle` and `+20 XP`; the second account saw no leaked row/history; Android same-account archive/confirmation journey passed. | PASS for the disposable local non-iOS journey |
| P2-AC5 | Web dialog focus/Escape/return-focus test passes. Focused Android Maestro runs passed scroll-to-actions, open permanent-delete confirmation, Cancel, and return to the editor; the full clean local journey also passed. | PASS for the scoped web/Android gate; iOS remains explicitly unexecuted |

## RED evidence captured before runtime edits

The first focused lifecycle runs were intentionally against the existing implementation:

- Web: `node ..\node_modules\vitest\vitest.mjs run src/web/__tests__/WebQuestEditor.lifecycle.test.tsx` failed all four new tests because the old editor exposed neither `ARCHIVE QUEST` nor `DELETE PERMANENTLY` and had no Restore path.
- Mobile: the first component run failed at the existing unlinked `react-native-keyboard-controller` native module; after isolating that incumbent native dependency in the test harness, the lifecycle controls were still absent. The harness isolation is test-only and does not alter runtime behavior.

## Changed files and why

- `web/src/store/eiyu-store.tsx` — lifecycle RPC operations, single-flight requests, cache deletion, account-switch hygiene, stale-editor guard.
- `web/src/web/WebQuestEditor.tsx` — separate lifecycle controls, confirmation dialog, retry/error context, focus management.
- `mobile/contexts/eiyu-store.tsx` — lifecycle RPC operations, cache/account hygiene, reminder reconciliation and non-blocking warning state.
- `mobile/app/quest-editor.tsx` — separate Archive/Restore/Delete controls and native confirmation modal.
- `mobile/app/(tabs)/board.tsx` — accessible reminder warning surface after DB success.
- `web/src/web/__tests__/WebQuestEditor.lifecycle.test.tsx` — web interaction, retry, repeat-request and focus evidence.
- `web/src/store/__tests__/eiyu-store.lifecycle.test.tsx` — actual web store single-flight/cache/stale-editor evidence.
- `mobile/components/__tests__/quest-editor.lifecycle.test.tsx` — mobile editor interaction evidence.
- `mobile/lib/__tests__/notifications.lifecycle.test.ts` — cancellation and permission-boundary evidence.
- `mobile/maestro/flows/phase2_local_lifecycle_retry.yaml` — clean local same-account web-to-Android archive/confirmation journey.
- `mobile/maestro/flows/phase2_native_confirmation_retry.yaml` — focused Android confirmation-cancel retry using stable test IDs.
- `mobile/maestro/flows/phase2_notifications_disabled_retry.yaml` — reversible Android notification-toggle boundary retry.
- `mobile/maestro/flows/phase2_notification_schedule_retry.yaml` — Android alarm scheduling evidence.
- `mobile/maestro/flows/phase2_notification_cancel_retry.yaml` — Android reminder cancellation evidence.

## GREEN verification

Completed on the candidate tree:

- Shared: direct local Jest, 25 suites / 210 tests, exit 0.
- Web: direct local Vitest, 10 files / 33 tests, exit 0 (including lifecycle component and store suites).
- Mobile: direct local Jest, 9 suites / 21 tests, exit 0.
- Web TypeScript: direct local `tsc --noEmit`, exit 0.
- Mobile TypeScript: direct local `tsc --noEmit`, exit 0.
- Web ESLint: exit 0, no errors.
- Web production build: exit 0, 742 modules transformed; incumbent Vite config/chunk warnings remain.
- Expo SDK 54 lint: exit 0, 0 errors / 28 incumbent warnings.
- Android Expo export: exit 0, 1,812 modules bundled to `mobile/dist`.
- `git diff --check`: exit 0; only line-ending normalization warnings remain.

## Runtime retry evidence and remaining limitations

- The disposable local Supabase stack was restored at `http://127.0.0.1:55321`; the browser used `http://127.0.0.1:4173/board` and the Android client used the emulator route `http://10.0.2.2:55321`.
- Browser retry: restore archived `P2 Local Lifecycle` to active, reopen the editor, archive it, and observe `ARCHIVED` in the local board.
- Clean Android retry: `C:\Users\morad\.maestro\tests\2026-09-22_131439\phase2_local_lifecycle_retry\commands.json` reports 24/24 commands completed, including local login, archived-row visibility, editor open, confirmation, Cancel, and editor retention.
- Focused Android retry: `C:\Users\morad\.maestro\tests\2026-09-22_130220\phase2_native_confirmation_retry\commands.json` reports 8/8 commands completed with `quest-delete-permanent` and `quest-delete-cancel` IDs.
- Notification-toggle retry: `C:\Users\morad\.maestro\tests\2026-09-22_131205\phase2_notifications_disabled_retry\commands.json` reports 8/8 commands completed; this proves the reversible preference boundary, not OS delivery.
- Notification schedule retry: `C:\Users\morad\.maestro\tests\2026-09-22_133354\phase2_notification_schedule_retry\commands.json` reports 16/16 commands completed; `adb shell dumpsys alarm` showed five `expo.modules.notifications.NOTIFICATION_EVENT` alarms for `com.mclector.eiyusystem`.
- Notification cancel retry: `C:\Users\morad\.maestro\tests\2026-09-22_133613\phase2_notification_cancel_retry\commands.json` reports 9/9 commands completed; the subsequent alarm inspection returned `NO_COM_MCLECTOR_NOTIFICATION_ALARMS`.
- Delete/history/account isolation: the local browser DOM evidence recorded `+20 INT XP` before deletion, board removal after deletion, retained History `P2 Local Lifecycle` / `+20 XP`, an empty second account, and the retained first-account history after switching back.
- `adb` and Docker are available through their installed absolute paths for this retry environment; the earlier report's unavailable-runner limitation was transient and is superseded by the evidence above.
- The Android Settings switch-off was observed, but Expo’s permission request path re-enabled the emulator grant during the exploratory warning retry; that path is not claimed as a separate native pass. The denied-permission boundary remains covered by the passing notification unit test.
- iOS native execution remains unavailable on Windows.
- The repository npm PowerShell launcher remains broken; direct repository-local binaries were used, as in Phase 1.
- The generated `mobile/dist` export is ignored build output and is not part of the candidate source diff.

## Review commands

From the repository root (the direct package-directory invocations below avoid the broken root npm PowerShell launcher):

```powershell
Push-Location packages/shared; node ..\..\node_modules\jest\bin\jest.js --runInBand; Pop-Location
Push-Location web; node ..\node_modules\vitest\vitest.mjs run; Pop-Location
Push-Location mobile; node ..\node_modules\jest\bin\jest.js --runInBand; Pop-Location
Push-Location web; node ..\node_modules\typescript\bin\tsc --noEmit; Pop-Location
Push-Location mobile; node ..\node_modules\typescript\bin\tsc --noEmit; Pop-Location
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
maestro test -e 'PHASE2_EMAIL=phase2.local.retry.20260922@eiyu.test' -e 'PHASE2_PASSWORD=Phase2LocalRetry2026!' mobile\maestro\flows\phase2_local_lifecycle_retry.yaml
maestro test mobile\maestro\flows\phase2_native_confirmation_retry.yaml
maestro test mobile\maestro\flows\phase2_notifications_disabled_retry.yaml
maestro test mobile\maestro\flows\phase2_notification_schedule_retry.yaml
maestro test mobile\maestro\flows\phase2_notification_cancel_retry.yaml
```

Inspect the candidate with:

```powershell
git diff --check
git diff -- web/src/store/eiyu-store.tsx web/src/web/WebQuestEditor.tsx mobile/contexts/eiyu-store.tsx mobile/app/quest-editor.tsx mobile/app/(tabs)/board.tsx
```

## Gate verdict and next boundary

The automated implementation evidence and all authorized non-iOS Phase 2 runtime gates are green. The package is **REVIEW READY — AWAITING USER**. iOS native execution is explicitly excluded by the user and remains unexecuted on Windows. No Phase 2 commit was created and local `main` was not changed.

Phase 3 is **NOT AUTHORIZED**. Phase 2 needs a follow-up review and explicit landing approval before it can be committed or landed.
