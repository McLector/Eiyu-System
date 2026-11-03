# S02 minimal-data debrief eligibility implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The owner has already required inline implementation; no implementation delegation or replacement reviewer is authorized. Steps use checkbox syntax for tracking.

**Goal:** Replace the blanket adult-only debrief boundary with reviewed age12+/purpose-consent/conditional-authority access across the existing server and clients, without collecting sensitive verification evidence.

**Architecture:** Keep the existing Auth accounts, private birthday/mailbox revisions, quota ledgers and web/mobile screens. Introduce one owner-bound, versioned processing-access contract and purpose records; use it consistently at all generation, persistence and display boundaries. Keep hosted inference paused throughout local implementation and acceptance.

**Tech stack:** Supabase Postgres/Auth/Edge Functions, TypeScript shared library, React/Vite web, ExpoSDK54/React Native mobile, pgTAP/dblink, Jest, Vitest and Deno fake-provider tests.

**Execution approval:** owner said “proceed” after reviewing this plan on October20. Inline execution is authorized; no implementation delegation or broader deployment permission. Current task evidence/rulings are retained in the plan-specific ignored progress ledger and the continuation checkpoint.

**Spec:** [approved eligibility design](2026-10-20-s02-minimal-data-eligibility-design.md), read together with the [existing notice design](2026-10-20-s02-notice-consent-design.md). The focused eligibility revision is approved for planning; this plan awaits review. It does not declare the broader sensitive-tracker decline/withdrawal design complete.

## Global constraints

- Continue ONLY S02; S01 investigation COMPLETE; S02 INCOMPLETE until every gate passes. No028 while incomplete; no S03/S04.
- No IDs, documents, selfies, biometrics, payment checks, guardian birthdays, addresses, school records or new sensitive verification questions. No collection through support as a substitute.
- Trust initial/corrected birthdays; preserve histories, ordinary mailbox-independent quests and adopted under12 write-pause/explicit-Retry/original-date behavior.
- Keep `adultDeclared` truthful; it continues to mean18+. Do not silently reinterpret old RPC fields, exported helpers or private function names to mean12+.
- No routine guardian check solely because an account is under18. Do not infer capacity or authority from a checkbox, age threshold, metadata or OTP. Actual applicable authority determinations remain operating evidence, not client claims.
- Direct Groq Free `openai/gpt-oss-20b`, global ZDR, no training permission, $0/no paid upgrade/no other-provider fallback. Gemini implementation retained but unselectable through the release factory.
- Hosted ai-proxy v26 remains paused. This plan authorizes no production settings, deployment, publishing, provider contact or real inference. Preserve all dirty files, numbered handoffs and ignored artifacts; do not stage/commit automatically.
- Read current official Supabase topic docs before backend/Auth implementation and exact ExpoSDK54 docs before mobile changes. Use supported public APIs; no internal flags, font-scaling suppression or assumed SDK upgrade.

## Review focus

1. An old client or old server lacks consent fields: deny new inference rather than accepting missing data; Task1/3 test this.
2. A consent decision changes while a provider response is held: stop old output and avoid a duplicate quota refund; Task2/3 test this with real locking and fake transport.
3. A teen's declaration is corrected to adult: preserve history but never invent missing consent/authority; Task1/2/4 test this.
4. An authority request arrives from the wrong account or only one mailbox: never grant or expose history; Task5 rehearses this.
5. A queued action and unrelated Auth/widget data coexist with AI cache cleanup: preserve all ordinary state; Task3/4 test this. Cache retirement beyond touched current-client state remains its separately recorded S02 gate.

## Execution safety and verification commands

Use the retained disposable project `.superpowers/s02-age`, not the default reset/verify wrapper. `scripts/local-db.ps1 verify` includes a reset and must not be used on retained fixtures. Confirm the retained project identity/loopback endpoints in RAM before writes. Capture CLI status only in RAM; emit no keys or raw environment JSON.

Discover installed CLI options before use. Apply a new canonical numbered SQL draft only to the retained disposable database after its RED tests. Check that050 and031/032 are unused immediately before creating their files; if occupied, choose the next unused number and update this plan's links. Never overwrite an existing numbered artifact. Use the repository's canonical `backend/supabase` numbering convention; do not assume `db push` applies it.

