# 007 — Resilience, empty states and measured loading

Planning only. Implementor: **Luna 6 (gpt-6-luna), extra-high (xhigh) effort**. Owns **F-024 (S3), F-018 (S4), F-016 (S4), F-025 (S4)**. No SQL migration is proposed. F-025 is a verification gate first; implementation is conditional on reproducing the delay on a quiet release build.

## Context and verified root causes

- **F-024 (S3, Android):** the store retains React Query data (mobile/contexts/eiyu-store.tsx:164-168,198-200), but combines query and action failures into one error string (lines 228-241). packages/shared/src/logic/format-error.ts:1-8 returns the raw exception message. mobile/app/(tabs)/board.tsx:537-545 renders that error before the data-backed lanes, replacing the whole list even when cached quests exist. Retry is manual (eiyu-store.tsx:608-618); the mobile package has no connectivity listener. In the observed case an offline completion rolled back correctly, but the list disappeared, TypeError: Network request failed leaked into copy, and reconnecting did not refresh it.
- **F-018 (S4, Android):** mobile/app/(tabs)/board.tsx:313 initializes lane state to daily; one-time quests render only when activeLane is one-time (lines 559-568). The editor saves and immediately goes back (mobile/app/quest-editor.tsx:124-150), without telling Board which lane to show. Current mobile/maestro/flows/one_time_quest_create_complete.yaml explicitly switches lanes after create, confirming the gap in the journey.
- **F-016 (S4, Android):** the editor resolves quest from the live user.quests list (`mobile/app/quest-editor.tsx:64-65`). Successful deletion removes the record from cached query data before invalidation (`mobile/contexts/eiyu-store.tsx:556-579`, especially 567 and 573-577); the editor then waits for that promise before `router.back()` (`quest-editor.tsx:153-170`). While the route is still mounted, header and save label branch on quest truthiness (lines 180-183,452-495), so disappearance of the row makes the edit route look like a new quest form during pending deletion. Deletion itself succeeds.
- **F-025 (S4, both):** the finding explicitly says the long load was partly environmental and requires a quiet-machine release check before code changes. packages/shared/src/data/habits.ts:67-82,94-120,130-158 awaits timezone initialization, two RPCs, catalog read and three history/progress reads in sequence. fetchProfile also calls initializeAccountTimeZone before selecting the profile (packages/shared/src/data/profile.ts:45-60); mobile starts both queries independently (mobile/contexts/eiyu-store.tsx:164-172). The run saw Board around 10 seconds, History 6+ seconds and an 11-call chain at 19.2 seconds while the machine was loaded; standalone Supabase timings were 109-487 ms, and an open-recovery call took 1.9 seconds in that overloaded trace. These observations do not yet prove a product performance defect.

## Tests first

Write and run failing tests before changing implementation.

1. Extend mobile/components/__tests__/quest-editor.lifecycle.test.tsx with a deferred successful deleteQuest promise. Remove the quest from store data before resolving; assert the mounted route stays in EDIT QUEST mode, never shows NEW QUEST/CREATE QUEST, shows an explicit deleting state, then closes. Add the negative failure case: dialog and edit form remain usable and the error is visible. Also retain `mobile/maestro/flows/habit_edit_and_delete.yaml` as the end-to-end lifecycle regression and assert its current edit/delete journey still completes.
2. Extend mobile/components/__tests__/board-lanes.test.tsx or add a focused Board lane test: successful one-time creation carries a one-shot return intent, activates One Time Quest and displays the new quest without a manual tab tap. A normal Board refresh that merely adds a remote one-time item must not steal the current Daily/All Habits selection; unrelated query refreshes preserve lane state.
3. Add store/Board tests for offline recovery:
   - Seed cached quests, reject a completion with TypeError('Network request failed'), and assert the quest row remains visible and unchecked after rollback. Render a friendly offline message, never the raw exception string.
   - When connectivity changes offline-to-online, trigger exactly one refetch of active Board queries; after success clear the offline banner. Do not refetch on initial connected render, repeated connected notifications or offline-to-offline. If first load has no cached data, show a friendly empty error with Retry.
   - Keep unrelated server error messages visible and do not report a failed completion as saved.
