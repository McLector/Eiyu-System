# S02 Owner Export Receiving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, with failing tests first. Preserve the owner's inline execution choice. No implementation delegation or replacement reviewer.

**Goal:** Deliver a locally tested, explicit same-owner account-data export through existing Account/Profile surfaces without identity documents or operator-held export copies.

**Architecture:** A service-only, read-only SQL snapshot uses a fixed field manifest and current Auth session/account/mailbox checks. A separate trusted final check precedes output. The strict export handler never calls AI. Request-scoped client state discards results on every Auth transition; browser download and SDK54 native directory selection receive only an explicitly requested, revalidated export.

**Tech Stack:** Existing Supabase/Postgres17/pgTAP, installed Deno, shared TypeScript, React web and Expo54/RN0.81.5. Directly declare the already installed expo-file-system19.0.24; no expo-sharing, SDK upgrade, paid service or new verification provider.

**Spec:** [owner-approved receiving design](2026-10-22-s02-export-receiving-design.md). Owner approved design for planning, then this concrete plan for inline implementation. Tasks1–3 and Task4 local software are implemented. Actual synthetic Oppo saved-file/schema and exact collision-byte checks passed; isolated browser download/schema and simulated session-invalidation refusal passed. Physical picker-held session/identity and independent acceptance remain INCOMPLETE, so Task4/Task5 full acceptance stays open. Full local SQL now37files/1250assertions; real local Auth/RPC HTTP rehearsal passed with two new retained synthetic fixtures. Read the [qualified receiving checkpoint](2026-10-22-s02-export-receiving-verification.md) before repeating checks. S02 INCOMPLETE.

## Global constraints

- S01 COMPLETE; S02 INCOMPLETE. No028, S03 or S04. No staging, commit, reset, ignored-artifact deletion, deployment, publishing, hosted configuration, external messages, provider contact/inference or spend.
- Retained local project only: `.superpowers/s02-age`, project eiyu-s02-age-demo, API127.0.0.1:57321, database container supabase_db_eiyu-s02-age-demo. Refuse any other target. Preserve all accounts/fixtures/ordinary content and every dirty file. Use before-images in this plan's ignored workspace and the existing approved dirty checkout.
- No IDs, selfies, documents, guardian birthdays or additional identity-verification data. Tokens/session claims stay in RAM and never enter exports, filenames, errors, logs or artifacts. No raw Auth rows/service logs/environment JSON or secret digests.
- This is export receiving only. Existing contact/manual deletion/recovery remain. Do not add account deletion, remove queues or weaken birthday/consent/authority/mailbox/AI rules. Data access does not require AI consent or an adult declaration; current owner/session/mailbox verification governs this disclosure action. Intake/recovery remains accessible when the action is unavailable.
- Hosted AI remains disabled under historical evidence;051 admission stays closed. New export work must not open it, change quotas, add inference, or claim exact hosted parity.
- Use exact SDK54 public APIs. The versioned Expo website redirected to latest on October22; latest docs are not accepted as SDK54 evidence. Use official sdk-54 source docs and installed19.0.24 declarations linked below. No internal API/flag or scaling suppression.
- Export limits:10,000 projected records TOTAL,5MiB final UTF-8 JSON. No truncation or success-labeled partial export. Reject before unbounded JSON aggregation; check final encoded size as well. Network operation budget15seconds; abort is not proof that remote work stopped. User interaction with the picker has no automatic retry; revalidate after selection.
- No durable export files on the server or app-private plaintext cache. Native output goes only to the user's explicitly selected directory. User-chosen saved files/browser downloads are outside remote recall. On a failed native write, remove only the just-created owned file when possible; failed removal must report possible partial-file residue. No blanket directory cleanup or overwrite.
- Complete export is unavailable when owned/path-scoped media objects or pending media-cleanup objects exist. Explain that media needs assisted handling, without returning a partial JSON labeled complete. Media byte export remains a separate gate; do not create signed URLs or delete storage metadata/files in this slice.

## Official references and verified prerequisites