Affected test commands, run from repository root:

```powershell
npm test --workspace @eiyu/shared -- --runInBand data/__tests__/processing-access.test.ts
npm test --workspace @eiyu/web -- src/web/__tests__/DebriefConsent.test.tsx
npm test --workspace @eiyu/mobile -- --runInBand components/__tests__/debrief-consent.test.tsx
```

For SQL, use the installed CLI `test db` with the explicit retained workdir and specific031/032 test file, after checking `test db --help`; use the same workdir for the full local suite and lint. Do not print connection credentials. Deno executable discovered and version-checked during the cutover is `C:/Users/morad/AppData/Local/npm-cache/_npx/76f887347d91547a/node_modules/deno/deno.exe`; verify it still exists before use:

```powershell
& 'C:/Users/morad/AppData/Local/npm-cache/_npx/76f887347d91547a/node_modules/deno/deno.exe' test --no-config --no-lock --node-modules-dir=none backend/supabase/functions/ai-proxy/ backend/supabase/functions/mailbox-verification/
```

## Task1: Typed current-owner processing access and explicit denial states

**Files:** create `packages/shared/src/data/processing-access.ts` and `packages/shared/src/data/__tests__/processing-access.test.ts`; extend `packages/shared/src/index.ts` exports and `packages/shared/src/types/database.ts`. Preserve the existing account-age module and its helper semantics.

**Interfaces:** `ProcessingAccess` contains `contractVersion:1`, `userId`, `ageVersion`, `consentVersion`, `authorityVersion`, `mailboxVersion` (all safe nonnegative integers), `ageEligible`, `canReadDebrief`, `canGenerateDebrief`, `authorityState:'not-required'|'pending'|'approved'|'revoked'`, and separate purpose booleans `ageConsent`/`aiConsent`. `fetchProcessingAccess():Promise<ProcessingAccess>` calls `get_processing_access` with no supplied owner. `requireDebriefAccess(kind:'read'|'generate', expected?:ProcessingAccess):Promise<ProcessingAccess>` validates the owner and every captured revision. `setProcessingConsent(purpose:'age-screening'|'weekly-debrief', granted:boolean, noticeVersion:string, expected:ProcessingAccess):Promise<ProcessingAccess>` calls the purpose RPC with the expected owner/revisions; never grants authority. `subscribeProcessingAccessChanges(listener:()=>void):()=>void` signals current-client invalidation after accepted mutations only. Export candidate notice constants `AGE_NOTICE_VERSION='2026-10-20-age-v1'` and `AI_NOTICE_VERSION='2026-10-20-weekly-debrief-v1'` with the shared copy; do not publish these until the copy and matching implementation pass review.

- [ ] Write parser/guard RED tests before the module. Cover every missing field, integer overflow/negative revisions, unknown enum/version, wrong owner, RPC failure and missing old-server capability. Pin adult birthday correction without AI consent to generation=false.

```typescript
it('does not turn an older age response into consent', async () => {
  rpc.mockResolvedValue({data: {userId: 'owner', adultDeclared: true, version: 2}, error: null});
  await expect(requireDebriefAccess('generate')).rejects.toThrow();
});
```

- [ ] Run the focused shared command; require behavioral failures, not a test import/setup error alone. Add a minimal export stub only if necessary to reach the assertions, with no acceptance defaults.
- [ ] Implement strict parsing, explicit read/generate checks, all-revision comparison and notification only after success. Send expected owner/revisions in consent mutations. Do not parse raw Auth metadata or calculate permission locally from a birthday.
- [ ] Run focused tests plus existing account-age/mailbox/weekly-summary tests. Record actual results; no implementation claim from a diff.

## Task2: Private consent/authority records and authoritative SQL boundaries

**Files:** create `backend/supabase/050_processing_access.sql`, `supabase/tests/031_processing_access.test.sql`, `supabase/tests/032_processing_access_concurrency.test.sql`; extend database RPC types from Task1. Read canonical047–049 and the actual current function definitions first; preserve earlier drafts and their history.

