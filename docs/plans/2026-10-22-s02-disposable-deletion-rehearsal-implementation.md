# S02 Disposable Deletion Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, failing tests first. Preserve the owner's existing execution method. No implementation delegation or replacement reviewer.

**Goal:** Rehearse actual local Auth/Storage removal of one freshly created disposable synthetic target, with wrong-requester refusal, controlled failure/resume and original/control preservation.

**Architecture:** A pure test-only scope/state machine controls injected Auth/Storage ports. A host-only adapter uses the retained local stack and existing SDK to create the run's target/control; an in-memory verified requester and immutable target allowlist precede every irreversible step. Nonsecret receipts are diagnostic records, never deletion capabilities.

**Tech Stack:** Installed Node22.18/node:test, Supabase JS/Auth/Storage2.112.4, retained local Supabase/Postgres17, existing read-only052 helpers and40-table manifest. No dependency, mobile, SQL schema, bucket, RLS or deployed configuration changes.

**Spec:** [approved design](2026-10-22-s02-disposable-deletion-rehearsal-design.md). Owner approved design for planning October22. Owner approved this concrete plan and scoped local rehearsal October22. Tasks1–4 completed with qualified local evidence:29focused tests, read-only preflight and one fresh-target live removal passed. Read the verification checkpoint; independent/full S02 acceptance remains open. S02 INCOMPLETE.

## Global constraints

- Exact project eiyu-s02-age-demo; API http://127.0.0.1:57321; container supabase_db_eiyu-s02-age-demo; bucket gym-exercise-media, private,20MiB, GIF/MP4. Do not modify these settings.
- Preserve every existing account, synthetic fixture, phone/browser export, ignored artifact, roadmap and numbered handoff. Only the fresh target created by this same authorized execution is disposable. The fresh control and its file are retained.
- Keys/passwords/tokens/signed URLs/export content/original row comparisons remain RAM-only. No credential/env/row/error/body logging or secret digests. Fixed result categories and new synthetic IDs/paths only.
- No real mail, provider calls, paid services, contact, deployment, publishing, production changes or permanent deletion of any retained fixture. Hosted AI stays disabled; current deployed unknowns remain UNKNOWN.
- Default --dry-run is read-only, creates no fixture, calls no remove/delete operation. Real execution requires exactly --execute-disposable-target; reject other flags and any caller-supplied target/path/endpoint.
- No automatic cross-process resume. A crash preserves remaining fixtures and requires review; receipt files are insufficient to proceed. Same-process controlled resume retains credentials privately in RAM and rechecks actual identity/mailbox.
- Keep native picker-held session acceptance, full client-copy cleanup, historical/global provider drain, authority/vendor retention, font repair, hosted/build/origin parity and independent acceptance open. No028/S03/S04 or commits/staging/reset.

## Review focus

1. Stale/foreign requester between Storage removal and Auth deletion must stop before the next mutation (Task1/3 held reauthorization tests).
2. A forged receipt or CLI target must never turn an existing fixture into the disposable target (Task1 exact-scope/unknown-field tests).
3. A timeout after a successful remove/delete must be reconciled by read-only state checks, never a blind retry or success inference (Task3 ambiguous-result tests).
4. Storage metadata absence and a signed-URL refusal must not masquerade as complete byte/backup deletion (Task2/4 dual API checks and qualified report).
5. A genuine process crash loses private authorization/baselines; retain partial state and refuse receipt-only recovery (Task1/3 missing live context tests).

## Files and interfaces

Create only these source/test files after review:

| File | Responsibility |
|---|---|
| scripts/lib/s02-disposable-deletion.mjs | Pure scope validation, requester gate, bounded state transitions and fixed report projection; no SDK/process/filesystem imports. |
| scripts/lib/s02-disposable-deletion.test.mjs | Denied/fake transport tests for all guard/failure/resume cases. |
| scripts/lib/s02-disposable-deletion-local.mjs | Host-only exact-stack discovery, bounded SQL comparisons, SDK adapters and fresh synthetic fixture setup. No import-time side effects. |
| scripts/lib/s02-disposable-deletion-local.test.mjs | Fake process/fetch/SDK tests, endpoint and mutation routing refusals, sanitized reports. |
| scripts/s02-disposable-deletion-local.test.mjs | Explicit dry-run/live acceptance entry, one fresh target/control pair maximum per run, scoped report and finally checks. |
| docs/plans/2026-10-22-s02-disposable-deletion-rehearsal-verification.md | Exact results, failure stages, preserved fixtures, current limitations. |

