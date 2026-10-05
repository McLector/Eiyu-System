# 006 - Web polish round 0015 handoff

Finished 2026-10-05, branch `web-polish-0015` (not merged, not pushed). Follows handoff 005.

## What changed (web only)

1. **Archive notice** has no close button. It fades out after its eight seconds, and Undo / View archived habits fade out too. The fade is timer-driven (200 ms), so it also works under reduced motion.
2. **Chain Progression** is a chain panel with a **Your chains** list on the right (done/total per chain, `+ NEW CHAIN`, stacks above the chain below 900 px). The current stage has a **COMPLETE STAGE** button; only the last finished stage can be undone, from its menu ("Mark not done"). Stage rows are no longer click targets. The panel shows a Created date (`long_quests.created_at`, no migration).
3. **Move arrows** point the way the quest travels: right into Backlog, left back to One-time.
4. **System blue palette**, chosen in Settings next to Dark Mode (dark only), remembered in `localStorage`. It is a block of token overrides on `:root[data-palette="blue"]`. Cyan stays the default; making blue the default is a one-line follow-up.
5. **Heatmap day detail** opens in a modal instead of under the grid; each day cell has an accessible label.
6. **AI error handling**: `ai-proxy` now answers JSON 503 with CORS headers for any unexpected throw (see "Needs you").
7. **Leave without saving** asks once when closing a dirty quest editor (the confirmed leave unregisters its editor before navigating).
8. **Gym quick-log** replaces the workout/draft flow: type into **Current** and press Enter or the arrow. The video keeps a capped 16:9 column with the notes beside it. A typed, unlogged weight still guards leaving the routine or page.

## Needs you (in this order)

1. **Apply SQL 039 before deploying the web client.** `backend/supabase/039_gym_quick_log.sql`, one transaction. Then run the README marker query: `039 gym: quick-log weights and the two newest weights per exercise` must be true. A web client deployed first fails on every weight log.
   - It converts existing drafts instead of dropping them: a draft with a typed weight becomes history under its own start date (blank entries dropped); a blank draft is removed.
   - `start_gym_session`, `save_gym_session` and `discard_gym_session` stay, for tabs still on the old client. A draft started from such a tab afterwards is invisible to the new client; re-run only the conversion statement at the top of 039 to fold it in.
2. **Fix the live `ai-proxy`.** Probed 2026-10-05 against the project in `web/.env`: OPTIONS answers correctly, but every POST that passes the gateway returns a bare text/plain `500 Internal Server Error` with no CORS headers, even for a payload the repo source rejects with a JSON 400. A browser reports that as "Failed to send a request to the Edge Function". The function therefore dies before it builds a response, and the root cause is **not confirmed**: deployed code may differ from the repo, or a runtime difference is at play.
   - Read the function logs (Dashboard → Edge Functions → ai-proxy → Logs) for the real error.
   - Confirm the secrets `GEMINI_API_KEY` and SQL 029-031 (the quota RPCs) are in place.
   - Redeploy with `npx.cmd supabase --workdir backend functions deploy ai-proxy --project-ref <ref>`. After this branch, an unexpected throw is logged and returned as JSON, so the log line names the cause.
   - Re-probe: an anon-key POST should now return a JSON 401, not a text 500. Then retry Suggest penalties and Weekly summary in the app.
   - Also check the origin you used: the function only allows `localhost:5173`, `8081`, `19006` and the Vercel origins. A dev server on 5174 gives the same browser error.

## Verification (this machine, 2026-10-05)

- `web`: `npx vitest run` 63 files / 470 tests pass; `tsc --noEmit` and `eslint .` clean (run with dummy `VITE_*` values; the worktree has no `.env`).
- `packages/shared`: `jest` 35 suites / 297 tests pass (2 env-gated native suites skipped); `tsc --noEmit` clean. `mobile`: `tsc --noEmit` clean.
- `backend/supabase/functions/ai-proxy`: 20 Deno tests pass. `deno check` still reports one error that was already in the original (`index.ts` `SupabaseClient` vs `RpcClient`).
- SQL on PGlite: `node scripts/verify-gym-quick-log-db.cjs` 41 assertions (conversion, ownership, validation, retry idempotency, grants); `node scripts/verify-web-overhaul-db.cjs` 55 assertions with all 39 migrations and every README marker. Three deliberate mutations of 039 were each caught.
- Real Chromium against fixture APIs: `node scripts/verify-web-overhaul-browser.cjs` 223 screens / 13 flows; `--profiles` 268 screens / 28 flows. One run of the default pass failed once on a motion-sampling check and passed unchanged on rerun.

## Not verified

- **No real Postgres.** Docker was not running, so the pgTAP files (including the new 039 marker in `015_migration_markers.test.sql`) and multi-connection locking were not run. PGlite cannot certify locking.
- **`scripts/verify-board-gym-browser.cjs`** needs a live local Supabase with 039 applied. It was updated for quick-log but not run, and it already referenced text that no longer exists elsewhere ("Reward journey").
- **The live `ai-proxy` fix** cannot be confirmed until you redeploy.
- **Light mode with System blue** is intentionally cyan; the palette control is disabled there.

## Notes

- Under System blue the INT chip (`#60a5fa`, shared with mobile) is close to the blue accent. The shared stat colours were not changed.
- The Chain page keeps the header **NEW QUEST** button alongside the list's **+ NEW CHAIN**; drop one if the duplicate bothers you.
- Workout history now lists each logged weight as its own one-exercise "workout".
- The browser scripts' overlap detector now counts fixed-position controls; its own self-test depended on that.