**Interfaces:** `public.get_processing_access()` returns Task1's exact contract for `auth.uid()`. `public.set_processing_consent(p_purpose text,p_granted boolean,p_notice_version text,p_expected_user_id uuid,p_expected_age_version integer,p_expected_consent_version integer,p_expected_authority_version integer,p_expected_mailbox_version integer)` returns the same contract. Separate private current purpose state and minimal grant/withdrawal events from server-controlled authority decisions. No authenticated role receives direct write permission to authority records. A trusted operator procedure must bind an actual reviewed decision to owner/purpose/revisions; it cannot be synthesized by the consent RPC. `canReadDebrief` requires current eligible age, age-purpose consent, applicable authority and current-mailbox proof; `canGenerateDebrief` additionally requires the current AI-purpose grant. Withdrawing AI generation permission does not itself request deletion or remove otherwise permitted access to previously saved content; unresolved/withdrawn age-purpose or applicable authority still denies protected debrief access.

- [ ] Write pgTAP RED cases using synthetic users: unknown, accepted under12, age12/17/18 boundaries in Asia/Manila, pending correction, all missing/withdrawn/stale grants, old Terms-only accounts, wrong owner, forged metadata and direct authority writes. The teen positive fixture explicitly supplies a synthetic reviewed authority disposition; it is not evidence for a real user's capacity.

```sql
select ok(not (public.get_processing_access()->>'canGenerateDebrief')::boolean,
  'an accepted birthday alone does not create AI consent');
```

- [ ] Run those tests against retained049 before implementation and capture only sanitized assertion results. Add no migrations to production and reset no fixtures.
- [ ] Implement the canonical transactional draft. Lock existing account/declaration state in a documented consistent order. Privilege checks must use the real current database role, not a spoofable text claim alone. Apply explicit grants/revokes and owner predicates; no public authority-approval RPC. Notice versions are an allowlist tied to reviewed copy, not arbitrary accepted strings. No automatic consent backfill. Retention of minimal audit/contact records must remain bounded by the reviewed operating policy; do not introduce an indefinite default or claim expiry is erasure.
- [ ] Keep actual authority applicability unresolved where evidence is unresolved. `not-required` must represent a recorded reviewed operating determination, not a client-editable self-capacity assertion. Do not create a rule requiring all teens to produce guardian evidence; do not silently classify all teens as capable either. Synthetic fixtures can exercise every branch while actual activation remains gated on that operating determination.
- [ ] Replace adult-only checks in both outer and retained private wrapper layers for `ai_begin_request`, `ai_reserve_next_attempt`, final authorization and `reserve_weekly_summary_regen`. Ensure a nested `_before_age`/`_before_mailbox` adult guard does not continue denying the approved teen branch. Preserve adult fact functions separately. Replace `weekly_summary_age_gate` deliberately with equivalent owner-safe read/write processing checks; retain mailbox policy and owner RLS. Differentiate read from generation consent according to the reviewed saved-history contract; do not erase rows on withdrawal.
- [ ] Capture `consent_version` and `authority_version` in the existing logical request ledger alongside birthday/mailbox revisions. Missing versions on old in-flight requests deny release/retry. Reused request IDs cannot acquire a new grant. Keep refunds/provider attempt accounting unchanged. Use the same serialized current-state check at request reservation, every retry and final output/save.
- [ ] Add nullable historical provenance columns `age_version`, `mailbox_version`, `consent_version`, `authority_version` to `public.weekly_summaries`. Preserve old rows without fabricating grants. New inserts/updates must supply the captured versions and pass a trigger comparing them with current server state under the same owner lock; stale or missing write provenance is denied even if permission was withdrawn and later regranted. Existing otherwise eligible read access is not denied merely because a historical row lacks provenance. Shared save payloads in Task3 must supply these exact field names; do not accept a fresh current version as a replacement for the request's captured versions.
- [ ] Add dblink RED/GREEN tests that hold a generation authorization and race withdrawal/correction/authority revocation, assert observed database lock waits and the eventual deny result. Roll back synthetic changes and disconnect both sessions in cleanup. Repeat 029/030 as targeted regression for under12/queue-related locking.
- [ ] Apply/test the exact draft only locally, then full retained SQL suite and lint. Reconstruct048/049 prerequisite application in a transaction and roll it back to qualify canonical ordering. Preserve every retained fixture/history row.

