# S02 AppText (Decision 8) handoff, 2026-10-24

Decision 8: all app text goes through one shared component.

## Batch 1 (done): design, tests first
- RED: `components/ui/__tests__/app-text.test.tsx` (module missing) and `no-raw-text.guard.test.ts` (listed ~53 offending files). GREEN after the changes below.
- `mobile/contexts/font-scale-nudge.tsx`: `FontScaleNudgeProvider` (one window listener, shares the change count), `useSharedFontScaleNudge`. Mounted in `app/_layout.tsx` around AuthProvider (inside PersistQueryClientProvider, no remount of existing providers).
- `mobile/lib/font-scale-nudge.ts`: added `useFontScaleChanges`, `nudgeOffsetForChanges`; `useFontScaleNudge` unchanged in behaviour.
- `mobile/components/ui/app-text.tsx`: `AppText` (forwardRef Text; adds nudge additively to the flattened letterSpacing; nested AppText without own letterSpacing inherits the parent's).
- `TestThemeProvider` now also wraps `FontScaleNudgeProvider` so existing field/quest-row font-scale tests stay unchanged.
- field.tsx: labels/notes via AppText; TextInput uses the shared nudge. quest-row.tsx: title via AppText.

## Batch 2 (done): scripted migration of 53 files + field.tsx; guard test green.
Skips: components/eiyu/brand-mark.tsx `Animated.Text` (reanimated, not RN Text); mobile/widgets/** (own primitives); test files.

## Batch 3: full jest + tsc + eslint (see final report).

## Batch 3 results
- Full mobile jest (`npx.cmd jest --ci --runInBand`): 122 suites passed, 1914 tests passed.
- `npx.cmd tsc --noEmit` in mobile: no errors.
- eslint on 61 touched files: 0 errors, 5 pre-existing import/no-duplicates warnings in dev-ball.tsx.
