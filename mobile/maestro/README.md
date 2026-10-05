# Maestro flows

## Verify a staged Android release

From the repository root, before installing a staged release:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-android-release.ps1 -AndroidAppBuildDirectory '<verified short-path mobile/android/app/build>' -ApkPath '<local test APK>'
```

The gate checks the APK's embedded/merged bundle hashes and one router module
identity for the root, stack and link contexts. APK size, timestamps and
`UP-TO-DATE` output alone do not prove incorrect packaging. Keep the workspace
`mobile/metro.config.js` in the staged copy. If it needs another dependency
directory, set `EXPO_METRO_EXTRA_NODE_MODULES` in that build process. After a
resolver change, rerun the bundle/merge/package tasks with per-task `--rerun`,
then verify the artifact and actual startup. This does not replace F-029's
foreground/no-relaunch font-scale sequence or its settings restoration.

Manual-testing-as-code for the native app, run against an Android emulator
(or device) with a real dev client — not the web build, since
`expo-notifications` isn't supported in Expo Go/web on SDK 54.

## One-time setup

```
# Java: point at Android Studio's bundled JBR (JDK 21) rather than
# installing a separate JDK — Maestro needs 17+.
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export PATH="$PATH:$HOME/.maestro/bin:/c/Users/morad/AppData/Local/Android/Sdk/platform-tools"

# Build and install the dev client on a running emulator.
npx expo run:android