4. **Only if F-025 reproduces at the recheck gate below**, extend packages/shared/src/data/__tests__/habits.test.ts and profile.test.ts with deferred network promises proving independent calls overlap and timezone initialization is coalesced once per account/load. Add negative tests that one rejected request rejects the overall fetch (no partial Board result) and an empty Board skips completion/occurrence/progress selects. Do not add timing-sensitive latency benchmarks to CI.

## Fix approach and files

For **F-024**, use cached React Query data as the stale-but-useful Board during a failed request. Keep a compact error/offline banner and Retry action above the list; use the full-page empty error only before any cached data exists. Translate common network failures to concise, accurate copy such as “You’re offline. Your update wasn’t saved. Your saved quests are still shown.” Preserve optimistic rollback and action-failure semantics.

Use the SDK 54 expo-network API for connectivity changes, with a single transition guard in the store/provider so only an offline-to-online transition triggers one active-query refresh when an offline error is pending. This project does not currently list expo-network; SDK 54 recommends npx expo install expo-network (version ~8.0.8) and documents useNetworkState/addNetworkStateListener: [Expo Network SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/network/). Rebuild the native client after installation. Do not equate isConnected with a successful Supabase request; retain explicit request errors and manual Retry for captive portals or server failures.

For **F-018**, make a successful one-time creation carry an explicit, one-use destination intent to Board. Consume it once after the new item is available, select One Time Quest and leave the user there. A background refresh or an item created on another client must not switch lanes by inference.

For **F-016**, distinguish the mounted route’s edit mode from whether its record is still present in the live list. Keep the editor in edit mode for the full lifecycle promise, show DELETING… while delete is in flight, and navigate away only after success. A failed delete restores the regular edit actions and leaves its confirmation/error path available; never turn a removed record into a create form.

For **F-025**, first run the release-only recheck below on a quiet Android emulator or device and a quiet production web browser. Use a dedicated `mobile/maestro/flows/release_board_history_timing.yaml` that launches the installed release app directly, signs in inline with the disposable `E2E_EMAIL`/`E2E_PASSWORD` variables if needed, and records the first usable Board render and History grid render. It must not call `_helpers/launch_fresh.yaml` or `_helpers/login.yaml` (both route through dev-client startup) and must not use `phase6_reload_smoke.yaml` or any Phase 6 fixture. Run the release flow three times individually; capture cold/warm Board and History checkpoint times, client request durations from the disposable project's API logs, and standalone endpoint latency from the same host/network. Keep captures under ignored `maestro-logs/`. Compare with the finding threshold: if Board and History are each under six seconds in all three quiet runs and service timings are in the observed roughly 0.1–0.5 second range, mark F-025 environmental and make no performance code change. If either screen remains over six seconds with ordinary server latency, first make the independent-read/coalescing and empty-list/error-propagation tests fail; then parallelize only independent reads, coalesce duplicate timezone initialization and preserve the empty-list fast path and error propagation. After the conditional fix, the same release flow must show both screens usable within six seconds in all three quiet runs, with no regression in empty/error paths. The existing Phase 6 fixture remains a separate local dev-client regression and contributes no release-timing evidence.

Expected implementation files if their gates pass: mobile/contexts/eiyu-store.tsx, mobile/app/(tabs)/board.tsx, mobile/app/quest-editor.tsx, mobile/package.json and package-lock.json for expo-network; mobile/components/__tests__/quest-editor.lifecycle.test.tsx, board-lanes.test.tsx and focused store tests; packages/shared/src/data/habits.ts, profile.ts and existing tests only if F-025 reproduces; mobile/maestro/flows/one_time_quest_create_complete.yaml and e2e/A9_offline_complete.yaml for final journeys; plus `mobile/maestro/flows/release_board_history_timing.yaml` for the gated release matrix. Keep current uncommitted Maestro edits intact and use UTF-8 without BOM.

## Acceptance criteria

- **F-024:** During airplane mode, saved quest rows remain visible. Failed completion rolls back and reports a friendly offline state without exposing TypeError: Network request failed. Restoring connectivity automatically retries the active Board load once; success clears the message and the row remains unchecked. A first-load failure still has a usable Retry control.
- **F-018:** Creating a one-time quest from Daily returns to Board with the One Time Quest lane selected and the new item visible; no extra tab tap is needed. Later unrelated refreshes do not switch the selected lane.
- **F-016:** While permanent delete is pending, the sheet remains an edit sheet and reads DELETING…. It never displays NEW QUEST, CREATE QUEST or a create action. After success it closes; on failure it stays editable and reports the failure.
- **F-025:** Either (a) the quiet release check does not reproduce the >6-second delay, so the report marks it environmental with no code change, or (b) it reproduces with normal standalone service timings, conditional deterministic tests fail before/fix and pass after, and fetch still propagates errors and handles empty data. The original overloaded dev-client trace alone is not evidence for a code change.

