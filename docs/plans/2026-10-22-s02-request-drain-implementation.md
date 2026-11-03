# S02 Request Admission and Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax. The owner selected inline execution; do not delegate implementation or create replacement reviewers.

**Goal:** Build a local, default-closed admission barrier and honest execution accounting without representing it as a proved global historical drain.

**Architecture:** Database transactions register admitted executions atomically with existing quota receipts. Strict Edge runtimes authorize each dispatch, check their captured epoch before output preparation, and report local settlement separately from refunds. Uncertain execution details expire into account-unlinked aggregate uncertainty rather than disappearing from drain accounting.

**Tech Stack:** Existing Supabase/Postgres/pgTAP/dblink, installed Deno and TypeScript; no client changes, paid dependency or provider traffic.

**Spec:** [approved design](2026-10-22-s02-request-drain-design.md). Owner approved planning, seven-day detailed-metadata retention followed by aggregate uncertainty, then “Plan approved; implement inline.”

**Execution checkpoint:** Tasks1–2 local software verified. Task3 SQL retention/cascade and owner-authorized actual empty-data scheduler invocation verified; owned job/module removed and prior local state restored. Task4 local HTTP, canonical051 rollback reconstruction, full SQL and Edge checks verified; final independent review remains unavailable. See [verification and qualifications](2026-10-22-s02-request-drain-verification.md). Unchecked original steps below remain the plan's baseline, not a claim that no execution occurred. S02 INCOMPLETE.

## Global constraints

- S01 COMPLETE; S02 INCOMPLETE; no028, S03 or S04. Preserve every dirty file, numbered handoff, retained fixture and ignored artifact. No reset, commit or staging.
- Local retained project only: `.superpowers/s02-age`, project `eiyu-s02-age-demo`, API127.0.0.1:57321, database container `supabase_db_eiyu-s02-age-demo`. Refuse any other target and never print connection values, credentials, OTPs, payloads or raw service errors.
- Keep hosted AI disabled. No deployment, production configuration, provider/platform contact, inference or spend. Exact future hosted source/build/ingress and untracked v24 bootstrap remain separate release gates.
- Keep direct singleton Groq Free `openai/gpt-oss-20b`, global ZDR/no training permission; retained Gemini code stays unreachable. Preserve quotas, week/timezone, proof, consent, birthday and saved-content behavior.
- Execution detail deletion target seven days; unresolved count survives detail expiry/account deletion independently of account identity. No prompts, answers, emails, DOB, bearer data or secret digests in new metadata. No cleanup of retained synthetic account content.
- Read current official Supabase docs and applicable Postgres skill before SQL. Preserve the canonical numbered SQL workflow used by047–050; do not run a reset or regenerate/replace historical files.
- Final tests must execute and report their actual status. Historical counts are context, not current acceptance. Independent whole-change review stays open if the original authorized reviewer is unavailable.

## Review focus

1. Close between dispatch authorization and fetch must leave that potentially late dispatch accounted for; do not claim immediate zero egress.
2. Lost admission/settlement acknowledgments and repeated execution IDs must never produce a second untracked fetch or decrement an outstanding count twice.
3. Existing eight-day logical-request cleanup and account cascade must never erase uncertainty or make aggregate outstanding zero by deleting detail rows.
4. An old worker calling legacy RPC signatures must remain denied even after the new gate opens; a compatible new worker must not gain a path around consent/mailbox checks.
5. Retention maintenance outage or a duplicate cron job name must not overwrite other jobs, silently miss the seven-day target, or reopen admission.

Each case is owned by an explicit test below. A response prepared before close may still be delivered afterward. Local accounting cannot prove remote-provider termination or global network drain.

## File map and interfaces

Create canonical `backend/supabase/051_ai_admission.sql` only after confirming051 is unused at execution time; if occupied, stop for sequencing review rather than renumber retained files. Create tests `supabase/tests/033_ai_admission.test.sql`, `034_ai_admission_concurrency.test.sql`, `035_ai_execution_retention.test.sql`; check these numbers are unused first. No backend source is changed by writing this plan.

Create `backend/supabase/functions/ai-proxy/ai-proxy-admission.ts` and `ai-proxy-admission_test.ts`; integrate narrowly in `ai-proxy-core.ts`. Update existing core/route/refund/processing test fixtures for the new strict RPC protocol without replacing their negative assertions. Keep provider routing and generator retry policy intact.

Modify affected quota/age/mailbox/processing SQL tests013/015/026/027/028/031/032 to exercise their existing positive quota/eligibility paths through the new admitted protocol. Keep explicit new legacy-RPC denial assertions; do not just make every old expectation503. Test-only setup/helper SQL stays in rollback tests, never in product migrations.