## Task3: Edge and shared request/output/cache integration

**Files:** modify `backend/supabase/functions/ai-proxy/ai-proxy-core.ts` and its existing test files, `packages/shared/src/data/weekly-summary.ts`, `packages/shared/src/data/__tests__/weekly-summary.test.ts`, `packages/shared/src/ai/suggestions.ts` and relevant age/mailbox/owner-race tests; add `packages/shared/src/ai/__tests__/consent-access.test.ts`.

**Interfaces:** generation uses Task1's captured `ProcessingAccess`; the SQL reservation result includes the captured consent/authority versions. Retain the existing `ai_check_request_age(p_request_id uuid,p_age_version integer)` endpoint/signature for compatibility, but have it check the complete captured request's current authorization using consent/authority/mailbox versions stored in the ledger. The Edge core validates that the new reservation fields are safe integers before proceeding; a missing contract is unavailable, not grandfathered permission. No older endpoint may release a request without consent checks. Include Task2's four exact provenance columns in both first-save and regeneration writes, using the captured access object.

- [ ] Write RED cases for generation denied before any transport, synthetic eligible teen accepted, missing server capability, owner A→B→A, consent revoked during a held provider response, stale cache/read completion, old request IDs and one-time refund. Mock no real provider. Test that suggestion action denial remains under the strict weekly-only route; this work does not reenable suggestions or another provider.

Add `jest.mock('../processing-access', () => ({requireDebriefAccess: jest.fn()}))` and the corresponding import to the existing weekly-summary test harness, then exercise its actual regeneration signature and chainable helper:

```typescript
let revoked = false;
const access: ProcessingAccess = {
  contractVersion: 1, userId: 'user-1', ageVersion: 1, consentVersion: 1,
  authorityVersion: 1, mailboxVersion: 1, ageEligible: true,
  canReadDebrief: true, canGenerateDebrief: true, authorityState: 'not-required',
  ageConsent: true, aiConsent: true,
};
jest.mocked(requireDebriefAccess).mockImplementation(async () => {
  if (revoked) throw new Error('AI permission changed.');
  return access;
});
(supabase.rpc as jest.Mock).mockImplementation((name: string) =>
  chainable({data: name === 'read_history_range'
    ? {habits: [], recurring_totals: {}, rows: []} : 1, error: null}));
(supabase.from as jest.Mock).mockReturnValue(chainable({error: null}));
(generateWeeklySummary as jest.Mock).mockImplementationOnce(async () => {
  revoked = true;
  return 'Synthetic stale review';
});
await expect(regenerateWeeklySummary('user-1', 'Asia/Manila',
  new Date('2026-10-20T04:00:00Z'))).rejects.toThrow('AI permission changed.');
expect(supabase.from).not.toHaveBeenCalledWith('weekly_summaries');
```

This pins the shared post-response boundary. The separate Edge/dblink cases hold transport/transactions to prove their respective in-flight boundaries; no real inference is required.

- [ ] Run affected tests to observe RED. Implement read/generate access checks at existing await boundaries, extend final server authorization version validation, and invalidate affected current-client AI state after accepted consent/authority changes. Preserve captured-token owner isolation and native recovery's separate RAM-only credentials.
- [ ] Verify an old cached result cannot bypass a new denial and that ordinary queue/widget/Auth/query values are untouched. Do not claim current-client invalidation retires unreachable old binaries or erases vendor backups.
- [ ] Run shared affected/full tests and full fake Edge suite, then exact Edge entry-point typecheck. Keep the production factory disabled/Groq-only restriction and all Gemini exclusion tests passing. No deployment or hosted authenticated model probe.

## Task4: Existing signup/Profile/debrief consent interfaces on both clients

