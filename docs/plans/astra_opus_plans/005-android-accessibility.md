# 005 — Android quest editor accessibility

Planning only. Implementor: **Luna 6 (`gpt-6-luna`), extra-high (`xhigh`) effort**. Owns **F-012 (S3) and F-013 (S3)**. No backend migration. This plan follows 004 because both plans edit `mobile/app/quest-editor.tsx`; implement the shared file serially.

## Context and verified causes

- **F-012 (S3):** the quest editor renders days as `day[0]` from `Sun`, `Mon`, etc. (`mobile/app/quest-editor.tsx:359-385`; source values in `packages/shared/src/constants/eiyu-data.ts:20-22`). That produces duplicate S/T chips. The day, stat, and difficulty `Pressable`s expose no `accessibilityRole`, accessible name, or checked/selected state (`quest-editor.tsx:363-415, 421-445`). Color is the only selected cue, so the view hierarchy reports the selected options as unselected.
- **F-013 (S3):** the editor close control wraps only the `×` glyph in a `Pressable` (`quest-editor.tsx:180-186`). It has no button role, stable “Close” name, or target sizing/hit slop. This matches the reported glyph-only label and approximately 12 dp touch width.

## Tests first

After plan 004's layout changes are available, add tests and observe them fail before changing semantics:

1. Add `mobile/components/__tests__/quest-editor.accessibility.test.tsx` (or extend `quest-editor.lifecycle.test.tsx`) to query all seven day choices by their full names, require checkbox semantics and checked states, and prove selecting a day updates only that day's state. Cover Sunday/Saturday and Tuesday/Thursday specifically because the old single-letter labels collide.
2. In the same test, assert that every stat and difficulty option has a unique accessible name, radio semantics, and exactly one checked/selected item in each group; changing a choice moves that state. Include both the default and a non-default selection so the negative options remain unchecked/unselected.
3. Assert the close control is found by a stable button name and has a minimum 48×48 dp touch area. Verify pressing it navigates back, and that the existing delete-confirmation/pending guards still prevent an accidental close.
4. Keep a real-device accessibility check in the test checklist: enable TalkBack and traverse all editor controls with focus. Jest can verify semantics, but it cannot verify that TalkBack announces the full label and state naturally.

## Fix approach and reuse

In `mobile/app/quest-editor.tsx`, keep the current state transitions (`toggleDay`, `setStat`, `setDifficulty`) and selected colors. Add full, unique accessible names for each day (Sunday through Saturday); show visually distinct compact abbreviations such as `Su`, `Mo`, `Tu`, `We`, `Th`, `Fr`, `Sa` so the two S and two T choices are distinguishable without taking the full row width. Expose days as checkboxes with `accessibilityState={{ checked: active }}`. Expose stat and difficulty choices as radio options with their label/value and `accessibilityState={{ checked: active, selected: active }}` so Android accessibility services receive the checked state TalkBack commonly announces while the radio selection remains explicit; keep exactly one checked/selected value in each group. Allow the day row/chips to reflow at large font sizes from plan 004.

Give the close `Pressable` button semantics, a stable label such as “Close quest editor,” and an actual minimum 48×48 dp box (hit slop alone does not enlarge the accessibility bounds). Preserve `router.back()` and the existing pending/confirmation guards. Do not add a new accessibility library.

Files expected to change in implementation: `mobile/app/quest-editor.tsx`, its focused component test, and optionally the existing Maestro flow only if it needs a selector for the improved labels. No shared/backend code should be needed.

## Acceptance criteria

- **F-012 (S3):** all seven day choices have unique visible abbreviations and full screen-reader names; each reports checked true/false accurately. Stat and difficulty options are named radio controls; `checked` and `selected` match the current value, with exactly one true option in each group. The visual active colors still match their reported state.
- **F-013 (S3):** TalkBack announces the close control as a button named “Close quest editor” (or the final agreed stable equivalent); its measured bounds are at least 48×48 dp. It closes the editor only when no save/delete action is pending and no confirmation is blocking it.

## Verification commands and flows

Run the targeted and full mobile tests from the repository root:

```powershell
npm.cmd run test --workspace @eiyu/mobile -- --runInBand components/__tests__/quest-editor.accessibility.test.tsx
npm.cmd run test --workspace @eiyu/mobile -- --runInBand components/__tests__/quest-editor.lifecycle.test.tsx
npm.cmd run test --workspace @eiyu/mobile -- --runInBand
npx.cmd tsc --noEmit -p mobile/tsconfig.json
```

Expected: tests verify role/name/state, mutually exclusive radio selections, the enlarged target and preserved lifecycle behavior; the full mobile suite and type check pass. Then run these existing Android flows one at a time with private local test credentials:

```powershell
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/habit_create_happy.yaml
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/habit_edit_and_delete.yaml
```

Expected: the existing create/edit/save/delete journey still passes with the current selectors, and no selected choice or close behavior regresses. Do not run these flows as one multi-file command. Follow `mobile/maestro/README.md` for the dev-client launch and shared-account rules; screenshots/hierarchies stay under ignored `maestro-logs/`.

On Android with TalkBack enabled, traverse DAYS, STAT, DIFFICULTY and Close. Expected: no repeated “S”/“T” labels, checked/selected values announced accurately, and the close target is easy to focus and activate. Record whether this was a physical device, emulator, or unavailable; do not mark TalkBack verified from Jest alone.

## Risks and rollout

Keep this plan after 004 and before plan 006's validation changes; avoid parallel edits to the quest editor. Verify TalkBack behavior on Android because cross-platform role announcements vary. A 48 dp target and larger dynamic text increase the editor's content height, so retain scrollability and recheck at font scale 2.0. No schema or service rollout is involved.

## Needs you (user-side actions)

- If the implementor has no TalkBack-enabled Android surface, enable TalkBack on a test device/emulator and confirm the labels and state announcements described above.
- Provide disposable test credentials only through private shell environment variables if no authorized fixture is already available.
- No backend, Supabase dashboard, secret, production account, or deployment action is required.
