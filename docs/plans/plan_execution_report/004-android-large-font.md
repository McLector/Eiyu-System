# 004 — Android large-font execution

## Takeover verification (2026-09-30)

- Reproduced a release startup blocker separate from F-029: two router module identities caused `useLinkPreviewContext` to crash. The embedded bundle already matched merged output, correcting the stale-packaging hypothesis.
- Added workspace canonical resolution for `expo-router` entry/root/subpath imports. Optional `EXPO_METRO_EXTRA_NODE_MODULES` supports the staged build while retaining ordinary Expo monorepo defaults.
- The artifact check failed on the original APK and passed after `:app:createBundleReleaseJsAndAssets --rerun :app:mergeReleaseAssets --rerun :app:packageRelease --rerun :app:assembleRelease`. Gradle exited 0 and reused native compilation. Installed the new APK; fresh private UI evidence reached authentication without the router error.
- **F-029 remains open:** release sign-in/Board/font-scale sequence was not completed. Computer Use was stopped with Escape, and no further UI input was issued. Font scale remained 1.0. Layout and TalkBack checks remain pending. Tooling-blocker statements below are historical.

## Findings and implementation

- **F-027, F-028, F-030, F-015, F-020:** implemented responsive editor action layout, wrapping Board lanes/header content, chooser scrolling, and long-name containment with unit coverage.
- **F-029:** verification-first. No navigation code change was made because the quiet release-build font-scale check was unavailable and the defect was not reproduced here.

## Verification

- Mobile component suites passed; full mobile suite: 23 suites / 91 tests. Mobile TypeScript passed.
- ADB/device access was rechecked. The SDK ADB executable at `%LOCALAPPDATA%\\Android\\Sdk\\platform-tools\\adb.exe` is outside the sandbox's visible/executable paths; the hidden emulator launch returned no process ID before it was interrupted. No running device was confirmed, so no Maestro flow, release APK, 200% font-scale, route-remount or logcat verification ran.

## User-side checks

Build/install the SDK 54 dev client in the verified short-path checkout. Run `e2e/_release_signin_board.yaml`, set Android font scale to 2.0, then run `e2e/A10_release_fontscale_recheck.yaml`; restore the original scale in a `finally` block. Separately run `e2e/A10_fontscale_layout.yaml`, `habit_edit_and_delete.yaml`, `one_time_quest_create_complete.yaml`, and `e2e/board_lane_phone_visibility.yaml`. Only change F-029 product code if the quiet release check reproduces the linking/remount defect. Keep logcat/screenshots under ignored `maestro-logs/`.
