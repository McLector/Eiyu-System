# S02 queue hold expiry (owner decision 5) handoff

Held offline queue entries (`heldForTrackerPause` / `heldForProcessingPause`) expire 30 days after the hold began.

## Design
- `QueueEntry.heldAt?: number` (ms): set by the engine the first time an entry is held (`holdForProcessing`, `holdForTrackerPause`); never reset by a later hold.
- `HELD_RETENTION_MS` = 30 days. `expireHeldEntries(entries, nowMs)` in `write-queue.ts` removes entries that are `failed`, held, and `nowMs - heldAt > 30d`. Exactly 30 days is kept; plus 1 ms is removed. Needs no account zone.
- Only entries still in the held (failed) state expire, including a hold that already ended as `day-passed`. A hold released by Retry (now `uncertain`/`pending`) and ordinary entries are untouched.
- `decodeQueue(raw, userId, loadedAt?)`: a held entry with no readable `heldAt` gets `loadedAt` (the engine passes load time), so existing queues never expire at once. Without `loadedAt` no stamp is invented. v1 format unchanged; valid old entries still decode.
- New failure reason `hold-expired` (message in `FAILURE_MESSAGES`). The removed entry is reported through `deps.onFailed` as a stripped notice (id, userId, kind, habitId, accountDate, createdAt, attempts, status, failure). Label, delta, base, tracker revision and targets are dropped and are not persisted. The entry is not kept in the queue, so it is not in `entries` after expiry.
- Engine: expiry runs on load (before revive) and in `sweep()` (also called every flush pass); `retry()` sweeps first, so an expired but unswept hold cannot be retried.
- Account switch: engines and storage keys are per user and decode drops foreign-owner entries, so A->B->A neither expires nor adopts another account's entries (tested).

## Evidence
- RED: write-queue.test.ts 10 failed of 93 (new functions missing); write-queue-engine.test.ts 7 failed of 99.
- GREEN: write-queue + write-queue-engine + use-write-queue = 3 suites, 215 passed, 0 failed.
- Seven older engine tests compared a loaded held fixture with `toEqual(heldPurpose())`; they now expect the load-time `heldAt` (fixture predates the field).
- `npx.cmd tsc --noEmit -p mobile`: exit 0 (one transient TS6053 on a vanished `lib/__tests__/dbg.test.tsx` from another lane, gone on rerun).

## UI request (components not edited)
- `FailureReason` gained `'hold-expired'`. The `onFailed` notice carries `failure.message` ready to show as a toast or notice. It is not in the queue, so the sync review sheet will never list it; show it from the `onFailed` callback (no label available, only `habitId`).
- Hook `use-write-queue.ts` needed no change (it forwards `onFailed`). The store's `onFailed` handler should accept the new reason if it switches on reasons.

## Status: COMPLETE.
