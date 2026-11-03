# S02 tracker consent, client side: independent review (2026-11-03)

A fresh read-only reviewer covered the shared, web and native client work for tracker consent, the offline queue, reminders, the widget filters and AppText. It ran no tests. This records an AI review, not a human or legal one.

No High findings. Every protected write traced goes through `invokeTrackerWrite`, which copies the revision and targets before its first await and pins the session owner. Failed or foreign access reads fail closed.

## Medium

| # | Finding | Where | Disposition |
| --- | --- | --- | --- |
| C1 | A 22023 is treated as "already recorded", but 054/057 map unique, check, not-null and FK violations all to 22023. A completion failing for another reason can read as success. | `data/completions.ts:42`, `mobile/lib/write-queue.ts:190`, web `eiyu-store.tsx:351` | Fix, tests first: settle only after re-reading the quest. |
| C2 | Web Profile grant or withdrawal does not refresh the quest lists, so the board keeps a stale `canWrite`. Mobile does refresh. | `web/src/web/TrackerPermissions.tsx:16` | Fix, tests first. |
| C3 | Offline at cold start nothing can be queued, because the tracker read is never persisted. | `mobile/contexts/eiyu-store.tsx:89` | Owner decision: see the checkpoint. |
| C4 | `runtimeVersion` not bumped for the native `fontScale` change. | `mobile/app.json` | Fix: 1.3.0 with the APK rebuild. |
| C5 | The notices promise removal after 30 days, but the job is not live. | `legal-content.ts`, 061 | Release gate: enable the job with the notices. Added to the checklist. |
| C6 | Web `runLifecycle` and `runMove` capture a stale `userId`, so a refused write does not re-read access. | web `eiyu-store.tsx` near 505 | Fix, tests first. |

## Low

| # | Finding | Disposition |
| --- | --- | --- |
| C7 | Reminders and the widget treat unknown capability as granted; `DELIVERED_REMINDER_NOTICE` is never shown. | Review when fixing C3, since both concern unknown access. |
| C8 | Store-level `attemptedDeletes` treats a later 42501 as a successful delete after a confirmed failure. | Fix: remove the store copy. |
| C9 | An expired-hold notice can reach the wrong account during a switch. PLAUSIBLE; the message has no names. | Fix: check `disposed`. |
| C10 | A teen can briefly see the adult notice while the age read loads or fails. | Fix: hold the grant button until the read settles. |
| C11 | Concurrent consent toggles, no confirmation on withdrawal, web Gym wording for a paused account. | Reconsider after the owner's own testing. |
| C12 | `gym/[id].tsx:190` uses a raw `TextInput`; the guard misses some import forms; `InsideAppText` leaks through inline Views. | Fix the input and the guard. |
| C13 | `dev-ball.tsx:245` calls `undo_habit_completion`, revoked in 054, so the DEV wipe fails. | Fix or remove. |

## Checked and sound

Shared access parsing and target reads are strict and owner-bound. `invokeTrackerWrite` rejects caller-supplied targets and has no direct-write fallback. Gym uploads carry the captured revision. The tracker and age queries stay out of the persisted cache, and only the age band is cached, never the birthday. The queue drops other users' entries, Retry keeps the original date, and expiry keeps exactly 30 days. AppText changes nothing at launch, and the config plugin is idempotent.

## Not checked by the reviewer

`ReviewRequest`, the mobile long-quest editor and gym screens in depth, the widget task handler, notification taps, sign-out cache clearing, and native Android behaviour of `fontScale`.
