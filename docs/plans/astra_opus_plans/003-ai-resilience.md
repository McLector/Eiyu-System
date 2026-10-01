# 003 — AI proxy resilience and verified success paths

This plan covers F-019 only. It depends on plan 002's SQL 030 quota contract. No Edge Function, client, migration, secret, or live deployment is changed by this planning document.

Every implementor uses Luna 6 (`gpt-6-luna`) at extra-high (`xhigh`) effort, as required by the task brief.

## Context and finding

**F-019 — S2, Android and web:** Suggest Penalties, Suggest Stages, and Weekly Summary all failed during the 2026-09-29 run because Gemini returned HTTP 503 `UNAVAILABLE`. The finding was reproduced over roughly 50 minutes; Edge logs recorded eight 500 responses and two expected 400 validation responses, with no 200 responses. The AI success path is **unverified**, not presumed to work. Existing Maestro flows passed on either suggestions or a readable error, so their current assertions do not establish success.

This plan improves the app's response to transient upstream failure; it does not claim to fix Google's availability.

## Verified root cause

backend/supabase/functions/ai-proxy/index.ts:10 hard-codes one model (`gemini-3.6-flash`). The two request helpers make one `fetch` each and immediately throw on every non-2xx response (backend/supabase/functions/ai-proxy/index.ts:61, backend/supabase/functions/ai-proxy/index.ts:115). The top-level handler catches all failures and returns the same HTTP 500 body (backend/supabase/functions/ai-proxy/index.ts:212, backend/supabase/functions/ai-proxy/index.ts:260). That response body is parsed by packages/shared/src/ai/suggestions.ts:8, so a stable action-specific HTTP error can reach the current UI without forwarding Google's response body.

The user-visible weekly summary already leaves its prior value untouched unless generation succeeds: `regenerateWeeklySummary` calls the Edge Function before updating the `summary` column (packages/shared/src/data/weekly-summary.ts:87). Preserve that ordering. The current account UI keeps a weekly summary error visible and exposes REGENERATE after failure (mobile/app/(tabs)/status.tsx:82, mobile/app/(tabs)/status.tsx:318).