Create guarded `scripts/s02-admission-local.test.mjs` for local HTTP/RPC/fake-provider acceptance and owned maintenance-job rehearsal. Extend `backend/supabase/README.md`, retention evidence, release review and continuation records with exact results/remaining gates. Do not modify mobile/web UI, SDK, caches or generation triggers.

Proposed service RPC contracts (no client grants):

```ts
type ExecutionTicket = { executionId: string; requestId: string; epoch: number };
type Admission = {
  allowed: boolean;
  attemptNumber: number;
  executionId?: string;
  epoch?: number;
  ageVersion?: number;
  mailboxVersion?: number;
  consentVersion?: number;
  authorityVersion?: number;
};
type LocalSettlement = 'completed' | 'stopped-before-dispatch' | 'unresolved';
// ai_admit_execution(p_user_id uuid, p_action text, p_request_id uuid,
//   p_week_start date, p_execution_id uuid, p_contract_version integer) -> jsonb
// ai_authorize_execution_attempt(p_execution_id uuid, p_epoch bigint,
//   p_attempt_number integer) -> boolean
// ai_prepare_execution_result(p_execution_id uuid, p_epoch bigint,
//   p_age_version integer) -> boolean
// ai_settle_execution(p_execution_id uuid, p_epoch bigint,
//   p_outcome text) -> boolean
```

Only trusted postgres-owner operator functions in `private` may close/open maintenance or run detail pruning. `service_role` has no direct table/schema/operator-control grants; public schema wrappers receive only the execution RPC grants they need, validate the service role, and use empty search paths. Authenticated/anon cannot invoke these service RPCs. Preserve existing trusted postgres ownership/private helper permissions from050. Explicitly revoke inherited PUBLIC/service-role execution privileges when moving old wrappers into private helpers; a schema move alone is not a privilege repair.

Private table shape: maintenance singleton has `is_open boolean`, `epoch bigint`, `updated_at timestamptz`, `last_pruned_at timestamptz`; epoch rows have `epoch bigint primary key`, `opened_at/closed_at timestamptz`, `outstanding_count/uncertain_count bigint check >=0`. Detail rows have `execution_id uuid primary key`, `request_id uuid unique`, `epoch bigint`, `contract_version integer`, `state text`, `authorized_attempt_mask smallint check between0and15`, `created_at/settled_at timestamptz`. State values are `admitted`, `dispatch-authorized`, `completed`, `stopped-before-dispatch`, `unresolved`. No owner FK or logical-receipt cascade may convert deletion into settlement. Existing receipt joins supply owner-scoped export/deletion while details exist. Check epochs against JavaScript's safe-integer bound before emitting/accepting them. Admission also requires a trusted successful prune within one hour and no overdue detail backlog; Task1 tests may seed that timestamp only as their trusted rollback fixture, while Task3 proves the real maintenance update. A last-success timestamp does not prove an unobserved later job succeeded; observed failures close the gate and stale health is independently fail closed.

`completed` means the tracked local provider promises and handler work have settled, not remote cancellation or client delivery. If a dispatched operation has ambiguous transport/cancellation/worker state, use `unresolved`; no timeout or refund translates it into completed. A second settlement is idempotent. A missing/expired ticket cannot authorize another dispatch or decrement a count.

## Task1: Atomic SQL admission, close and legacy fencing

**Consumes:** approved051 contract,050 processing wrappers,030/045 logical receipt semantics. **Produces:** service RPCs above and default-closed private state.

- [ ] Preserve before-images of touched files under a new ignored `.superpowers/sdd/2026-10-22-s02-request-drain-implementation/before`; record HEAD/status and confirm staging empty. Read design and plan again. Confirm retained database/services and no alternate target. No isolated worktree may discard or omit the required existing dirty050 work.
- [ ] Write033/034 tests before051. Use test-owned synthetic IDs and rollback/dblink cleanup patterns already used in032. Set explicit statement/lock deadlines; never permanently delete retained fixtures. Include an initially closed gate with unchanged quota counts, unauthorized service/operator access, malformed identifiers/contract version, and missing-row fail-closed behavior.
- [ ] Pin the first negative test to the actual new RPC contract:

```sql
select is(
  (public.ai_admit_execution(
    'd3300000-0000-4000-8000-000000000001', 'weekly-summary',
    'd3300000-0000-4000-8000-000000000101',
    date_trunc('week',current_date)::date,
    'd3300000-0000-4000-8000-000000000201', 1
  )->>'allowed')::boolean,
  false, 'default closed gate denies admission before provider/quota work'
);
```

