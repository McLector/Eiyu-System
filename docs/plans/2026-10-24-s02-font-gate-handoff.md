# S02 gate 2 (font repair) handoff, 2026-10-24

## Decision: no safe product repair is supported by the retained evidence. Gate 2 stays OPEN. No code or tests were written.

### What the evidence actually shows
- Plain Text spike ([text-prop](2026-10-23-s02-text-prop-spike.md)): a tiny explicit letterSpacing change (0 to 0.01 to 0.02) on one standalone Text reflowed it correctly in both directions (1.0 to 1.6 and back) with parent state kept. The control Text with no prop change stayed clipped (120 high vs 309.3 reflowed).
- Matrix spike ([font-matrix](2026-10-23-s02-font-matrix-spike.md)): the same offset reflowed nested Text and single-line TextInput both ways, with focus and selection range kept. Multiline return and post-cycle edit are UNPROVED (command3 stayed pending).
- Earlier negatives: ordinary rerender and key remount left Text clipped ([text-leaf](2026-10-22-s02-text-leaf-spike.md), recorded in the safe-font-refresh review); unconditional reload loses drafts and route ([public-reload](2026-10-20-s02-public-reload-font-spike.md)) and breaks input handover ([input-handover](2026-10-21-s02-input-handover-spike.md)).

### Why that is not an adoptable repair
1. Both positive spikes ran with the public `fontScale` configChanges bit added to MainActivity, an experiment-only change (text-prop spike: "Reuse the prior public fontScale Activity handler solely in the experiment"). The product manifest does not have it (`mobile/android/app/src/main/AndroidManifest.xml` line 23 lists keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode; no config plugin in `app.json`, no `fontScale` anywhere in the Expo config). The manifest-continuity result is recorded as a "candidate prerequisite, not adopted native policy" (safe-font-refresh-design). So the "text-prop only" repair is not what was tested; the tested repair is text prop plus a native manifest change that has not been accepted, and the product Activity behaviour on font change today is unproved to match.
2. The primitive is a per-component perturbation of typography. The product renders raw React Native `Text`/`TextInput` in about 66 files with no central text component, so applying it everywhere means a whole-app typography change. The text-prop spike states it is not "permission to change typography throughout the product" and not a whole-app repair; the matrix spike says the same. The ledger forbids changing existing typography.
3. Spec-level unknowns: which offset is stable (the spikes alternated 0, 0.01, 0.02, 0.01, so the nudge must drift or alternate on every font change, leaving a permanent spacing offset in the product), repeated cycles, actual Router and recovery state, TextInput glyph rendering, IME and multiline return/edit. The ledger says lack of final multiline acceptance stays explicit and the gate "cannot be marked closed by probe totals".
4. Component tests cannot honestly pin the behaviour the spike showed. The positive result depends on native layout-cache invalidation on a real device. A Jest test asserting that a prop is passed would only verify my own implementation and would give false assurance, and the ledger forbids that. Writing failing tests first for an unsupported repair would be inventing one, which the task says not to do.

### What I did not do
No tests, no product files, no probes, no device or emulator, no git state change, no installs. Only this file was written.

### If the owner later wants to pursue it (needs a new owner decision, not covered by the bound)
- Decide whether the product adopts the `fontScale` configChanges manifest plugin (needs its own accepted continuity evidence).
- Decide a typography-neutral nudge (single shared helper or wrapper, alternating value, documented as the one permitted typography exception).
- Then tests-first: helper unit tests, wrapper props pass-through, drafts/focus/selection preserved across a simulated Dimensions/fontScale change; then physical acceptance below.

### Physical checks still required on the Oppo (cold start at font scale 1.6, then 1.0, then 1.6 again) if a repair is ever adopted
1. Cold launch at 1.6: Board, Status, Gym, Auth, Settings headings and body text unclipped and complete.
2. With app running and an unsaved draft in quest editor, auth fields, and a multiline field with a selection: change system font 1.0 to 1.6 and back through Settings; confirm same Activity, same route, same draft text, same focus and selection, no keyboard drop.
3. Repeat the cycle at least twice, then edit a multiline field after return and confirm typing, return key and cursor placement work (the unproved case).
4. Confirm no duplicate writes or queue entries from the font change, and that allowFontScaling stays enabled (text really grows).

---

## Progress under Decision 15 = A (2026-10-24, continuation)

Owner decision: adopt the public `fontScale` configChanges entry through a config plugin plus one shared, typography-neutral nudge helper. No SDK change, no allowFontScaling=false, no cap.

