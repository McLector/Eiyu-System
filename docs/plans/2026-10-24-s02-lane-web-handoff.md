# S02 web lane handoff (2026-10-24)

Contract re-read after coordinator update: custom chain name is required (existing validateQuestName covers it); basic habit payload built from the Pick fields only (no name/description/easyVersion/genre, even null; timeSet omitted when null); reorder targets deduped; editors pass copyTrackerRevision(access.revision), never the raw object.

## Plan / order
1. web/src/store/tracker.ts (access hook, messages, helpers) + test fixtures web/src/test/tracker-fixtures.ts
2. TrackerConsent.tsx + test
3. Store + store tests
4. WebQuestEditor + consent test
5. LongQuestEditorDialog + consent test
6. WebGym + gym-media
7. AccountShell Profile
8. Fix existing tests; tsc; lint

## Done
- 1. web/src/store/tracker.ts (useTrackerAccess hook sharing query key ['tracker', userId], readTrackerAccess, writeDenial, snapshotOf, error messages) and fixtures web/src/test/tracker-fixtures.ts, tracker-store-mocks.ts.
- 2. TrackerConsent.tsx + TrackerConsent.test.tsx: RED (module missing) then GREEN 13/13.
- 3. Store (eiyu-store.tsx) + eiyu-store.tracker.test.tsx: RED 15 failed/17, GREEN 17/17. Existing store tests (lifecycle, backlog, reorder) updated: `npm test -- src/store` 5 files, 35 tests GREEN.
- 3b. Section 8 late facts in the store (tests first, RED 2 failed/21 then GREEN): duplicate completion 22023 settles as recorded; delete 42501 after own unanswered attempt settles; reorder refusal reloads the lane. store dir: 5 files / 39 tests GREEN.
- 4. WebQuestEditor + WebQuestEditor.consent.test.tsx: RED 14/14 failed, GREEN 14/14; existing WebQuestEditor.* tests updated, 6 files / 49 tests GREEN.
- 5. LongQuestEditorDialog + LongQuestEditorDialog.consent.test.tsx: RED 10/11 failed, GREEN 11/11; existing WebLongQuests.* / density tests updated.

- 6. WebGym + gym-media (resumed agent): implementation existed from the earlier agent. Existing WebGym.test/detail tests were RED (16 failed: no tracker mocks, old signatures) -> GREEN (trackerSharedMocks + new signatures); WebGym.consent.test.tsx now uses real TRACKER_PURPOSE_NOTICES (shared mock of NOTICES/NO_TARGETS/copyTrackerRevision removed, also from tracker-store-mocks.ts) and gained 5 negative tests (under-12, authority pending, read failure, stale ET003 log). New gym-media.upload.test.ts (2 tests). Gym dir: 6 files, 71 tests GREEN + gym-media 2.

- 7. AccountShell Profile: new web/src/web/TrackerPermissions.tsx (two TrackerConsent controls via useTrackerAccess, shared query key) mounted in ProfileDialog before OwnerExport. AccountShell.tracker.test.tsx: RED 8/8 failed -> GREEN 8/8. AccountShell.navigation.test.tsx updated (QueryClientProvider + fetchTrackerAccess mock): 26/26 GREEN across both files.
- Mock cleanup: removed obsolete TRACKER_PURPOSE_NOTICES/NO_TARGETS/copyTrackerRevision mocks and fixtures NOTICES from TrackerConsent, WebQuestEditor.consent, LongQuestEditorDialog.consent, eiyu-store.tracker, WebGym.consent tests (now real shared notices/versions). Run of TrackerConsent+WebQuestEditor+LongQuestEditorDialog+WebGym+AccountShell+store: 21 files / 197 tests GREEN.

- 8. tsc --noEmit: clean (exit 0). Web eslint: clean after fixing WebGym unused import, eiyu-store unused disable directive, owner-export-init.test unused arg. Full web vitest: 95 files, 1353 passed / 6 failed; the 6 (LongQuestEditorDialog.density, WebAuth.legal, WebAuth.validation) are load timeouts in a 1270s run and pass in isolation (3 files, 11 tests GREEN).

## In progress
nothing

## Remaining
nothing for the web lane. Optional: rerun the full suite on an idle machine to confirm the 6 timeouts do not reproduce.