Surround this with the existing valid synthetic Auth/profile/mailbox/processing fixture and service-role claims so a denial is attributable to admission. Assert quota receipt/count absence separately. RED must identify the missing admission routine/behavior, not a bad fixture or unavailable database.
- [ ] Run033/034 against only the retained local workdir and record RED. Discover installed CLI help first; the verified invocation shape is `supabase.exe --agent no --workdir .superpowers/s02-age test db --local <test paths>`. Sandbox CLI help itself attempted a user telemetry file and failed; use the already authorized host execution route when needed, withholding raw errors.
- [ ] Implement051 with private maintenance singleton/current epoch, epoch aggregate accounting and detailed execution rows. Details have no FK cascade that could reduce uncertainty. Use deterministic locking: admission/control row, existing owner lock, receipt/execution rows, then existing quota locks. Closing never holds a DB lock over HTTP. Keep nonnegative outstanding/uncertain counters and exact-once counter transitions in the same transaction as their detail transitions.
- [ ] Move the current050 begin/reserve/final-check implementations into separately named private helpers, preserving their bodies and trusted ownership. New service wrappers invoke those helpers under admission. Keep old public begin/reserve/final signatures present but fail closed for uninstrumented callers even when maintenance is open; never fall back to the old protocol on an RPC error. Before quota charging, reject an existing logical request that lacks a live compatible execution ticket; do not revive an expired detail into another provider call. Preserve the existing bounded logical-receipt idempotency window rather than inventing permanent replay detection after all receipts expire.
- [ ] New begin registers successful admission and its quota receipt atomically; quota denial creates no running execution. Reserve attempt1 without double-charging its pre-existing quota reservation; attempts2–4 call the retained quota helper once. Dispatch authorization is one-use per execution/attempt; an acknowledgment loss is fail closed and unresolved rather than a reason to fetch twice.
- [ ] Add dblink races: close/admit; close/authorize; duplicate admission under owner lock; duplicate settlement; owner withdrawal/email/birthday revision versus authorization/result preparation. Test both serialized outcomes with bounded waits. After close, new admission/authorization fails; previously authorized execution remains counted until honestly accounted for. Legacy callers remain denied after operator-open. Preserve all earlier consent/proof/quota positive and negative cases via the admitted protocol.
- [ ] Run033/034 GREEN and affected earlier SQL files. Repair actual failures with tests first. Verify private grants/RLS/search paths/owner checks explicitly and inspect all new security-definer routines. Do not commit.

## Task2: Strict Edge protocol and local settlement

**Consumes:** Task1 service RPCs. **Produces:** fail-closed Edge integration with the existing16000ms request budget and separate3000ms best-effort refund deadline.

- [ ] Write `ai-proxy-admission_test.ts` and core integration cases first. Use fake RPCs and deferred fake provider promises; no real endpoints or credentials. Test malformed/unsafe epoch or revision fields, RPC failure, missing migration, disabled strict factory, duplicate attempt authorization, close-before-fetch and close-during-fetch. No provider call when admission/authorization is denied or ambiguous.
- [ ] The core acceptance structure must include this meaningful held-provider counterexample:

```ts
Deno.test('close during an admitted held provider request refuses stale output', async () => {
  const run = admissionFixture();
  const response = run.handler(run.validWeeklyRequest());
  await run.providerEntered;
  run.closeGate();
  run.resolveProvider({ summary: 'synthetic held output' });
  const result = await response;
  assert(result.status === 503, 'closed epoch must refuse output preparation');
  assert(run.providerCalls === 1, 'only the already admitted provider ran');
  assert(run.unresolvedOrSettledCount === 1, 'execution must remain accounted for');
});
```

