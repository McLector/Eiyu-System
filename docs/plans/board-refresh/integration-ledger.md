# Board refresh integration ledger

> **Current status (2026-09-29):** The phase entries below are dated landing records. The post-landing review reopened acceptance; repairs are on `codex/board-refresh-repairs`. Current criterion-level status and local evidence are in `review-evidence/2026-09-29-repair-final-review.md`; no remote schema verification or production rollout has occurred in this repair effort.

This ledger records local phase approvals and integrations. Remote push, production data changes, deployment, and publishing remain out of scope.

## Phase 0 — foundation, fixtures, and baseline

- Base main SHA: `b840bb723229ba34a19a8a73a07ff3da7e952d81`
- Candidate branch: `codex/board-refresh-phase-00`
- Candidate scope: fixture correction/independence tests, Phase 0 evidence reports, and local browser/native runner scenario documentation.
- User authorization: the user said “proceed” on 2026-09-21 after the package was presented as **REVIEW READY — AWAITING USER**. This is recorded as approval to land Phase 0 and begin the next planned phase; no remote or production action was authorized.
- Candidate checks: recorded in `phase-00-report.md`; `git diff --check` passed.
- Landed commit SHA: `ace2a58f8d8e926e0b9902ba6836bbabf3c7a964` (local `main` fast-forwarded on 2026-09-21).
- Post-main smoke: `npm run test --workspace @eiyu/shared -- --runInBand src/logic/__tests__/board-refresh-fixtures.test.ts` passed, 1 suite / 4 tests, on local `main` before creating the Phase 1 branch.

Phase 1 was the only authorized implementation scope after the Phase 0 landing and has now been landed locally. Phase 2 was subsequently authorized by the user saying “phase 2” on 2026-09-22 and has now been approved and landed locally.

- Phase 1 candidate branch: `codex/board-refresh-phase-01`
- Phase 1 review package: `phase-01-report.md` and `phase-01-executive-summary.md`
- Landed commit SHA: `6918d03` (`fix: add safe habit lifecycle persistence`); local `main` fast-forwarded on 2026-09-22.
- Post-main smoke: direct local Jest invocation for `lifecycle.test.ts` and `lifecycle-readers.test.ts` passed, 2 suites / 5 tests.
- Phase 2 branch prepared: `codex/board-refresh-phase-02`; implementation authorized by the user on 2026-09-22.

## Phase 2 — lifecycle UI candidate

- User authorization: the user said “phase 2” on 2026-09-22.
- Candidate branch: `codex/board-refresh-phase-02`.
- Review package: `phase-02-report.md` and `phase-02-executive-summary.md`.
- Candidate status: **APPROVED / LANDED** for the authorized non-iOS scope; automated gates, browser delete/history/account-isolation evidence, clean disposable web-to-Android lifecycle journey, Android reminder scheduling/cancellation, and the reversible notification-toggle boundary pass. The emulator's native permission switch-off path was not claimed as a separate Expo permission-warning pass, and iOS execution remains explicitly excluded by user authorization.
- Landed commit SHA: `7004bcc` (`feat: add honest quest lifecycle controls`); local `main` fast-forwarded on 2026-09-22.
- Post-main smoke: web lifecycle/store tests passed, 2 files / 7 tests; mobile lifecycle/notification tests passed, 2 suites / 5 tests.
- Phase 3 authorization: the user said **“commit and start phase 3”** on 2026-09-22.

## Phase 3 — four-lane board candidate

- User authorization: the user said **“commit and start phase 3”** on 2026-09-22.
- Base main SHA: `e7160ea` (`docs: record phase 2 landing`).
- Candidate branch: `codex/board-refresh-phase-03`.
- Review package: `phase-03-report.md` and `phase-03-executive-summary.md`.
- Candidate status: **REVIEW READY — AWAITING USER** for the authorized non-iOS scope. Shared/web/mobile suites, static checks, web build, Expo export, desktop geometry, and Android lane navigation passed. The existing narrow web fixed-rail overflow and unexecuted 30/100-card + 200% zoom stress screenshots are explicitly documented limitations; Phase 4 remains unauthorized.
- Phase 3 commit SHA: `01d47da94a586287fa32536045f8517b6ac6c7bc` (`feat: present quests in a responsive four-lane board`). This committed predecessor revision was the Phase 4 base.

## Phase 4 — horizontal navigation and account overlays candidate

- User authorization: the user said **“commit, start phase 4”** on 2026-09-24, then **“proceed phase 5 if phase 4 is clear now”** on 2026-09-25. This authorized Phase 4 landing and Phase 5 implementation after the Phase 4 checks passed; remote push, production data changes, deployment, and publishing remain out of scope.
- Base revision: `01d47da94a586287fa32536045f8517b6ac6c7bc` (`feat: present quests in a responsive four-lane board`).
- Landed branch: `codex/board-refresh-phase-04`.
- Review package: `phase-04-report.md` and `phase-04-executive-summary.md`.
- Landed status: **APPROVED / LANDED** for the authorized non-iOS scope. Web/native/runtime/database gates passed; local `main` was fast-forwarded to `9681243` on 2026-09-25. Post-main smoke retained the shared 27-suite/214-test, web 11-file/36-test, mobile 11-suite/23-test, and TypeScript results.

## Phase 5 — compact weekly review and page sizing candidate

