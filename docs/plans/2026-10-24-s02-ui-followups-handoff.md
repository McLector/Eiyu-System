# S02 UI follow-ups handoff: teen notice in prompts, expired-hold notice

## 1. Teen notice text in editor and Gym prompts
- One shared hook per app, `useAccountAudience(userId, enabled)` in `web/src/store/tracker.ts` and `mobile/contexts/tracker-access.ts`: a react-query read of `fetchAccountAge()` under key `['account-age', userId]`. Only the band is cached (never the birthday). `audienceOf(age)`: birthDate and `adultDeclared === false` -> teen; birthDate otherwise -> adult; none -> unknown (undefined, adult body). Another account's read, a failed read and loading all give undefined. A birthday save (`subscribeAccountAgeChanges`) invalidates it.
- Reads only when a prompt can appear: the stores pass `enabled` when the tracker exists and either optional purpose is ungranted; the Gym passes `enabled` only while the Gym notice is open. Nobody with both purposes granted pays a read.
- Exposed as `audience` on the web and mobile Eiyu stores (editors read `useEiyu().audience`) and on the mobile Gym store (`useGym().audience`); web `WebGym` calls the hook directly. Passed to every prompt: `WebQuestEditor`, `LongQuestEditorDialog`, `WebGym`, `app/quest-editor`, `app/long-quest-editor`, `components/gym/fitness-prompt`.
- Profile (`AccountShell`, `account-header`) keeps its own read and now uses `audienceOf` so the rule lives in one place.
- Mobile persisted cache: `shouldPersistQuery` also excludes `account-age`.

## 2. Notice when a held offline change expires (mobile)
- `eiyu-store.tsx`: `reportFailedWrite` now takes the notice; for `failure.reason === 'hold-expired'` it sets `expiredHoldNotice` to the existing queue message (`FAILURE_MESSAGES['hold-expired']`: "A change that was kept while permission was paused has expired after 30 days and was removed from this device. It was not saved."), which has no quest name. `dismissExpiredHoldNotice()` clears it; it also clears on account change. Several expiries share one notice.
- Shown by `SyncNotice` (new optional props `expiredNotice`, `onDismissExpired`; alert role, Dismiss button), wired in `app/(tabs)/board.tsx`.

## Evidence
- Web RED: 10 failed of 73 (store age band x5, Long/Quest editor teen x3, WebGym x2). GREEN: 21 files, 220 passed (store dir, WebGym*, WebQuestEditor*, LongQuestEditorDialog*, AccountShell*, TrackerConsent).
- Mobile part 1 RED: 13 failed of 138 across eiyu-store.tracker, gym-store, quest/long-quest consent, gym-list. GREEN with account-header: 6 suites, 169 passed.
- Mobile part 2 RED: 5 failed of 107 (store x2, SyncNotice x2, Board x1). GREEN: 3 suites, 107 passed.
- Mobile regression sweep (other store suites, gym, editors, board): 18 suites, 254 passed.
- `npx.cmd tsc --noEmit -p web` exit 0; `-p mobile` exit 0.

## Status: COMPLETE. Nothing staged or committed.
