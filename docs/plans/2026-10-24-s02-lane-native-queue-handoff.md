# S02 native queue lane (N2) handoff

Owner files: mobile/lib/write-queue.ts, write-queue-engine.ts, use-write-queue.ts and tests in mobile/lib/__tests__/.

## Decisions
- The queue has no `delete` kind. Section 8 delete rule is implemented in `classifyError(kind: QueueKind | 'delete', error, priorAttempt)`: a 42501 "Tracker target unavailable." for kind `delete` after a prior attempt is `applied`; otherwise it is `not-on-board`. Duplicate completion 22023 on `complete` is `applied`.
- Decoder strips (treats as absent) a malformed or foreign-owner `trackerRevision` / `trackerTargets`; the engine then holds the entry as `purpose-paused` on its next pass.
- Retry on an entry with no captured targets renews only when the fresh target is `basic`.
- A later entry for a habit waits while an earlier entry of that habit is held (nothing jumps over it). Only holds with reason `tracker-paused` / `purpose-paused` block; a held entry that expired as `day-passed` does not.
- Retry on a non-held failed entry (server/not-on-board/...) also runs the owner/date/permission check, but keeps status `pending` (existing behaviour); a held entry becomes `uncertain`.
- Hook's `checkProcessingAccess` turns a 42501 "Tracker target unavailable." from `fetchTrackerTargets` into `targets: []` (habit gone -> engine holds `purpose-paused`); every other error propagates (engine leaves the entry untouched and stops the pass).
- `enqueue` also returns false when the zone is unknown (nothing persisted), when `trackerAccess.revision.userId` is not the engine's user, and when `trackerTargets` has no `habit` snapshot for `habitId` (kind unknown = treated as custom/read-only).
- Progress entries are only folded when both carry the same captured revision (a newer revision starts a new entry).

## Answer to the native-UI lane: 22023 on `complete`
The queue engine DOES map 22023 on `complete` to "applied" (via `classifyError`): the entry leaves the queue and `deps.onApplied(entry)` is called. The store `send` should therefore NOT swallow it a second time to hide a failure from the engine: either let the 22023 propagate (engine settles it once) OR return normally from `send` (engine then also calls onApplied once). It must not do both an "already recorded" toast and let the engine call `onApplied`, or it is handled twice. Recommendation: `send` lets the error propagate for queued entries; keep the store's own mapping only for the non-queued direct path.

## Needs from others
- Store: pass `{ trackerAccess, trackerTargets }` to `enqueue` and treat `false` as "refused, nothing stored, show the denial notice". `retry` is now `Promise<boolean>`.
- Store `send(entry)` must use `entry.trackerRevision` / `entry.trackerTargets` and never fetch a new revision.

## Status log
- [x] model tests RED (previous agent; not captured) / [x] model GREEN: `write-queue.test.ts` 100% passing
- [x] engine tests RED: first run after adapting existing tests to `checkProcessingAccess` = 28 failed; the 41 new tracker tests were written in the same step and not run RED on their own (honest note)
- [x] engine GREEN: write-queue + write-queue-engine suites 169 passed, 0 failed
- [x] hook tests RED: 15 of 23 failed before the hook change (new tracker tests plus existing ones that now need access/targets)
- [x] hook GREEN: write-queue + write-queue-engine + use-write-queue = 192 passed, 0 failed (3 suites)
- [x] tsc --noEmit: 28 errors, none in the six owned files; all in native-UI/other files still on the old signatures (app/gym-exercise-editor, gym-routine-editor, long-quest-editor, quest-editor; components/eiyu/dev-ball; contexts/gym-store; contexts/__tests__/eiyu-store.{lifecycle,long-quests,tracker}; lib/gym-media-upload)

## Status: lane COMPLETE. Nothing unfinished in the six owned files.
