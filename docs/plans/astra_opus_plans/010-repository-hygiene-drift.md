# 010 — Public-repository hygiene and migration drift documentation

Planning only. Implementor: **Luna 6 (`gpt-6-luna`), extra-high (`xhigh`) effort**. Owns **F-005 (S3), F-006 (S2), F-007 (S4)**. No new migration is needed for documentation alone.

## Context and verified root cause

- **F-005:** `backend/supabase/README.md:25` starts a catalog query that covers only 011–013. Its function-existence checks cannot distinguish later redefinitions. Canonical files now run through 028. `supabase/config.toml:74` applies these files as local reset seeds; that is not deployed migration history. `scripts/local-db.ps1:115` dispatches `verify`, which resets before testing. Never use that action for this work.
- **F-006:** `mobile/maestro/README.md:23` publishes a credential and misclassifies it as harmless. `git ls-files artifacts/phase-06` confirms screenshots/hierarchy/report files are tracked. The reported account exists, but password validity was not tested; do not claim successful authentication with it. Never reproduce the password in a plan or report.
- **F-007:** `.gitignore:91` ignores Maestro reports/logs but does not cover the phase-06 evidence tree, repair-a emulator image or personal observation directory. `git status --short` confirms these untracked paths are present. Do not read or copy personal notes to investigate an ignore-rule defect.

## Tests first

1. Capture the current tracked evidence inventory with `git ls-files artifacts/phase-06` and ignore results with `git check-ignore --no-index`; they currently fail the intended clean-repository contract. Add a lightweight hygiene check only if the repository needs a durable gate: private evidence patterns must be ignored, while Maestro YAML and these plans remain eligible for tracking. Do not test against a literal published password.
2. Add `supabase/tests/015_migration_markers.test.sql` (reserved test filename; recheck uniqueness before implementation). Test the drift query against a complete disposable local schema, then alter a representative function inside a rollback-only transaction to its older body. The corresponding marker must turn false even while the function exists. Restore automatically by rollback. Include missing function/column/trigger and overloaded signature cases without causing the whole query to abort.
3. Test markers against the latest compatible definitions, not obsolete exact text: 022 replaces completion logic, 023 replaces stage reconciliation, 025 replaces occurrence generation, and 027 replaces profile validation. New 029–031 definitions must satisfy historical capability checks and their own stricter checks.

## Fix approach and files

Update `backend/supabase/README.md` with a read-only, labeled per-migration marker query and remediation instructions. Use schema-qualified catalog lookups and exact signatures; inspect `pg_get_functiondef`, `pg_get_constraintdef`, trigger attachment and effective grants. Coalesce missing objects to false. A marker proves the required resulting behavior, not that a historical file was executed. Never advise rerunning an old migration over a newer body merely because an old marker fails.

Required 014–028 capability inventory, verified against these source entry points:

| Migration | Source anchor and checks the future query must include |
|---|---|
| 014 | `014_server_side_xp.sql:20,52`: three-argument completion computes XP; old client-XP signature absent; helper body bounds delta. Final grant expectations follow 029. |
| 015 | `015_weekly_summary_regen.sql:8,21`: counters/date columns and atomic regeneration guard. Check latest 021 body, then 030 replacement policy; do not require the unsafe update policy to remain. |
| 016 | `016_long_quest_descriptions.sql:6,9`: descriptions on quests and stages. |
| 017 | `017_reconcile_long_quest_stages.sql:8`: reconciliation capability, with latest 023 ownership/sequence behavior rather than existence alone. |
| 018 | `018_habit_scheduled_date.sql:6`: scheduled date column and effective schedule use. |
| 019 | `019_habit_progress.sql:11,32`: target count, progress table and bounded increment behavior using latest 022 body. |
| 020 | `020_habit_easy_version_exempt_quantity.sql:10`: constraint includes one-time and quantity exemptions. |
| 021 | `021_scheduled_habit_eligibility.sql:43,154,187,451`: timezone initialization, schedule start/version triggers, occurrence tables and account-local regeneration day behavior. |
| 022 | `022_habit_recovery_state_machine.sql:137,344,446,546`: recovery tables/state, ownership and eligibility checks, recovery award and undo behavior. |
| 023 | `023_long_quest_stage_sequence.sql:264,317`: predecessor rule, authenticated ownership, stage sequence triggers and first completion preservation. |
| 024 | `024_long_quest_stage_description_validation.sql:5`: description normalization, 2000-character guard and attached trigger. |
| 025 | `025_habit_lifecycle_persistence.sql:67,129,201,222,243`: archive intervals, occurrence exclusion, archive/restore/delete ownership and retained-history write. |
| 026 | `026_profile_editing.sql:26,80`: profile changed-field validation, update RPC and only intended column grants. Evaluate final 027/031 body. |
| 027 | `027_profile_compatibility_repair.sql:5,29,83`: old blocking constraints absent; unchanged legacy fields allowed; corrected trim and update behavior. |
| 028 | `028_history_read_boundary.sql:6`: history RPC body combines retained/live history, filters the half-open date range and applies ownership; security invoker and authenticated-only execution. |