- Current [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data), [sessions](https://supabase.com/docs/guides/auth/sessions), [admin deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser) and [admin sign-out](https://supabase.com/docs/reference/javascript/auth-admin-signout): deleting/signing out does not revoke every outstanding JWT immediately. Validate session_id for this sensitive operation; no managed Auth-table modifications or paid session policy.
- [Postgres17 volatility/snapshots](https://www.postgresql.org/docs/17/xfunc-volatility.html): a read-only STABLE function's SELECTs use the calling statement snapshot. Do not use a VOLATILE multi-query loop and call it a consistent snapshot. Final authorization is a separate fresh statement; later socket delivery cannot be recalled.
- [SDK54 FileSystem docs source](https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/filesystem.mdx), [SDK54 public types](https://raw.githubusercontent.com/expo/expo/sdk-54/packages/expo-file-system/src/ExpoFileSystem.types.ts). Installed19.0.24 exposes Directory.pickDirectoryAsync, createFile and File.write/delete. Existing Expo bundledNativeModules maps filesystem to~19.0.24. Do not use latest SDK58 API signatures.
- Current local catalog:32 owner tables plus8 other public/private base tables. Full-rollback32-table and indirect-request rehearsal passed; neither provides requester verification or delivered-file acceptance. See [checkpoint](2026-10-22-s02-export-deletion-checkpoint.md).
- Required managed Auth session columns id/user_id/not_after were confirmed present by a metadata-only query, with no session values read.052 and036 filenames were confirmed unused at planning time; check again before creating them.

## Files and interfaces

Create canonical `backend/supabase/052_owner_export.sql`, `supabase/tests/036_owner_export.test.sql`, `scripts/fixtures/owner-export-manifest.json`, pure handler/tests/index under `backend/supabase/functions/account-export/`, shared `data/owner-export.ts` and tests, web `web/OwnerExport.tsx`/test and `lib/save-owner-export.ts`/test, mobile `components/eiyu/owner-export.tsx`/test and `lib/save-owner-export.ts`/test. Modify only needed existing AccountShell/account-header slots, existing mobile/web MailboxVerification copy props/tests, shared index, local seed list/marker test, README, mobile package.json/root package-lock and S02 evidence. Check that052/036 names remain unused at execution; never overwrite a new intervening artifact.

New SQL RPCs (service_role EXECUTE only; postgres owner; SECURITY DEFINER; empty search_path):

```sql
public.owner_export_snapshot(p_user_id uuid,p_session_id uuid) returns jsonb
public.owner_export_check(p_user_id uuid,p_session_id uuid,p_mailbox_version integer) returns boolean
```

Snapshot/check are read-only STABLE. The private service guard checks the actual service claim; it is not an AI eligibility check. Verify user exists, session.id/user_id match and session.not_after is null or future, and current mailbox proof/version. No current-session row or mismatched proof fails closed. Snapshot returns only:

```ts
type OwnerExportDocument = {
  schemaVersion: 1;
  generatedAt: string;
  accountId: string;
  account: {
    email: string | null; createdAt: string;
    signup: {
      displayName: string | null; timeZone: string | null; birthDate: string | null;
      ageScreening: { granted: boolean | null; noticeVersion: string | null };
    };
  };
  mailboxVersion: number;
  sections: Record<string, Record<string, unknown>[]>;
  omissions: string[]; // fixed explanations of excluded security/replay fields
};
```

Errors are fixed SQLSTATE categories: EX001 unauthorized/current-session loss; EX002 mailbox proof/revision loss; EX003 schema-manifest mismatch; EX004 size/record bound; EX005 media needs assisted handling. Never put row data in exception text. Missing migration, unexpected errors and malformed results are unavailable, never legacy fallback.

Handler `createOwnerExportHandler(deps)` consumes `authenticate(authorization,signal):Promise<{userId:string;sessionId:string}|null>`, request-bound `createServiceClient(signal)` and existing allowlisted-origin CORS conventions. POST bodies are exactly `{action:'snapshot'}` or `{action:'check',mailboxVersion:positiveInteger}`. Reject additional fields, including owner/session selectors. Authenticate the same token authoritatively before reading its bounded session_id claim; verify subject equals the authenticated user. The client cannot authorize using a decoded/unverified JWT alone. No cookies/query bearer auth.

Shared `beginOwnerExport(userId):Promise<OwnerExportOperation>` produces:

```ts
interface OwnerExportOperation {
  document: OwnerExportDocument;
  current(): boolean;
  confirm(): Promise<void>;
  dispose(): void;
}
```

The operation captures the exact starting bearer/session and a monotonically changing Auth revision, subscribes before async work, and cancels on every subsequent Auth transition (including A→B→A, sign-out and token refresh). Handle INITIAL_SESSION before declaring the operation ready, or fail conservatively and require explicit Retry; never ignore a possible intervening change. confirm uses the original pinned authorization plus current mailbox revision and refuses if that operation is stale. dispose aborts/unsubscribes and makes current false. Nothing persists in query caches, AsyncStorage or localStorage.

## Task1: Manifest and consistent, guarded database snapshot

**Consumes:** current047–051/Auth schema and the manifest appendix. **Produces:**052 and the two RPCs above; no schedule, user-data table or write path.

- [ ] Save before-images, read Supabase/Postgres skills/current docs, inspect managed session column metadata without values. Write036 first. Test service-only ACL, no PUBLIC/anon/authenticated execution, no access to raw Auth tables, current/missing/revoked/foreign session, expired not_after, mailbox pending/change, restricted/under12/unknown owners and no AI-consent prerequisite. Use ephemeral rollback-only fixtures, not permanent deletion or actual inference.
- [ ] Add explicit projection/manifest tests: all32 owner tables classified; indirect attempts/details joined only through the owner's logical requests; all8 other tables classified; every live column is either exported or explicitly excluded. A new table/column, renamed owner column or foreign-key dependency fails EX003 until reviewed. No `select *`/to_jsonb(whole private row) export. Nested replay blobs are omitted, not recursively trusted. Test omitted challenge/review-reference/receipt fields and no other-owner sentinel in serialized output. Project bigint identifiers, including processing event IDs, as decimal strings before JSON serialization; test an ID above JavaScript's safe-integer range so export cannot silently round it.
- [ ] Example tests must execute real RPCs, not a test-only projection:

```sql
select throws_ok($$select public.owner_export_snapshot(null,null)$$,
 'EX001',null,'missing verified owner/session denied');
select ok(not has_function_privilege('authenticated',
 'public.owner_export_snapshot(uuid,uuid)','EXECUTE'),'client cannot pick an owner');
-- Fixture-specific assertions require actual nonempty owner and foreign rows.
```

- [ ] Run036 RED through this plan's guarded Docker/psql runner, with ON_ERROR_STOP,15s statement/3s lock bounds and exact TAP-plan matching. Expected: missing052 functions/failed new boundary assertions, no raw error/row output. Keep this plan's runner/artifacts under `.superpowers/sdd/2026-10-22-s02-export-receiving-implementation/`; do not modify another plan's allowlist/workspace.
- [ ] Implement052 with fixed manifest metadata, quoted identifiers from that constant manifest only and parameterized owner IDs. Use a STABLE read-only snapshot. Count bounded projected rows and projected UTF-8 bytes before jsonb_agg; do not first allocate an unlimited whole export then check it. Reject total>10,000 and final JSON>5MiB; test exact-boundary/one-over, including multibyte text and wrapping overhead. Global tables never join through guessed user data. Check storage objects by both owner_id and reviewed user-path prefix, plus target cleanup rows and non-null gym_exercises.media_path references; any matching object/cleanup/media reference rejects EX005, including a dangling reference whose file cannot be found. No Storage API/object mutation.
- [ ] Test one-statement snapshot consistency against a separate dblink writer with deterministic barriers, plus fresh separate check after session/proof loss. Do not lock across HTTP. Test media owner/path/cleanup refusal and another owner's media isolation. Full rollback restores every fixture and control/epoch state. Run036 GREEN and lint error gate; do not fix unrelated inherited warnings. Add052 marker/local seed list without resetting the retained stack. Apply only locally with target/closed-state guards; reconstruct new objects inside rollback for owner/grant parity.

## Task2: Strict export handler and trusted runtime entry

**Files:** `backend/supabase/functions/account-export/{export-core.ts,export-core_test.ts,index.ts}`. **Consumes:**052 RPC contract. **Produces:** a local-only function with no AI/provider imports or service credentials in responses.

- [ ] Write pure-handler RED tests with injected Auth/RPC clients and a deny-all external fetch. Include missing/invalid bearer, malformed/mismatched session claim, oversized/non-JSON body, additional owner selector, unsupported method, disallowed browser origin, no Origin native request, fixed SQLSTATE mapping, unexpected backend body, and absent052.

```ts
Deno.test('foreign owner selector performs no privileged read', async () => {
  const trace: string[] = [];
  const handler = createOwnerExportHandler({
    authenticate:async()=>null,
    createServiceClient:()=>({rpc:async()=>{
      trace.push('snapshot'); return {data:null,error:null};
    }}),
    corsHeaders:()=>({}),
  });
  const response = await handler(new Request('http://local/export', {
    method:'POST', headers:{Authorization:'Bearer synthetic-token','Content-Type':'application/json'},
    body:JSON.stringify({action:'snapshot',userId:'foreign-owner'}),
  }));
  if (response.status !== 400 || trace.includes('snapshot')) throw Error('selector accepted');
});
```

- [ ] Run installed Deno with `test --no-config --no-lock --node-modules-dir=none` on the new test. Expected RED missing handler or new semantic assertion. Then implement a≤1KiB request-body limit,15s abort budget, authoritative Auth adapter, exact contract parsing and snapshot→fresh-check order. snapshot success never returns before fresh session/mailbox confirmation; a lost/error/false/malformed check denies output. Preserve fixed EX001401, EX002403, EX003503, EX004413, EX005409 categories and generic503 unknown errors; do not surface raw errors.
- [ ] Set `Cache-Control: private, no-store`, `Pragma: no-cache`, `Content-Type: application/json`, `X-Content-Type-Options: nosniff`; no sensitive Content-Disposition name or content log. Reject disallowed browser Origins before Auth/SQL; reuse inspected current local/known candidate origins, and keep final hosted origin parity open. A held snapshot followed by revocation, client abort or proof revision change must release no export. `{action:'check'}` returns only fixed acknowledgment and current expected version.
- [ ] Runtime index uses the existing pinned Supabase JSR version2.112.4 and request-bound clients. Retain JWT verification for any eventual serving/deploy configuration. No local serving-copy overwrite of another function, deployment or automatic function start. Run new tests GREEN and cached-only entry typecheck with the existing host cache; missing cache is a reported tooling gate, not permission to upgrade dependencies.

## Task3: Pinned shared-client export operation

**Files:** `packages/shared/src/data/owner-export.ts`, `data/__tests__/owner-export.test.ts`, shared index. **Consumes:** exact handler protocol. **Produces:** OwnerExportDocument and beginOwnerExport defined above.

- [ ] Write RED tests for0 calls before an explicit action; identity pinned across token lookup/invoke; Auth-event cancellation including A→B→A; revision loss before final confirm; mailbox changes; dispose/unmount; invalid envelope/accountId; >5MiB body; check failure; and no provider/cache/storage call. Wrong account must not observe the document or retain a deliverable operation.

```ts
it('never confirms an old operation after A→B→A', async () => {
  const operation = await beginOwnerExport('owner-a');
  emitAuth('owner-b'); emitAuth('owner-a');
  await expect(operation.confirm()).rejects.toThrow();
  expect(operation.current()).toBe(false);
});
```

- [ ] Run `npm test --workspace @eiyu/shared -- --runInBand src/data/__tests__/owner-export.test.ts`. Expected RED missing implementation/new semantic failures. Implement request-local AbortController, bounded parsing, fixed user-facing errors, current owner/session validation and synchronous Auth-event invalidation; do not await other Auth methods inside an Auth-event callback. Pass an export-specific message to existing owner-authorization helpers, never adult-only AI wording. Missing server capability is unavailable; no direct client table/admin fallback.
- [ ] Run GREEN plus affected mailbox/authorization tests. The server remains authoritative even if client cancellation is delayed. Dispose every failed/completed operation and subscription. No automatic retry or storing bearer/documents for restart recovery. No source/classification change to existing AI and under12 contracts.

## Task4: Explicit browser/native receiving in existing account surfaces

**Consumes:** OwnerExportOperation. **Produces:** web OwnerExport and native OwnerExport controls plus platform save adapters. Use AccountShell/profile slot and existing mobile account-header/ProfileSheet; no separate account system or navigation rewrite.

- [ ] Web tests first: explicit click only; pending duplicate-click protection; confirm/current check before download; held Auth/proof change; failure leaves no anchor/Blob URL; cancel/unmount; object URL revoked after browser handoff; generic filename `eiyu-account-export.json`. Add a second explicit Save action if browser activation is lost after async work. Never claim that anchor click proves the browser finished writing a file.
- [ ] Run `npm test --workspace @eiyu/web -- src/web/__tests__/OwnerExport.test.tsx src/lib/__tests__/save-owner-export.test.ts`. Expected RED missing controls/adapter. Implement a JSON Blob, temporary object URL and explicit download handoff; no export in query/localStorage caches. Revoke URLs on success/failure/dispose using a tested browser-safe handoff lifetime. Status text distinguishes “download started” from “file saved”. Copy explains user-controlled copies and the existing contact/manual deletion path.
- [ ] Native tests first: confirm directory selection is explicit; canceled picker writes0files; account/proof changes while picker open write0files; failed write removes only the newly created file when possible; removal failure reports possible residue; existing destination never overwritten; unsupported API shows unavailable/contact. No private-cache staging, broad storage access or expo-sharing fallback.

```ts
// Public SDK54 APIs; execution adapter must check operation.current around every await.
const directory = await Directory.pickDirectoryAsync();
await operation.confirm();
if (!operation.current()) throw new Error('Export request changed. Try again.');
// Create only after successful revalidation and explicit user directory choice.
const file = directory.createFile('eiyu-account-export.json','application/json');
file.write(JSON.stringify(operation.document));
```

- [ ] Run `npm test --workspace @eiyu/mobile -- --runInBand components/__tests__/owner-export.test.tsx lib/__tests__/save-owner-export.test.ts`. Expected RED missing behavior. Implement only public FileSystem19.0.24 APIs. Declare the already installed version directly: `npm install --workspace @eiyu/mobile --save-exact expo-file-system@19.0.24 --ignore-scripts --offline`. Inspect lock diff; preserve other versions. If offline metadata is unavailable, inspect the existing cache and use the same pinned package with authorized normal dependency resolution, never upgrade Expo or install expo-sharing by assumption.
- [ ] Verify destination behavior rather than assume createFile is collision-safe on every document provider. Keep the operation active until owned-write completion/cleanup. Failure before file creation writes nothing; failure afterward may leave a partial selected-file copy if cleanup fails. Never delete preexisting files or use recursive cleanup. OS/user-held copies cannot be recalled after successful save. Directory selection/cancel capability on exact Oppo build is an acceptance condition, not a unit-test claim. Unavailable iOS device/build remains unverified.
- [ ] Integrate Profile controls without disturbing unsaved profile drafts, existing consent/mailbox controls or route recovery. Reuse existing `mobile/components/status/mailbox-verification.tsx` and `web/src/web/MailboxVerification.tsx`. Add only optional `purpose?:'weekly-debrief'|'account-export'`, defaulting to weekly-debrief; account-export copy says verification is for the data download, while default behavior/copy remains covered by existing tests. Verification completion never automatically starts an export; require an explicit Retry/download action. An unavailable export offers verification/contact access without asking for AI consent or an adult declaration. Preserve font scaling and existing font-repair gate. Run focused tests GREEN, affected Account/Profile/mailbox regressions and TypeScript; disclose inherited diagnostics separately.

## Task5: Guarded acceptance, field audit and exact checkpoint

**Files:** `scripts/s02-owner-export-local.test.mjs`, SQL052/036, affected README/continuation/release/retention/device evidence. **Consumes:** Tasks1–4. **Produces:** qualified local receiving evidence; never a full deletion/release certificate.

- [ ] Write the guarded acceptance test first: exact local project/API/container, synthetic-only owners, credentials/tokens RAM-only, denied provider fetch, bounded outputs limited to case/result categories. Create new retained synthetic Auth fixtures only if current ones cannot cover the case safely. Do not reuse unknown passwords, send mail without a scoped need or permanently delete any retained fixture. Real Auth must establish requester/session identity; admin email confirmation alone is not mailbox proof, so fixture proof must be labeled simulated privileged setup.
- [ ] Test actual local HTTP handler+real Auth/RPC: missing/stale/foreign sessions, body owner selector refused before privileged access, successful subject-only nonempty text export, mailbox change during held snapshot, sign-out followed by final-check refusal, original ordinary histories/queues unchanged and no AI call. Distinguish a Node bridge from actual Deno Edge serving. Use the existing retained stack without reset or source-copy assumptions. Store no exported payload, token, raw Auth response or server error.
- [ ] After final backend changes, run full SQL suite with exact TAP matching, lint error gate,052 rollback reconstruction/owner/grant check and new/full relevant Edge suites once. Expected: no new failures; inherited reserve_weekly_summary_regen warning remains separately disclosed. Run targeted shared/web/mobile tests and TypeScript after their final changes; broaden only for justified cross-cutting impact. Run `git diff --check`.
- [ ] Run browser receiving with synthetic data on exact local origin; inspect download filename/content only through sanitized comparisons, not printed payloads. Native acceptance must use a reviewed Dev candidate with FileSystem capability verified, before-image APK/artifact preservation and no production install/data clearing. Detached builds only if a new binary is actually required. A directory picker may need owner interaction; ask only when that concrete action is ready. Preserve any user-chosen synthetic export artifact under the owner's selected location; do not delete it as routine cleanup. Record physical pass only after actual saved-file/schema comparison, cancellation and held-identity rejection.
- [ ] Review exported field manifest against the approved appendix, private security omissions and every32+8 catalog entry. Record bounds/media rejection as incomplete assisted cases, never successful full fulfillment. No actual support email, real-user export or deletion. Keep Auth API deletion/storage-byte cleanup/token expiry/client-copy/authority/vendor/old-client/font/hosted parity gates explicitly open.
- [ ] Update the S02 checkpoint with exact commands/results, fixture preservation, native/web capability, secret-free artifacts, unanswered deployed facts and independent review availability. Reuse only the original authorized read-only reviewer if available; otherwise report independent acceptance open. Preserve ignored workspace/before-images. No commit,028 or later phase.

## Review focus and self-review

1. A→B→A or same-owner reauthentication during picker/network work must not deliver an earlier operation; Tasks2–4 explicitly test monotonic Auth revision and current server session.
2. New/renamed schema fields or indirect owner relationships must not silently leak or vanish; Task1 tests exact table/column classification and foreign dependency drift.
3. Large multibyte data or one oversized record must fail before unlimited aggregation and never download a truncated success; Tasks1–3 test row/byte bounds and JSON framing overhead.
4. User-selected directory providers may overwrite, cancel, fail mid-write or retain a partial file; Task4 tests owned-file semantics and requires actual provider verification before acceptance.
5. Media cleanup/orphan objects, revoked sessions and later socket delivery can invalidate overbroad completion claims; Tasks1/2/5 test refusal and preserve explicit residual limitations.

Self-review separated AI permission from data access, replaced snapshot loops with STABLE read-only semantics, added session_id revocation checks, made media-containing accounts fail rather than receive a misleading partial export, and selected existing SDK54 directory APIs to avoid assuming expo-sharing/new SDK support. The field appendix classifies every observed column and avoids opaque replay JSON/admin review references. Saved-file receipts do not prove global deletion. No implementation test or receiving pass is claimed by this plan.

Preserve inline execution. Ask the owner to review this concrete plan before code; do not ask again to choose delegation. Plan approval authorizes local implementation only, not deployment, real fulfillment or permanent deletion.

## Explicit field manifest

The following appendix lists exact current columns. `export` is the user-facing projection; `exclude` is intentional security/replay minimization, not a wildcard. Keep omission explanations in the document. Any changed column/table requires review. Direct owner fields belong only to the verified account; no unreviewed nested JSON replay payload is serialized.

```json
[
  {
    "table": "private.account_age",
    "export": [
      "user_id",
      "birth_date",
      "pending_birth_date",
      "version"
    ],
    "exclude": []
  },
  {
    "table": "private.ai_logical_requests",
    "export": [
      "request_id",
      "user_id",
      "action",
      "request_class",
      "account_date",
      "week_start",
      "attempt_count",
      "created_at",
      "refunded_at",
      "age_version",
      "mailbox_version",
      "consent_version",
      "authority_version"
    ],
    "exclude": []
  },
  {
    "table": "private.ai_pending_weekly_regenerations",
    "export": [
      "user_id",
      "week_start",
      "account_date",
      "created_at",
      "expires_at",
      "consumed_at",
      "request_id"
    ],
    "exclude": [
      "reservation_id"
    ]
  },
  {
    "table": "private.ai_user_daily_usage",
    "export": [
      "user_id",
      "usage_date",
      "action",
      "request_count"
    ],
    "exclude": []
  },
  {
    "table": "private.long_quest_definition_receipts",
    "export": [
      "user_id",
      "request_id",
      "quest_id"
    ],
    "exclude": [
      "input"
    ]
  },
  {
    "table": "private.long_quest_reward_receipts",
    "export": [
      "user_id",
      "request_id",
      "stage_id",
      "done"
    ],
    "exclude": [
      "receipt"
    ]
  },
  {
    "table": "private.mailbox_state",
    "export": [
      "user_id",
      "version",
      "verified_version",
      "verified_at"
    ],
    "exclude": [
      "challenge_id",
      "challenge_version",
      "challenge_expires_at",
      "challenge_ready",
      "challenge_attempted",
      "last_sent_at",
      "window_started_at",
      "sends",
      "attempts"
    ]
  },
  {
    "table": "private.processing_authority",
    "export": [
      "user_id",
      "state",
      "purposes",
      "age_version",
      "version",
      "changed_at"
    ],
    "exclude": [
      "review_reference"
    ]
  },
  {
    "table": "private.processing_authority_events",
    "export": [
      "id",
      "user_id",
      "state",
      "purposes",
      "age_version",
      "version",
      "changed_at"
    ],
    "exclude": [
      "review_reference"
    ]
  },
  {
    "table": "private.processing_consent",
    "export": [
      "user_id",
      "age_granted",
      "age_notice",
      "ai_granted",
      "ai_notice",
      "version",
      "changed_at"
    ],
    "exclude": []
  },
  {
    "table": "private.processing_consent_events",
    "export": [
      "id",
      "user_id",
      "purpose",
      "granted",
      "notice_version",
      "version",
      "changed_at"
    ],
    "exclude": []
  },
  {
    "table": "public.deleted_habit_history",
    "export": [
      "id",
      "user_id",
      "source_habit_id",
      "historical_date",
      "habit_name",
      "stat",
      "quest_type",
      "scheduled",
      "completion_kind",
      "xp_awarded",
      "time_zone",
      "day_ends_at",
      "created_at"
    ],
    "exclude": []
  },
  {
    "table": "public.gym_entries",
    "export": [
      "id",
      "session_id",
      "user_id",
      "exercise_id",
      "position",
      "prescription",
      "weight"
    ],
    "exclude": []
  },
  {
    "table": "public.gym_exercises",
    "export": [
      "id",
      "routine_id",
      "user_id",
      "name",
      "position",
      "sets",
      "reps",
      "rest_seconds",
      "rir",
      "notes",
      "media_path",
      "media_mime",
      "rir_max"
    ],
    "exclude": []
  },
  {
    "table": "public.gym_media_cleanup",
    "export": [
      "user_id",
      "path",
      "created_at"
    ],
    "exclude": []
  },
  {
    "table": "public.gym_routines",
    "export": [
      "id",
      "user_id",
      "name",
      "unit",
      "archived",
      "created_at",
      "deleted_at"
    ],
    "exclude": []
  },
  {
    "table": "public.gym_sessions",
    "export": [
      "id",
      "routine_id",
      "user_id",
      "routine_name",
      "unit",
      "status",
      "created_at",
      "completed_at"
    ],
    "exclude": []
  },
  {
    "table": "public.habit_archive_intervals",
    "export": [
      "id",
      "habit_id",
      "user_id",
      "archived_from",
      "restored_on",
      "created_at"
    ],
    "exclude": []
  },
  {
    "table": "public.habit_completions",
    "export": [
      "id",
      "user_id",
      "habit_id",
      "completed_on",
      "kind",
      "xp_awarded",
      "created_at"
    ],
    "exclude": []
  },
  {
    "table": "public.habit_occurrences",
    "export": [
      "habit_id",
      "user_id",
      "occurrence_date",
      "created_at",
      "time_zone",
      "day_ends_at"
    ],
    "exclude": []
  },
  {
    "table": "public.habit_progress",
    "export": [
      "id",
      "user_id",
      "habit_id",
      "progress_date",
      "progress_count"
    ],
    "exclude": []
  },
  {
    "table": "public.habit_recovery_windows",
    "export": [
      "id",
      "habit_id",
      "user_id",
      "missed_on",
      "preserved_streak",
      "opened_at",
      "deadline_at",
      "status",
      "resolved_at",
      "created_at"
    ],
    "exclude": []
  },
  {
    "table": "public.habit_schedule_versions",
    "export": [
      "habit_id",
      "user_id",
      "effective_from",
      "days",
      "created_at"
    ],
    "exclude": []
  },
  {
    "table": "public.habits",
    "export": [
      "id",
      "user_id",
      "name",
      "easy_version",
      "stat",
      "difficulty",
      "reminder_time",
      "days",
      "archived",
      "created_at",
      "updated_at",
      "quest_type",
      "description",
      "scheduled_date",
      "target_count",
      "schedule_start_on",
      "genre",
      "time_set",
      "position"
    ],
    "exclude": []
  },
  {
    "table": "public.long_quest_rewards",
    "export": [
      "user_id",
      "quest_id",
      "reward_key",
      "kind",
      "stat",
      "amount",
      "active",
      "legacy_exempt"
    ],
    "exclude": []
  },
  {
    "table": "public.long_quest_stages",
    "export": [
      "id",
      "long_quest_id",
      "user_id",
      "name",
      "position",
      "done",
      "description"
    ],
    "exclude": []
  },
  {
    "table": "public.long_quests",
    "export": [
      "id",
      "user_id",
      "name",
      "stat",
      "deadline",
      "created_at",
      "description",
      "completed_at",
      "strict_order",
      "position"
    ],
    "exclude": []
  },
  {
    "table": "public.profiles",
    "export": [
      "user_id",
      "display_name",
      "user_class",
      "target_role",
      "theme",
      "created_at",
      "updated_at",
      "time_zone",
      "time_zone_changed_at",
      "palette"
    ],
    "exclude": []
  },
  {
    "table": "public.stats",
    "export": [
      "user_id",
      "stat",
      "xp",
      "updated_at"
    ],
    "exclude": []
  },
  {
    "table": "public.streaks",
    "export": [
      "habit_id",
      "user_id",
      "best",
      "updated_at",
      "current_streak",
      "recovery_armed",
      "last_processed_on",
      "active_recovery_id"
    ],
    "exclude": []
  },
  {
    "table": "public.weekly_quests",
    "export": [
      "id",
      "user_id",
      "week_start",
      "stat",
      "target_count",
      "current_count",
      "created_at"
    ],
    "exclude": []
  },
  {
    "table": "public.weekly_summaries",
    "export": [
      "id",
      "user_id",
      "week_start",
      "summary",
      "created_at",
      "regenerate_count",
      "last_regenerated_date",
      "age_version",
      "mailbox_version",
      "consent_version",
      "authority_version"
    ],
    "exclude": []
  }
]
```

Indirect sections are explicitly joined to private.ai_logical_requests.user_id:

```json
[
 {"table":"private.ai_provider_attempts","export":["request_id","attempt_number","usage_date","created_at"],"exclude":[]},
 {"table":"private.ai_execution_details","export":["request_id","contract_version","state","created_at","settled_at"],"exclude":["execution_id","epoch","authorized_attempt_mask"]}
]
```

Excluded global tables, with all their columns classified as not subject-scoped: private.ai_admission_control, private.ai_execution_epochs, private.ai_provider_daily_usage, private.ai_provider_exhaustion, private.ai_quota_config, private.backlog_rollover_settings. Do not export account-unlinked unresolved counts as if they identify the requesting account.

Auth projection is separately fixed: account id/email/created_at and the known signup metadata display_name/time_zone/birth_date/processing_consent.age_screening.granted/notice_version only. No raw metadata object. Known Auth-added metadata email/email_verified/phone_verified/sub are technical duplicates and excluded; unknown metadata keys or unexpected nested shapes require assisted review (EX003), not silent omission. Current account/session verification never trusts this user-editable metadata. Never select Auth password, token, identity-secret or raw session columns into an export. Auth schema is managed: check existence of required explicit columns, without making ordinary addition of unrelated managed Auth columns a user-schema drift failure. The32+8 public/private schema manifest remains exact.

Global exclusions are exact column sets (a new column still requires review):
```json
[
  {
    "table_name": "ai_admission_control",
    "excluded_columns": [
      "singleton",
      "is_open",
      "epoch",
      "updated_at",
      "last_pruned_at"
    ]
  },
  {
    "table_name": "ai_execution_epochs",
    "excluded_columns": [
      "epoch",
      "opened_at",
      "closed_at",
      "outstanding_count",
      "uncertain_count"
    ]
  },
  {
    "table_name": "ai_provider_daily_usage",
    "excluded_columns": [
      "usage_date",
      "attempt_count"
    ]
  },
  {
    "table_name": "ai_provider_exhaustion",
    "excluded_columns": [
      "provider",
      "exhausted_until",
      "updated_at"
    ]
  },
  {
    "table_name": "ai_quota_config",
    "excluded_columns": [
      "singleton",
      "max_provider_attempts",
      "max_user_requests_per_action"
    ]
  },
  {
    "table_name": "backlog_rollover_settings",
    "excluded_columns": [
      "singleton",
      "cutover"
    ]
  }
]
```
