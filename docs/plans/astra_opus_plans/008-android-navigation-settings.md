# 008 — Android navigation, Status and Settings polish

Planning only. Implementor: **Luna 6 (`gpt-6-luna`), extra-high (`xhigh`) effort**. Owns **F-033 (S3), F-026 (S4), F-022 (S4), F-023 (S4), F-035 (S4), and F-009 (S4)**. No backend migration. Execute after plan 004 because it also changes Board layout and after plan 005 for safe sequential work in adjacent mobile UI files.

## Context and verified causes

- **F-033 (S3):** the heatmap builds a six-month chronological week grid and renders it in a horizontal `ScrollView` (`mobile/components/eiyu/habit-heatmap.tsx:57-63, 102-168`). The `ScrollView` has no ref, initial offset, or end-scroll behavior (`122-168`), so Android starts at the oldest columns and leaves today's rightmost column off-screen. The existing date utilities intentionally produce ascending columns (`packages/shared/src/logic/heatmap.ts:44-71`).
- **F-026 (S4):** Board exposes four fixed-label lane tabs in a horizontal `ScrollView` with the horizontal indicator hidden (`mobile/app/(tabs)/board.tsx:512-535`). The longest fourth label is placed after the first three (`319-324`) with no wrapping or other visual cue; at the reported phone width “ARCHIVED” is clipped until the user discovers a horizontal swipe.
- **F-022 (S4):** unsaved profile close/Back calls React Native's `Alert.alert` (`mobile/components/eiyu/account-header.tsx:31-41`), which uses the OS alert appearance on Android. The existing settings/profile UI is already themed with the app's `Modal` surfaces (`account-header.tsx:62-82, 135-143`), and quest deletion already demonstrates an in-app accessible confirmation (`mobile/app/quest-editor.tsx:500-537`).
- **F-023 (S4):** the embedded Settings modal adds a “SETTINGS” header (`account-header.tsx:135-142`) and `SettingsContent` always adds a second “Settings” heading and hard-codes `Eiyu System v0.1.0` (`mobile/components/eiyu/settings-content.tsx:37-44`). The configured app version is `1.0.0` (`mobile/app.json:2-6`); `expo-constants` is already installed (`mobile/package.json:31-33`) and SDK 54 documents `Constants.expoConfig` as the standard app config object.
- **F-035 (S4):** the visible switch label changes between “Dark Theme” and “Light Theme” while `accessibilityLabel="Dark theme"` and `checked` continue to represent `darkMode` (`settings-content.tsx:39`). In light mode the visible “Light Theme” label therefore appears next to an off switch even though light mode is active.
- **F-009 (S4):** `SettingsContent` owns a transient `useState(false)` for Sound Effects (`settings-content.tsx:29-33`); toggling only changes that local state (`19-21, 40`). No code reads it or plays a sound, and no audio package is currently installed. The project already provides a device-local preference pattern using AsyncStorage (`mobile/lib/notification-prefs.ts:1-13`) and calls habit completion through the centralized store (`mobile/contexts/eiyu-store.tsx:406-464`).

## Tests first

Write and run these tests before any implementation. Add automated behavior tests first; use Maestro and a real Android accessibility/audio check for device-level behavior.

1. Add `mobile/components/__tests__/habit-heatmap.test.tsx` to verify the scroll ref calls `scrollToEnd` after content size is measured, does not keep resetting after a user begins scrolling, preserves access to old dates, and handles a year/month boundary and a timezone where account-today differs from the device date. Include loading/empty history. These unit tests verify the ref/scroll calls and date selection; they do not prove that today's cell is geometrically visible on a real Android viewport.
2. Extend `mobile/components/__tests__/board-lanes.test.tsx` for a phone-width Board: every lane remains exposed as a named tab, Archived remains reachable, and selecting it still renders archived content. Check behavior at default scale and 200% without depending on a fixed tab index; use Android Maestro/device inspection separately to verify the actual visible bounds at phone width.
3. Extend `mobile/components/__tests__/account-header.test.tsx` to replace the `Alert.alert` expectation with an in-app themed confirmation. Assert Back and Cancel leave the draft intact, Keep Editing closes only the prompt, Discard closes the profile sheet, and system Back while the prompt is open cannot discard implicitly.
4. Add `mobile/components/__tests__/settings-content.test.tsx` (or extend the account-header test) for one Settings heading in embedded mode, version text derived from Expo app config, and a stable “Dark Theme” switch name whose checked state tracks `darkMode` in both themes.
5. Extend `mobile/contexts/__tests__/eiyu-store.lifecycle.test.tsx` and the Settings component tests for Sound Effects: default off; on/off survives unmount/reopen; successful full/easy completion plays once only when enabled; quantity progress plays only on the confirmed transition across its target (not on partial increments or later taps); successful recovery completion plays once if enabled; undo, failed completion, and audio-player failure do not claim success or break quest state. Include AsyncStorage write/read failure cases and verify the displayed value does not falsely claim a failed preference write succeeded.
6. Update `mobile/maestro/flows/settings_toggles_and_signout.yaml` as a test-first red change: expect the same theme label after toggling with its state changing, and expect the Sound Effects preference to remain enabled after leaving/reopening Settings. Add `mobile/maestro/flows/e2e/status_heatmap_latest.yaml` to open Status and assert a current-date test hook is visible before any horizontal swipe. Add `mobile/maestro/flows/e2e/board_lane_phone_visibility.yaml`, which logs in with `_helpers/login.yaml`, creates its own disposable habit using `_create_habit.yaml`, and checks the four lane labels/selection at default scale and 200% so it does not depend on a pre-existing account record. Preserve the All Habits/Archived checks in `phase3_lane_navigation.yaml`; do not use that flow as the standalone test because it assumes an already-authenticated session and the local “P2 Notification Retry” fixture.

