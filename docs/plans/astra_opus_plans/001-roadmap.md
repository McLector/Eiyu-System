# 001 — E2E remediation roadmap and user checklist

Planning only, based on the full `maestro-logs/e2e-2026-09-29/FINDINGS.md`, its harness notes H-1–H-8 and coverage exclusions, and code inspection on 2026-09-29. No application, shared, backend or Maestro source is changed by this deliverable. No migrations, deployments, commits or pushes are performed.

Every implementation must run on **Luna 6 (`gpt-6-luna`) at extra-high (`xhigh`) effort**. Read AGENTS.md, CLAUDE.md, backend/supabase/README.md, mobile/maestro/README.md and the exact [Expo SDK 54 reference](https://docs.expo.dev/versions/v54.0.0/) before Expo planning or code. Use this document with the relevant detailed plan; each detailed plan contains tests-first work, code anchors, acceptance criteria and user-only actions.

## Inventory, ownership and missing inputs

The supplied file contains **32 actual findings**, not 36. The four missing IDs below have no index row, severity, repro or evidence. They are explicitly deferred, not inferred from similar issues. Each actual finding has exactly one owning fix plan; cross-plan dependencies do not create duplicate ownership.

| Plan | Title | Owned finding IDs (severity) |
|---|---|---|
| 002-backend-security.md | Backend security and XP/AI quota integrity | F-001 S2, F-002 S2, F-003 S3, F-004 S3 |
| 003-ai-resilience.md | AI proxy resilience and verified success paths | F-019 S2 |
| 004-android-large-font.md | Android large-font layout and remount verification | F-027 S1, F-028 S2, F-030 S3, F-015 S3, F-020 S3, F-029 S3 |
| 005-android-accessibility.md | Android editor accessibility | F-012 S3, F-013 S3 |
| 006-validation-consistency.md | Form validation, Unicode names and defaults | F-014 S3, F-017 S3, F-031 S3, F-034 S4, F-021 S4 |
| 007-resilience-empty-states.md | Resilience, empty states and measured loading | F-024 S3, F-018 S4, F-016 S4, F-025 S4 |
| 008-android-navigation-settings.md | Android navigation, Status and Settings polish | F-033 S3, F-026 S4, F-022 S4, F-023 S4, F-035 S4, F-009 S4 |
| 009-web-phone-layout.md | Web phone-width navigation and scrollbar layout | F-036 S3 |
| 010-repository-hygiene-drift.md | Public-repository hygiene and migration drift documentation | F-005 S3, F-006 S2, F-007 S4 |
| Deferred | Missing from supplied findings file; severity unknown | F-008, F-010, F-011, F-032 |

**Count: 32 findings covered; 4 missing IDs explicitly deferred.** F-025 and F-029 are included as verification-first work, with implementation conditional on a reproducible product defect. F-004 is a user dashboard action rather than a code fix. No finding is declared fixed by the original coverage table or by this planning task.

## Recommended execution order and dependencies

1. **010 first, immediate containment:** user rotates/deletes the published shared account credential; prepare ignore/documentation cleanup and baseline 001–028 migration drift checks. Evidence/history removal awaits the user's explicit choice. This must not delay urgent Android accessibility work.
2. **002:** close direct XP writes and helper exposure with migration 029; implement authoritative AI quota with migration 030 and compatible proxy/client changes. User enables leaked-password protection. Review current live grants first; avoid repeating attack probes against personal data.
3. **004:** fix the S1 unreachable Save action and large-font layout. Reproduce F-029 in a quiet release build before any navigation change. It can proceed independently of backend work.
4. **005, then 006:** build editor accessibility on the new layout, then add validation copy/defaults and Unicode validation. Plan 006 owns all of F-031, including migration 031. Sequence changes to quest-editor.tsx instead of having implementors overwrite one another.
5. **003:** integrate bounded retries/fallback with 002's quota design so retry attempts cannot bypass or multiply user reservations. Mock-based tests can be drafted earlier, but release depends on the quota integration and a real AI success-path check.
6. **007:** stabilize delete/create/offline state against the settled editor and store changes. Measure F-025 on a quiet machine/release build before conditional performance changes.
7. **008, then 009:** navigation/Settings refinements follow the mobile layout changes. Web phone CSS is independent and may proceed earlier if its shared AccountShell edits are serialized with 006.
8. **Final integration:** reconcile 010's drift query with 029–031, run the affected regressions, and complete user-side rollout/coverage checks. Any later SQL change gets the next unused number; never modify an applied SQL file to alter deployed behavior.

Dependency summary: 010 baseline docs → 002 migration/proxy quota → 003 retry integration; 004 editor layout → 005 semantics → 006 validation → 007 editor lifecycle; 004 → 008 mobile polish. 009 is independent except for shared web file coordination. Migration order is always **029 → 030 → 031**, regardless of parallel drafting or plan execution order.

## Tests first and verification contract

Implementors first write and run the failing tests listed in their owning plan, then implement, then rerun those tests and affected regressions. A source assertion does not prove runtime behavior. User-owned live settings require a separate user verification result. Record red/green evidence, unresolved issues, deviations, exact commands and user actions in `docs/plans/plan_execution_report/<plan-number>-<slug>.md` during later implementation. That directory is intentionally empty except `.gitkeep` now. Do not put secrets, private logs, screenshots or personal notes in reports.

Preserve all existing uncommitted edits under mobile/maestro/flows and web/maestro as the test baseline. Respect H-1/H-2 dev-client launch and package repairs; H-3 current selectors; H-4 browser-driver limitations; H-5 Unicode input limitation; H-6 dev-ball overlap; H-7 separate test-origin/session isolation; H-8 UTF-8/BOM handling. Run Maestro flows **one at a time** on a given device, using private environment variables. Keep evidence in ignored `maestro-logs/`, never newly tracked paths.

Common PowerShell regression commands from repository root (future implementation, not run for this documentation task):

```powershell
if (-not (Test-Path node_modules)) { npm.cmd ci }
npm.cmd run test --workspace @eiyu/shared -- --runInBand
npm.cmd run test --workspace @eiyu/mobile -- --runInBand
npm.cmd run test --workspace @eiyu/web
npx.cmd tsc --noEmit -p packages/shared/tsconfig.json
npx.cmd tsc --noEmit -p mobile/tsconfig.json
npx.cmd tsc --noEmit -p web/tsconfig.json
git diff --check
```

Expected: all commands exit 0; tests add coverage rather than relying on historical test counts. For backend work, run `npm.cmd run db:lint` and `npm.cmd run db:test` against the explicitly prepared disposable local schema. They do not reset it. Never run `scripts/local-db.ps1 verify`, `npm run db:verify`, or a wrapper with its default `verify` action. `supabase db push` does not consume the canonical backend SQL files.

Android native builds must use the verified short-path checkout. Discover its actual location before building; do not assume old Q: mappings or historical staging workarounds are still valid. Run Gradle, Expo native builds and emulator boots detached, with `Start-Process -WindowStyle Hidden`, redirect stdout/stderr to ignored logs, poll progress and exit status. Do not equate a debug/dev-client run with release verification. No ML dependencies are needed here; if later tooling requires them, pin numpy as instructed.

## Coverage that remains a gate, not an invented defect

- F-019 requires actual successful suggestions and weekly summary/cache behavior; legacy flows that accept a readable error are insufficient.
- Run A13 only after the recovery fixture crosses its account-local midnight. Do not fake it by changing the device clock; the boundary is server-side.
- Include scheduled OFF DAY and one-time 0/1 → 1/1 → 0/1 regression coverage around backend schedule/XP changes.
- TalkBack and real browser zoom were not tested; plans 005 and 009 explicitly add those checks. Settings/History at font scale 2.0 belong in 004's regression matrix.
- Real notification delivery, denied notification permission, timezone change, forgot-password mail and iOS remain unverified in the original run. Do not claim a pass. Capture remaining platform limitations in execution reports; avoid sending real mail without the user's authorization. Windows alone cannot verify an iOS native build.

## Consolidated Needs you (user-side actions)

- [ ] **Immediately:** rotate or delete the shared Maestro test account, revoke sessions and account for existing access-token expiry. Keep replacement credentials private. This comes before cleanup commits.
- [ ] **Evidence handling:** choose an explicit tracked-evidence removal manifest and whether historical public Git data needs coordinated removal. Index cleanup does not remove old commits. Preserve needed private evidence; authorize history rewriting separately if desired.
- [ ] **Test/build access:** supply disposable account access through private environment variables and identify/prepare the short-path Android checkout if not discoverable. Run release/quiet-machine, TalkBack and real 200% zoom checks if implementors lack those surfaces.
- [ ] **Before SQL:** review the prepared migrations/tests and run the expanded read-only drift query; confirm 001–028 capabilities. The test report says all were present after that day's manual application, but recheck current state. Do not rerun obsolete function definitions over newer migrations.
- [ ] **SQL rollout:** first deploy 002's compatible quota guard that fails closed when the new quota schema is absent (expect a temporary AI-unavailable response with no provider calls). Apply prepared `029_*.sql`, then `030_*.sql`, then `031_*.sql` in the Supabase SQL Editor, in filename order, following each plan's coordinated rollout steps. Implementors prepare these files; they never apply them to the live project. Re-run all drift markers after each file and check exact function bodies/grants. After 030 passes, complete 003's resilience deployment and smoke checks.
- [ ] **029 verification:** run plan 002's disposable-user REST probes: direct `PATCH /rest/v1/stats?stat=eq.STR` and `increment_stat_xp` must both be denied, values unchanged; legitimate complete/undo/recovery still work; cross-account access remains denied.
- [ ] **030 / AI release:** review the proposed limits (two requests/day for each suggestion action, two weekly-summary regenerations/day, and 100 provider attempts/project/UTC day) against your expected usage and spend; these are proposed settings, not measured requirements. Set only the approved quota/model configuration privately, deploy from the directory containing the function with `supabase functions deploy ai-proxy` as detailed in 002/003, then verify quota bypass/concurrency denial, successful AI actions and bounded upstream failure. Confirm fallback model availability in the project's Gemini account. Any required API-key or secret changes are yours; do not paste values into chat/files. Coordinate client deployment with server-side persistence/grant changes and the fail-closed rollout window in 002.
- [ ] **Auth dashboard:** enable leaked-password protection in Supabase Authentication settings, verify the setting/advisor, and test rejection with a disposable signup fixture. If the current project tier does not provide it, record the blocked status and choose the plan/tier action; do not mark fixed.
- [ ] **031 verification:** confirm invisible-only profile values are rejected by direct writes and the profile RPC while valid Unicode and unchanged legacy values remain usable; verify signup/profile limits and existing-record compatibility.
- [ ] **Recovery before cleanup:** retain `e2e0929r1@eiyu.test` until after the fixture's first midnight in Asia/Manila (2026-09-30 00:00 PHT = 2026-09-29 16:00 UTC for this run). Using its private credentials, run `maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/e2e/A13_recovery_check.yaml`; expect `RECOVERY REQUIRED` / `STREAK FROZEN` for the prepared fixture. If it is now later than that window, document actual fixture state instead of assuming the original boundary remains reproducible.
- [ ] **After verification:** delete `e2e0929a1@eiyu.test`, `e2e0929w1@eiyu.test`, `e2e0929p1@eiyu.test`, and only then the checked recovery account `e2e0929r1@eiyu.test` in Supabase Authentication → Users. Follow the chosen shared-account remediation separately.
- [ ] **Missing input:** provide findings F-008, F-010, F-011 and F-032 if they exist, or confirm they were intentionally unused IDs; until then no change is proposed for them.
- [ ] **Release:** approve and perform any live client release or external deployment after the detailed plan's gates pass. No commit or push is authorized by this planning request; any later commit must be Conventional Commits without attribution trailers.

## Acceptance criteria for the roadmap

All 32 supplied findings have exactly one owning fix plan; the four absent IDs remain explicitly deferred. Every implementation report must show the owning plan's per-finding acceptance result, red/green test evidence and outstanding user actions. Completion of a local test suite does not substitute for a required live, release-build or accessibility check. The final release gate requires the applicable 001–031 migration markers, denied unauthorized XP/quota writes, reachable large-font actions, verified AI success/cache paths, and preserved existing lifecycle behavior.

## Verification of this planning deliverable

Check the numbered file sequence, required plan sections, finding ownership and source-path/line citations. Confirm only the plan folder and the empty execution-report placeholder were added; application/shared/backend source and the existing Maestro baseline must stay unchanged. Do not run product tests, migrations or deployments merely to validate these Markdown files.

## Risks and references

The main cross-plan risks are summary persistence breaking when grants tighten, quota charging multiplying under retries, stale profile contracts between SQL and clients, editor layout work colliding with validation/lifecycle changes, and incorrectly treating environmental delays as code defects. Each has an explicit dependency or verification gate above.

Source anchors in detailed plans refer to the inspected working baseline and can move during implementation. Read the actual code again before editing. Expo planning uses the [versioned SDK 54 documentation](https://docs.expo.dev/versions/v54.0.0/). Database test design follows [Supabase's pgTAP testing overview](https://supabase.com/docs/guides/local-development/testing/overview), with this repository's manual numbered SQL process taking precedence over generic migration workflows. Current product behavior must be rechecked at implementation time; no live test success is asserted by these documents.