Google's current troubleshooting guide recommends bounded exponential backoff with jitter for transient 429/503-class failures and says not to retry client errors; its models page currently lists `gemini-3.7-flash` as a stable previous-generation Flash model. These are implementation-time inputs, not a guarantee that either model is available to this project's key: [Gemini retry guidance](https://ai.google.dev/gemini-api/docs/troubleshooting), [Gemini models](https://ai.google.dev/gemini-api/docs/models), [Gemini API errors](https://ai.google.dev/gemini-api/docs/api-errors). Recheck them and perform a live-key smoke test before rollout.

## Tests first

Add the mocked Edge tests before changing retry behavior. Keep tests independent from Gemini credentials and live network access. Extract a small handler/client module if needed so the request flow can inject `fetch`, jitter/sleep and quota-reservation dependencies; `index.ts` should remain the thin `Deno.serve` entry point.

1. Add `backend/supabase/functions/ai-proxy/ai-proxy_test.ts` using Deno's built-in test runner and stubbed fetch. Confirm a primary-model 503 followed by a primary success returns the expected string-array or paragraph body and makes exactly two provider calls.
2. Confirm two primary transient failures move to the configured fallback model, with valid `easy-versions`, `stage-breakdown`, and `weekly-summary` response shapes. Assert the action-specific existing validation and response parsers still reject blank/malformed content.
3. Test retry classification: transient 408, explicitly recognized per-minute rate-limit 429, 500/502/503/504 and network timeout may retry within the cap; malformed requests and non-retryable 400/401/402/403 responses do not retry. A 429 that identifies exhausted daily quota is not retried. If the upstream 429 body cannot be safely classified as transient, fail closed without retrying it.
4. Test boundedness with an always-503 primary and fallback: no more than four provider attempts (two per model), with at most 3 seconds per fetch, waits capped at 250 ms then 500 ms plus bounded jitter, and one 16-second total deadline that includes auth/quota calls, backoff and fetches. If the budget runs out, return a stable 503 with a short user-facing message and bounded `Retry-After`. The response must not contain model response text, API key material, prompt text, or provider stack details.
5. Test timeout and cancellation edge cases: a hanging fetch is aborted at the per-attempt/overall deadline; a caller disconnect or timeout does not trigger unbounded background retries; invalid JSON/no candidates/empty arrays cannot be cached as a successful suggestion.
6. Test quota integration using injected RPC stubs: invalid payloads reserve neither user nor provider budget; a missing/failed quota RPC returns fail-closed HTTP 503 before any Gemini fetch; one logical request reservation is reused across retries; every outbound attempt reserves one project provider slot; a denied attempt never reaches fetch; a failed or ambiguous provider call does not refund the provider-attempt slot. For weekly summary, consume only the private pending reservation written by `reserve_weekly_summary_regen`; reject regeneration without a pending row, and reject a caller-supplied fake week or initial/regen label.
7. Run the unit suite with `deno test backend/supabase/functions/ai-proxy/ai-proxy_test.ts`. Expected: all deterministic tests pass with no credentials, no network, and an observed maximum of four fetches for a request.
8. Add a Maestro assertion that requires the generated result when the live smoke test is run; keep a separate mocked/local outage case asserting the clear error and manual-entry path. A legacy “suggestions or readable error” pass is not evidence of a successful upstream path.

## Fix approach and files for later implementation

- `backend/supabase/functions/ai-proxy/index.ts`: keep JWT validation and action-specific payload validation; add an injectable, bounded upstream caller used by both string-array and prose generation. Retry only transient errors. Use a configured stable fallback model after the primary model's bounded retry is exhausted. The current Google docs list `gemini-3.7-flash` as stable, but the implementor must verify that exact model against current docs and this project's API key immediately before using it. Read the fallback model name from a deployment setting such as `GEMINI_FALLBACK_MODEL`; do not put the Gemini API key in source or plans.
- `backend/supabase/functions/ai-proxy/ai-proxy_test.ts` (and, if needed, a small `ai-proxy-core.ts`): keep retry classification, response mapping, and injected quota dependencies independently testable. Reuse the existing prompt builders and JSON response parsing in `callGeminiForStringArray` / `callGeminiForText` rather than rewriting prompts.
- `backend/supabase/functions/ai-proxy/index.ts` plus the SQL 030 RPC contract from plan 002: after validation, begin-request atomically reserves the logical request and its first provider-attempt slot. Use that returned slot for the first fetch; do not reserve it twice. Each retry/fallback asks reserve-next-attempt for a new slot with the same request ID and a unique next attempt number. A missing/failed quota RPC returns a bounded 503; an exhausted cap returns 429, with no unreserved Google call. For a summary action, let the database classify first-generation versus regeneration from the current-week cached row and the verified user's pending private authorization; do not send a client label or reservation token.
- Return HTTP 503 with a stable message such as `The AI service is busy right now. Please try again shortly.` only after the bounded primary/fallback paths fail transiently. Return HTTP 429 for exhausted user/project quotas with a separate actionable message. Return 400 for invalid client input. Keep provider detail in server logs only; log status, selected model, and attempt number, and avoid echoing the request body, response body, user prompt or key. Preserve the current successful JSON shapes `{ suggestions }`, `{ stages }`, and `{ summary }`, so `packages/shared/src/ai/suggestions.ts` keeps working.
- Do not broaden CORS as part of resilience. The current allow-list includes `http://localhost:5173` but not the assessment's isolated `http://127.0.0.1:5174`; browser smoke testing from the latter would fail CORS before testing Gemini. Use Android Maestro (native requests have no Origin) or a separate browser profile on the explicitly allowed local origin with a disposable fixture. Never use the user's signed-in Chrome profile or a personal production session.
- Keep client-side caching and timeout behavior in `packages/shared/src/ai/suggestions.ts`. Its existing parser turns the JSON `{ error }` body into a readable Error. Confirm the 503/429 body reaches the UI; change client formatting only if the actual UI masks it. Never cache an error or an empty generated result.

## Acceptance criteria

- A transient primary 503/429-rate-limit/network timeout recovers after bounded retry or returns a valid result from the configured fallback model. All three action responses retain their current JSON shape and valid cardinality/text checks.
- Every request uses no more than four upstream attempts and stays under a 16-second total deadline, before the current client timeout (`AI_TIMEOUT_MS = 20_000`). A retry/fallback attempt is separately reserved against plan 002's shared 100-attempt UTC-day provider ceiling; it does not consume a second logical user request.
- Invalid input and non-retryable provider errors are not retried. An exhausted provider returns HTTP 503 and a readable temporary-service message; an exhausted account/project quota returns HTTP 429 and its separate quota message. No raw Gemini error, API key, prompt or response body appears in the client response.
- If regeneration fails, the previous cached weekly summary remains unchanged and the REGENERATE action returns to an enabled, retryable state. If initial generation fails, Status leaves its existing clear error and allows a later attempt; it never spins indefinitely on `Thinking…`.
- **Live success remains a release gate:** the deployed function returns usable penalty suggestions, usable stages and a non-empty weekly paragraph, and a second visit to Status reads the persisted cached paragraph without another AI request. Do not mark F-019 complete from mock tests or from readable-error assertions alone.

## Verification commands and flows

From the repo root after the tests and implementation exist:

```powershell
deno test backend/supabase/functions/ai-proxy/ai-proxy_test.ts
npm.cmd run db:lint
npm.cmd run db:test
```

Expected: the Deno suite passes with the bounded attempt assertions; SQL lint and the root `supabase/tests/` suite pass against the prepared disposable schema, with SQL 030's quota tests included. `db:test` does not reset the database. Do not run `npm run db:verify` or `scripts/local-db.ps1 verify`.

The first Edge deployment is intentionally fail-closed: until SQL 030's quota RPC exists and returns a reservation, the function responds 503 before calling Gemini. This closes the uncapped spend window during rollout. After that deploy, the owner applies SQL 029 and then SQL 030 in the Supabase SQL Editor, verifies the expanded drift markers, and confirms the quota RPC starts serving valid reservations. The current app's integer-returning regen RPC contract stays compatible; its SQL 030 definition writes the private pending reservation the Edge consumes. The function source is `backend/supabase/functions/ai-proxy`; invoke the CLI from the backend workdir and supply the project reference privately because that folder does not have a `config.toml`:

```powershell
Push-Location .
try {
  npx.cmd supabase --workdir backend functions deploy ai-proxy --project-ref $env:SUPABASE_PROJECT_REF
} finally {
  Pop-Location
}
```

The deploy syntax is documented by the [Supabase Functions deploy command](https://supabase.com/docs/reference/cli/supabase-functions-deploy). The project reference is a private environment variable. No deploy command has been run for this planning task.

The deployment is user-side only. Do not deploy during planning or implementation without the user's own action. The `GEMINI_API_KEY` is already an existing project secret; never print it, pass it as a command literal, or change it unless the owner has independently chosen to rotate it.

Run each Maestro flow one at a time using a private disposable account (`E2E_EMAIL` and `E2E_PASSWORD` remain environment variables):

```powershell
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/habit_ai_suggest_easy_version.yaml
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/longquest_ai_suggest_stages.yaml
maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/status_weekly_summary_and_cache.yaml
```

Expected: Suggest Penalties produces three usable editable choices; Suggest Stages populates editable stages; Status renders a non-empty weekly paragraph; leaving and revisiting Weekly Review uses the cache without showing `Thinking…`; regeneration resolves and preserves the last good paragraph if an upstream failure is injected. Strengthen/add live-success assertions, since the checked-in flows currently accept a readable error and can pass during a complete outage. Keep any local fault injection in an ignored test harness and do not add screenshots to tracked paths.

For the browser leg, use a clean browser profile and a disposable test account on `http://localhost:5173`, which is on the current allow-list, or test through the native Android flows. Do not use the user's existing Chrome profile, the real production account, or `127.0.0.1:5174` against the live Edge Function unless that origin has been explicitly enabled only in a local mock setup. Do not broaden the live CORS allow-list to compensate for the test origin.

Finally, in the Supabase Edge Function logs, confirm each upstream request has the expected attempt count/model status and no sensitive request content. Use the SQL 030 usage inspection from plan 002 to show that one logical user reservation was recorded and each retry/fallback consumed exactly one provider-attempt slot.

## Risks and rollout order

1. Land the mocked tests first and prove them red against the one-shot helper.
2. Prepare SQL 029/030 and the bounded Edge behavior with the quota call integrated. Ensure a missing quota schema or RPC returns 503 without provider traffic.
3. Have the owner deploy that fail-closed Edge gate first. Apply SQL 029 and SQL 030 in order, then verify the README grant/body markers and quota reservations. The current shared client remains compatible with the unchanged integer-returning regen RPC.
4. Configure the verified fallback model privately and have the owner deploy/activate the retry version. Keep the global attempt budget enabled for every upstream call.
5. Run local mocks and the test-only forced-outage case. Then have the owner verify all three successful live paths with disposable fixtures.
6. If both models remain unavailable, show the readable 503 and keep cached data. Do not change prompts, bypass quotas or claim an unverified success.

Risks include both models sharing a provider outage, undocumented fallback model access/rate limits on this API key, exceeding the mobile client's 20-second timeout, and accidental duplicate logical quota charges across retries. The shared SQL attempt counter, injected clock/fetch tests, short overall deadline and idempotent request ID cover the latter cases. A failed or ambiguous HTTP call may already have been accepted by Google, so the attempt remains charged. The global ceiling can temporarily deny legitimate traffic after heavy usage; the owner can adjust the private limit after reviewing actual use and spend.

## Needs you (user-side actions)

- Review the 100-attempt UTC-day project ceiling and the user-action quotas from plan 002 against expected user volume and acceptable provider spend. Deploy the fail-closed Edge gate first, then apply SQL 029 and SQL 030 in order, run the drift markers, and activate quota-backed serving before enabling retries.
- Confirm `gemini-3.7-flash` (or the selected stable fallback model) is still documented and available to this project's key using a private smoke test. If unavailable, choose another currently supported stable model before setting the fallback; do not place API keys in files or chat.
- Set the verified `GEMINI_FALLBACK_MODEL` privately if the implementation reads it, then deploy `ai-proxy` yourself with `npx.cmd supabase --workdir backend functions deploy ai-proxy --project-ref $env:SUPABASE_PROJECT_REF`. The implementor prepares source and tests only.
- Use a disposable account for the three live Maestro flows and a clean browser profile for any web check. Keep the recovery fixture until its separate A13 check is done; do not use the user's signed-in Chrome profile or real production account.
- Treat successful live output and a cache revisit as required verification. If both models are unavailable, record F-019 as still operationally affected even though the bounded retry and clear error behavior pass.
