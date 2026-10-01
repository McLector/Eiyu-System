# 002 — Backend security execution

## Takeover verification (2026-09-30)

- Final isolated suite: 15 files / **494 emitted assertions**, complete TAP plans; 012 passes 37 and 013 passes 75. All 31 README markers and schema lint pass. No application migration changed.
- Reproduced 013's race-test assumption: requests B/C can acquire the lock in either order. It now collects independent responses and checks exactly two accepted/one denied, retaining the exactly-two-provider-charge check. This repairs the test, not the quota implementation.
- Tests ran through isolated container-local `psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -At`. Credential-free dblink connections in 013 require that local administrator; 005/009 connection ports changed only in ignored copies. Database 55322 was preserved. `scripts/verify-tap-output.ps1` validates emitted outcomes/counts; SQL runner exit 0 alone is insufficient.
- Live rollout remains authorized but unperformed; authenticated Codex Supabase MCP is absent. No live SQL, Edge, dashboard/account change or provider call occurred. Earlier counts/connection instructions below are historical.

## Findings and implementation

- **F-001 / F-003:** prepared migration `029_server_owned_xp_and_internal_helpers.sql` for server-owned XP and helper execution grants.
- **F-002:** prepared migration `030_authoritative_ai_quotas.sql`, fail-closed AI quota integration, and quota tests. Existing weekly-regeneration client return shape is preserved.
- Added root pgTAP coverage in `supabase/tests/012_backend_security.test.sql` and `013_ai_quota.test.sql`; migration body/grant markers are included in the expanded README query.
- **F-004:** no code change; leaked-password protection is an Auth dashboard setting.

## Test-first record

The implementation predates this verification pass, so no pre-implementation red pgTAP result is claimed. During follow-up, an isolated Supabase stack was created with a separate project/container identity and ports 54321–54329; the pre-existing database on 55322 was left untouched. SQL 001–028 were applied to the empty isolated database, then 029, 030 and 031 were applied in order. README markers passed after each migration. The quota suite exposed stale assertions: invalid weeks raise the documented exception, while replaying an existing provider attempt succeeds idempotently. The test now asserts those behaviors and verifies replay is not charged twice.

## Verification

- Shared tests: 243 passed. Mobile/web tests and all three TypeScript checks passed.
- `supabase db lint --db-url <isolated local URL with sslmode=disable> --schema public,private --fail-on error`: passed, `No schema errors found`.
- All 15 `supabase/tests/*.test.sql` files passed against the isolated database: **489 pgTAP assertions**. The two concurrency files were copied into the isolated container with only their hard-coded dblink port changed in memory from existing-stack port 55322 to isolated port 54322. UTF-8 test bodies were copied as files to avoid shell-pipeline encoding changes.
- `supabase/tests/012_backend_security.test.sql`: 37 assertions passed, covering denied client XP writes/helpers, ownership and legitimate completion/undo paths. `supabase/tests/013_ai_quota.test.sql`: 72 assertions passed, including same-ID/race/global-cap/retry replay behavior and summary grants/persistence.
- No live RPC/REST probe, dashboard change or deployment was performed. The user-authorized Supabase MCP rollout remains unavailable because no Supabase MCP tools are loaded in this session; project-scoped OAuth/reload is still required.

## User-side rollout

The disposable local SQL gates are complete. Before live rollout, reload the project-scoped `.mcp.json`, complete Supabase OAuth, and confirm the connected project reference matches the private application configuration. Then remediate the identified exposed test account and sessions, deploy the fail-closed Edge guard, apply the three reviewed migrations in order, verify live markers and disposable-account probes, confirm model access, and only then activate retries/fallback. Leaked-password protection and valid/compromised disposable signup checks remain dashboard gates. Keep all project references and credentials private.