- User authorization: the user said **“proceed phase 5 if phase 4 is clear now”** on 2026-09-25, then **“proceed to next phase if everything is clear with phase 5”** on 2026-09-25 after the Phase 5 review package reported all authorized gates clear. This authorized Phase 5 landing and Phase 6 implementation.
- Base revision: `9681243` (`feat: move web navigation to header and add account dialogs`).
- Candidate branch: `codex/board-refresh-phase-05`.
- Review package: `phase-05-report.md` and `phase-05-executive-summary.md`.
- Candidate status: **APPROVED / LANDED**. Phase 5 covered the remaining R9/R10 scope, R12 regression protection, and the required weekly/layout evidence. Shared/web/mobile tests, static/build/export checks, browser geometry, the Android Status Maestro flow, and the detector passed for the authorized non-iOS scope. The remote retained-history schema and a fresh Docker-backed local DB rerun remain environment limitations; no production data change was made.
- Landed commit SHA: `87c370d` (`feat: compact weekly review and rebalance web layouts`); local `main` will be fast-forwarded to this Phase 5 landing before the Phase 6 branch is created.

## Phase 6 — whole-product acceptance and final handoff

- User authorization: the user said **“proceed to next phase if everything is clear with phase 5”** on 2026-09-25, after Phase 5 was verified clear for the authorized non-iOS scope.
- Base revision: `ab9bdd206578d834e382e44a80e26c943f0ce2aa` (`docs: record phase 5 landing and authorize phase 6`).
- Candidate branch: `codex/board-refresh-phase-06`.
- Review package: `phase-06-report.md`, `phase-06-executive-summary.md`, and executed `phase-06-scenario.md`.
- Landed status: **APPROVED / LANDED**. Local SQL lint and pgTAP passed 10 files / 331 tests; shared/web/mobile tests, static checks, web build, Android debug APK, latest Android export, and actual Maestro flows passed. Android font-scale 200% uncovered and then verified a navigation-label fix. On 2026-09-27 the user reported Board, Status, and History passed a real 200% browser-zoom review and explicitly authorized committing the six-phase work. No screenshots or viewport measurements were supplied; the visual review is user-reported manual validation.
- FINAL-01: Android full-product flow completed 128 actions; its last Board assertion was obscured by the Expo dev-client overlay. Separate 100% and 200% relaunch flows then passed Board/Profile/`3/3`, Status, Quests, return to Board, and persistence assertions. Evidence is under `artifacts/phase-06/android-maestro-final-20260926/`, `android-reload-smoke-standard-final-20260926/`, and `android-fontscale-200-final-safebar-verified-20260926/`.
- FINAL-02: local lifecycle persistence, RLS/authorization, and concurrency pgTAP suites are included in the passing 10-file / 331-test run. The reset-capable `local-db.ps1 verify` was intentionally not run against existing local DB state. The configured remote still lacks `public.deleted_habit_history`; no remote/production mutation was attempted.
- FINAL-04: user-reported PASS for the 200% browser-zoom review on Board, Status, and History; no screenshot artifacts were supplied. No implementation phase remains after Phase 6.
- iOS remains excluded. No push, deployment, publishing, or production data action is in scope. The approved plan defines no Phase 7.
- Landed commit SHA: `d6c520f` (`test: verify board lifecycle and navigation journeys`); local `main` fast-forwarded on 2026-09-27.
- Post-main smoke: mobile Jest passed, 12 suites / 24 tests, on local `main` after the fast-forward.
- Next phase: the user requested Phase 7 on 2026-09-27. The approved plan ends at Phase 6 and contains no Phase 7 objective or acceptance criteria; obtain a scoped objective before creating or implementing another phase. This is not authorization to deploy or mutate production.

## Post-landing review — 2026-09-27

- User requested a review against the plan and a repair plan with Luna as implementer/fixer.
- Reviewed local main: `aa793ba`; prior phase commits/approvals remain historical facts.
- Current technical assessment: **REOPENED — acceptance defects found**. Existing shared/web/mobile and 331 SQL tests pass, but 13 review probes fail planned behavior and additional source/SQL findings remain open.
- Review: `2026-09-27-post-landing-review.md`; Luna handoff: `2026-09-27-luna-repair-plan.md`; reproduction evidence: `review-evidence/`.
- Phase-count clarification: this refresh contains stages 0–6 (seven including foundation); the earlier `mobile-web-quest-design-plan.md` contains stages 0–8 (nine).
- This review changed documentation/evidence only. No product repair, new phase commit, remote migration, push, or deployment was performed.

## Repair candidate — 2026-09-29

- The user authorized Sol (`gpt-6-sol`, medium) to continue implementation after Luna (`gpt-5.6-luna`, xhigh) stopped. Parent Codex also contributed early A changes and independently executed browser/data reviews. This repair branch is based on `aa793ba`; it is not a new Phase 7 or an amended historical phase commit.
- Batches A–E have local source, suite, SQL, build/export, and rendered browser evidence. The current source digest is in `review-evidence/2026-09-29-source-snapshot.json`; detailed requirement verdicts, remaining device/zoom/rollout gaps and no-deployment status are in `review-evidence/2026-09-29-repair-final-review.md`.
- Earlier Phase 6 user-reported 200% browser validation belongs to its landed revision. Actual 200% zoom on the changed repair surfaces, current Android interaction, and remote schema state are not reverified. No repair commit, push, remote migration or production deployment is recorded.