# Create a disposable test account. Supply values from your private shell
# environment; never put credentials in a flow or this README.
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD -e E2E_NAME=$env:E2E_NAME maestro/flows/00_setup_create_test_account.yaml
```

Set `E2E_EMAIL`, `E2E_PASSWORD`, and `E2E_NAME` privately in the current
shell before running signup or login flows. Use a disposable development
account. The previously published shared account is not an approved test
fixture and must be rotated or deleted by the project owner.

## Running flows

```
maestro test maestro/flows/auth_login_happy.yaml          # single flow
```

**Run flows one at a time, not as a multi-file/directory invocation.**
`maestro test a.yaml b.yaml` (or `maestro test maestro/flows`) runs the
files *concurrently* against the same device, not sequentially. Flows that
only touch their own fresh-signup account are fine either way, but any flow
that reads/writes the shared test account's board state (most `habit_*`,
`longquest_*`, `board_*`) will race with any other
such flow run in the same invocation and corrupt each other's data -
quests left half-created, wrongly marked complete, etc. Invoke each file
separately, e.g. in a loop or one `maestro test` call per flow.

`phase8_cross_platform_persistence.yaml` is intentionally local-only. It reads
`PHASE8_EMAIL`, `PHASE8_PASSWORD`, and `PHASE8_METRO_URL` from the Maestro
command environment and expects its named records to have been created by the
Phase 8 browser journey against the same disposable local Supabase stack. The
explicit Metro URL prevents a development client from selecting another Expo
project when several local bundlers are discoverable.

`_helpers/login.yaml` is included via `runFlow` by every flow that needs a
session — it always does a fresh `launchApp: { clearState: true }` first,
so flows are independent and can run in any order (aside from `00_setup_*`,
which only needs to run once ever).

The Phase 6 flows use a separate disposable local account and are deliberately
not idempotent: `phase6_whole_product_acceptance.yaml` permanently deletes its
named test quests. Run it only against a fresh/reset Phase 6 fixture with the
same local Supabase stack used by the web leg. `phase6_reload_smoke.yaml` is a
read-only post-journey route/persistence check; it can be run after the main
flow at normal or increased Android font scale.

## What's covered

- `auth_*` — signup/login/forgot-password happy paths, validation errors,
  wrong password, mode-switching state leaks
- `habit_*`, `board_*` — quest CRUD, save-button validation, AI
  Penalty suggestions, complete/un-complete toggling, a rapid
  double-tap race-condition probe
- `longquest_*` — Chain CRUD, stage list bounds (at least one stage, no maximum),
  stage completion and undo, delete (centred confirmation). Rewritten for the
  Chain list and detail screens in mobile parity slice 3; not yet run on a device.
  The AI stage breakdown flow was removed with "Suggest stages" (D17).
- `gym_*` — Gym tab: create routine and exercise, log a weight, delete; validation and the discard guard.
  Written in mobile parity slice 4, not yet run on a device. GIF/MP4 upload is not covered (the system
  picker cannot be driven); do it by hand.
- `phase6_whole_product_acceptance.yaml` — disposable cross-platform lifecycle,
  account-isolation, retained-history, and Android navigation journey
- `phase6_reload_smoke.yaml` — same-account relaunch, persisted board state,
  and Board/Status/Quests navigation smoke
- `status_weekly_summary_and_cache` — weekly AI summary generates and
  then serves from cache on revisit
- `history_month_navigation` — calendar month paging
- `settings_toggles_and_signout` — theme switch (stable `Dark Theme` name, `settings-dark-theme` id, checked state flips), palette radiogroup, sound switch, Logout from the account menu

## Notes on the app changes made to support this

`testID`s were added purely for Maestro to disambiguate taps that plain
visible text can't reach (all inert - no behavior change):

- `board.tsx` — the per-quest checkbox `Pressable` (`testID="quest-checkbox"`,
  matched by `index` since every row shares the id)
- `board.tsx` — the per-quest edit-trigger `Pressable` (`testID="quest-edit-trigger"`).
  Its content is the quest name text, and the checkbox's `accessibilityLabel`
  is *also* the plain quest name until completed - tapping by name text
  lands on the checkbox instead (confirmed empirically; an `index` doesn't
  reliably fix it either, since React Native auto-derives a third, longer
  content-desc for the row - `"<name>, <time>"` - that doesn't exact-match
  the plain name but still perturbs which element an index lands on).
- `chain/[id].tsx` — the current stage's COMPLETE STAGE button (`testID="stage-complete"`),
  the chain's overflow button (`chain-more`) and the delete confirmation
  (`chain-delete-confirm` / `chain-delete-cancel`). `chain/index.tsx` — the
  `chain-card` rows and `chain-new`. Stages are no longer expanded from the list.
- `auth.tsx` — the terms-acceptance checkbox `Pressable` (`testID="terms-checkbox"`,
  a 48dp target next to the consent text; tapping the text itself would hit the
  Privacy Policy / Terms of Use links)
- `components/settings/settings-sheet.tsx` — `settings-dark-theme` and
  `settings-sound-effects` switches (match `checked`)

## Known selector traps (see comments in the flow files)

- Chain detail: the stats grid always shows a "Done" label, so `assertVisible: "Done"` passes before any stage is complete. Assert on the percent (`50%`) or the notice (`Stage completed.`) instead.
- Long Quest editor: the stage name inputs are prefilled when editing, so an `assertVisible` on a known stage name
  can pass without the right screen being open; assert on the screen title (`NEW LONG QUEST` / `EDIT LONG QUEST`) too.
- Secure-text fields (password/confirm-password) both report as the same
  masked placeholder text in the accessibility tree, and - unlike a plain
  placeholder - this does NOT clear once the field has a value. Two such
  fields on one screen need an explicit `index` on both taps; assuming
  "the filled one stops matching" silently re-taps the first field.
- A fresh dev-client process always lands on Expo's server-picker screen
  after `launchApp`, regardless of `clearState` (`launchApp` always
  restarts the process; the remembered connection is process-level, not
  persisted data). The first connection after `clearState` also triggers
  Expo's one-time dev-menu tutorial overlay, which covers the screen and
  hides app content from the accessibility tree until dismissed - its own
  "Continue" advances into the dev-menu panel rather than closing it, and
  that panel's "Go home" exits to the picker rather than the app. The
  hardware back button is what actually closes it in place. All of this is
  handled once in `_helpers/launch_fresh.yaml`.
