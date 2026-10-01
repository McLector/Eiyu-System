# 004 — Android large-font layout and remount verification

Planning only. Implementor: **Luna 6 (`gpt-6-luna`), extra-high (`xhigh`) effort**. Owns **F-027 (S1), F-028 (S2), F-030 (S3), F-015 (S3), F-020 (S3), and F-029 (S3)**. No backend migration. Read the exact [Expo SDK 54 reference](https://docs.expo.dev/versions/v54.0.0/) before implementation; this repository is on Expo `~54.0.36` / Router `~6.0.24`.

## Context and verified causes

The 2026-09-29 Android run confirmed five layout defects at the default or 200% system font scale. F-029 was reproduced once in a development build; a release build has not been checked. `FINDINGS.md` marks the symptoms and expected behavior; the code below confirms the layout mechanisms. Source line references describe the inspected baseline and may move before implementation.

- **F-027 (S1):** the edit sheet is capped at 88% of the viewport (`mobile/app/quest-editor.tsx:547-555`) and puts Archive/Restore, Delete, and Save in a single horizontal `actionsRow` (`452-496`, `664-692`, `735-745`). The three controls have large fixed horizontal padding and their labels scale (`669-692`), so at 200% they fight for width, wrap into oversized controls, and push the primary action out of practical reach. Several editor chips also have fixed heights (`617-663`), clipping scaled text.
- **F-015 (S3):** the same three-control row has `flexDirection: 'row'` and `gap: 12` (`quest-editor.tsx:452-496, 664-692`). At the default scale, the primary button shrinks until “SAVE CHANGES” breaks in the middle of a word and sits beside the destructive action.
- **F-028 (S2):** Board text scales while important geometry does not. For example, the profile name fixes `lineHeight: 20` (`mobile/app/(tabs)/board.tsx:777-788`); the profile row, avatar, rank badge, and five-column stat row use fixed or tightly constrained geometry (`756-823`); lane tabs are a hidden-indicator horizontal scroller (`512-535`). The shared account header also fixes its brand mark at 32×32, avatar at 30×30, and rank badge width at 27 (`mobile/components/eiyu/account-header.tsx:115, 149-152`), so its labels and marks cannot reflow with enlarged system text. `GlassView` clips its children (`mobile/components/eiyu/glass-view.tsx:17-34`). These mechanisms match the clipped hero/stat/tab labels and garbled fixed-size branding reported across screens. The tab navigator has a font-scale height adjustment (`mobile/app/(tabs)/_layout.tsx:12-34`), but Board and shared-header content do not reflow enough.
- **F-030 (S3):** the quest-type modal centers an unconstrained card inside a padded overlay (`mobile/app/(tabs)/board.tsx:630-675, 690-725`). It has no maximum height or internal scroll container, so content enlarged by 200% can extend beyond the dialog and overlap the Board.
- **F-020 (S3):** the Board profile row renders the accepted profile name without a line limit (`board.tsx:406-429`); the text wrapper has no flex/min-width constraint (`756-788`) and competes with the fixed rank badge. The shared profile limit is 80 code points (`packages/shared/src/logic/validation.ts:13, 31-37`), so an 80-character name is valid input and the Board must contain it.
- **F-029 (S3, conditional):** the report captured an Expo Router “configured linking in multiple places” error during a font-scale change in a single dev-build run. The inspected root layout creates one Expo Router `<Stack>` under its providers (`mobile/app/_layout.tsx:28-99`) and does not explicitly render a `NavigationContainer`; the tabs have their own Expo Router `<Tabs>` (`mobile/app/(tabs)/_layout.tsx:10-70`). The app config also has the Expo Router plugin (`mobile/app.json:30-32`). Those facts do not establish why the runtime emitted the error. Treat the cause as **unverified** and do not alter navigation based on this one dev-only observation.

## Tests first

Add and run the regression checks below before changing the UI. Do not turn layout assertions into source-string tests; exercise real Android geometry for the font-scale defects.

1. Add focused component tests (for example, `mobile/components/__tests__/quest-editor.large-font.test.tsx` and `board.large-font.test.tsx`) for the action order, edit/save callbacks, full 80-character profile rendering contract, and both chooser actions. Cover short and long names, archived and active quests, a validation error, and a failed save so the reflow does not hide errors or change lifecycle behavior.
2. Add a Maestro flow `mobile/maestro/flows/e2e/A10_fontscale_layout.yaml`, using the existing `e2e/A10_fontscale_prep.yaml` fixture and current `_helpers/login.yaml` environment contract. At 200%, it must edit and save the prepared quest, inspect the action row, use both chooser options without creating unwanted records, and visit Board, Status, Long Quests, Settings, and History. Include a long ASCII profile name of 80 `M` characters; Maestro's Android Unicode entry limitation (H-5) means this flow should not rely on emoji.
3. Add a release-only login/setup helper `mobile/maestro/flows/e2e/_release_signin_board.yaml` and an assertion-only `mobile/maestro/flows/e2e/A10_release_fontscale_recheck.yaml`. Neither uses dev-client server-picker helpers. Setup signs into the release app and leaves Board foregrounded; the recheck must not launch/relaunch, clear state or navigate back to Board before its first assertion. Change the OS scale between those two flows while Board stays open. Run this sequence **before any F-029 source change**. Then check Board, Status and Quests remain usable; capture native/logcat output in ignored `maestro-logs/` only.
4. For F-029, the test-first gate is the release recheck itself. If it does not reproduce on a quiet release build, make no navigation code change and record the finding as dev-build-only/unreproduced there. If it reproduces, add a failing regression assertion/flow for the actual transition before changing code, then identify the concrete duplicate-linking path in source or the resolved dependency tree. No fix is accepted solely because a later run did not show the toast.

## Fix approach and files

Keep system font scaling enabled. Reflow the content instead of reducing `fontSize`, setting a low `maxFontSizeMultiplier`, or applying `allowFontScaling={false}` broadly.

- In `mobile/app/quest-editor.tsx`, let the action controls wrap or stack at constrained widths; keep Save a full-width or otherwise protected primary action, with Archive/Restore and Delete visually separated from it. Use scalable minimum heights rather than fixed text-bearing heights for day/stat/difficulty chips. Keep the sheet content scrollable inside its safe viewport and preserve pending/error/confirmation behavior.
- In `mobile/app/(tabs)/board.tsx`, allow profile/stat/lane content to grow or wrap; remove fixed line metrics where they clip; constrain long profile text within the available width beside the rank badge; and make the lane controls remain readable and reachable. If a horizontal lane scroller remains necessary, expose a clear affordance and keep selected state. Reflow the type chooser within the safe viewport using an internally scrollable card if its content exceeds available height.
- In `mobile/components/eiyu/account-header.tsx`, make the 32×32 brand mark, 30×30 avatar, and 27 dp rank badge responsive to scaled text and available width. Let the header rows wrap/grow while keeping profile actions reachable; verify both the profile sheet and embedded Settings header at 200%.
- Review `mobile/components/eiyu/glass-view.tsx` only if the Board's clipping still occurs after its content can grow; its shared `overflow: 'hidden'` can clip scaled descendants and any change can affect every glass surface. Prefer a local layout correction if that contains the fix.
- Do not touch the root router for F-029 unless the release gate reproduces. If it does, keep Expo Router as the single navigation container, use the already-read SDK 54/router guidance, and make only the source-supported correction. Preserve the auth-protected stack and tab route behavior.

## Acceptance criteria

- **F-027 (S1):** at Android font scale 2.0, an existing quest can be edited and saved. Scrolling to the bottom exposes fully readable Archive/Restore, Delete Permanently, and Save Changes controls; none expands into a giant side-by-side label block or is clipped. Stat/difficulty/day text does not lose glyphs. Delete cancel and save failure continue to preserve the quest/editor state.
- **F-028 (S2):** at 200%, Board headings, due count, stat names/levels, profile name/class/date, lane labels/counts, and action labels are fully readable or word-wrapped. Users can scroll to and activate every lane and ADD A QUEST. The shared header remains legible on Board, Status, Long Quests, Settings, and History.
- **F-030 (S3):** at 200%, both HABIT QUEST and ONE-TIME QUEST options remain entirely inside a themed chooser surface; if they cannot fit vertically, the chooser itself scrolls. The backdrop does not show through the second option, and both options can be tapped.
- **F-015 (S3):** at default scale, SAVE CHANGES stays on one line or wraps only between words. The primary action is not adjacent to a destructive control in a way that makes the target ambiguous.
- **F-020 (S3):** the valid 80-character display name remains within the Board viewport (wraps or ellipsizes); it does not cover the rank badge or produce horizontal overflow. Short names remain unchanged.
- **F-029 (S3, conditional):** on a release build, changing system font scale does not blank the screen, remount a second navigation container, change routes unexpectedly, or emit the multiple-linking-configuration error. If it cannot be reproduced in a quiet release build, no source fix is required; document that boundary without claiming the dev-run symptom was resolved.

## Verification commands and flows

From the repository root in PowerShell, run the mobile component suite and type check after the tests-first red run and after the implementation:

```powershell
npm.cmd run test --workspace @eiyu/mobile -- --runInBand components/__tests__/quest-editor.large-font.test.tsx components/__tests__/board.large-font.test.tsx
npm.cmd run test --workspace @eiyu/mobile -- --runInBand
npx.cmd tsc --noEmit -p mobile/tsconfig.json
```

Expected: focused and full mobile Jest suites pass, followed by a clean TypeScript exit. Run each Maestro flow separately (README forbids parallel/multi-file invocation against the shared account). Set the credentials only in the local shell; do not save them in a flow or plan:

```powershell
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/e2e/A10_fontscale_prep.yaml
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/e2e/A10_fontscale_layout.yaml
```

Run `A10_fontscale_prep.yaml` at the normal emulator scale to create its fixture. Then run the layout flow at 2.0; preserve and restore the emulator's original setting even if Maestro fails. For example:

```powershell
$originalFontScale = (adb shell settings get system font_scale).Trim()
try {
  adb shell settings put system font_scale 2.0
  if ($LASTEXITCODE -ne 0) { throw 'Could not set Android font_scale to 2.0' }
  maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/e2e/A10_fontscale_layout.yaml
  if ($LASTEXITCODE -ne 0) { throw 'Large-font Maestro flow failed' }
} finally {
  adb shell settings put system font_scale $originalFontScale
}
```

Expected: each flow reports success; the edited quest persists after save; both chooser actions are reachable; all large-font screenshots and hierarchies are legible. Keep captured evidence in ignored `maestro-logs/`, never in tracked paths.

For F-029, build from the **actual verified short-path checkout**, not the long workspace path. Discover the checkout rather than assuming a drive mapping. In a persistent PowerShell terminal, start the native release build detached and hidden with logs. Keep this start step separate from short, nonblocking process/log polls; do not put an unbounded wait loop in one tool call:

```powershell
$repo = '<actual verified short-path checkout>'
$logs = Join-Path $repo 'maestro-logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$stdout = Join-Path $logs 'f029-release-build.stdout.log'
$stderr = Join-Path $logs 'f029-release-build.stderr.log'
$build = Start-Process -FilePath 'npx.cmd' -ArgumentList @('expo', 'run:android', '--variant', 'release') -WorkingDirectory (Join-Path $repo 'mobile') -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
$build.Refresh()
"Started release build PID $($build.Id); stdout=$stdout; stderr=$stderr"
```

On later calls from that same PowerShell session, use this bounded poll and repeat only if it still reports running:

```powershell
$build.Refresh()
if ($build.HasExited) {
  if ($build.ExitCode -ne 0) { throw "Release build failed with exit code $($build.ExitCode); inspect $stdout and $stderr" }
  'Release build completed successfully'
} else {
  Get-Content -Path $stdout -Tail 25 -ErrorAction SilentlyContinue
  Get-Content -Path $stderr -Tail 25 -ErrorAction SilentlyContinue
  "Release build PID $($build.Id) is still running; poll again later"
}
```

With the release binary installed, check `adb shell settings get system font_scale`, set `adb shell settings put system font_scale 2.0`, and run only the dedicated release flow. Restore the original value even on failure. Expected: the release flow completes with no linking error/toast and the app stays on its route. A debug/dev-client pass does not satisfy this gate. If the release flow needs a signed-in fixture, use a disposable account with private local environment values; never use the user's personal production session.

Run the release flow with the same scale restoration guarantee and capture release logcat output:

```powershell
$originalFontScale = (adb shell settings get system font_scale).Trim()
try {
  # Start at 1.0 so changing to 2.0 actually triggers a configuration change.
  adb shell settings put system font_scale 1.0
  maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/e2e/_release_signin_board.yaml
  if ($LASTEXITCODE -ne 0) { throw 'Release sign-in/Board setup failed' }
  # Keep Board foregrounded; the following flow must not relaunch the app.
  adb shell settings put system font_scale 2.0
  if ($LASTEXITCODE -ne 0) { throw 'Could not set Android font_scale to 2.0' }
  maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/e2e/A10_release_fontscale_recheck.yaml
  if ($LASTEXITCODE -ne 0) { throw 'Release font-scale Maestro flow failed' }
  adb logcat -d | Out-File -FilePath (Join-Path $logs 'f029-release-fontscale.log') -Encoding utf8
} finally {
  adb shell settings put system font_scale $originalFontScale
}
```

Expected: the release flow completes with no linking error/toast and the app stays on its route. Keep logcat in ignored `maestro-logs/`; do not put emulator logs in tracked files.

After layout work, rerun the relevant existing baseline flows individually:

```powershell
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/habit_edit_and_delete.yaml
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/one_time_quest_create_complete.yaml
```

`phase6_reload_smoke.yaml` is a local post-journey smoke only: run it only after `phase6_whole_product_acceptance.yaml` has provisioned the named “Phase 6 Android” and “P6 Quantity Quest” records on the disposable local stack and the matching authenticated local account is active. Its flow does not log in or create those records. Skip it when that fixture is absent; never substitute a live/shared account or treat ordinary `E2E_EMAIL` / `E2E_PASSWORD` as proof that the Phase 6 fixture exists.

When that local Phase 6 fixture is present and its authenticated session is active, run the smoke separately with no generic E2E credentials (it uses the already authenticated app state):

```powershell
maestro test mobile/maestro/flows/phase6_reload_smoke.yaml
```

Expected: quest editing/deletion still works, one-time completion remains isolated to its lane, and Board/Status/Quests navigation still returns to persisted state. Existing dev-client flows use the current repaired package id and helpers; do not revert their uncommitted edits. If `node_modules` is absent, follow the roadmap's `npm.cmd ci` instruction before testing.

## Risks and rollout

Keep 004 ahead of plan 005 because both touch `quest-editor.tsx`; then serialize plan 008's Board/header edits after 004. Check 320–360 dp phone widths as well as the reported 1080×2400 emulator, default scale as well as 2.0, both light/dark themes, and keyboard-open state. Text reflow can increase sheet height and change tap positions; a shared `GlassView` adjustment can affect unrelated surfaces. Avoid saving screenshots or hierarchy dumps into tracked paths. F-029 is not a rollout blocker unless the release recheck reproduces; a confirmed release defect must pass that gate before any navigation adjustment ships.

## Needs you (user-side actions)

- If the implementor cannot access the existing verified short-path checkout and quiet Android release surface, identify/prepare them or run the F-029 release recheck yourself. Until that result exists, the F-029 code-change branch remains conditional.
- Provide disposable Android test access via private `E2E_EMAIL` / `E2E_PASSWORD` shell variables if no authorized test fixture is already available. Do not put credentials in tracked files.
- Restore the emulator's original system font scale after the verification session if the implementor cannot do so.
- No Supabase dashboard, migration, secret, live account, or production deployment action is required for this plan.
