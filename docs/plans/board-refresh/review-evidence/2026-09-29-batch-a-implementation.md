# Repair A implementation checkpoint

Date: 2026-09-29. Branch: `codex/board-refresh-repairs`. Base: `aa793baf4eed94c0704f799f36c98d742853a9a4`. Implementer for this continuation: **gpt-6-sol, medium** at the user's explicit direction. The preceding uncommitted A code has mixed parent/Luna provenance. Reviewer: parent Codex. This document is a review checkpoint, not acceptance of B–F or native device behavior.

## Changed behavior

- Board retrieval includes archived recurring and one-time definitions, while active one-time quests remain eligible only through today's server result. ID merging prevents duplicates. Authenticated updates require a returned row; a stale editor keeps its draft and shows a missing-definition error.
- Editor and board delete actions show named retention confirmation. On web, both confirmation surfaces start on Cancel, contain Tab focus in a portal, make background inert, return focus on dismissal, block dismissal and repeats during the write, and keep failures available for retry. The native editor and board use named modals with retention text; Android Back and repeated confirmation are blocked while pending, and failures remain retryable.
- Reminder permission inspection is passive during Restore. Explicit opt-in creates the Android channel before requesting permission, per [Expo SDK 54 notification documentation](https://docs.expo.dev/versions/v54.0.0/sdk/notifications/). Reminder warning and retry are shown on the native Board. Preference writes complete before the displayed setting changes or an OS permission request begins; failed reads/writes stay visible. Reminder work is serialized and each sync clears scheduled IDs before rebuilding from authoritative active definitions, including future one-time dates. This lets Retry remove orphaned notifications after cleanup failure and prevents an older save from re-arming a quest archived during query invalidation.

## Executed evidence

| Boundary | Result |
| --- | --- |
| Real local auth/PostgREST/RPC, `scripts/integration/board-lifecycle-rest.cjs` with local CLI URL/anon key | PASS three times. Fresh authenticated clients observed archived one-time after reload, restored the same ID, rearchived/deleted, and safely retried delete. A stale client PATCH returned zero rows, matching the app's row-count guard. Retained ledger was `full`, 20 XP, `one_time`; WIS XP remained 20 after deletion. A future active one-time quest was excluded from today's RPC, remained available to the upcoming-reminder query, and archived definitions were excluded from that query. Only disposable local accounts were used; no database reset. |
| Real browser, parent review against local web app and disposable account | PASS for Archived → Restore → reload → rearchive → delete; retained History showed both deleted completions and WIS XP remained 40. Board and editor confirmations showed exact target/retention copy, Cancel initial focus, Tab containment, Escape/Enter safe dismissal, inert background and focus return. A second authenticated tab deleted the definition while the first editor stayed open; stale Save visibly rejected and kept the editor open. Parent holds the detailed browser evidence. |
| Web tests | Full suite independently rerun by parent after the board retry assertion: 14 files / 44 tests PASS. |
| Shared tests | Focused `habits.test.ts`: 12/12 PASS, including archived one-time retrieval, zero-row update rejection, and active upcoming one-time reminder filtering. |
| Mobile tests | Full suite after final A edits: 13 suites / 41 tests PASS. Provider tests include granted/denied/undetermined/disabled, scheduler failure, explicit opt-in channel order, preference read/write failures, controlled old-sync/archive and delayed-save/archive interleavings, and failed cancellation followed by full Retry reconciliation. |
| Static checks | Web and mobile `tsc --noEmit` passed after A edits. |

The REST probe is a repeatable explicit local integration test. It requires `LOCAL_SUPABASE_URL` and `LOCAL_SUPABASE_ANON_KEY`, refuses any host other than `127.0.0.1`, and creates unique disposable users. The script prints credentials for an optional browser follow-up; these credentials are not stored in this report. The test users and their retained evidence remain in the disposable local stack for review/cleanup. It does not touch remote data.

## Still open at this checkpoint

- Android touch, hardware Back, permission prompt, reminder scheduling, and screen-reader initial Cancel focus could not be run. Three emulator boot attempts produced an offline or hung shell; logs are in `artifacts/repair-a/emulator-*.log`. Native component tests cover the handlers, but they are not device acceptance. In particular, native confirmation has no verified initial Cancel focus under TalkBack/hardware keyboard.
- Native archive → reload → restore on an installed app remains unverified. The shared fetched-data contract and real REST transport pass; the native Board test uses injected quest rows.
- `git diff --check` reports trailing whitespace in `mobile/components/eiyu/account-header.tsx:57`, an unfinished later-batch file outside A. No A-owned whitespace error was reported.
- B–F findings, later-batch dirty files, remote migration state, and final rollout remain open. No commit, push, deployment, or active database reset occurred in this batch.
