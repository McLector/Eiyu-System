# 008 — Android navigation and Settings execution

## Findings and implementation

- **F-033 / F-026:** Status heatmap initial scroll targets the latest month; four Board lanes wrap at narrow widths.
- **F-022 / F-023 / F-035:** dirty profile close uses an app-themed confirmation, Settings uses configured app version without a duplicate title, and Dark Theme has a stable label/state.
- **F-009:** Sound Effects is device-persisted, defaults off, and plays a short bundled cue only after confirmed completion/target/recovery transitions. Playback failure does not fail the quest action.

## Test-first record

The initial Settings test showed that toggling Sound Effects did not reach the store preference setter; the preference helper tests also had no persisted key implementation. The updated Settings/preference/store suites pass, including full/easy, quantity target crossing, recovery, failure, undo and disabled-state cases.

## Verification

- Targeted status, Board, settings and sound tests passed; full mobile suite: 23 suites / 91 tests. Mobile TypeScript passed.
- Android device, persistence-across-relaunch and audio-module checks remain unverified. ADB at the verified SDK path is outside this sandbox's visible/executable paths, and no emulator process ID or connected device could be confirmed; no device flow ran. Native rebuild is required for `expo-audio`.

## User-side checks

Rebuild/install the SDK 54 Android dev client. Run `e2e/status_heatmap_latest.yaml`, `e2e/board_lane_phone_visibility.yaml`, `settings_toggles_and_signout.yaml` and `e2e/A3_quantity.yaml` one at a time. Enable Sound Effects in Settings, verify it remains enabled after reopening Settings, then complete a habit and a quantity target to confirm the cue is audible. Run the dirty profile discard check with Keep Editing and Discard.
