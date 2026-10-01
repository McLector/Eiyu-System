# 003 — AI resilience execution

## Takeover verification (2026-09-30)

- Production Deno suite: 18/18 passed, including retry-disabled guard-only rollout. Existing `AI_RETRY_ENABLED` provides the staged switch; no extra rollout artifact is needed.
- Final isolated SQL contracts: 15 files / 494 emitted assertions with complete TAP plans after test-harness repairs. Client suites/types/lint/web build pass; current roadmap records exact counts.
- F-019 stays open: no real provider output/cache revisit or live deployment occurred. Restore the authenticated Codex Supabase MCP connection before project/model/quota/rollout gates. Existing RPC and summary-write contracts are preserved.

## Follow-up verification (2026-09-30)

- **F-019 remains open for live acceptance.** The production generator/handler suite now runs under official Deno 2.9.7: `deno test backend/supabase/functions/ai-proxy/ai-proxy_test.ts` passed **18/18** with mocked provider transport and no credentials or network. It covers the 16-second request budget, three-second attempt deadline, quota reservation gate, cancellation, transient classification, bounded retry/fallback limits and preserved response shapes.
- `supabase/tests/*.test.sql`: **489/489 pgTAP assertions passed** on the isolated local stack after SQL 029–031. `supabase db lint` on `public,private` reported no schema errors. The README capability query returned all 31 markers true.
- Workspace tests passed: mobile 23 suites / 91 tests, web 18 files / 62 tests, shared 28 suites / 243 tests. All three TypeScript projects, workspace lint and web production build passed. The web build retains a 988 kB minified-chunk warning.
- No Gemini request was made. Project-specific primary/fallback model access, three usable live outputs, weekly-summary persistence and a cache revisit remain unverified. No live Edge deployment was made; the project-scoped Supabase MCP is not loaded in this session, so OAuth/reload is still needed for the authorized rollout.


## Finding and implementation

- **F-019:** implemented bounded quota-aware provider attempts and fallback/error handling in `backend/supabase/functions/ai-proxy/` with injectable core dependencies and Deno tests.
- Tightened the three Maestro success flows so readable provider errors cannot satisfy a live-success run. Success assertions require three non-empty penalty choices, a populated third Long Quest stage, a rendered weekly paragraph and cache display on revisit.
- Added deterministic UI tests for the successful suggestion/stage/summary states. Failure behavior has component/shared and Edge-handler test coverage in source.

## Test-first record

The UI success assertions initially failed on missing stable selectors; after adding selectors, the mocked suggestion, stage and summary/cache UI tests passed. No pre-implementation Deno red result was captured. The current native Deno suite is a green verification of the production generator and handler, not historical red/green evidence.

## Verification

- Native Deno 2.9.7: 18/18 deterministic production-generator/handler tests passed.
- Isolated SQL: 489 pgTAP assertions passed; `public,private` schema lint and all 31 README markers passed.
- Mobile/web/shared unit tests passed (91/62/243); all three TypeScript checks, workspace lint and web production build passed.
- No provider call or live output was made. Fallback model availability, actual generated content and weekly-summary cache persistence remain open.

## User-side release gate

No additional local AI suite work remains. For live acceptance, first reload the project-scoped `.mcp.json` and complete OAuth, then confirm primary/fallback model access privately. Deploy the fail-closed gate, apply the reviewed SQL in order, and activate retries only after quota markers/probes pass. Run the three disposable-account AI flows, verify actual output, and revisit the cached weekly summary without another AI request. Keep F-019 open until those checks produce evidence.