### Step 1: config plugin (done, tests first)
- `mobile/plugins/with-font-scale-config-changes.js` (uses `withAndroidManifest` from `expo/config-plugins`, already installed); registered in `mobile/app.json` plugins right after `expo-router`.
- Test `mobile/plugins/__tests__/with-font-scale-config-changes.test.ts` (7 tests: adds once, preserves existing flags and order, adds attribute when absent, idempotent, no duplicate, other activities untouched, throws without MainActivity). RED observed (module missing), then GREEN 7/7.
- `mobile/android/` is a generated native project that is GITIGNORED (git check-ignore confirms), so the plugin only takes effect at prebuild. I made the identical edit in `mobile/android/app/src/main/AndroidManifest.xml` (`...|uiMode|fontScale`) so the next local Gradle build matches; that edit is not in git and a fresh prebuild reproduces it from the plugin.
- Native change: needs a new APK. app.config.js says a native plugin change should bump `runtimeVersion` (currently 1.2.0); I did NOT bump it (owner/release decision, and app-config tests pin the current value). An OTA to old binaries only carries the JS nudge, which is harmless without the manifest bit.

### Step 2: helper (done, tests first)
- `mobile/lib/font-scale-nudge.ts`: `useFontScaleNudge(baseLetterSpacing?)` returns undefined at mount; after each `useWindowDimensions().fontScale` change returns `{ letterSpacing: base + 0.01 }` then `+ 0.02`, alternating (spike sequence 0, 0.01, 0.02, 0.01). Base spacing is added, not replaced, so styled tracking (label 1.2) is preserved. Never touches fontSize or allowFontScaling.
- Test `mobile/lib/__tests__/font-scale-nudge.test.tsx` (7 tests). RED (module missing, then wrong mock path), GREEN 7/7.

### Step 3: applied to (see final tally below)
- `mobile/components/ui/field.tsx`: label, TextInput (single and multiline), error and hint notes. Field is the shared input used by the quest/long-quest/gym editors, auth, and PasswordField, so this covers editor fields/labels and auth fields.
- `mobile/components/board/quest-row.tsx`: the quest title (Board quest card).
- Tests: `components/ui/__tests__/field.font-scale.test.tsx`, `components/board/__tests__/quest-row.font-scale.test.tsx` (base style unchanged at mount, patch merged and alternating after a simulated scale change). RED observed (2 failed), GREEN after the change.

### Step 4: verification (real output)
- `npx.cmd tsc --noEmit` in mobile: no output (clean).
- `npx.cmd jest components/__tests__ lib/__tests__ components/ui components/board plugins --runInBand`: Test Suites 102 passed / 102; Tests 1485 passed / 1485.

### Coverage: covered vs NOT covered
Covered (nudge applied): every `Field` label, TextInput (single and multiline) and error/hint note (so quest, long-quest, gym routine/exercise editors, auth Display name/Birthday/Email, and PasswordField fields); Board quest-row titles.
NOT covered (gap, raw Text in ~54 files, no central text component): Board section headings and quest meta/chip/progress text, quest details sheet, Status, Gym lists/cards, Chain, Settings sheet, auth title/subtitle/notice/terms text, Button/Chip/Segmented/StateBlock labels, modals and sheets. Extending means adding `useFontScaleNudge()` per component (or a shared Text wrapper later). Unproved: multiline edit after a cycle, repeated cycles, real Router state.
Also open: native change needs a new APK; runtimeVersion NOT bumped (owner decision).

### Oppo checklist (updated)
0. Install a NEW build (plugin/manifest changed): confirm `fontScale` in the installed MainActivity configChanges. OTA alone will not do.
1. Cold launch at 1.6: Board titles, editor/auth fields and labels complete. Uncovered surfaces (list above) may still clip: record which.
2. With app running, unsaved draft in quest editor, auth fields, and a multiline field with a selection: 1.0 to 1.6 and back via Settings. Same Activity, route, draft, focus, selection, no keyboard drop; Field text and Board quest titles reflow (letterSpacing alternates 0.01/0.02 only after the change).
3. Repeat at least twice, then edit a multiline field (typing, return, cursor) - the unproved case.
4. No duplicate writes/queue entries; text still really grows (allowFontScaling untouched); confirm no visible tracking difference at launch (no patch at mount).

Emulator results for steps 1 to 4 are in `2026-11-03-s02-review-clients.md`. Auth fields and a selection range were not covered there. Change the font through Settings, so the app is left and resumed: that is what makes it read the new scale.