Retain and improve 001–013 coverage too, so the final query covers every numbered migration rather than only appending 014+. Plans 002 and 006 own 029–031 marker additions and pgTAP tests alongside those migrations. Coordinate one README edit at a time. A future backend plan that introduces SQL must allocate the next unused number and extend this inventory and query in the same change.

Replace the credential instructions in `mobile/maestro/README.md` with environment-variable injection and disposable test-account guidance. Audit tracked flow fixtures and docs for the same exposed credential without printing secret values into reports. Preserve the run's uncommitted Maestro fixes and UTF-8 encoding.

Add narrow ignore rules for `/artifacts/phase-06/`, `/artifacts/repair-a/`, `/skill-observations/` and any specifically identified equivalent personal-run directories. Review broader `/artifacts/` exclusion with the user before hiding legitimate source fixtures. Ignoring a path does not untrack it: prepare a manifest of tracked evidence proposed for removal and wait for the user's choice before index removal or history rewriting. Keep existing local files intact. A normal removal commit cannot erase old public history.

## Acceptance criteria

- **F-005:** README query yields labeled booleans for every migration through the implemented latest number; altered old bodies fail their capability markers; missing objects return false. Deployment instructions require all required markers before shipping dependent clients.
- **F-006:** Current tracked docs/fixtures contain no usable credential. User confirms exposed account remediation and chosen evidence treatment. If historical evidence remains, explicitly report that residual exposure; do not declare remediation complete.
- **F-007:** New emulator/evidence/personal-note files are ignored, while intended Maestro flows and plan documents remain trackable. No local artifact is deleted as a side effect.

## Verification commands and expected output

From repository root, use PowerShell. No reset, deploy or live SQL mutation:

```powershell
git ls-files artifacts/phase-06
git check-ignore --no-index artifacts/phase-06/probe.png artifacts/repair-a/probe.img skill-observations/probe.md
git check-ignore mobile/maestro/flows/auth_login_happy.yaml docs/plans/astra_opus_plans/001-roadmap.md
git diff --check
npm.cmd run db:lint
npm.cmd run db:test
```

After user-approved untracking, the first command should return no paths. The second should list all three paths, without creating them. The third should return no paths (exit 1 is expected for unignored files). Diff check should exit 0. Database commands require an already prepared disposable local schema: expect no lint errors and pgTAP `Result: PASS`. `npm.cmd ci` first if dependencies are absent. The user runs the README read-only query in the SQL Editor and confirms every applicable marker is true. This documentation-only plan does not require a product Maestro run; if fixture login instructions change, rerun `maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/auth_login_happy.yaml` individually with replacement disposable credentials; expect successful Board arrival. Never use the published credential.

## Risks and rollout

Prioritize credential rotation/deletion before document cleanup. Evidence removal can break links in existing reports; retain sanitized descriptions and move private evidence outside tracking. Broad ignore patterns can hide genuine fixtures. Drift markers based on brittle text matching can misclassify harmless formatting or later compatible definitions; test semantic fragments and catalog state together, and document superseded checks. No commit/push or history rewrite is authorized by this plan.

## Needs you (user-side actions)

- Rotate or delete the shared Maestro test account and revoke its sessions; do not publish replacement credentials. Account deletion alone does not instantly invalidate already-issued JWTs, so follow the Supabase session-revocation/expiry procedure.
- Choose evidence removal scope: stop tracking future/current files, and separately decide whether public Git history needs coordinated rewriting. Approve the explicit path manifest before removal; preserve required local evidence privately.
- Run the completed README query against the live project before and after future migrations; apply missing SQL in filename order using the SQL Editor, with latest compatible bodies preserved. Do not use `supabase db push` for these canonical files.
- Preserve the recovery account until A13 is checked, then delete disposable accounts as listed in roadmap 001.
