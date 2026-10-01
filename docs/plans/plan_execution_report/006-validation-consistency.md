# 006 — Validation consistency execution

## Takeover verification (2026-09-30)

- Isolated 014 profile validation passes 27/27; final full SQL suite passes 15 files / 494 emitted assertions with complete plans, all 31 README markers true and schema lint clean. SQL 031 was not changed.
- Shared/mobile/web suites and all TypeScript checks pass. No new device/browser/live REST acceptance was completed; interactive checks stopped with Escape and Supabase MCP remains unavailable. Earlier counts/tooling statements below are historical.

## Follow-up verification (2026-09-30)

- SQL 031 was applied after 029 and 030 on the isolated local schema. `supabase/tests/014_profile_validation.test.sql` passed **27 assertions** for 80/81 Unicode code-point boundaries, invisible-only input, internal joiners, direct table writes, RPC writes and unchanged legacy names. All README markers are true.
- Shared/mobile/web unit tests passed (243, 91 and 62 tests respectively). All three TypeScript checks, workspace lint and web production build passed. No release APK, live REST probe or authenticated cross-platform account check is claimed here. Android device automation did not run because the SDK ADB path is outside this sandbox's visible/executable paths; browser automation did not run because the CUA runtime exposes no browser provider.


## Findings and implementation

- **F-014 / F-017 / F-031 / F-034 / F-021:** shared name validation enforces the 80-code-point rule and rejects invisible-only values; Android/web editors surface field-level errors, preserve unchanged legacy names, normalize edited boundaries and agree on all-days defaults. Signup/profile and habit/Long Quest paths are covered.
- Prepared migration `031_profile_name_validation.sql` and `supabase/tests/014_profile_validation.test.sql`.

## Test-first record

Shared and platform boundary/default-schedule tests were added with implementation, but no initial red result is claimed for SQL 031. The follow-up pgTAP run is green on the isolated schema and exercises the final trigger/RPC boundary.

## Verification

- `supabase/tests/014_profile_validation.test.sql`: 27 assertions passed on the isolated schema, covering the 80/81 code-point boundary, invisible-only strings, joiners, direct writes, profile RPC and unchanged legacy values. All 31 README markers pass.
- Shared/web/mobile suites passed (243/62/91 tests). All TypeScript checks, workspace lint and web production build passed. Release-device, live REST and actual-browser checks are not represented by these results.

## User-side checks

The isolated SQL and local client gates are complete. Remaining acceptance is live disposable-user REST validation after OAuth/MCP reconnect, plus the Android release-device and real-browser matrix. The CUA environment currently exposes no browser provider; this is a tooling gap, not a product test failure.
