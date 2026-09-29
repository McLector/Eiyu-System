# Repair B implementation checkpoint

Date: 2026-09-29. Branch: `codex/board-refresh-repairs`. Implementer: **gpt-6-sol, medium**, authorized by the user. Reviewer: parent Codex. This is a Batch B checkpoint, not final acceptance of the board refresh.

## Changed boundary

- `028_history_read_boundary.sql` returns ordered normalized live and retained evidence, live habit metadata, and exact recurring completion totals in one JSON RPC response. The function is `security invoker`, has no user-ID input, reads only the authenticated caller's RLS-visible records, and grants execute only to `authenticated`.
- History/heatmap, Weekly Review, Weekly Quest, and weekly AI inputs all call the same snapshot reader. The former separate live/ledger reads and missing-RPC fallback were removed, so a missing deployment is an explicit error instead of a potentially inconsistent success.
- `fetchHistoryRange` keeps recurring-only heatmap denominators and full completion details including one-time quests. Weekly Quest uses the server recurring aggregate; Weekly Review and AI inputs include one-time completions. AI summary cache/write policy remains unchanged. Live habits with zero completions remain in AI inputs through snapshot metadata.
- One JSON response bypasses the configured PostgREST `max_rows=1000` relation-row cap. Detail order is date/source ID, and `pageHistoryEvidence` provides stable local slices of that immutable response. This avoids cross-request paging races during deletion.

## Executed evidence

| Boundary | Result |
| --- | --- |
| Permanent real REST probe `scripts/integration/history-boundary-rest.cjs` | PASS with 1,201 completion records, including 1,080 recurring. All four exported shared consumers returned exact values for all-live, 600 retained/601 live, and all-retained states. Direct RPC rows remained 1,201; source/date pairs were unique and their full date/ID/kind/scheduled digest was identical across stages. |
| Controlled actual read/delete overlap | PASS. A local authenticated database transaction moved one habit into the ledger, then entered `pg_sleep(10)` before commit. A separate connection observed its `PgSleep` wait event, and the authenticated REST snapshot completed while the transaction was still open. Snapshot detail and digest were identical before/during/after commit. |
| REST security | PASS. Anonymous RPC rejected; second authenticated owner received zero rows; attempted ledger update was rejected. |
| SQL tests | Existing lifecycle persistence/concurrency: 95/95 PASS. New `011_history_read_boundary.test.sql`: 10/10 PASS, including execute grants, owner isolation, date window, recurring-only aggregate, and ordering. |
| Shared focused tests | 3 suites / 15 tests PASS. |
| Static checks | Mobile and web `tsc --noEmit` PASS. |

The probe requires `LOCAL_SUPABASE_URL`, `LOCAL_SUPABASE_ANON_KEY`, and `DOCKER_CLI`, verifies the API host is `127.0.0.1`, and uses only new disposable local accounts. It obtains its credentials from `supabase --agent no --network-id eiyu-supabase-local status --output env`; the credentials are not recorded here. The local `028` function was applied additively using psql because `supabase db query --file` rejects multiple SQL commands. No active rows were reset, no remote data was touched, and no commit/push/deployment occurred.

## Open

- Parent independent B review and rerun remain pending. The SQL file is repository-canonical numbered migration but is not deployed remotely. Clients using this code require 028 before use.
- Native device acceptance from A remains open due the local emulator host issue; the added Modal.onShow Cancel accessibility focus has focused tests but no TalkBack/hardware-keyboard observation.
- C–F findings remain open.
