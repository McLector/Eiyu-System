# Board refresh repair candidate — criterion-level review

Date: 2026-09-29. Status: **repair branch ready for review, not final acceptance or rollout**. Branch `codex/board-refresh-repairs`, base commit `aa793baf4eed94c0704f799f36c98d742853a9a4`. The tested source snapshot has 59 files and SHA-256 `022ef2dc9c4b9dc5f2b23d65939fd3385ad06755e4cd92415cccb7baa3ebd9c0` in `2026-09-29-source-snapshot.json`. Regenerate with `node scripts/integration/repair-source-manifest.cjs` after any source change. The digest excludes local fixture credentials and generated artifacts and identifies the tested source independently of commit history.

The original board refresh has **seven phases, 0–6**. The earlier quest project had nine. This post-landing repair uses **six batches, A–F**; they are neither new original phases nor new landed commits. The original Phase 0 halt language and Phase 6 approval remain historical dated records. The user's 2026-09-29 authorization changed the active implementer from Luna (`gpt-5.6-luna`, xhigh) to Sol (`gpt-6-sol`, medium). Parent Codex authored some initial A work, independently reviewed source and browser behavior, and supplied the checkpoint. No claim that one model authored the entire diff is made.

Verdict key: **Local pass** means the named behavior was executed on the current repair candidate at the stated boundary. **Partial** means some required boundaries passed but at least one remains. **Open** means the criterion is not currently established. Historical phase approvals do not turn a newly affected, unexecuted check into a pass. Detailed commands, measurements, browser interactions and failures are in `2026-09-29-repair-checkpoint.md` and the batch reports below.

## Original acceptance matrix