## Fix approach and reuse

- **F-033:** keep the full chronological history window and reuse `heatmapWeekColumns`/`heatmapMonthLabels`. Attach a ref to the horizontal heatmap scroller and move it to the end once its content width is known; handle subsequent date-window changes without repeatedly fighting a user's manual scroll. Add a stable test hook/accessibility name to today's cell for unit and device regression checks. Unit tests assert the call timing; the Maestro/device check must separately show the current-day hook inside the initial native viewport before any swipe. Do not reverse the shared date order or remove older months.
- **F-026:** make all four lane labels legible at phone width. Prefer a wrapping tab grid (for example, two rows) if it fits the layout; if horizontal scrolling remains, keep labels untruncated and add a visible scroll cue/indicator. Preserve `accessibilityRole="tab"`, selected state, lane counts, `activeLane`, and `board-lane-tab-*` test IDs. Reuse current lane options and handlers in `board.tsx:319-324, 512-535`.
- **F-022:** replace the native alert with an app-themed confirmation `Modal` in `ProfileSheet`, following the existing backdrop/card/button patterns. Provide explicit Keep Editing and Discard controls with accessible names, focus on a safe action, dismiss the prompt without losing input, and make hardware Back dismiss/keep editing rather than silently discard. Keep save-in-flight protection intact. `Alert.alert` in unrelated settings/export code is outside this finding.
- **F-023:** render one Settings title in embedded mode; keep an accessible heading for any non-embedded use. Read the version from `Constants.expoConfig?.version` using the existing `expo-constants` dependency and keep a safe empty/unavailable fallback rather than a stale hard-coded version. SDK 54 reference: [Expo Constants](https://docs.expo.dev/versions/v54.0.0/sdk/constants/).
- **F-035:** use one stable switch name (“Dark Theme”) tied to the existing `darkMode` boolean and keep its checked state aligned with that name. Do not make the switch describe whichever theme is currently active; the label must mean the same thing in both states. Keep the theme toggle and visual theme description behavior intact.
- **F-009:** make the switch a working device preference, default off to preserve current no-sound behavior until enabled. Persist it with a small helper modeled on `mobile/lib/notification-prefs.ts`; expose it through `EiyuStore` so Settings and completion paths use the same value. Play one short bundled completion cue only after a confirmed successful transition into completed state: full/easy via `runCompletion` (`mobile/contexts/eiyu-store.tsx:406-464`), quantity only when confirmed progress crosses target (`474-509`), and recovery via its success path (`511-528`). Do not replay for later taps on an already-completed quest, partial quantity increments, undo, failed requests, or while disabled. Keep playback out of optimistic updates so rollback cannot emit false success. Use SDK 54 `expo-audio`, not deprecated `expo-av`; install the compatible package with `npx expo install expo-audio` and a local sound asset. Expo SDK 54's [Audio docs](https://docs.expo.dev/versions/v54.0.0/sdk/audio/) document `useAudioPlayer` and local bundled sources. Playback needs no recording permission; do not add microphone access. Ensure the player is lifecycle-managed and rewind/replay behavior is correct for repeated completions.

Likely implementation files: `mobile/components/eiyu/habit-heatmap.tsx`, `mobile/app/(tabs)/board.tsx`, `mobile/components/eiyu/account-header.tsx`, `mobile/components/eiyu/settings-content.tsx`, `mobile/contexts/eiyu-store.tsx`, a small `mobile/lib/sound-effects-prefs.ts` / audio helper, the audio asset, `mobile/package.json` and its lockfile, plus the tests and Maestro flows listed above. No SQL or Supabase change is needed.

## Acceptance criteria

- **F-033 (S3):** opening Status on Android initially shows the latest month and today's cell at the right edge of the six-month heatmap, with the current account date highlighted. A Maestro/device check confirms the today hook is within the native viewport before any horizontal swipe; unit tests only confirm the scroll ref call and state behavior. The user can still scroll left through all prior months and selection details continue to work.
- **F-026 (S4):** at 1080×2400 and a 360 dp phone width, “ARCHIVED” is not cut off and a new user can tell the lane selector has more content if scrolling remains. All four lanes and their counts remain selectable; archived content and existing lane state are unchanged.
- **F-022 (S4):** dirty profile Back shows an in-app dialog matching the active theme. Keep Editing preserves the draft; Discard closes it. Back while the prompt is open is safe and neither loses text unexpectedly nor bypasses pending-save rules.
- **F-023 (S4):** embedded Settings has one visible Settings heading and reports the configured `1.0.0` version from Expo config; it contains no hard-coded `v0.1.0`.
- **F-035 (S4):** the visible and accessible control has a stable Dark Theme meaning; its checked state is true in dark mode and false in light mode, with the same name in both states.
- **F-009 (S4):** Sound Effects defaults off and persists after leaving/reopening Settings. When enabled, play exactly one cue after confirmed full/easy completion, the quantity target-crossing transition, or successful recovery completion; partial increments and already-completed taps do not replay. Turning it off persists and prevents playback. Undo, failures, or unavailable audio produce no false success sound and do not break quest completion.

## Verification commands and flows

Run targeted mobile tests, the full suite, and type checking from repository root:

```powershell
npm.cmd run test --workspace @eiyu/mobile -- --runInBand components/__tests__/habit-heatmap.test.tsx components/__tests__/board-lanes.test.tsx components/__tests__/account-header.test.tsx components/__tests__/settings-content.test.tsx contexts/__tests__/eiyu-store.lifecycle.test.tsx
npm.cmd run test --workspace @eiyu/mobile -- --runInBand
npx.cmd tsc --noEmit -p mobile/tsconfig.json
```

Expected: focused/full Jest suites and the TypeScript check exit 0. Unit tests use a mocked audio player; they must prove call count and persistence without relying on audible CI output. Installing `expo-audio` adds native code, so rebuild the Android dev client from the verified short-path checkout before device verification.

Run each flow separately with private local test credentials; Maestro flows sharing the account must not run concurrently:

```powershell
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/e2e/status_heatmap_latest.yaml
$originalFontScale = (adb shell settings get system font_scale).Trim()
try {
  adb shell settings put system font_scale 1.0
  if ($LASTEXITCODE -ne 0) { throw 'Could not set Android font_scale to 1.0' }
  maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD -e HABIT_NAME='Lane Visibility Default' mobile/maestro/flows/e2e/board_lane_phone_visibility.yaml
  if ($LASTEXITCODE -ne 0) { throw 'Default-scale lane visibility flow failed' }
  adb shell settings put system font_scale 2.0
  if ($LASTEXITCODE -ne 0) { throw 'Could not set Android font_scale to 2.0' }
  maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD -e HABIT_NAME='Lane Visibility Large Font' mobile/maestro/flows/e2e/board_lane_phone_visibility.yaml
  if ($LASTEXITCODE -ne 0) { throw 'Large-font lane visibility flow failed' }
} finally {
  adb shell settings put system font_scale $originalFontScale
}
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/settings_toggles_and_signout.yaml
```

Expected: Status starts with today's cell geometrically inside the native viewport before any swipe, scrolling exposes earlier dates, all four lane labels are fully visible/reachable and selectable at the tested scales, the discard dialog matches the app's current theme and preserves/cancels correctly, and Settings retains the theme/audio values after reopening. The new lane flow authenticates and creates its own disposable habit; run it only on the authorized local disposable test account, never on a live/shared account. `phase3_lane_navigation.yaml` is a separate local-only flow: it has no login step and expects both an already-active session and preseeded “P2 Notification Retry” data. Run it only when that local fixture is confirmed; the `E2E_EMAIL`/`E2E_PASSWORD` arguments do not satisfy either precondition. The settings flow signs out at the end, so run it after other authenticated flows. Keep screenshots and hierarchy evidence under ignored `maestro-logs/`.

On an Android device/emulator with audible output, enable Sound Effects, complete a disposable quest once, and confirm one short cue; undo it and confirm silence; turn Sound Effects off, complete another quest, and confirm silence. Also open Settings after navigating away to verify the persisted switch. Record audio routing limitations explicitly; a Jest mock is not proof of audible output. No production session/account should be used.

For an absent node_modules directory, run the roadmap's `npm.cmd ci` instruction before tests. Inspect `git diff --check` and confirm no screenshots/evidence have been added to tracked paths.

## Risks and rollout

Implement 004/005 first and serialize edits to `board.tsx`, `account-header.tsx` and Settings components. Heatmap auto-scroll must run after measurement and not reset during an in-progress user scroll. A wrapping lane grid takes more vertical space, especially at 200%; check it against plan 004. A themed discard modal must keep Back/cancel semantics and focus safe. Audio adds a native module and a bundled asset, so the dev client must be rebuilt; use a tiny original/local cue, avoid external copyrighted assets, and keep playback failures from affecting the completion transaction. The preference is device-local like notifications, so reinstalling may reset it; document that behavior if observed. No backend rollout or data migration is needed.

## Needs you (user-side actions)

- If no implementor can verify screen-reader or sound behavior on an Android device with accessible audio routing, perform the TalkBack/audio checks above and report the result.
- Provide disposable test credentials only through private shell environment variables if no authorized fixture is already available. Do not use the personal production session.
- If the implementor cannot access the verified short-path checkout for the Android native rebuild required by `expo-audio`, identify/prepare that checkout or run the rebuild from it.
- No migration, Supabase dashboard setting, API secret, live account cleanup, or server deployment is required by this plan.