Modify the approved design status and existing S02 receiving/deletion/retention/device/release/continuation ledgers. Preserve before-images and logs under .superpowers/sdd/2026-10-22-s02-disposable-deletion-rehearsal-implementation/. No change to package files or existing product modules. Check filenames are unused before creating any file.

Task interfaces (JSDoc types in .mjs, using existing installed modules):

```js
// Scope is frozen in RAM after fresh creation; never reconstructed from a receipt.
// {runId,projectId,api,container,bucket,targetId,controlId,targetKey,controlKey}
// Context additionally holds originalTargetUserCreatedInThisProcess=true,
// current requester token and secret-free proof: {userId,sessionId,mailboxVersion}.
// All identifiers are validated UUIDs; keys are exact strings generated below.
export function assertScope(scope, liveContext) {} // returns void or fixed refusal
export async function authorizeTarget(scope, liveContext, ports) {} // fresh Auth+052 check
export async function advanceRemoval(scope, liveContext, ports, state) {}
// state enum: prepared | storage-removed | auth-removed | verified | needs-review
// ports: verifyRequester(),checkMailbox(),removeExactObject(),objectAbsent(),
// targetExists(),deleteExactUser(),verifyRemoval(),writeStage(),assertOriginals().
export function reportResult(result) {} // projects fixed allowlisted fields only
export async function inspectLocal(dependencies) {} // exact-stack/bucket read-only preflight
export async function createDisposablePair(local, runId) {} // RAM credentials; immutable scope
export function createLocalPorts(local, pair, baseline) {} // no broad mutation port
```

## Task1: Pure authorization and deletion state machine

**Files:** first pure module/test above. Consumes injected ports and frozen live scope. Produces assertScope/authorizeTarget/advanceRemoval/reportResult.

