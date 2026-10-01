# 010 — Repository hygiene and migration drift execution

## Takeover verification (2026-09-30)

- All 31 README capability markers are true on the isolated database. Repaired 015's discarded TAP assertion; its weaker-body probe and restored-body assertion now both emit results (14/14). Application migrations are unchanged.
- `scripts/verify-tap-output.ps1` fails on the original 12-of-13 output and accepts the final full suite (15 files / 494 assertions, complete plans). Checks must inspect TAP outcomes/plans as well as process exit status.
- `git ls-files artifacts/phase-06` returns no indexed evidence paths; ignore probes pass; 27 staged removals and ignored local files remain intact. Normal staged/unstaged `git diff --check` passes. No history rewrite, commit, push or account remediation occurred.
- Codex MCP setup requires config.toml/app Settings and OAuth; the standalone workspace `.mcp.json` did not load the connection. Live markers/remediation remain unverified.

## Follow-up verification (2026-09-30)

- The complete 31-row README query was run against the isolated schema before and after SQL 029, 030 and 031. Earlier capabilities passed after correcting two stale checks: 011 now checks the scheduled-date index introduced by 018, and 022 checks the recovery RPC's actual recovered/expired/deadline branches. Final result: **31/31 true**.
- The same full query completed without error in four rollback-only mutations. A renamed required column made only 018 false; a missing validation trigger and a weakened validator body each made only 031 false; a misleading four-argument completion overload made only 014 false.
- `supabase/tests/015_migration_markers.test.sql`: 12 assertions passed. All 15 database test files passed with 489 total pgTAP assertions. No applied SQL file was edited or replayed; the existing database on port 55322 was not targeted.
- The 27 staged Phase 6 evidence removals and ignored local evidence were preserved. F-006 account/session remediation and any historical Git cleanup remain outstanding; no commit, push or history rewrite was performed. The authorized live marker check still requires the project-scoped Supabase MCP OAuth/reload.


## Findings and implementation

- **F-005:** `backend/supabase/README.md` now extends the labeled read-only capability/body markers through migrations 029–031.
- **F-006:** tracked Maestro setup/docs no longer contain the previously published credential; flows read private environment variables. Twenty-seven Phase 6 evidence paths are removed from the Git index only, with local copies preserved in ignored `/artifacts/phase-06/`. The manifest is `010-evidence-removal-manifest.md`. This does not remove historical commits or rotate/revoke the account.
- **F-007:** `.gitignore` covers the named evidence, emulator and personal-observation locations without ignoring intended flows/plans.

## Verification

- The actual complete README query returned 31/31 true after SQL 029–031. Four rollback-only mutations proved missing-column, missing-trigger, older-body and misleading-overload cases each return only their intended false marker without aborting.
- `supabase/tests/015_migration_markers.test.sql`: 12 assertions passed; all 15 pgTAP files passed (489 assertions). Isolated local schema lint passed for `public,private`.
- Workspace lint exit 0 with 40 mobile warnings and no errors. `git diff --check` and cached diff whitespace check exit 0. The 27 staged evidence removals and ignored local copies remain preserved; existing database was not modified.

## User-side actions

F-006 account/session remediation remains outstanding, along with the separate historical Git cleanup decision. The authorized live README marker verification requires the project-scoped Supabase MCP OAuth/reload. Keep credentials private; do not rewrite Git history without a separate decision.
