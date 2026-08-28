# Maestro flows

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

# Create the persistent test account these flows log into.
maestro test maestro/flows/00_setup_create_test_account.yaml
```

The test account is `maestro.tester@eiyu.test` / `TestPass123!` (email
confirmation is off on this Supabase project, so signup drops straight
into the app). It's a throwaway dev-project account, not a real secret.

## Running flows

```
maestro test maestro/flows/auth_login_happy.yaml          # single flow
```

**Run flows one at a time, not as a multi-file/directory invocation.**
`maestro test a.yaml b.yaml` (or `maestro test maestro/flows`) runs the
files *concurrently* against the same device, not sequentially. Flows that
only touch their own fresh-signup account are fine either way, but any flow
that reads/writes the shared `maestro.tester@eiyu.test` account's board
state (most `habit_*`, `longquest_*`, `board_*`) will race with any other
such flow run in the same invocation and corrupt each other's data -
quests left half-created, wrongly marked complete, etc. Invoke each file
separately, e.g. in a loop or one `maestro test` call per flow.

`_helpers/login.yaml` is included via `runFlow` by every flow that needs a
session — it always does a fresh `launchApp: { clearState: true }` first,
so flows are independent and can run in any order (aside from `00_setup_*`,
which only needs to run once ever).

## What's covered

- `auth_*` — signup/login/forgot-password happy paths, validation errors,
  wrong password, mode-switching state leaks
- `habit_*`, `board_*` — quest CRUD, save-button validation, AI
  easy-version suggestions, complete/un-complete toggling, a rapid
  double-tap race-condition probe
- `longquest_*` — Long Quest CRUD, stage list min/max bounds, AI stage
  breakdown, stage toggling, delete (native `Alert.alert` confirm/cancel)
- `status_weekly_summary_and_cache` — weekly AI summary generates and
  then serves from cache on revisit
- `history_month_navigation` — calendar month paging
- `settings_toggles_and_signout` — theme/notification toggles, sign out

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
- `longquests.tsx` — the per-stage checkbox `Pressable` (`testID="stage-checkbox"`)
- `auth.tsx` — the terms-acceptance checkbox `View` (`testID="terms-checkbox"`,
  on the checkbox glyph itself, not the row - the row's accessible tap
  target overlaps the nested "Privacy Policy & Terms" link)

## Known selector traps (see comments in the flow files)

- `longquest_stage_toggle_and_delete.yaml`: the delete row's label
  ("Delete Long Quest") is identical to the `Alert.alert` title, so flows
  anchor on the alert's body text instead once the dialog is open.
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