- [x] Preserve before-images/absence record, reread executing-plans/TDD, then write tests before the module. Initial missing-module RED is not enough: add semantic RED for every new guard before its implementation.
- [x] Pin exact UUID/key invariants: targetId differs from controlId; both absent from original Auth ID inventory; generated during this process; project/API/container exact; keys exactly `${targetId}/s02-delete-${runId}/probe.gif` and corresponding controlId path. runId is a UUID. Reject traversal, percent encoding, alternate separators, trailing slash, prefix deletion, mismatched bucket, nonlocal URL/userinfo/query/fragment, unknown scope fields and supplied original ID.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertScope,advanceRemoval} from './s02-disposable-deletion.mjs';
test('receipt alone cannot authorize removal',()=>{
 assert.throws(()=>assertScope(validScope(),null),/Deletion rehearsal refused/);
});
test('foreign requester stops before all mutation ports',async()=>{
 const calls=[]; const ports=fakePorts(calls,{requester:'control'});
 await assert.rejects(advanceRemoval(validScope(),liveContext(),ports,'prepared'));
 assert.deepEqual(calls.filter(x=>x==='remove'||x==='delete'),[]);
});
function validScope(){
 const runId='d5200000-0000-4000-8000-000000000001';
 const targetId='d5200000-0000-4000-8000-000000000002';
 const controlId='d5200000-0000-4000-8000-000000000003';
 return Object.freeze({runId,projectId:'eiyu-s02-age-demo',
  api:'http://127.0.0.1:57321',container:'supabase_db_eiyu-s02-age-demo',
  bucket:'gym-exercise-media',targetId,controlId,
  targetKey:`${targetId}/s02-delete-${runId}/probe.gif`,
  controlKey:`${controlId}/s02-delete-${runId}/probe.gif`});
}
function liveContext(){
 const s=validScope();return {originalTargetUserCreatedInThisProcess:true,
  createdIds:new Set([s.targetId,s.controlId]),originalIds:new Set(),
  requesterToken:'inert-unit-fixture-label',expectedMailboxVersion:1};
}
function fakePorts(calls,{requester='target'}={}){
 const s=validScope();return {
  verifyRequester:async()=>({userId:requester==='target'?s.targetId:s.controlId,
   sessionId:'d5200000-0000-4000-8000-000000000004'}),
  checkMailbox:async()=>true,
  removeExactObject:async()=>{calls.push('remove');},objectAbsent:async()=>true,
  targetExists:async()=>true,
  deleteExactUser:async()=>{calls.push('delete');},verifyRemoval:async()=>true,
  writeStage:async()=>{},assertOriginals:async()=>true};
}
```

- [x] Run `node --test scripts/lib/s02-disposable-deletion.test.mjs`, retain RED, implement the minimum guards and rerun GREEN. Tests include missing token, expired/foreign session, wrong owner, stale mailbox, control key, original target, wrong mode and unknown state; every refusal asserts zero remove/delete calls.
- [x] authorizeTarget verifies the exact token with actual Auth via the injected port; only afterward may its matching session_id be used. Require verified userId===targetId and fresh owner_export_check(targetId,sessionId,expectedMailboxVersion)===true. Never authorize from metadata, decoded JWT alone, file receipt or an arbitrary operator ID. This is a rehearsal-only composition, not a released deletion-request endpoint.
- [x] Implement prepared→storage-removed only after fresh authorization and scope checks. Remove exactly one targetKey, then confirm object absence via trusted read-only checks. Reauthorize before storage-removed→auth-removed. Auth removal is exactly deleteUser(targetId,false). No catch/finally may remove another account/object or clean retained files.
- [x] Test successful transitions/order, async authorization loss at each boundary, duplicate stage calls, missing capabilities and unexpected port values/errors. Fixed unknown failures become needs-review; retain stage and stop mutations. No raw error is serialized. Verified completion requires verifyRemoval and assertOriginals, not SDK success alone.
- [x] Project reports with an explicit fixed-field constructor (do not spread an error/context/SDK result). Test canary credential/email/bearer/URL/row objects injected into errors and unknown fields: none appear in JSON output. Keep reports≤16KiB/50 case categories. Run GREEN and `node --check` for both files. No commit.

## Task2: Exact local SDK adapters and preserved fixture setup

**Files:** local adapter module/test. Consumes pure Task1 functions and existing manifest/installed SDK. Produces inspectLocal/createDisposablePair/createLocalPorts.

- [x] Read current official Auth deletion/Storage remove/sessions docs and relevant changelog, installed GoTrueAdminApi.deleteUser and StorageFileApi.remove. The installed2.112.4 remove signature is string[]; do not copy newer versionId overloads from current web examples. No package upgrade.
- [x] Write fake process/fetch/SDK RED tests. inspectLocal must reject a wrong config/project/container/API/mailbox origin, unknown schema/bucket policy, open admission, tracked outstanding/details, missing service capability and redirected/nonlocal transport before fixture creation. Global unknown historical ingress remains unresolved even when local tracked counters are0.
- [x] Implement discovery using the existing local status command captured/parsed in RAM and Docker inspect exact-name output. Never echo status output. Reuse the guarded query shape from scripts/s02-owner-export-local.test.mjs, with15s statement/3s lock/20s process bounds. Importing this adapter must run no command. Read-only preflight confirms current40-table/48-FK manifest, bucket private/20971520 bytes/image-gif+video-mp4, Auth session columns and052 callable shape; report categories only.
- [x] Wrap ALL SDK HTTP with an exact local-origin allowlist, redirect:error and per-request15s AbortController. Deny nonlocal hosts, arbitrary function routes and Management API. SQL mutation helpers accept validated new target/control IDs only, use fixed parameter shapes and permit fixture setup only. No raw SQL supplied by CLI/receipt.
- [x] Create at most two new accounts: `s02-delete-target-${runId}@example.invalid` and `s02-delete-control-${runId}@example.invalid`, independent random passwords held in RAM, minimum synthetic metadata matching050: display_name, time_zone UTC, birth_date2000-01-01, processing_consent.age_screening granted/notice2026-10-20-age-v1. Admin email confirmation and private mailbox verified_version/verified_at setup are explicitly simulated consent/proof. Actual signInWithPassword establishes each session. Preserve partial creation on failure.
- [x] Record new IDs/disposable target designation before proceeding; never store email/password/token. Assert actual Auth session subject/requester binding. Add one synthetic habit per new owner; add one synthetic logical-request/provider-attempt pair for the target using this fixed SQL inside a transaction with local timeouts (all UUID values validated first):

```sql
insert into private.ai_logical_requests
 (request_id,user_id,action,request_class,account_date,week_start)
 values(:request_id,:target_id,'weekly-summary','initial',current_date,
        date_trunc('week',current_date)::date);
insert into private.ai_provider_attempts(request_id,attempt_number,usage_date)
 values(:request_id,1,current_date);
