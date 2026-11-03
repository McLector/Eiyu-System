# S02 disposable Auth/Storage deletion rehearsal — proposed design

October22. S01 COMPLETE; S02/public release INCOMPLETE. Owner approved this design for implementation planning October22; concrete plan review remains pending. This proposes local testing only, not an automatic account-deletion feature, real support fulfillment, deployment or a retention certificate.

## Purpose and approval boundary

The approved export implementation now has qualified actual receiving evidence. The remaining deletion evidence is transactional SQL coverage: it cannot establish actual Auth API deletion, Storage byte removal, outstanding-token behavior or recovery after a multi-service failure. We should rehearse these boundaries using one newly created disposable target and one newly created retained control account in the existing exact local stack. Every account, synthetic fixture, phone history, user export and ignored artifact that already exists remains preserved.

Deleting even a synthetic Auth account through the Admin API is irreversible. The owner's preservation instruction does not authorize deleting a retained fixture. Review of this design authorizes implementation planning only. A concrete guarded implementation plan must identify the new disposable target boundary and be approved before running any irreversible step. No existing fixture is reclassified as disposable. If that narrow exception is declined, retain rollback-only evidence and leave actual deletion acceptance open.

## Selected approach and alternatives

Use a host-only test driver against project eiyu-s02-age-demo/API127.0.0.1:57321/container supabase_db_eiyu-s02-age-demo. Create a run-specific synthetic target and control only after assertions establish those exact local endpoints and no hosted transport. Keep all credentials, access/refresh tokens, signed URLs, exports and row comparisons in RAM. Artifact output contains only case categories, new synthetic IDs, exact owned object paths and nonsecret stage receipts. The control is retained. The target is the only account proposed for eventual permanent removal.

Continuing transaction-only tests is reversible but leaves actual API/byte/token gates open. A second full Supabase stack would isolate deletion further but adds resource/configuration drift and does not prove this retained stack's behavior. The selected approach uses exact allowlists and original-state comparisons, with no broad cleanup or reset.

## Rehearsal boundaries

1. Create fresh target/control with obvious run-specific synthetic names and minimum adopted signup metadata. Label any privileged consent/mailbox setup simulated; do not send email or collect IDs, documents, selfies, guardian birthdays or other verification data. Establish actual local Auth sessions. Existing current-session/mailbox verification checks remain the requester-binding contract; this test is not a real contact request.
2. Retain a RAM baseline of original forty-table contents, relevant original Auth existence/session metadata and Storage object metadata. Inspect schema/policy compatibility before mutations. All writes must match the run's exact target/control IDs and exact object keys. A stage receipt does not itself authorize a different target.
3. Upload one tiny known synthetic GIF per new owner through the existing private gym-exercise-media bucket and supported Storage API. Do not change the bucket, MIME/size policy, RLS, plan or SDK. Verify bytes in RAM and wrong-owner denial. Keep signed URLs and tokens RAM-only. If the local Storage API is unavailable, report that boundary and do not replace byte deletion with a metadata-only claim.
4. With admission already closed, inspect tracked request uncertainty. Do not dispatch AI or manufacture settlement. Unknown/bootstrap/historical work stays explicitly unresolved; the test cannot certify global provider drain. Any new synthetic linked execution coverage must preserve aggregate uncertainty under051 and must not mutate an original epoch/control state.
5. Rehearse wrong/missing/expired/foreign requester refusal before privileged removal. An operator-supplied target ID alone is insufficient. Record that the test's consent/proof is simulated and that a real request still needs the adopted contact/verification procedure.
6. The eventual irreversible path uses the Storage remove API for only the exact disposable target object, verifies the object cannot be fetched, then uses server-only auth.admin.deleteUser(targetId, false). Never delete Storage metadata with SQL, empty a bucket, recursively delete a prefix, reassign another owner's file or restore raw managed Auth tables as an undo strategy. No existing target is eligible.
7. Inject a controlled stop after successful target-object removal and before Auth deletion, then resume from the exact nonsecret stage/ID allowlist after fresh local and identity checks. Missing objects are not proof of completed account removal. Repeated execution must not broaden scope or delete the control. Unknown or conflicting state stops for review. Test code must distinguish before-mutation failure, partial completion and verified active-service removal.
8. After target deletion, test real sign-in/refresh refusal, absence of the target Auth session/identity rows and reviewed owner/indirect cascades. An outstanding JWT may remain cryptographically valid; test the existing sensitive export/session checks and current tracker/Storage policies separately. Record actual statuses as categories without logging bodies/tokens. Never call surviving token validity a universal access revocation pass.
9. Compare the retained control and all originals exactly in RAM. Preserve the control's synthetic file and all diagnostic artifacts. Verify no target object is accessible through the API; an HTTP refusal is not proof of backup/CDN/third-party erasure. Phone/browser saved exports and inaccessible old clients remain outside recall. No app data clearing or forced client cleanup is authorized by this rehearsal.

## Test-first plan requirements

Write failing tests for target authorization, nonlocal endpoint rejection, unknown/stale receipts, wrong-owner object paths, missing capability, failure/resume, duplicated calls and bounded sanitized output before implementing driver mutations. Use denied/fake transports first. The concrete plan must list the exact command, owned stages and irreversible activation guard; dry-run must perform no deletion. Do not run real destructive acceptance until that reviewed plan is authorized. Product defects, new request-service behavior or a new deletion endpoint require their own focused design/TDD, not an implicit expansion of test authorization.

## Acceptance and accurate response

A pass means only that the newly disposable local target's active Auth/database/Storage removal and scoped failure/resume cases were observed, with originals/control preserved. It does not complete S02, approve release or prove deletion from backups, provider logs, delivered email, downloaded exports or offline clients. The rehearsal response must enumerate active-service results, partial/unknown stages and surviving copies; keep the adopted7-day acknowledgment/30-day ordinary-completion targets distinct from guaranteed erasure deadlines.

Current native picker-held session-expiry observation and independent review remain incomplete. Authority sufficiency, actual vendor retention applicability, live-font repair, old-client/global drain and exact hosted origin/build parity remain separate gates. Only the original authorized read-only reviewer may be reused. No028/S03/S04.

## Official sources reread October22

- [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data): Storage ownership must be handled, and deleting an account does not retroactively invalidate issued JWTs.
- [Admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser): trusted server-only operation; soft deletion is not a reversible substitute.
- [Storage remove](https://supabase.com/docs/reference/javascript/storage-from-remove): remove exact objects through the API; inspect installed-client capabilities instead of assuming newer versioning options.
- [Sessions](https://supabase.com/docs/guides/auth/sessions): sensitive operations need current session checks when outstanding JWTs must be refused. No paid session feature or deployed setting is inferred.
October22 execution amendment: owner approved the concrete plan including the bounded irreversible operation. The single fresh-target Auth/Storage rehearsal passed; all retained fixtures and new control are preserved. See [verification](2026-10-22-s02-disposable-deletion-rehearsal-verification.md). This does not authorize deletion of an existing fixture or establish full S02 completion.