Implement `admissionFixture` in the test file: existing valid processingAccess/weekly payload, current epoch, explicit close mutation, deferred provider-enter/resolve promises, fake service RPC recorder and exact execution accounting assertions. Its fake must model the Task1 protocol, not merely return true for every unknown RPC.
- [ ] Run these tests RED before implementation. Installed Deno last verified present: `C:/Users/morad/AppData/Local/npm-cache/_npx/76f887347d91547a/node_modules/deno/deno.exe`; recheck existence/version. Test flags: `test --no-config --no-lock --node-modules-dir=none`. A runtime/cache setup error is not behavioral RED.
- [ ] Implement focused admission response validation and ticket helpers in `ai-proxy-admission.ts`. Accept only finite safe positive epochs, exact execution/request identity and current contract version. Reuse `createServiceClient(signal)` and the existing request budget; no new unauthenticated endpoint or client feature flag. Service RPC failures return generic503 without raw diagnostics.
- [ ] Integrate core: authenticate/validate current processing context, admit, authorize every attempt including the first, run the unchanged generator, then prepare output through the epoch/processing check. Preserve authorization failures, quota429, provider-capacity/busy semantics, owner checks and independent refunds. Reject an acknowledgment-lost admission without a provider call, leaving any committed DB execution unresolved.
- [ ] Separate quota reservation from dispatch authorization. The existing `reservedAttempts = new Set([1])` fast path cannot authorize first dispatch under the new protocol; remove that bypass for dispatch and test attempt1 explicitly. Repeating an already-used dispatch authorization is false rather than another permission to fetch, even though quota charging remains idempotent. Keep the existing generator's one-reservation-per-attempt call pattern and retry counts unchanged.
- [ ] Settlement runs on a separately bounded service RPC after locally tracked work has settled. A success response may be prepared only after successful compatible local settlement and the existing processing/epoch result check; do not pretend this removes the later socket-write race. A refund failure never decrements execution counters by itself. Failed/malformed settlement acknowledgment yields unavailable and unresolved accounting. Termination before settlement remains detectable. Track whether actual dispatch was authorized/entered so a pre-dispatch refusal is not falsely called a remote cancellation.
- [ ] Add cases for provider success, non-OK response, timeout, caller abort, unresolved underlying promise, refund error, settlement write/ack failure, unknown ticket and repeated settlement. Inspect generator abort semantics; a race wrapper returning is insufficient if underlying work is still pending. Mark ambiguous dispatched work unresolved, never completed merely because the handler stopped awaiting it.
- [ ] Update existing core/route/refund/processing fixture protocol without deleting their coverage. Run focused GREEN, then all existing ai-proxy and mailbox Deno tests once for shared-boundary regressions. Typecheck runtime entry against its actual installed imports/cache. No network inference or hosted environment inventory. No commit.

## Task3: Seven-day detail minimization, cascade safety and maintenance health

**Consumes:** Task1 epoch counters/details and Task2 settlement semantics. **Produces:** tested local pruning plus a guarded owned-job rehearsal, with aggregate uncertainty preserved.

- [ ] Write035 before implementation of pruning/health. Include settled/unresolved rows just inside/outside the cleanup threshold of6days23hours, the seven-day maximum target, repeated pruning, missing receipt, logical receipt deletion at its actual eight-day cutoff, and Auth owner removal inside a savepoint. The35-day quota-bucket cleanup is a different boundary. Do not rely on the older assessment's broad quota-cleanup wording to conflate them.
- [ ] Assert the core privacy/safety invariant directly:

```sql
select is((select outstanding_count from private.ai_execution_epochs where epoch=1),
  1::bigint,'unresolved execution counted before detail removal');
select lives_ok('select private.prune_ai_execution_details()',
  'operator removes expired detail without declaring work complete');
select is((select count(*) from private.ai_execution_details where epoch=1),
  0::bigint,'expired execution identifiers are gone');
select is((select outstanding_count from private.ai_execution_epochs where epoch=1),
  1::bigint,'aggregate uncertainty survives detail expiry');
```