## Verification commands and flows

Run from repository root in PowerShell. Use npm.cmd ci first only if root node_modules is absent. These run after tests are added; none run as part of planning.

    npm.cmd run test --workspace @eiyu/mobile -- --runInBand components/__tests__/quest-editor.lifecycle.test.tsx components/__tests__/board-lanes.test.tsx contexts/__tests__/eiyu-store.lifecycle.test.tsx
    npm.cmd run test --workspace @eiyu/shared -- --runInBand src/data/__tests__/habits.test.ts src/data/__tests__/profile.test.ts
    npm.cmd run lint --workspace @eiyu/mobile
    npx.cmd tsc --noEmit -p mobile/tsconfig.json
    npx.cmd tsc --noEmit -p packages/shared/tsconfig.json
    git diff --check

Expected: mobile lifecycle/Board/store tests pass; shared data tests run only if F-025 gate permits; lint, type checks and diff check exit 0. If installing expo-network, install the SDK-matched package with Push-Location mobile; npx.cmd expo install expo-network; Pop-Location, then rebuild native client before Maestro verification.

Run stateful Maestro flows **one at a time** against the disposable fixture/account:

    maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/one_time_quest_create_complete.yaml
    maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/e2e/A9_offline_complete.yaml
    maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/habit_edit_and_delete.yaml

Expected: the one-time journey shows the new quest immediately without manual lane selection; A9 keeps the saved quest visible, shows a friendly failed-update message and automatically recovers after airplane mode is disabled, with no ghost completion. Maestro is not the timing oracle for F-025; run these individually only when the disposable environment is ready.

**F-025 release gate, before performance code:** use the detached hidden short-path release build recipe in plan 004, section “For F-029”; build/install the Android release variant in the actual verified short-path checkout, not this long workspace or the Expo dev client. That recipe is `npx.cmd expo run:android --variant release`, launched through hidden `Start-Process` with stdout/stderr under ignored `maestro-logs/`. With the private disposable account loaded, run the dedicated release flow (which has no dev-server chooser helper) three times, individually:

    maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/release_board_history_timing.yaml
    maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/release_board_history_timing.yaml
    maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/release_board_history_timing.yaml

Expected: each checkpoint records a first usable Board and History render; both screens settle in under six seconds in each of three quiet runs to pass the release gate. If either remains over six seconds while standalone calls are near 0.1–0.5 seconds, collect client request durations from the disposable project's API logs and add/run conditional data tests before changing call ordering. Also measure the same Board and History journey three times in a quiet production web build. The dedicated release flow logs in directly on the release app; it must not display a development-server chooser. Keep the existing `phase6_reload_smoke.yaml` as a separate dev-client-only fixture check after its documented Phase 6 records have been provisioned; never run it as F-025 release evidence or against the shared account.

## Risks and rollout

The offline banner must distinguish a failed completion from a saved change; optimistic state must roll back before showing “wasn’t saved.” Connectivity can return while retry is already in flight, so guard duplicate refetches and stale account IDs. The native dependency requires a rebuilt client; test Android offline/online events on SDK 54 and retain manual Retry when connectivity state is inconclusive. Lane return intent must be consumed once to avoid surprising navigation on later refreshes. Delete state changes must not resurrect deleted rows or enable create/save actions on the still-mounted route. F-025 remains parked unless the quiet release gate reproduces it. No backend migration or live database mutation is in scope.

## Needs you (user-side actions)

- Provide a quiet Android emulator or device with the plan 004 local release build and a quiet web production environment for the F-025 recheck. A physical device is not required if a quiet emulator reproduces normal service timings. If only a dev client or overloaded environment is available, keep F-025 conditional; do not approve a performance refactor.
- Provide disposable account environment variables and the documented Phase 6 fixture only for stateful Maestro flows. Keep the shared maestro.tester account and personal browser sessions untouched.
- Review and approve a mobile release after offline/empty-state flows pass. This plan needs no live SQL, Supabase dashboard change, commit or push.