**Files:** add `mobile/components/status/debrief-consent.tsx`, `mobile/components/__tests__/debrief-consent.test.tsx`, `web/src/web/DebriefConsent.tsx`, `web/src/web/__tests__/DebriefConsent.test.tsx`; modify existing mobile auth/account-header/weekly-debrief and web WebAuth/AccountShell/WebStatus components with their existing tests. Add shared child/adult prior-notice copy in `packages/shared/src/logic/legal-content.ts` with content tests. No new verification screen or identity upload flow.

**Interfaces:** both consent controls consume the exact Task1 status and mutation functions, display separate purpose grants and call the existing Profile/contact paths for unresolved authority. A successful local checkbox change alone does not update eligibility. Failure leaves the server's last confirmed choices authoritative and hides unapproved AI output.

- [ ] Before implementation, reread exact ExpoSDK54 docs and current Supabase Auth signup docs. Resolve the prior-consent-before-first-birthday-submission path using supported Auth behavior and the existing trigger ordering; do not silently introduce a BEFORE-trigger metadata rewrite. Test the actual returned Auth session before claiming DOB duplication repaired. If that separate minimization change remains unverified, keep its gate open and its disclosure accurate.
- [ ] Write web and mobile RED tests: absent prior age consent sends no birthday/Auth request; under12 sends no signup request; generic Terms alone grants nothing; Status/Weekly mounts and foreground events make zero AI calls before the specific grant; decline/withdrawal preserves ordinary quests; child-oriented and full notices are accessible. Test wrong owner/stale save, failed save, old-server capability and no ID/document/guardian-DOB input.

Extend the existing `weekly-mailbox-foreground.test.tsx` harness's shared-module mock with `fetchProcessingAccess: () => mockAccess()` and a no-op processing subscriber. Define `const mockAccess = jest.fn()` next to its current `mockSummary` and test the actual component props/theme wrapper:

```typescript
mockAccess.mockResolvedValue({
  contractVersion: 1, userId: 'owner', ageVersion: 1, consentVersion: 0,
  authorityVersion: 1, mailboxVersion: 1, ageEligible: true,
  canReadDebrief: true, canGenerateDebrief: false, authorityState: 'not-required',
  ageConsent: true, aiConsent: false,
});
await renderWithTheme(<WeeklyDebrief userId="owner" timeZone="Asia/Manila" />);
await screen.findByText(/AI permission/i);
expect(mockSummary).not.toHaveBeenCalled();
await act(async () => { resume('background'); resume('active'); });
expect(mockSummary).not.toHaveBeenCalled();
```

Do not use the combined read/create helper when only read permission exists: add `fetchSavedWeeklySummary(userId:string,timeZone:string,now?:Date):Promise<string|null>` to `packages/shared/src/data/weekly-summary.ts`, using the same owner-bound read/revision checks and existing date helpers. Its tests must prove no generator call and permitted saved-content reading after AI-generation withdrawal. Use the combined helper only after generation permission is established; this separates permissions without implementing S04's manual trigger or allowance changes.

- [ ] Observe RED separately on each platform, then implement the existing-flow integration. Use an understandable child-oriented notice plus fuller detail, separate unchecked purpose controls and true current automatic-trigger disclosure. Do not implement manual Generate/two-total-week behavior here.
- [ ] Ensure signup's server capture accepts only the reviewed initial age-purpose notice/grant combination and later metadata cannot mutate it. Legacy users explicitly supply missing purpose consent through Profile; birthday corrections retain their existing trusted declaration behavior and do not manufacture AI consent.
- [ ] Use the exact initial metadata field `processing_consent: {age_screening: {granted: true, notice_version: AGE_NOTICE_VERSION}}` alongside the existing initial birthday declaration. The Task2 draft must validate/capture this only at initial account insertion, reject missing/false/unknown-version new signup atomically, and never consume a later editable metadata change as a grant. Reject under12 before retaining a declaration/consent/profile row. Preserve legacy users already present without manufacturing a grant; their recovery/history/correction paths remain. Add real local Auth signup tests for missing consent, invalid version and successful capture before claiming this works beyond SQL fixtures.
- [ ] Run focused/full client suites, shared content tests, TypeScript and affected lint; qualify baseline warnings/errors. Build web locally. Do not install a new phone artifact until its exact source/runtime/origin and purpose are recorded; preserve the current Dev variant and all histories.