Use rollback-owned epoch1 state for this test; never modify another run's real epoch row. Add deletion/export assertions joining detail to its logical receipt before account removal. Removing an account/detail cannot decrement an unresolved aggregate as if the provider finished.
- [ ] Run035 RED. Implement trusted operator pruning and owner/receipt deletion cleanup that remove detailed linkage without reducing unresolved counts. Aggregates contain only epoch/time/count categories, never request/execution/user identifiers or payloads. No success marker or automatic reopen on expiry. A late settlement for removed detail is refused and cannot underflow the count.
- [ ] Maintenance acceptance uses the official [Cron](https://supabase.com/docs/guides/cron) and [Quickstart](https://supabase.com/docs/guides/cron/quickstart). Canonical051 must not silently install a hosted schedule. In the explicitly local rehearsal, inspect extension/job availability using nonsecret metadata. If unavailable, report the scheduler gate open; do not install dependencies or change another stack by assumption.
- [ ] If available, create only the test-owned job `eiyu-s02-execution-prune-v1` after proving that name absent. Supabase replaces a same-name job, so absence is mandatory. Schedule a constant SQL call to the private pruning function, with no request data in command text. Test expired-detail removal inside rollback tests; observe the actual scheduled invocation with no committed overdue fixture rows, then unschedule only the job this run created. This separately proves SQL pruning and scheduler invocation, not actual timed erasure of a retained fixture. Preserve unrelated jobs/history and all original synthetic content. Keep the new test artifacts.
- [ ] Seven days is the detailed-data deletion target. Proposed steady-state schedule is hourly with pruning at6days23hours, leaving one hour of margin under healthy operation; the local rehearsal may temporarily use a shorter supported interval solely to observe an invocation. Test overdue detection and last-success health; missing or older-than-one-hour health denies new admission. If maintenance fails or backlog could breach the deadline, keep admission closed and surface operator-only status. Do not publish an unconditional seven-day erasure guarantee during outages or claim a local job is deployed. Any future hosted schedule and its own job-run metadata retention require explicit release/configuration authorization; do not blanket-delete `cron.job_run_details`.
- [ ] Run035 GREEN and a transaction-only export/removal/restoration rehearsal for these new linked details, including retained aggregate uncertainty. Record exact limitations for Auth sessions, remote work, backup/log copies and old clients. No permanent account deletion or public data-request rollout. No commit.

## Task4: Guarded local acceptance and exact checkpoint

**Consumes:** Tasks1–3, existing retained local services. **Produces:** verified local software checkpoint, never a global drain certificate.

- [ ] Write `scripts/s02-admission-local.test.mjs` first against the protocol. Assert the exact local project/API/database container before any call. Read local status in RAM, never print/store its JSON or credentials. Snapshot compared retained fixture rows in RAM or synthetic-only allowlisted artifacts. Fake provider transport only; deny every external model hostname.
- [ ] Acceptance cases: default closed0provider; explicit local operator-open admits one held fake request; close denies another; previously authorized dispatch remains counted; stale output preparation denied; settle/ack failures retain uncertainty; detail expiry/cascade preserves aggregate; legacy RPCs denied while open; quests/saved reads and compared retained histories exact. Restore closed state, direct forwarding if touched and owned local overlays; preserve accounts/fixtures/messages/artifacts.
- [ ] Run RED for missing actual behavior, then minimal harness/integration changes and GREEN. Treat unavailable service/scheduler/runtime separately. No live AI, hosted probe or fabricated global cutoff timestamp.
- [ ] Run complete local SQL suite and lint after the additive migration/affected tests, because the wrapper/grant changes affect existing callers. Use a preserved local reconstruction/transaction pattern; never reset the retained database. If full reconstruction needs a new disposable project or conflicts with retained ports, inspect and use an existing authorized isolated path or stop for the missing environment decision. Do not destroy existing fixtures to obtain a clean run.
- [ ] Run complete Edge/mailbox fake-provider suite once after final changes. Repeat narrower checks only for new failures/edits. No mobile/native rebuild or unchanged web/shared full-suite repeat is required for this backend-only contract. Run `git diff --check`; inspect every failure and disclose inherited failures without attributing them to this change by assumption.
- [ ] Update README051 local/unreleased marker, seven-day metadata purpose and operational qualifications, retention evidence, release review and continuation. Record exact local source/test results, disabled state, maintenance availability/cleanup, unknown bootstrap/ingress/provider boundaries and unavailable independent reviewer. Keep public release and S02 INCOMPLETE. No028, later phase, staging, commit, deployment or activation.

## Self-review and execution boundary

Covered: default-closed admission, quota atomicity, privilege separation, legacy denial after reopen, per-attempt one-use authorization, local output preparation/settlement, lost acknowledgments, crash/expiry uncertainty, deterministic concurrency, eight-day receipt cascade, seven-day detail policy, scheduler ownership/health, account-linked detail export/removal, ordinary content preservation and explicit bootstrap limits. Concrete schema field names/counters/RPC signatures in these tasks must remain consistent in implementation; changes that weaken the uncertainty/retention/legacy boundaries need another focused review.

Self-review repaired three specific hazards before presenting this plan: legacy first-attempt reservation caching could skip dispatch authorization; inherited grants survive moving functions; and scheduled destructive fixture expiry would conflict with retained-fixture preservation. The plan now tests first dispatch, explicitly revokes moved-helper privileges and separates rollback-only expiry from non-destructive actual scheduler invocation. Full backend regressions are required after contract changes; no implementation test result is claimed by this document.

No current production ingress control, globally effective old-version cutoff, provider completion acknowledgment or independent reviewer is available in this plan. Those are explicit release prerequisites, not executable local tasks with invented passing results. The local work can finish without closing them; it cannot complete S02. The plan's review does not authorize a hosted cron job, SQL rollout, enabling Groq or changing existing histories.

Owner should review this plan before implementation; preserve inline execution and the original read-only-reviewer restriction. Do not ask the owner to select delegation again.
