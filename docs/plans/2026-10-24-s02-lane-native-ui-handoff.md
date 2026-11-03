# S02 native UI lane N1a handoff (2026-10-24)

Scope: mobile/app/**, mobile/components/**, mobile/contexts/**, plus test-only infra in mobile/test-support/. Not touched: mobile/lib/** (N1b, N2).

## Plan / order (each step ends GREEN)
1. This file.
2. mobile/contexts/tracker-access.ts (port of web store/tracker.ts) + mobile/test-support/tracker-fixtures.ts (test-only infrastructure).
3. components/status/tracker-consent.tsx + tracker-consent.test.tsx
4. contexts/eiyu-store.tsx + tracker store test + existing store test mocks; _layout.tsx excludes ['tracker', ...] from persistence
5. app/quest-editor.tsx + quest-editor.consent.test.tsx + kit update
6. components/board/sync-review-sheet.tsx (async Retry)
7. components/eiyu/account-header.tsx Profile controls
8. app/long-quest-editor.tsx + consent test
9. gym-store.tsx, gym-routine-editor.tsx, gym-exercise-editor.tsx, dev-ball.tsx
10. tsc

## Facts
- No Expo API is added (only RN Pressable/Text and existing expo-router usage), so no new SDK 54 page was needed.
- Shared lane is complete: TRACKER_PURPOSE_NOTICES etc. are real exports; tests use the real notices (fixtures NOTICES stand-in removed).
- No mobile caller of fetchOrCreateWeeklyQuest or fetchWeeklyQuest exists: nothing to migrate.

## Done
- step 2: mobile/contexts/tracker-access.ts + mobile/test-support/tracker-fixtures.ts (exist; no own test, covered through store tests).
- step 3: components/status/tracker-consent.tsx + components/__tests__/tracker-consent.test.tsx (RED: module missing -> GREEN 13/13).

- step 4 (eiyu-store): contexts/__tests__/eiyu-store.tracker.test.tsx RED 30/30 failing -> GREEN 30/30. Store now has tracker/acceptTracker/refreshTracker, prepareBoard before fetchTodayHabits, authorize()/afterRefusal() helpers (port of web), enqueue passes {trackerAccess, trackerTargets}, send uses entry.trackerRevision/targets (throws if missing, does NOT swallow 22023: N2 settles it), retrySync returns Promise<boolean>. `shouldPersistQuery` exported from eiyu-store and used in app/_layout.tsx dehydrateOptions (tracker never persisted).
  Store tracker test mocks @/lib/use-write-queue (isolated from N2).

- step 4 older store tests updated and GREEN (lifecycle, offline-queue, reorder, long-quests, sound, widget: 80/80 after fixes; tracker test 30/30). Helpers in test-support/tracker-fixtures.ts (createTrackerMocks/resetTrackerMocks/CLASSIFIED/revisionOf/basicTarget).
- step 5 quest-editor: components/__tests__/quest-editor.consent.test.tsx RED (16 failing before impl) -> GREEN 16/16; app/quest-editor.tsx has mode chips, TrackerConsent prompt, read-only, paused, backlog lookup; quest-editor-kit updated (tracker, backlog, acceptTracker, refreshTracker; habitQuest classified custom).
- step 6 sync-review-sheet: async Retry awaited, busy guard, notices (tests extended; RED not run separately - tests+impl written in one pass).
- step 7 account-header: Profile shows TrackerConsent for both purposes (5 new tests, GREEN; RED not run separately).
- step 8 long-quest-editor: long-quest-editor.consent.test.tsx RED 11 failing -> GREEN 13/13.

## In progress
Existing quest-editor/long-quest-editor tests (lifecycle/validation/types/order/long-quest-editor.test) being adapted to editor input shape + tracker mock.

## Remaining
step 9 (gym-store, gym-routine-editor, gym-exercise-editor, gym-media-upload.ts, dev-ball), reminders/widget (notifications.ts, widget-snapshot.ts, use-widget-snapshot.ts), step 10 tsc + full focused runs.

## Needs from others
- none outstanding (N2 complete).

## Part A close-out (continuation agent)
- Existing quest-editor/long-quest-editor tests (lifecycle, validation, types, order, long-quest-editor.test) were already adapted: all pass. No assertions removed.
- 22023 rule already in store (eiyu-store.tsx send does not swallow; covered by eiyu-store.tracker.test.tsx).
- Full run of mobile components/__tests__ + contexts/__tests__ (--runInBand): 59 suites, 826 tests, all passed.
- tsc --noEmit -p mobile: 7 errors, all in part B files (app/gym-exercise-editor.tsx, app/gym-routine-editor.tsx, components/eiyu/dev-ball.tsx, lib/gym-media-upload.ts). None in part A files.