| ID | Current verdict | Evidence and remaining boundary |
| --- | --- | --- |
| P0-AC1 | Historical pass | Original fixture independence in Phase 0 package; new E fixtures use fresh disposable accounts. |
| P0-AC2 | Historical pass | Original characterization and explicit later-phase changes remain in dated Phase 0 report. |
| P0-AC3 | Partial | Current shared/web/mobile suites, types, lint/build/SDK/export and non-resetting SQL checks passed; no final post-repair Android interaction. |
| P0-AC4 | Partial | Authenticated local browser, local REST/DB and Android build paths available; current emulator interaction failed after six attempts. |
| P0-AC5 | Partial | Original test map and historical approval exist; this matrix reopens affected criteria and cannot itself supply missing device evidence. |
| P1-AC1 | Local pass | Local lifecycle SQL regression removes definitions/dependents and preserves read-only retained evidence. |
| P1-AC2 | Local pass | Owner-scoped snapshot reader, 1,201-row REST comparison and SQL regression cover retained details, denominators, weekly/AI inputs and XP. Exact REST transport cases 0/1/1,000/1,001 were not each executed; unit/SQL fixtures cover small boundaries. |
| P1-AC3 | Local pass | Local SQL grants/RLS/security suite and real REST anonymous/other-owner/ledger-write rejection. No remote security claim. |
| P1-AC4 | Local pass | SQL concurrency regression plus actual local REST read/delete interleaving; consistent snapshot digest and no double count. |
| P1-AC5 | Partial | Deterministic lifecycle/recovery tests and local upgrade/fresh rehearsal pass; current Android restore/reminder journey unavailable. |
| P1-AC6 | Partial | Non-resetting local SQL 11 files/341 assertions and source review pass; full original gate's fresh target/remote rollout and user review remain separate. |
| P2-AC1 | Partial | Real browser archive/restore/delete and retained History; web/mobile component boundaries pass; Android direct actions not re-executed. |
| P2-AC2 | Partial | Deferred web/mobile component tests cover repeat/pending/failure/retry; actual stale two-client web editor rejects deleted write; Android stale UI/cache not executed. |
| P2-AC3 | Partial | Native notification tests cover disabled/denied/undetermined and cancellation/rebuild; DB result remains distinct from reminder warning; Android permission dialog behavior unavailable. |
| P2-AC4 | Partial | Browser reload preserves one-time lifecycle and History/XP, with two-client deletion; same-account web-to-Android journey not repeated. |
| P2-AC5 | Partial | Web Cancel-first focus trap, Escape/focus return and controlled deletion were rendered; native TalkBack/Back and full device gate open. |
| P3-AC1 | Local pass | Shared deterministic partition and unique-ID totals tests; native mixed/one-time-only component assertions; real one-time-only board 0/1 → 1/1 → 0/1. |
| P3-AC2 | Partial | Browser quantity 0→1/5→0 mirrors Daily/catalog, one-time XP completes/undoes, recovery30→29 awards INT+4 and persists after reload with no daily total inflation; native device interaction open. |
| P3-AC3 | Partial | Empty/error/retry and archived controls covered by component tests and browser weekly error rendering; all-lane Android touch and all board error variants not re-executed. |
| P3-AC4 | Partial | Real 0/1/30/100 board geometry at six widths, independent desktop scroll and no document horizontal overflow; Android lane navigation unavailable. |
| P3-AC5 | Partial | Dark/light 100-record geometry, long labels, preserved web lane/scroll, 720×450 reflow equivalent; actual 200% browser zoom and native font scaling unverified. |
| P4-AC1 | Partial | Existing three-destination semantic tests and inspected web layout; current Android tabs/icons not re-executed. |
| P4-AC2 | Partial | Web identity/menu component and actual browser overlay navigation; touch/keyboard from every primary destination and Android menu not fully repeated. |
| P4-AC3 | Partial | Actual browser dirty Back/Forward, inert focus trap/return, legacy `/settings` close, Settings→History; Android Back/keyboard remains open. |
| P4-AC4 | Partial | Shared/SQL legacy+fresh rehearsal and browser 80-code-point emoji reload, 81 rejection/draft retention, Unicode-safe initials; cross-platform reload, Android keyboard and full owner UI flow open. |
| P4-AC5 | Partial | Browser light Settings and History work, component logout/cache tests; actual Android settings/logout and failed logout UI not repeated. |
| P4-AC6 | Partial | Six-width board/weekly measurements and web modal focus; all protected-route overlays at real 200% and native keyboard/safe-area unverified. |
| P5-AC1 | Local pass | Date-key unit tests across UTC+14/+13/+12/negative and year/month boundaries; browser 35 labelled cells Wed Sep23–Tue Sep29. |
| P5-AC2 | Local pass | Shared/SQL exact historical counts and DOM visible-value/common-scale tests include retained and >3 values. |
| P5-AC3 | Partial | Browser labels/numbers, actual Edge failure alert/Retry, 1982-char cached summary and theme inspection; successful Edge retry and native TalkBack individual cells not established. |
| P5-AC4 | Partial | Board overview/first actions are visible at 1366×768 and 1440×900, stress is bounded and 390–1920 widths were measured. The original criterion is also about the Status overview and other routes; their comprehensive current geometry, real 200% changed-surface review and durable screenshot files remain missing. |
| P5-AC5 | Partial | Shared/web/mobile suites, build/export/static and local SQL pass; Android shared-data smoke and full device gate not repeated. |
| P6-AC1 | Open | Earlier Phase 6 journey is historical; this repaired candidate lacks a fresh same-account web↔Android complete journey. Browser subset was executed. |
| P6-AC2 | Local pass | Local 11-file/341-assertion SQL suite, 1,201-row real REST scale/security/interleaving and isolated compatibility rehearsal. No production/remote claim. |
| P6-AC3 | Partial | Final shared 28/224, web 15/52, mobile 13/48; three TypeScript checks, web build, Expo SDK54 check/export, Android debug build and SQL lint pass. Actual repaired Android E2E blocked by emulator. |
| P6-AC4 | Open | Desktop/phone stress, dark/light and rendered error/long summary checked; actual 200% zoom on repairs, native TalkBack/font200/keyboard and durable screenshots missing. Earlier user-reported 200% check was on the pre-repair revision. |
| P6-AC5 | Partial | This R1–R13 matrix, historical SHA/approval ledger and source digest exist; independent final user review and rollout prerequisite remain. |

## Requirements and finding disposition

