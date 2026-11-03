# S02 request admission and drain — approved design, local implementation checkpoint

October22 amendment: owner subsequently approved the concrete implementation plan for inline execution. Local software verification is recorded in [the checkpoint](2026-10-22-s02-request-drain-verification.md). The proposal-era statements below describe the original approval boundary; they do not negate that subsequent local authorization. No hosted activation or global-drain acceptance follows. S02 remains INCOMPLETE.

S01 investigation is COMPLETE. S02 remains INCOMPLETE. This is an architectural proposal for review, not an executable runbook or permission to change SQL, hosted configuration, deployment, provider traffic or client availability. It preserves the accepted evidence limitation: unavailable deployed facts remain UNKNOWN. No new provider contact, credential inventory, live logs or real inference was performed.

Owner subsequently approved this written design for planning. Owner also selected “Use 7 days plus aggregate uncertainty”: detailed execution metadata has a seven-day deletion target, after which only an account-unlinked aggregate unresolved count per epoch may remain pending review. Expiry never marks work completed. Matching maintenance/health/deletion tests are required before claiming the target is operating; no unconditional physical erasure promise during service outages follows. Existing saved histories and prior fixtures are outside this new metadata cleanup. This supersedes the retention question below without approving implementation.

## Purpose and current evidence

Prevent new AI work from entering during maintenance and account for previously admitted work without confusing quota receipts with active requests. Preserve quests, saved content, histories, budgets, exhaustion marks and existing eligibility/consent/mailbox contracts. Keep hosted AI disabled until all release gates and the separately authorized exact replacement are accepted. This work does not change S04 generation triggers or counts.

Read-only source review covered canonical030/045/046 quota/refund definitions, current strict route, core request budget and generator boundaries. `private.ai_logical_requests` is a quota receipt, and046 `refunded_at` makes user refunds idempotent. Neither successful requests nor every abrupt worker termination produce a durable completion record. Current core returns successful output without writing a lifecycle completion receipt. A failed best-effort refund is not a worker-state acknowledgment. Historical receipt counts or provider exhaustion rows therefore cannot establish zero active work. No SQL query was run to relabel or delete old receipts.

Historical hosted v26 disabled/JWT-enabled/source-parity evidence remains scoped to the October20 cutover. Canonical core subsequently changed locally; this document performs no new hosted comparison. v24 did not honor the disabled mode during its replacement interval. Neither elapsed time since that deployment nor a local fake-provider test retrospectively proves an instantaneous globally drained cutover.

Current official references read October22:

- [Limits](https://supabase.com/docs/guides/functions/limits): worker wall-clock lifetime is150seconds on Free and400seconds on paid; idle response timeout150seconds is a different boundary. Do not infer the deployed project tier from the separate Groq Free operating target.
- [Background tasks](https://supabase.com/docs/guides/functions/background-tasks): work can outlive a returned response; local per-request worker termination also differs from persistent worker behavior.
- [Shutdown reasons](https://supabase.com/docs/guides/troubleshooting/edge-function-shutdown-reasons-explained): cleanup is not guaranteed; external execution tracking must handle abrupt termination.
- [Changelog](https://supabase.com/changelog): reviewed for relevant platform changes after the markdown endpoint failed the web tool's content-type handling. No reviewed entry supplied a global deployment-drain acknowledgment contract. This is a bounded source finding, not a claim about every unpublished platform capability.

These references do not provide the missing timestamp at which all ingress stopped selecting an old deployment. A worker lifetime cannot be used as a timer from an arbitrary deployment-command completion. A local AbortSignal also does not acknowledge cancellation of processing already accepted by a provider.

## Alternatives

| Approach | Assessment |
| --- | --- |
| Disabled environment mode plus wait150/400seconds or count quota rows | Keep the existing stop, but reject this as a complete drain mechanism. Old source, routing propagation, untracked work and provider cancellation remain unaccounted for. |
| Private database admission epoch plus durable execution accounting in all participating strict runtimes | Recommended local design direction for future controlled maintenance. Auditable and fail-closed, with no new service or paid dependency. It cannot retroactively instrument v24 or alone prove final network delivery/provider cancellation. |
| Verified upstream maintenance across every directly reachable AI endpoint, with platform-backed old-worker termination/cutover evidence | Required bootstrap route if global old-request quiescence is necessary and cannot otherwise be established. Actual supported control, scope, evidence and authorization remain UNKNOWN; a client flag, CORS list or optional proxy that direct callers bypass is insufficient. Do not invent or operate a production control. |

The recommended design combines future admission/accounting with a separate bootstrap prerequisite. Approval of local design must not accept untracked historical requests or authorize activation.

## Proposed local mechanism

1. Add a private singleton maintenance state with a monotonically increasing epoch. Start closed. No public client write access. Separate privileged admission-control operations from ordinary request execution where feasible; do not expose a maintenance toggle to clients.
2. Atomically combine admission with the existing logical-request/quota transaction. Capture an opaque execution identifier, request identifier, source contract version, epoch and timestamps. Preserve existing request idempotency and quota semantics; do not turn a duplicate receipt into an untracked second execution. Decide deterministic lock order before implementation. Never hold a database transaction open over provider I/O.
3. Track bounded lifecycle categories: admitted, provider dispatch authorized, locally settled, and unresolved. Store no prompts, answers, email addresses, tokens or new identity-verification data. Execution metadata retention and cleanup need an explicit bounded policy before implementation; do not infer that existing quota retention automatically applies.
4. Closing maintenance advances the epoch and denies new admissions and new dispatch authorizations atomically. A dispatch authorized before closing can still occur after the close transaction commits. Keep that execution unresolved until it is accounted for; do not promise zero provider sends immediately at close. Recheck the captured epoch alongside the existing identity/consent/mailbox checks before preparing output.
5. Record local settlement independently of whether a quota refund is due. Refunds, provider-attempt spending and execution settlement remain distinct. A worker crash, failed settlement write, lost acknowledgment or expired lease remains unresolved. Expiration must never silently become success or “drained.” A provider fetch abort/failure does not become proof the remote operation stopped.
6. A closed gate with zero unresolved participating executions is only an instrumented-runtime checkpoint. A response prepared before closing may still be delivered afterward; a database check cannot atomically fence a later socket write. Complete quiescence additionally needs verified ingress and response/worker lifetime boundaries, plus explicit treatment of downstream uncertainty. Do not label the checkpoint a global all-old-request drain.
7. Reopening is a separate privileged operator action, never an automatic timeout, success counter, client retry or rollback. Exact strict source, singleton Groq routing while disabled, accepted bootstrap evidence, eligibility/consent, mailbox, cache and remaining S02 gates must pass first. No fallback-capable rollback or quota/history reset.

## Bootstrap and observability boundary

The database barrier can deny old handlers that have not yet entered a guarded RPC, once such a barrier exists. It cannot reclaim data already sent, stop an uninstrumented provider call, prevent a legacy handler from returning an already computed response, or cover a direct endpoint outside the verified ingress scope. A new empty lifecycle table cannot prove old requests absent.

Before an activation runbook can claim global drain, establish the actual reachable ingress set, a supported deny-new-ingress boundary that old/direct requests cannot bypass, its effective cutoff acknowledgment, and the applicable old-worker/response bounds. Unavailable values stay UNKNOWN under the accepted limitation. Preserve the historical authorization/evidence record rather than re-requesting settled provider/declaration decisions. No provider/platform contact or production maintenance action follows from approving this design.

## Test-first acceptance to put in an implementation plan

- Race admission versus close: each execution is either denied without provider traffic or durably registered under its captured epoch; never untracked between quota charge and admission.
- Close after dispatch authorization but before fetch: the permitted late dispatch remains accounted for and blocks a premature drain claim. Close during an existing held fake-provider request denies new admissions and rejects stale output preparation after epoch change.
- Duplicate request/execution identifiers, concurrent workers, epoch replacement and retry cannot create an untracked second call or bypass eligibility/mailbox/consent checks.
- Success, rejected provider response, provider timeout, caller disconnect, failed refund, failed settlement, process termination and lost acknowledgment have distinct expected lifecycle outcomes. Uncertain cases remain unresolved after lease expiry.
- Default closed; unauthorized maintenance operation denied; malformed/missing state and database failures fail closed. Ordinary quests/saved reads remain available, and no quota/calendar-week trigger changes occur.
- Local synthetic HTTP/provider transport only; no real AI call or sensitive fixtures. Demonstrate local lifecycle behavior separately from hosted routing, bootstrap, final response delivery and remote-provider completion. Preserve retained services/accounts/fixtures and test artifacts.

## Review decision needed

Review this design as the basis for an inline, test-first local implementation plan. It introduces a new cross-runtime/database contract, so the written-spec and subsequent plan review are still required. Before executable implementation, resolve minimum execution metadata retention, privilege separation, request/attempt identity semantics and the exact local settlement definition. These are engineering design questions; they do not require IDs or additional sensitive verification information.

No implementation/deployment/activation is approved by this document. The future admission mechanism, initial bootstrap drain, supported font repair, email-change/origin/build, authority operations, complete export/deletion/vendor disclosures and independent final review remain open. No028 or S03.