```

  Bind parameters through a fixed safe query builder/validated UUIDs, never shell interpolation. These are privileged relational fixtures, not actual inference, quota settlement or request-drain proof. Do not add execution details, epoch mutations or fabricated provider completion. Existing rollback-only execution-detach coverage remains historical; full live in-flight removal stays open.
- [x] With each owner's authenticated client upload the same known tiny GIF to its exact new key, using upsert:false/contentType:image/gif. Keep bytes in RAM:

```js
const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
await owner.storage.from('gym-exercise-media').upload(key,gif,
 {contentType:'image/gif',upsert:false});
```

  Check every SDK error explicitly; failure preserves created state for review. Verify owner/admin download bytes and control's inability to fetch target bytes. Validate any signed URL has the exact local origin/expected object path, keep it RAM-only and fetch with redirects denied. Do not create directories/buckets, use SQL on storage.objects, clear app data or widen policies.
- [x] Baseline all originals'40-table rows, relevant Auth IDs/session existence metadata and Storage metadata in RAM, excluding only the two new IDs and exact new keys. Preserve control row/byte baseline. Cap RAM comparisons at32MiB; overflow stops without mutation. Do not persist snapshots, filenames of unrelated objects or hashes. Compare original rows with isDeepStrictEqual inside RAM and assert only its boolean result; never pass original rows, SDK results or secret-bearing objects as expected/actual values to a test assertion that could print them. No large original Storage byte scan; compare original metadata and control's actual bytes and report that limitation.
- [x] Absence requires exact-key trusted list/info plus failed admin download and target signed-URL fetch while control still fetches correctly. Do not treat authorization failure/network outage alone as object absence; ambiguous errors yield needs-review. Signed-link before/after observations must occur inside its known unexpired lifetime, otherwise link expiry is separately classified and is not deletion evidence. Test these branches with fake SDK statuses before implementation. Run both pure/adapter suites GREEN. No actual remove/delete execution in this task.

## Task3: Controlled interruption, reauthorization and honest reporting

**Files:** pure/adapter tests and implementations. Consumes Task1/2 ports. Produces same-process resumable acceptance sequence with conservative crash handling.

- [x] Add RED for an injected interruption immediately after confirmed target-object removal. Expect storage-removed receipt, target Auth still present/control unchanged, no Auth delete call and no success response. Implement a bounded callback hook invoked only at that exact stage.
- [x] Resume within the SAME process, using retained private credentials to establish a fresh actual target Auth session, then verify the same expected mailbox proof/version and exact scope before continuing. Do not reset passwords, manufacture a new requester through admin metadata, replay a stored token or accept a stage file as authorization. A missing/changed mailbox or account stops for review. Add stale/revoked/foreign reauthorization tests with0additional destructive calls.
- [x] Add RED for uncertain transport completion: remove/delete returned a timeout after fake service committed. Implement read-only reconciliation of exact target object/Auth presence, proceed only for established state and live authority; conflict or missing context→needs-review. No automatic mutation retry in catch/finally. Already verified state is idempotent and performs zero mutations.
- [x] A real process crash ends this run. Keep nonsecret stage receipts/new fixtures for review; do not auto-resume in a new invocation. Test forged/stale receipt and lost original baseline/live scope refusal. Controlled same-process failure/resume is the accepted scope; full crash recovery remains a separate gate.
- [x] Test report text distinguishes target-object removal, target Auth/database verification, partial state and independently retained copies. It must state localOnly/actualDenoEdge=false/privileged simulated proof, whether originals/control passed, and retained backups/logs/mail/exports/offline copies UNKNOWN or outside recall. Never report universal deletion or immediate JWT invalidation. Run pure+adapter tests GREEN and checks.

## Task4: Read-only gate, authorized destructive rehearsal and checkpoint

**Files:** acceptance entry, verification document, S02 evidence. Consumes all prior tasks. No product changes.

- [x] Write acceptance entry and fake tests first. Module import and default --dry-run must create/delete0accounts/objects. Unknown flag, caller-supplied ID/path, an existing artifact directory and nonlocal target must fail before mutations. Use a new run UUID and exclusive artifact creation; never overwrite an earlier run. The entry catches all exceptions and outputs only reportResult with a fixed failure category; never print an Error/stack/raw assertion object or permit an unhandled SDK rejection to dump context.
- [x] Run fake suites, syntax checks, then exact read-only command:

```powershell
node scripts/s02-disposable-deletion-local.test.mjs --dry-run
```

  Capture sanitized result only. A dry-run pass establishes capabilities/guards, not deletion. Recheck current Git status and immutable local target before the live command. If current plan review has not explicitly authorized permanent deletion of this fresh target and its exact GIF, stop here; planning/design approval alone is insufficient.
- [x] After concrete plan approval explicitly authorizes this boundary, run ONCE:

```powershell
node scripts/s02-disposable-deletion-local.test.mjs --execute-disposable-target
```

  This creates a fresh target/control, removes only the target GIF through Storage API, pauses at the controlled stage, reauthenticates/checks and resumes, then calls auth.admin.deleteUser(targetId,false). It preserves every fixture existing before the run and retains the new control/file. It cannot accept a target argument or reuse an old run. Standard tool approval review still applies; a rejection must be reported and cannot be bypassed.
- [x] In live pre-removal negative cases, prove missing/foreign/expired/stale requester gates refuse before mutating calls; use injected denied contexts or a separate new target session for expiry with restoration before the successful stage. Do not expire/sign out original sessions or call real delete as a negative test. Check calls with fixed counters; consent/proof setup remains simulated.
- [x] After target removal, verify admin getUserById absence, target Auth identity/session counts0, reviewed owner/indirect rows0, target object absence and control's account/rows/bytes exact. Sign-in with retained target password and refresh with the held original refresh token must fail. Keep raw responses/credentials in RAM, statuses/categories only.
- [x] Hold an issued target access token in RAM and test authoritative getUser, owner_export_snapshot/check, tracker insert and own-path Storage upload after deletion. Require no successful new record/object; inspect trusted scoped counts rather than treating RLS0rows as a mutation. If a prohibited write succeeds, record the failure and preserve that residue for review; do not silently remove it or patch product behavior under this test plan. Sensitive export refusal does not prove every API rejects the JWT, and JWT signature validity is not proof of live identity.
- [x] Compare all originals/control in finally without destructive cleanup; sign out only surviving new control sessions when safe, retain its account/GIF. An unsuccessful setup/removal leaves remaining new fixtures intact and a fixed failure stage. Do not stop retained Docker/mailbox services. No phone/browser permissions, forwarding or settings are touched.
- [x] Record exact commands/results and artifacts, irreversibility, original/control preservation, Storage/API/SQL boundaries, simulated proof, signed-link/cache observations and outstanding client/vendor/drain/authority/font/hosted gates. Reuse only the original authorized read-only reviewer if available; otherwise independent acceptance remains open. Run `git diff --check`; do not repeat unchanged SQL/Edge/mobile suites because this plan changes only test tooling/docs. Product fixes, if found, require separate focused tests/design. No commit/028/later phase.

## Self-review and official evidence

Coverage maps: design boundaries1–3→Task2,4→Task2/preflight plus existing qualified051 evidence,5→Task1/4,6→Task1/2/4,7→Task3,8→Task4,9→Task2/4. All five review-focus cases have named negative tests. No new public deletion service or legal/authority certification is implied.

Rulings: controlled failure/resume is same-process because private credentials and original baselines cannot be persisted safely. A crash stops for review. Live relational fixture coverage adds logical-request/provider-attempt children only; execution-detail detach remains separately qualified historical evidence. These limits must survive the final report rather than being labeled full deletion acceptance.

Sources reread October22: [Admin deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [Storage remove](https://supabase.com/docs/reference/javascript/storage-from-remove), [user management](https://supabase.com/docs/guides/auth/managing-user-data), [sessions](https://supabase.com/docs/guides/auth/sessions), [changelog](https://supabase.com/changelog). Markdown changelog fetch was unsupported by the browser tool; current HTML index was read instead. Hosted TLS deprecation does not change this HTTP loopback test or authorize configuration changes. Installed SDK source controls actual call signatures. Deployed retention/session settings remain UNKNOWN under the accepted evidence limit.

## Execution review

Owner-approved design is the basis for this plan, not authorization to run its irreversible command. Please review this concrete plan and confirm inline execution, including removal of only the freshly created disposable target and its exact synthetic GIF while all retained fixtures/control remain preserved. No implementation delegation is offered. If that boundary is not approved, implement only fake tests/read-only preflight after any separately scoped authorization and leave actual removal acceptance open. S02 remains INCOMPLETE.
## Execution result

Owner explicitly approved inline implementation and scoped permanent removal. One live invocation completed successfully;29focused tests and final read-only preflight passed. See [qualified verification](2026-10-22-s02-disposable-deletion-rehearsal-verification.md). Original data/control remain preserved. Historical planning/approval requirements above explain the execution gate; they are fulfilled for this single run. They do not authorize another destructive run. S02 INCOMPLETE.
