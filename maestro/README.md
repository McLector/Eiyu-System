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
maestro test maestro/flows                                # everything
```

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

Two `testID`s were added purely for Maestro to disambiguate taps that
plain visible text can't reach (both are inert - no behavior change):

- `board.tsx` — the per-quest checkbox `Pressable` (`testID="quest-checkbox"`,
  matched by `index` since every row shares the id)
- `longquests.tsx` — the per-stage checkbox `Pressable` (`testID="stage-checkbox"`)

## Known selector traps (see comments in the flow files)

- `longquest_stage_toggle_and_delete.yaml`: the delete row's label
  ("Delete Long Quest") is identical to the `Alert.alert` title, so flows
  anchor on the alert's body text instead once the dialog is open.
