# S02 owner export receiving — approved local design

October22 approval amendment: owner approved this written design for local implementation planning, then approved the [concrete plan](2026-10-22-s02-export-receiving-implementation.md) for inline test-first implementation. Local software and qualified Auth/RPC evidence are recorded in the [receiving checkpoint](2026-10-22-s02-export-receiving-verification.md). Browser/native receiving and independent acceptance remain open. Neither approval authorizes real fulfillment, permanent deletion or hosted operations.

S01 COMPLETE; S02 INCOMPLETE. This proposes the missing receiving/authorization boundary for exports. It is not approval to implement, deploy, publish, fulfill a real request or delete an account. The [database checkpoint](2026-10-22-s02-export-deletion-checkpoint.md) establishes the narrower rehearsal evidence. All original fixtures and histories remain.

## Intent and alternatives

The owner wants an operable export/deletion process without IDs, selfies, documents, passwords or codes sent to support. Existing contact remains available, including for restricted or recovered accounts. The adopted7-day acknowledgment/30-day ordinary verified-completion targets remain. Account data must not be disclosed on the strength of a supplied account identifier or email correspondence alone.

Recommended: add an explicit owner export action to existing Account/Profile surfaces, backed by authenticated same-owner retrieval. The user receives their export directly in the signed-in client. The existing contact remains the intake for questions, exceptional access and manually reviewed deletion. This minimizes operator copies and avoids a new support attachment/password-delivery procedure.

Alternative: operator-prepared encrypted export and a separately authenticated handoff. That needs a concrete secure delivery channel, key exchange, temporary-copy deletion and operator record policy that is not currently established. Do not assume the existing email inbox supplies all of these.

Alternative: keep the current contact and privileged database rehearsal only. This preserves the testing boundary but leaves working export delivery and release acceptance incomplete. Do not describe that as completed fulfillment.

## Proposed authorization and flow

1. Reuse existing signed-in Account/Profile and mailbox verification/recovery flows. Explain what will be downloaded and that a downloaded copy is controlled by its recipient. No automatic export on mount, login, contact-link opening or foregrounding.
2. An explicit export action uses the existing Auth session in an Authorization header to a trusted server handler. No bearer URL, support-issued identity token, public object bucket, admin key in clients or caller-selected owner. The server derives the account from authoritative Auth verification, verifies current account existence and the existing current-mailbox proof. As a sensitive disclosure operation, it also validates the verified token's session_id against the current Auth session; signature/expiry or getUser alone must not be presented as immediate sign-out revocation. Keep this trusted check out of client-readable Auth schemas and do not modify managed Auth tables. A caller-supplied target identifier cannot select another account.
3. Intake/contact and recovery remain accessible if verification cannot complete. Do not require AI eligibility, AI consent or an adult declaration to request account data. Unknown/pending/minor/under12 rules continue to deny AI as adopted; they do not silently remove recovery or data-request access. A third party or disputed guardian request stays manual/pending under the existing conditional authority design; it cannot use an owner's download action merely by naming that account.
4. Capture account/mailbox revision, read a consistent account-scoped snapshot, build the reviewed export, and recheck current session/permission/revision before releasing it. Sign-out, account switch, mailbox change or failed revalidation discards the pending result in the current client. Do not hold database locks while waiting for Auth or network delivery. Concurrent data edits may be described by a snapshot timestamp. A final check cannot recall bytes already delivered or eliminate every later socket-write race; document this boundary and do not claim global immediate revocation.
5. Return the export only to that authorized request, with private/no-store response handling and a generic filename that contains no email, birthday or account identifier. Browser/native delivery must be implemented using supported existing/version-matched APIs, with an explicit user download/save/share action. No new dependency or SDK upgrade is assumed. A native/browser capability unavailable in the existing build remains an acceptance gate rather than a silent fallback to emailing raw content.
6. No automatic server export file, export bucket, support attachment or second indefinite content copy. Minimize time in memory and discard failed/aborted results. A user-chosen saved file is outside remote recall; say so plainly. Logging must exclude tokens, contents, owner-bearing URLs and secret digests.

## Export boundary

Create an explicit per-table/per-field manifest before implementation. The current32 owner-table inventory is a coverage input, not permission to serialize every column. Include account-owned tracker/history/saved-debrief information and the applicable declaration/consent/authority records in an understandable format. Include relevant indirectly linked usage/execution information through the owner's logical requests. Do not expose other accounts or global project counters/epochs as though they belong to this owner.

Never serialize raw Auth rows, passwords/hashes, session/refresh/access tokens, identities' provider secrets, challenge material, private administrative capability references or raw support correspondence. Account/profile information may be represented only by the approved projection. Distinguish this user export from a full administrator backup. A new/unmapped schema field must fail the manifest coverage check rather than silently expanding disclosure. Exact field classifications and handling of any legitimately withheld operational fields must be reviewed in the implementation plan.

Storage ownership and object paths require their own inventory. The initial text export must not claim to include media bytes that were not exported. Do not insert signed object URLs into a permanent export by assumption. Whether a separate authenticated media download is required depends on that inventory; unexplained omissions keep the complete export gate open.

## Deletion remains a separate reviewed operation

An export button does not authorize deletion or disposal of offline queues. Preserve histories and unsent actions throughout export and ordinary sign-out. Manually reviewed deletion must establish the correct account/request, handle owned storage using supported APIs, stop relevant new work, account for unresolved executions, address sessions and outstanding tokens, and rehearse partial failure/resume. Do not add a one-click destructive operation in this slice.

The deletion completion response must separate active server removal from reachable-client cleanup, retained aggregate uncertainty, backups/logs, delivered mail, user exports and inaccessible old clients. Unknown deployed settings remain UNKNOWN. Current-client queue/cache/widget/notification deletion requires explicit owner deletion semantics and separate acceptance; neither AI-cache retirement nor database cascade supplies that result.

## Local acceptance before release claims

Use synthetic fixtures and fake/denied provider transport. Preserve retained accounts, messages, histories and ignored artifacts. Write failing tests before software changes. Test absent/invalid/stale Auth, nonexistent owner, caller-supplied foreign owner, current mailbox/revision loss, restricted accounts, A→B→A and held-response races, manifest omissions, indirect rows, content/secret exclusion, storage omissions, bounds/failure/abort and private response headers. Verify no AI call, no export content logs and no effect on ordinary tracker/history/queues. Limits and error handling belong in the concrete plan; no fallback partial export may be labeled complete.

Rehearse browser and native explicit receiving behavior on their exact origin/build. No actual user export, external message, production setting, hosted handler deployment, permanent account removal, provider call or spend is authorized by this design. Independent review remains subject to the sole previously authorized reviewer restriction.

## Review boundary

Approve or revise this written design before implementation planning. This is a new authenticated disclosure/receiving contract, distinct from the already authorized rollback database tests. Planning must resolve exact field projections, supported native delivery, snapshot/size limits, media coverage and error/race behavior before any implementation. It must preserve S02 INCOMPLETE and all other release gates; no028, S03 or S04 follows.