## Task5: Minimal-data authority and consent operating rehearsal

**Files:** add `docs/plans/2026-10-20-s02-minimal-data-authority-rehearsal.md`; use a new ignored synthetic runner under `.superpowers/s02-phone` only after its test-first contract is written. No raw correspondence, OTPs, bearer references, credentials or documents are retained.

- [ ] Write the synthetic rehearsal matrix before the runner: reviewed own-consent disposition, authority needed/pending, two separately confirmed contacts, one-contact-only attempt, wrong-account reference, expiry/replay, inconsistent authority, dispute/revocation, changed purpose and volunteered-document handling. Expected results are deny/pending for every unresolved case; no identity/guardianship-proof claim on success.
- [ ] Demonstrate an initial failing assertion for any implemented automation; then implement only the minimal local test driver and trusted local record operation. Do not send mail outside Mailpit, contact a provider or create a real guardian enrollment.
- [ ] Rehearse with synthetic references. Compare account/quest/completion snapshots before/after and emit equality/result categories only. Preserve original fixtures. Record which decisions are simulated versus operated by the owner and which actual authority-applicability/retention decisions remain unproved. Do not convert a scripted reviewer approval into an actual legal determination.
- [ ] Confirm signed-in withdrawal and a reported authority dispute stop future generation and held output with no request to delete history. Include recovery/correction/data requests remaining available. No sensitive-evidence escalation is offered when the procedure cannot establish authority.

## Task6: Matching-client physical acceptance, review and checkpoint

**Files:** amend `docs/plans/2026-10-16-s02-device-verification.md`, `docs/plans/2026-10-20-s02-continuation.md`, backend README and the existing release review. Preserve the roadmap and numbered handoffs.

- [ ] Identify the exact source, package/runtime, callback scheme and local transport for the test artifact. Run current official-doc checks and a detached supported local build only when needed; poll sanitized progress. Keep final candidate distinct from loopback/scratch Dev acceptance. No publish/deploy.
- [ ] On the authorized Oppo and matching local web origin, verify prior notices, large-font scrolling, consent decline/withdrawal, synthetic teen eligibility, unknown/pending/under12 denial, current-mailbox proof, in-flight owner/email/authority/consent changes and retained original-day queued actions. Receiving recovery/email-change callbacks need their own actual acceptance; mock tests or a prior APK pass do not close them.
- [ ] Run only newly justified regressions, then inspect actual outputs. Ask only the already-authorized read-only reviewer if it is still available; do not spawn a new reviewer or delegate implementation. If unavailable, mark independent review open. No legal certification or full S02 pass is inferred from test totals.
- [ ] Update the release record with current hosted pause evidence as historical unless freshly checked. Keep public release blocked for unresolved sensitive-tracker decline/withdrawal, authority applicability/retention, supported live-font repair, actual callback/origin/build parity, old-client/cache treatment, executable drain and complete export/deletion/vendor disclosures. Complete no later phase. Create028 and the next-session prompt only when all S02 gates actually close.

## Plan self-review and execution boundary

The tasks cover the approved eligibility design's server/client/revision/no-sensitive-evidence requirements and retain the broader design's unresolved dependencies explicitly. New interfaces are centralized in Task1; server fields and fake boundaries must match them. Task2 must inspect nested wrappers rather than only replace the outer adult check. Task4's initial birthday handling and Task5's actual operating decisions cannot be declared passed by simulation. No new rule grants all teens legal capacity, no mailbox challenge proves guardianship, and no old cached copy is promised remotely erased.

This plan is ready for owner review, not implementation-complete. Existing inline execution remains selected. After plan review, use executing-plans, start each software task with failing tests, and stop on unresolved design/authority issues rather than inventing sensitive evidence collection or permission. Continue independent already-authorized S02 work when a particular dependency is pending. No commit, new worktree or deployment is required to approve this plan.