| Requirement | Repair evidence | Original criteria | Finding disposition |
| --- | --- | --- | --- |
| R1/R2 lifecycle | Archived one-time reachability, Cancel-first delete, direct actions, stale-write rejection, reminder reconciliation | P1-AC1/5, P2-AC1–5, P3-AC2/3 | BR-01/02/05/16 repaired locally; Android journey open |
| R3 board | Shared partition/order/count, native separate cards, web lane/scroll state, bounded layout | P3-AC1–5 | BR-11/12/13/14/15 repaired in source/browser; native/zoom open |
| R4–R8 navigation/account | R4 gender-neutral Status people icon; R5 identity/menu; R6 profile editing; R7 Settings overlay/navigation; R8 horizontal top navigation, plus Unicode/legacy compatibility | P4-AC1–6 | BR-06/07/08/09/17 repaired locally; native keyboard/Back and complete route geometry open |
| R9 layout | Bounded desktop lanes/recovery, natural narrow flow, readable labels | P3-AC4/5, P4-AC6, P5-AC4 | BR-15 browser stress pass at normal size; actual 200% open |
| R10 weekly/history | Snapshot history read, account-local date keys, labelled matrix | P1-AC2, P5-AC1–3 | BR-03/04/10 locally repaired; remote schema rollout prerequisite |
| R11/R13 verification/governance | Dated reports, criterion matrix, exact candidate digest, independent browser review | P0-AC5, P1-AC6, P2-AC5, P3-AC5, P4-AC6, P5-AC5, P6-AC5 | BR-18 reconciled with open checks visible |
| R12 preservation/security | SQL RLS/concurrency, local REST owner/read-delete cases, retained XP/history | P1-AC1–6, P6-AC2 | Local pass; no remote deployment claim |

## Executed final gates and limits

- Shared Jest: **28 suites / 224 tests passed** (parent independent rerun). Web Vitest: **15 files / 52 tests passed**. Mobile Jest: **13 suites / 48 tests passed** after the per-card pending patch. TypeScript: shared, web and mobile passed. Web production build: 744 transformed modules, passed; existing `__dirname` and chunk-size warnings. Web eslint: clean. Expo lint: 0 errors, 22 warnings in older files; no Board warnings. `git diff --check`: passed.
- Expo SDK 54 `install --check`: passed with `CI=1 EXPO_NO_DOTENV=1`. Final Android export after native pending patch: **1,816 modules, passed**. Android debug `:app:assembleDebug` with existing Windows staging workaround and x86_64: **558 tasks, passed**; the initial default-ABI invocation hit the known Windows Ninja path-length limit. Build/export do not prove device behavior.
- Local SQL lint: no schema errors. Non-resetting local pgTAP: **11 files / 341 assertions passed**. Isolated pre-026 legacy and fresh 026/027 profile upgrade rehearsals passed; 028 was applied additively to local stack. The real local REST boundary passed 1,201 rows/1,080 recurring, four consumers, security, and read/delete interleaving. No active local database reset. Remote schema state was **not freshly checked**; verify ordered migrations and remote schema before rollout, and do not assume 028 is deployed.
- Parent actual browser results and measurements are in `2026-09-29-repair-checkpoint.md`; screenshots were inspected inline but no durable image files were supplied by the browser tool. Native emulator attempts were unusable (offline/hung/suspended or pre-ADB exit), so no repaired Android touch, TalkBack, keyboard, font200 or Maestro result is claimed. iOS was excluded by the user's prior scope.

### Reproduction commands and provenance

Run from the repository root with the installed Windows Node/npm (the user's roaming `npm` shim points to a missing module):

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' test --workspace @eiyu/shared -- --runInBand
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' test --workspace @eiyu/web
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' test --workspace @eiyu/mobile -- --runInBand
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build --workspace @eiyu/web
& 'C:\Program Files\nodejs\node.exe' scripts/integration/repair-source-manifest.cjs
powershell -File scripts/local-db.ps1 lint
powershell -File scripts/local-db.ps1 test
git diff --check
```

The three `tsc --noEmit -p` invocations targeted `packages/shared/tsconfig.json`, `web/tsconfig.json` and `mobile/tsconfig.json`; web/mobile workspace lint and Expo SDK54 `install --check`/Android export were run after the affected changes. The Android build used `mobile/android/gradlew :app:assembleDebug --init-script ../scripts/windows-native-staging.init.gradle '-PreactNativeArchitectures=x86_64' '-Pandroid.cxxBuildStagingDirectory=C:\Temp\eiyu-cxx' -x lint -x test --offline --console=plain` with installed JBR/SDK and `EXPO_NO_DOTENV=1`. `scripts/local-db.ps1 verify` was deliberately not run because it resets the active local database. The local REST/upgrade scripts require local credentials from Supabase status and verify loopback/disposable targets; credential values are neither in this report nor the manifest.

## Review decision

The repaired source and local data/web checks are ready for review at this exact digest. **Final acceptance is open** at P6-AC1/4 and the partial device/zoom criteria above. A usable Android runner, real 200% zoom on the changed browser surfaces, and rollout schema verification are the concrete remaining boundaries. The commit and push authorized after this review do not constitute acceptance, deployment, remote migration or production data change.
