# 007 — Resilience and empty-state execution

## Takeover verification (2026-09-30)

- Controlled full mobile rerun passes 23 suites / 92 tests; focused store lifecycle passes 13/13, including the plain-object offline error and reconnect assertions. An initial overlapping workspace run failed the listener assertion, but focused and controlled full reruns passed without another product change.
- Earlier A9 action/reconnect evidence remains partial; its full setup flow was not rerun. Device interaction stopped with Escape before additional acceptance. F-025 still has no qualifying three-run quiet Android/web timing evidence and no performance change was made.

## Findings and implementation

- **F-016:** deletion now retains the editor's prior state while the confirmation/action is in progress.
- **F-018:** successful one-time quest creation publishes a one-use return intent so Board opens the appropriate lane once.
- **F-024:** network failures retain cached quest rows, show a friendly offline message and retry/refetch on a true offline-to-online transition. The offline detector now reads the `message` from Supabase's plain-object `PostgrestError`, as well as ordinary `Error` instances.
- **F-025:** verification-first. No request-chain optimization was made without a quiet release-build measurement.

## Test-first record

The F-024 tests were run against the old behavior first: offline errors exposed raw `Network request failed` text, and Board dropped cached quest rows. A new store regression first failed with a Supabase-shaped `{ message: 'Network request failed' }` rejection, exposing the remaining classifier gap; it passes with the friendly cached-list message after the fix. The F-018 one-use lane-return test and F-016 lifecycle regression also pass in the mobile suite.

## Verification

- Store lifecycle suite: 13/13 tests passed after the fix, including the plain-object Supabase error regression and cached-row reconnect test.
- A9 action and reconnect assertions passed on the `Medium_Phone` Android emulator with the isolated local Supabase API gateway temporarily stopped and restarted. The Board displayed the friendly offline message, omitted raw transport text, rolled the quest checkbox back to unchecked, then cleared the message after reconnection while keeping the checkbox unchecked. API and emulator network state were restored.
- The source flow's full login/create setup was not rerun end-to-end; the already-created disposable quest was used for the controlled action and reconnect subflows. On this emulator, airplane mode alone still allowed the host-local `10.0.2.2` route, so the API gateway was used to create an immediate refusal.
- F-025 p50/p95 timings are still unknown pending three quiet release runs.

## User-side checks

Run `one_time_quest_create_complete.yaml` and `habit_edit_and_delete.yaml` separately with a disposable fixture. For F-025, run `release_board_history_timing.yaml` three times on a quiet release build and follow plan 007's cold/warm Board and History measurements. Make a performance change only if the stated threshold reproduces.
