# S02 Tracker Consent Implementation Plan

**October23 execution approval:** owner answered “Plan approved; implement inline.” Scoped local test-first implementation is now authorized. Earlier review-stage statements below are historical. S02 remains INCOMPLETE and public release blocked; no production change, retained-account erasure or real inference is authorized.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline. No implementation delegation or replacement reviewer is authorized. Steps use checkbox syntax for tracking.

**Goal:** Preserve ordinary basic tracking while enforcing independent optional custom-content and fitness permissions across authoritative writes, clients and derived copies.

**Architecture:** Extend the existing private processing controls and revisions. Add server-owned root provenance and a revision-checked tracker write gateway, closing legacy/direct mutation bypasses while preserving owner-scoped reads. Existing editors, queues and surfaces consume the additive capability; AI uses canonical authorized server input rather than accepting arbitrary client tracker text.

**Tech Stack:** Existing Supabase/Postgres/pgTAP/Deno, shared TypeScript/Jest, Vite/Vitest, Expo54.0.36/RN0.81.5, installed Notifications0.32.17 and Android widget0.22.1. No dependency or SDK change.

**Spec:** [Approved tracker-consent design](2026-10-23-s02-tracker-consent-design.md). Owner approved the written design for planning. **This plan awaits review; no implementation has started.** Existing inline method remains selected.

## Global constraints

- S01 COMPLETE; S02 INCOMPLETE; public release blocked. No028 until every S02 gate closes; noS03/S04.
- Preserve all dirty work, numbered handoffs, roadmap, retained synthetic fixtures and ignored artifacts. No staging/commit/reset/uninstall/data clear. Existing inline checkout is retained.
- Basic means restricted input/provenance, not anonymous or guaranteed nonsensitive. Preserve history, recovery, birthday correction and data-request access. Never backfill consent or classify text by its apparent meaning.
- Purpose keys: `custom-tracker`, `fitness-tracking`. Neither grants AI permission. No IDs, selfies, documents, guardian birthdays, new identity provider or routine guardian requirement for every teen.
- Existing under12 write pause and explicit Retry/original dates remain. Unknown/pending ages deny AI; legacy unknown owners retain basic quests. Mailbox proof does not gate ordinary tracking.
- Direct Groq Free `openai/gpt-oss-20b`, global ZDR, no training permission, no fallback/spend. Gemini source retained for deliberate future review. Hosted disabled/v26 evidence remains historical; no activation/deployment/configuration/publishing/contact authority.
- Preserve generation triggers, quota/refund/request identities, week/timezone and legacy-proof contracts. Exactly two TOTAL calendar-week generations/manual Generate remain solelyS04.
- Tests first for software, including any new operational runner. Credentials/tokens/private payloads/baselines RAM-only; allowlisted result categories only. No raw environment/log output or secret digests.
- Retention after full withdrawal, applicable own/guardian authority, old-client/global drain, final font repair, callback/origin/build and independent review remain explicit release gates. No retention duration is invented here.

## Review focus

1. An old request must not regain permission after withdrawal/regrant; Tasks1–2 test captured revisions, not only current booleans.
2. Deleted basic roots and generic-looking legacy roots must retain distinct provenance; Task2 tests tombstones, ID reuse and irreversible personalization.
3. A read/background helper must not update a paused custom quest while processing a basic quest; Task3 tests mixed-parent materialization and unchanged snapshots.
4. A denied upload may still have transport/orphan uncertainty; Task3 tests metadata/reference refusal and does not claim physical byte erasure.
5. A server-approved basic account must not send arbitrary custom text through the AI request body; Task4 tests metadata-only commands, canonical inputs and zero provider dispatch on denial.

## Evidence, commands and execution workspace

Use `.superpowers/sdd/2026-10-23-s02-tracker-consent-implementation` for before-images, ledger, sanitized outputs, test caches, reconstruction and candidate artifacts. Create it without overwriting an existing run. Preserve existing runners rather than modifying their historical allowlists/results.

Source audit found canonical053–056 and tests038–043 unused. Recheck before creating them; if occupied, stop and reconcile the new work rather than overwrite it. Canonical SQL remains under `backend/supabase`; do not run `db push` or reset the retained stack.

Read current official [functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage](https://supabase.com/docs/guides/storage/security/access-control) and `https://supabase.com/changelog.md` before backend implementation. October23 planning read the changelog; relevant headings included TLS/Postgres/managed-schema/Auth-template changes, not permission to change local/deployed configuration. No upgrade is needed for this plan.

The requested Expo54 Notifications URL currently redirects to latest; latest is not SDK54 evidence. Official [sdk-54 branch Notifications source](https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/unversioned/sdk/notifications.mdx) was read instead. Before mobile code, reread the exact SDK54 references and the installed public APIs used by the changed code. Keep the tested notification receiver; do not copy upstream sample event handling over its fixes.

Retained local SQL runner source: `.superpowers/sdd/2026-10-22-s02-export-receiving-implementation/sql.mjs`. Its apply allowlist is052 only, so do not use it to apply these migrations. Task1 creates a new scoped runner. Develop053–056 using rollback-only iteration bodies and focused tests; **permanently apply the complete four-file bundle atomically only after all backend single-session tests pass**. Intermediate tasks are not acceptance of a complete mutation boundary. Actual cross-session races run after this bundle is visible to both sessions. Do not use `npm run db:reset` or broad verify commands that reconstruct another stack by assumption.

Focused commands after the relevant files exist:

```powershell
node .superpowers/sdd/2026-10-23-s02-tracker-consent-implementation/sql.mjs test supabase/tests/038_tracker_processing.test.sql processing-red
npm test --workspace=@eiyu/shared -- --runInBand --runTestsByPath src/data/__tests__/tracker-access.test.ts src/data/__tests__/tracker-writes.test.ts
npm test --workspace=@eiyu/web -- src/web/__tests__/TrackerConsent.test.tsx src/web/__tests__/WebQuestEditor.consent.test.tsx
npm test --workspace=@eiyu/mobile -- --runInBand --runTestsByPath components/__tests__/tracker-consent.test.tsx components/__tests__/quest-editor.consent.test.tsx
```

Every run gets a unique output name; never overwrite RED/failed results. Require exact TAP plans, assertion counts and exit codes. During implementation retain checkpoints per task; do not commit automatically.

## Interfaces and file responsibilities

Create shared `data/tracker-access.ts` for capability/consent/target parsing and `data/tracker-writes.ts` for revision-bound dispatch. Existing domain modules retain validation, dates, receipt reconciliation and their typed return values. Add `logic/tracker-input.ts` for bounded basic/custom editor input types. No generic RPC proxy or independent consent service.

```ts
export type TrackerPurpose = 'custom-tracker' | 'fitness-tracking';
export type TrackerInputKind = 'basic' | 'custom';
export type TrackerAuthorityState = 'not-required' | 'pending' | 'approved' | 'revoked';
export interface TrackerRevision {
  userId: string;
  ageVersion: number;
  consentVersion: number;
  authorityVersion: number;
}
export interface TrackerAccess {
  contractVersion: 1;
  revision: TrackerRevision;
  canWriteBasic: boolean;
  customConsent: boolean;
  fitnessConsent: boolean;
  customAuthorityState: TrackerAuthorityState;
  fitnessAuthorityState: TrackerAuthorityState;
  canWriteCustom: boolean;
  canWriteFitness: boolean;
}
export interface TrackerTarget {
  kind: 'habit' | 'chain';
  id: string;
  inputKind: TrackerInputKind;
  canWrite: boolean;
}
export type TrackerTargetSnapshot = Pick<TrackerTarget,'kind' | 'id' | 'inputKind'>;
export type TrackerOperation =
 | 'habit-save' | 'complete_habit' | 'undo_habit_completion'
 | 'increment_habit_progress' | 'complete_habit_recovery'
 | 'archive_habit' | 'restore_habit' | 'delete_habit'
 | 'move_backlog_to_one_time' | 'move_one_time_to_backlog' | 'reorder_quests'
 | 'chain-save' | 'set_long_quest_stage_done_receipt' | 'reorder_long_quests' | 'chain-delete'
 | 'gym-routine-save' | 'gym-routine-archive' | 'save_gym_exercise'
 | 'remove_gym_exercise' | 'delete_gym_routine' | 'reorder_gym_exercises'
 | 'start_gym_session' | 'save_gym_session' | 'discard_gym_session' | 'log_gym_weight'
 | 'prepare-day';
export function parseTrackerAccess(value: unknown, expectedOwner: string): TrackerAccess;
export function fetchTrackerAccess(expectedOwner: string): Promise<TrackerAccess>;
export function fetchTrackerTargets(kind: 'habit' | 'chain', ids: readonly string[], expectedOwner: string): Promise<TrackerTarget[]>;
export function setTrackerConsent(purpose: TrackerPurpose, granted: boolean, noticeVersion: string, expected: TrackerRevision): Promise<TrackerAccess>;
export function subscribeTrackerAccessChanges(listener: () => void): () => void;
export function invokeTrackerWrite<T>(operation: TrackerOperation, args: Record<string, unknown>, expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[]): Promise<T>;
```

RPCs:

```sql
public.get_tracker_processing_access() returns jsonb
public.get_tracker_targets(p_kind text,p_ids uuid[]) returns jsonb
public.set_tracker_processing_consent(p_purpose text,p_granted boolean,p_notice_version text,p_expected jsonb) returns jsonb
public.apply_tracker_write(p_operation text,p_arguments jsonb,p_expected jsonb) returns jsonb
```

`p_expected` contains only `TrackerRevision`; server validates its four fields and never accepts decision flags as authority. The transport adds `p_expected_targets` to `p_arguments`, containing the captured root ID/kind/input-kind snapshots; it never invents them from fresh status after an old intent. These are staleness assertions, not permission claims. Target reads are bounded100 and paged by the shared reader; existing bulk-operation size semantics are not reduced to100. Missing/foreign live targets refuse generically rather than expose another owner's classification. Receipt/history reads remain separate owner-bound reads.

Errors: existing`ET001` under12 unchanged; `ET002` missing purpose/authority; `ET003` stale tracker capability; `22023` invalid shape/basic payload; `42501` authentication/owner/legacy mutation denied. No payload echoed in an error. Current ordinary Auth/recovery/export entry points retain their separate authorization.

### Task1: Private purpose state, provenance and additive capability

**Create:** `backend/supabase/053_tracker_processing.sql`, `supabase/tests/038_tracker_processing.test.sql` and ignored workspace `sql.mjs`, `sql-contract.mjs`, `sql-contract.test.mjs`.

**Modify:** `backend/supabase/README.md` for local-only canonical order; do not rewrite historical050. Functions from050 that need new behavior are replaced in053 with their prior signatures/ACLs preserved.

**Produces:** first three public tracker RPCs, `private.tracker_processing_access(uuid)`, `private.processing_authority_version(uuid)`, `private.record_tracker_processing_authority(uuid,text,text,integer,uuid)` and the private records below.

- [ ] Preserve current source/before-images and record retained stack identity without raw status/env output. Use only `supabase_db_eiyu-s02-age-demo` / `.superpowers/s02-age`. Write runner contract tests first: missing/extra TAP assertion, nonzero process exit, arbitrary apply path, unexpected transaction wrappers and raw-error redaction. Implement `parseTapResult(stdout,exitCode)` and a literal053–056 **complete-bundle-only** apply allowlist after RED. Copy the retained runner's stack guard and safe output projection; never broaden old runners. Iteration strips only each inspected file's outer standalone BEGIN/COMMIT after exact wrapper checks, never nested SQL blocks, and ends in rollback. Bundle application supplies one outer transaction; individual canonical files retain their original wrappers on disk. Test rollback of a deliberately failing final statement. Never concatenate canonical COMMITs and call that atomic.

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTapResult} from './sql-contract.mjs';
test('a zero exit does not hide a truncated TAP plan',()=>{
  assert.equal(parseTapResult('1..2\nok 1 - owned case\n',0).pass,false);
});
test('a failed process cannot be green',()=>{
  assert.equal(parseTapResult('1..1\nok 1 - owned case\n',1).pass,false);
});
```

- [ ] Write038 first using rollback-only synthetic users, current-role claims and pgTAP. Assert unknown legacy owner can write basic; both optional grants false; no metadata/backfilled authority; wrong owner/stale notices fail; custom/fitness independent; existing age/AI setters preserve the new fields. Observe missing-RPC/behavior RED via the new sanitized runner.

```sql
begin;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('da230000-0000-4000-8000-000000000001','tracker-design@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230000-0000-4000-8000-000000000001',true);
select ok((public.get_tracker_processing_access()->>'canWriteBasic')::boolean,'unknown legacy owner retains basic tracking');
select is(public.get_tracker_processing_access()->>'customConsent','false','no invented custom grant');
select is(public.get_tracker_processing_access()->>'fitnessConsent','false','no invented fitness grant');
reset role;
select * from finish();
rollback;
```

- [ ] Add false-default custom/fitness grant+notice fields to `private.processing_consent`; expand the consent-event purpose constraint. Add `private.tracker_purpose_authority(user_id,purpose,state,age_version,version,review_reference,changed_at)`, keyed by owner/purpose, for only the two new purposes. Mirror050's trusted-only decision boundary and revocation/stale-declaration behavior; no copied age/AI-only decision, client grant or new verification field. RLS enabled/private privileges revoked.
- [ ] Reuse the existing global consent revision for every purpose decision. Refactor the old setter to preserve all four purpose fields; signup still captures age only. New tracker setter ignores mailbox status as a permission requirement, locks the owner, validates its captured revision and notice, changes only its requested purpose and writes the minimal existing consent event. Notice versions are `2026-10-23-custom-tracker-v1` and `2026-10-23-fitness-tracking-v1`.
- [ ] Define logical authority revision as old authority row version plus the sum of the two purpose-authority row versions, calculated in bigint then bounded to the existing positive integer contract. Versions only increase; rows cannot be removed while the account exists. Replace050 authority/status/event code to use this logical revision consistently, without changing old purpose decisions. New/old trusted decisions append events at the logical revision under the same owner lock. Test mixed decisions, no event/version collision, stale old AI tuples and integer-overflow rollback. No hash/digest or caller-supplied version is used.
- [ ] Add `private.tracker_input_provenance(object_kind,object_id,user_id,input_kind,ordinal,next_stage_ordinal)`: kind habit/chain, composite primary key, account FK/cascade, unique owner/kind/ordinal, input kind basic/custom. No title/body/media. **No live-root FK:** retain provenance after a root is deleted while its history/receipts remain; account deletion removes it. Only trusted creation/conversion helpers write it; absence means custom. No existing root backfill.
- [ ] Implement minimal capability/target/consent RPC projections. Target ownership is resolved from actual live roots; stages inherit the chain. Adult/no-record and conditional minor authority follow the existing reviewed model; explicit revocation wins. Unknown basic access is independent of mailbox/AI. Under12 pauses every tracker write. Do not return review references or birthday/contact values.
- [ ] Run038 GREEN and targeted031/032 compatibility cases in rollback-only iterations. Resolve changed functional expectations through explicit fixture grants, not a global bypass. Record outputs with exact plans/exit0. Check grants/search paths/private permissions; no permanent partial migration or hosted application.

### Task2: Revision-bound write gateway and neutral definitions

**Create:** `backend/supabase/054_tracker_write_boundary.sql`, `supabase/tests/039_tracker_writes.test.sql`.

**Consumes:** Task1 revisions, grant/authority decisions and provenance. **Produces:** `apply_tracker_write`, static dispatch helpers and basic factories.

- [ ] Write RED cases for direct table mutations and every old public mutation entry point; also write basic save/progress, current custom/fitness grants, stale captured revision after withdrawal/regrant, foreign IDs, duplicate IDs, basic personalization and deleted-provenance cases. Tests must show actual calls denied, not only inspect ACL text.
- [ ] Before changing ACLs, inventory all authenticated-callable mutation functions and transitive public callers against canonical001–053 and the local catalog. Retain an allowlisted name/signature/operation manifest in the workspace. Include legacy XP helpers, public aliases, profile/timezone helpers with materialization, bulk functions and read helpers; do not assume only the functions imported by the current UI are reachable. Test this manifest for unexpected callable bypasses.
- [ ] Implement a static CASE gateway, no dynamic function name/SQL from the request. Validate operation-specific argument keys/types and the separate `p_expected_targets` assertion; resolve actual owned parents and compare their current provenance before using a receipt or mutating. Strip that assertion key before invoking retained routines. Acquire `auth.users` owner **FOR UPDATE first**, then parent rows in stable kind/ID order. Always compare captured owner/age revision. For protected, conversion or mixed-target operations compare the full four-field tuple and require the appropriate purpose. A still-basic-only operation ignores unrelated optional-consent/authority revision changes, so basic progress continues independently. Keep the existing under12 guard. Recheck receipt ownership before reporting its result.

```sql
-- Core order inside apply_tracker_write; operation-specific CASE follows.
uid := auth.uid();
if uid is null or p_expected->>'userId' is distinct from uid::text then
 raise exception 'Account changed.' using errcode='42501';
end if;
perform 1 from auth.users where id=uid for update;
current_access := private.tracker_processing_access(uid);
if current_access->'revision'->'ageVersion' is distinct from p_expected->'ageVersion' then
 raise exception 'Tracker access changed. Refresh before retrying.' using errcode='ET003';
end if;
if not (current_access->>'canWriteBasic')::boolean then
 raise exception 'Tracker updates are paused.' using errcode='ET001';
end if;
-- After locked parent/provenance assertions derive requires_optional_purpose:
if requires_optional_purpose and current_access->'revision' is distinct from p_expected then
 raise exception 'Tracker access changed. Refresh before retrying.' using errcode='ET003';
end if;
```

- [ ] Use the following closed operation map. Arguments retain the referenced routine's exact `p_` keys/types from `packages/shared/src/types/database.ts`; additional keys refuse. Wrap scalar results as `to_jsonb`, void as JSON null, without adding model/client trigger behavior.

| Gateway operation | Authorized input/result and retained implementation |
| --- | --- |
| `habit-save` | `p_id:uuid,p_create:boolean,p_mode:basic/custom,p_input:object`; returns UUID. New trusted factory uses the existing habit column/date validation and atomic schedule triggers. |
| `complete_habit`, `undo_habit_completion`, `increment_habit_progress`, `complete_habit_recovery` | Existing argument/result shapes from `data/completions.ts`; resolve actual habit/root and purpose before existing server XP/date/recovery logic. |
| `archive_habit`, `restore_habit`, `delete_habit`, `move_backlog_to_one_time`, `move_one_time_to_backlog`, `reorder_quests` | Existing shapes from `data/habits.ts`; every bulk target must be owned/permitted; no partial reorder. |
| `chain-save` | `p_id,p_request_id,p_create,p_mode,p_input`; returns UUID via existing atomic definition receipt semantics. |
| `set_long_quest_stage_done_receipt`, `reorder_long_quests`, `chain-delete` | Existing stage/request and reorder shapes; chain-delete takes `p_id`. Plain stage mutation/reconciliation aliases cease being public write entry points. |
| `gym-routine-save`, `gym-routine-archive` | Save takes `p_id,p_create,p_name,p_unit`; archive takes `p_id,p_archived`. Preserve stable creation IDs and existing routine lifecycle. |
| `save_gym_exercise`, `remove_gym_exercise`, `delete_gym_routine`, `reorder_gym_exercises`, `start_gym_session`, `save_gym_session`, `discard_gym_session`, `log_gym_weight` | Exact current shapes from `data/gym.ts`; all new records/progress require fitness permission, regardless of text/media. |
| `prepare-day` | Empty arguments; Task3 implements permission-aware current-day preparation. No caller-provided timezone/today override. |

- [ ] Basic habit input accepts only `questType,stat,difficulty,time,days,scheduledDate,targetCount,timeSet` with existing enum/range/date rules; omitted genre is null and descriptions are null. Assign `Quest N` using the next private owner/kind ordinal under the owner lock; never reuse a retired ordinal. Binary habits get fixed `Take one small step` easy-version text; nonhabits keep existing null rules. Repeated identical creation ID returns the existing owned result; conflicting payload, foreign/retired ID refuses. Editors keep one creation ID through uncertain retries.
- [ ] Basic chain input accepts only existing stat/order fields and an ordered stage-ID list; no title/description text. Assign `Chain N` and stable `Step N` labels. The private per-root stage ordinal advances only for newly created stages; reordering does not rename retained stages. Existing atomic request receipts prevent duplicate stage allocation/rewards. Basic→custom conversion requires current custom permission, preserves root/stage IDs and makes provenance custom permanently. A matching generic string never downgrades a custom root.
- [ ] Test an old basic completion after the root becomes custom **without a consent revision change**: its captured input-kind assertion must refuse. Test basic-only progress with an old optional-purpose revision after unrelated custom withdrawal: it must still succeed under current age/owner/provenance checks. New-definition/fitness operations carry an empty root snapshot array; existing habit/chain operations carry the exact affected roots. A caller claiming basic for a custom root cannot bypass the authoritative classification.
- [ ] Revoke direct authenticated INSERT/UPDATE/DELETE on the nineteen tracker tables listed in049, including shared stats/reward/history rows. Revoke PUBLIC/anon/authenticated execution of old mutation functions and any callable bypass aliases discovered by the manifest. Keep owner-scoped SELECT/RLS and privacy/account functions. Gateway ownership explicitly checked because definer code bypasses RLS. Retained routines remain callable only through approved trusted paths; do not introduce a caller-set GUC/bypass flag.
- [ ] New dispatcher reaches existing routine bodies under trusted privileges; verify it cannot update an unapproved parent through nested/global helpers. Task3 supplies the filtered helpers before integrated acceptance. Run039 GREEN, with direct-call/ACL and immutable provenance assertions. No fixture/history rewrite and no destructive live deletion rehearsal.

### Task3: Read side effects, mixed derived data and Storage

**Create:** `backend/supabase/055_tracker_preparation_storage.sql`, `supabase/tests/040_tracker_preparation_storage.test.sql`, `supabase/tests/041_tracker_withdrawal_concurrency.test.sql`.

**Consumes:** gateway/current capability/root purpose. **Produces:** permission-aware `prepare-day`, read-only public history surfaces and revision-bound upload paths.

- [ ] Write RED mixed-account cases containing a basic habit, protected habit, chain and fitness record. Snapshot occurrences, penalties/recovery, deleted-name copies, summaries, shared stats and weekly quest rows. Invoke Board/history/profile/timezone read paths and basic progress. Assert no new paused protected rows/copies/rewards/recomputation, while basic progress succeeds and old totals/history remain.
- [ ] Separate public reads from preparation in `get_habits_for_date`, `get_open_habit_recoveries`, `read_history_range` and public `ensure_habit_occurrences`, `reconcile_habit_recoveries`, `rollover_unfinished_one_time_quests`. Public read/legacy preparation entry points must not mutate protected data or bypass the gateway. Implement `private.prepare_tracker_day(p_user_id uuid,p_include_protected boolean)` behind `prepare-day`; the gateway derives that boolean from captured/current revisions, never from a caller flag. Retained filtered preparation routines filter **before** effects/copies. Existing valid date/recovery/rollover rules are unchanged for eligible targets. Profile/timezone changes retain their account semantics but cannot incidentally materialize paused tracker content. Paused definitions/history remain available to the read-only Board/history surfaces without fabricating today's occurrence, eligibility or completion.
- [ ] `prepare-day` derives roots on the server rather than treating an empty snapshot list as a blanket basic assertion. With matching full revisions it prepares permitted basic/custom work; if only optional revisions changed, prepare still-basic roots only and return `{basicPrepared:true,protectedPrepared:false,accessChanged:true}`. With matching revisions return actual basic/protected preparation booleans and `accessChanged:false`. A stale age revision refuses. The client refreshes status on accessChanged and does not pretend protected preparation completed. This prevents a concurrent optional withdrawal from stopping ordinary basic preparation or enabling a changed custom root.
- [ ] Extract the existing028 history projection to private `tracker_history_snapshot(p_user_id uuid,p_start_date date,p_end_date date) returns jsonb`, with explicit owner predicates on every source/join and all privileges revoked. Preserve the current snapshot keys/normalization. The public read wrapper supplies only its nonnull `auth.uid()`; the service-only Task4 wrapper supplies its independently authenticated owner. Test both paths and cross-owner joins; do not call the old invoker snapshot with a service-role/null subject and mistake empty rows for a basic-only account.
- [ ] Shared-stat baseline totals are preserved; permitted basic actions apply their existing target-owned delta. New lazy non-AI weekly quests are created only when their input dependencies are permitted; do not recompute mixed custom aggregates without permission or replace prior weekly rows. Do not recalculate historical stats as part of consent withdrawal. Retained history continues to read independently of preparation success.
- [ ] Add upload revision path format `<owner>/<routine>/<ageVersion>-<consentVersion>-<authorityVersion>/<objectId>.<gif|mp4>`. `gymMediaPath` will receive the captured revision in Task5. Restrictive Storage INSERT/UPDATE policies validate that format, live owner/routine and current fitness/under12 decision; malformed/old upload paths deny, old existing paths remain readable and existing unreferenced cleanup keeps its separate restrictions. No managed-schema trigger or broad Storage grant.
- [ ] Test real local Storage metadata policies plus database attachment checks: denied no-grant/old tuple, valid current tuple, cross-owner/routine, withdrawal before final attachment and old read paths. Refusal does not prove remote byte deletion if transport/storage already accepted data; retained object/orphan cleanup is explicitly classified. Use synthetic bytes only and preserve any retained test objects; no account deletion.
- [ ] Reuse030/032's observed-lock-wait technique for041, now owner lock before target locks. Test writer-before-withdrawal settlement, withdrawal-before-write denial and withdrawal→regrant still refusing the captured old tuple. Include basic concurrent progress unaffected by custom withdrawal, target personalization and purpose-authority revision. Two-session setup owns fresh SQL-only synthetic fixtures; preserve them and restore scoped mutable state, close both connections, compare every original owner snapshot in RAM. No reuse/deletion/reset of retained phone fixtures. Require observed lock waits, bounded statement/lock timeouts and explicit cleanup result.
- [ ] Run040 GREEN in rollback-only iteration. Retain041's first expected failure and leave its actual two-session GREEN gate for Task4 after atomic bundle application; uncommitted draft DDL is not visible to a second session. Reconstruct053–055 inside rollback against saved052 definitions and compare function owners/grants and original histories/control state. This is reconstruction evidence, not a rollback instruction for production. Do not rerun the old font/cache/scheduler probes.

### Task4: Canonical AI input and export coverage

**Create:** `backend/supabase/056_tracker_ai_export.sql`, `supabase/tests/042_tracker_ai_input.test.sql`, `supabase/tests/043_tracker_export.test.sql`, `backend/supabase/functions/ai-proxy/ai-proxy-tracker_test.ts`.

**Modify:** current `ai-proxy-core.ts`, `ai-proxy-generator.ts` types only where needed, `test-helpers/admission.ts` and affected existing tests; preserve strict route/admission/provider/refund behavior. Shared export contract/types follow in Task5.

- [ ] RED: metadata-only weekly command accepted for eligible canonical basic inputs, arbitrary `habits/statTotals` body refused, ungranted protected input denied before provider/quota dispatch, foreign owner/week rejected, held consent/authority change denied, missing fitness grant irrelevant when input has no fitness dependency. Do not add Gym content to prompts.
- [ ] Add service-only `public.ai_tracker_week_input(p_user_id uuid,p_week_start date,p_expected jsonb) returns jsonb`. It validates strict service role, owner lock/revisions and the existing calendar-week window, then builds the same bounded habit names/counts/stat totals as `gatherWeekData` from owner-bound history. Check every actual input dependency, including deleted roots via retained provenance. Unclassified history is protected. Reject incomplete/over-limit inputs rather than truncate a review. No prompts/results persisted by this RPC.
- [ ] Edge constructs this RPC's expected object from verified subject plus the existing submitted four numeric revisions: `userId,ageVersion,mailboxVersion,consentVersion,authorityVersion`. The body cannot supply its owner. Check current mailbox/debrief permissions as well as tracker input dependencies, using Task3's explicit-owner private snapshot. Do not confuse this five-field AI expectation with the mailbox-independent four-field tracker-write revision.
- [ ] External command is action, week start and the existing nested `processingAccess` tuple, **without client habit text/totals**. Keep the server-generated logical request ID exactly where the current core creates it; do not add a client idempotency/request-ID contract. Keep an internal enriched weekly payload for the existing generator. Edge verifies the current session owner, obtains authorized canonical input before admission/provider dispatch and retains it only in RAM for that execution. Existing admission/retry/final-state checks and one-time refund accounting continue; no provider fallback or new generation trigger. Wrong old clients fail closed; no data-body compatibility fallback.

```ts
// Client command contract: keys only, not free-form tracker content.
type WeeklyReviewCommand = {
  action: 'weekly-summary'; weekStart: string;
  processingAccess: {
    contractVersion: 1;
    ageVersion: number; mailboxVersion: number;
    consentVersion: number; authorityVersion: number;
  };
};
```

- [ ] Canonical names/counts are an internal payload, never trusted from a caller-supplied body. Preserve existing100-habit and other reviewed bounds. Replace the current SQL admit wrapper's relevant dependency check without reopening051 legacy ingress; `ai_begin_request` remains denied. Use the same existing consent/authority revisions at reservation/retry/final-output/save; no separate provider execution accounting system. Preserve read access to already saved summaries under the existing read contract.
- [ ] Extend the existing admission test helper with a narrowly owned synthetic canonical-input response, preserving explicit missing/invalid/foreign/denied cases. Do not make unknown RPC names succeed globally merely to retain old fake-provider totals. New command/parser, canonical read, admission refusal and provider settlement expectations must each be observable in the focused tests.
- [ ] Update052's explicit export table/field/FK inventory for the two new private tables and new consent fields. Provenance exports only owner/kind/ID/input kind/neutral ordinal fields needed to explain their data; trusted review references stay omitted. Add owner-only authority disposition/purpose/version/time projection using existing omissions. Extend rollback-only cascade/foreign-record/schema-drift/bounds tests; do not rerun the permanent disposable deletion rehearsal.
- [ ] Run042/043 and affected strict fake-provider tests GREEN in iteration. Validate/capture the retained state and apply the complete053–056 bundle atomically once. Run041's actual two-session lock-wait races, actual local Storage policy cases and then **one** full retained SQL suite, SQL lint/new-issue comparison, canonical053–056 rollback reconstruction and fake Edge suite. Global ACL changes justify that one broad pass; do not rerun it after documentation-only edits. Update older functional tests to the current public gateway and explicit synthetic grants, preserving old-client negative coverage rather than granting global bypasses. No real provider/hosted invocation.

### Task5: Shared capability, typed input and domain transports

**Create:** `packages/shared/src/data/tracker-access.ts`, `data/tracker-writes.ts`, `logic/tracker-input.ts` and matching `__tests__/tracker-access.test.ts`, `tracker-writes.test.ts`, `tracker-input.test.ts`.

**Modify:** shared `index.ts`, `types/database.ts`, `types/eiyu.ts`, `logic/legal-content.ts`, `logic/gym-media.ts`, data modules `habits.ts`, `completions.ts`, `long-quests.ts`, `gym.ts`, `gym-media.ts`, `weekly-quest.ts`, `weekly-summary.ts`, AI `suggestions.ts` and their affected tests.

- [ ] Write parsing/owner/stale-result/unknown-field/independent-purpose RED tests first. Invalid capability never becomes a grant. Capture a copy of the revision before awaits; use the existing `authorizationForOwner` pattern so refresh/account switching cannot retarget a request. Target readers chunk100, compare every requested owner/ID and refuse missing classification rather than call it basic.

```ts
import {parseTrackerAccess} from '../tracker-access';
it('does not turn the old processing contract into tracker permission',()=>{
  expect(()=>parseTrackerAccess({contractVersion:1,canGenerateDebrief:true},
    'da230000-0000-4000-8000-000000000001')).toThrow('Tracker access unavailable.');
});
```

- [ ] Add discriminated editor inputs: `{mode:'basic',values:BasicHabitInput}` / `{mode:'custom',values:HabitInput}`. Define `BasicHabitInput = Pick<HabitInput,'questType'|'stat'|'difficulty'|'time'|'days'|'scheduledDate'|'targetCount'|'timeSet'>`; chain basic input is `Pick<LongQuestInput,'stat'|'strictOrder'> & {stages: {id?: string | null}[]}`. Preserve `HabitInput`/`LongQuestInput` custom shapes for existing editors; no optional-name shortcut that lets text leak into basic payloads.
- [ ] Route domain writes through the static gateway with **required captured `TrackerRevision` and root snapshots**. Update all call sites/types; no default auto-refresh of a missing/stale revision, no fresh provenance substituted for an old intent, and no fallback to old direct writes. Basic-only preflight follows Task2's purpose-aware comparisons rather than rejecting every unrelated optional revision. Existing completion/gym/chain scalar results and receipt reconciliation stay typed and validated. Keep one creation/root/request ID for uncertain create/save retries; conflict fails rather than silently creating a second object. Basic→custom is explicit, not inferred from a name edit.
- [ ] Explicit `prepare-day` precedes relevant Board preparation with the caller's captured revision. Ordinary history reads do not depend on preparation success. Replace direct lazy weekly-quest insertion with the gateway's authorized preparation; do not change its week/target semantics. Attach owner-scoped input kind/canWrite to current quest/chain view models through the target reader.
- [ ] Add new purpose notices and versions from Task1, including child-oriented explanation, full data/purpose/consequence/storage/rights detail. AI permission stays separate. New tracker notices appear only on feature choice, not signup/foreground auto-prompt. Metadata-only AI transport omits habit text/totals; saved-summary reads remain unchanged. Update gym upload path generation with the captured revisions; no inference that an uploaded body was erased after a refused attachment.
- [ ] Focused shared tests GREEN, then shared TypeScript. Global changed signatures are intentional: resolve every compile-time caller rather than retain a permissive overload. Full shared suite runs once after all callers/clients settle in Task8, not after every domain file.

### Task6: Existing web editors and Profile

**Create:** `web/src/web/TrackerConsent.tsx`, `web/src/web/__tests__/TrackerConsent.test.tsx`, `WebQuestEditor.consent.test.tsx`, `LongQuestEditorDialog.consent.test.tsx`.

**Modify:** `web/src/web/AccountShell.tsx`, `WebQuestEditor.tsx`, `LongQuestEditorDialog.tsx`, `WebGym.tsx`, `web/src/store/eiyu-store.tsx` and affected store/Gym/Account tests.

- [ ] RED tests: ungranted custom/fitness choice shows the relevant notice before input submission, decline keeps basic creation available, independent Profile grant/withdrawal, legacy generic-looking quest stays read-only, failed/stale save preserves the right owner's choice, under12 basic write refused, mailbox-unproved basic progress allowed. Record zero write/provider calls on passive mount.

```tsx
// Add to the real editor/store harness, with a loaded no-grant tracker capability.
await user.click(screen.getByRole('button',{name:'Use basic tracking'}));
expect(screen.queryByPlaceholderText('e.g. Morning run for 30 min')).not.toBeInTheDocument();
await user.click(screen.getByRole('button',{name:/save/i}));
await waitFor(()=>expect(store.saveHabit).toHaveBeenCalledWith(
  expect.objectContaining({mode:'basic'}),undefined));
```

- [ ] Implement a small purpose-specific TrackerConsent component reusing existing debrief consent styling/owner guards. Profile exposes both separate controls; editor invocation selects one purpose only. Submission waits for server-confirmed grant/current authority. Scope/status refresh never silently completes a refusal or retries a save.
- [ ] Existing new quest/chain editor offers basic or custom. Basic hides unbounded fields and displays the server-neutral labeling explanation; ordinary structured controls remain. Custom fields use the existing form only after permission. Stored custom/legacy records show readable content and a clear reason/actions when read-only; no alternate saving path through archive/delete/move. Existing data-request/recovery/correction links remain. No public CORS/origin change.
- [ ] Gym history remains readable; new/edited routine/exercise/session/weight/media controls use fitness permission. A canceled notice returns to history. Temporary unsaved drafts are not sent or newly persisted on known denial; existing explicit close/discard guard remains. Include keyboard, role/label, error-focus and shorter/large-text layout tests using current components.
- [ ] Focused web component/store tests and affected lint/TypeScript GREEN. No broad web redesign or production build/deploy in this task. Capture exact affected test paths in the execution ledger.

### Task7: Native editors, queue and device surfaces

**Create:** `mobile/components/status/tracker-consent.tsx`, `mobile/components/__tests__/tracker-consent.test.tsx`, `quest-editor.consent.test.tsx`, `long-quest-editor.consent.test.tsx`.

**Modify:** native account header; app `quest-editor.tsx`, `long-quest-editor.tsx`, `gym-routine-editor.tsx`, `gym-exercise-editor.tsx`; `contexts/eiyu-store.tsx`, `gym-store.tsx`; `lib/write-queue.ts`, `write-queue-engine.ts`, `use-write-queue.ts`, `notifications.ts`, `widget-snapshot.ts`, `use-widget-snapshot.ts` and the existing relevant tests. Find the actual widget action task through its existing imports before changing its dispatch; do not invent a second widget handler.

- [ ] Read exact SDK54 references before mobile code. Write native versions of Task6's grant/decline/legacy/read-only/owner cases first. Reuse existing status consent and editor components; no root provider remount, reload, scaling suppression, new native flag or font experiment.
- [ ] Implement loaded/current tracker capability in stores and per-record canWrite checks for each action. Preserve ordinary history state while filtering actions. Pass the captured revision through domain writes; do not fetch a new grant just to release an old intent. Native editing/save lifecycle keeps its existing draft/uncertain-save protections and creation/request IDs.
- [ ] Queue RED: known denial enqueues no new protected action; an existing held entry survives restart; regrant does not drain automatically; Retry stays original-day only; uncertain commit is reconciled before another progress delta; A→B→A does not adopt another account's capability/payload. Add `purpose-paused` to FailureReason, `heldForProcessingPause?:true`, captured `trackerRevision?:TrackerRevision` and `trackerTargets?:TrackerTargetSnapshot[]` to entries. Keep the existing `tracker-paused` under12 reason/flag; either held flag enforces the original-date rule. Decoder accepts valid v1 entries without discarding/relabeling them; missing captured revision/provenance holds an old action for explicit review/Retry. Do not silently stamp it with a new grant. Basic v2 actions remain independently eligible across unrelated optional revisions under Task2's checks.
- [ ] New `EnqueueRequest` includes `trackerAccess:TrackerAccess` and `trackerTargets:TrackerTargetSnapshot[]`; reject known denial before persisting its label/action. Persist only the revision/target projection, not the full capability. Add `WriteQueueDeps.checkProcessingAccess(entry):Promise<{access:TrackerAccess;targets:TrackerTarget[]}>` for authoritative flush/Retry checks. Change `WriteQueueEngine.retry(id)` to `Promise<boolean>` and update hook/UI/test callers explicitly. Retry first checks owner/date/current permission and reconciles uncertainty; it can then renew the captured revision for an unchanged target kind. A basic→custom kind change returns false for current-record review instead of silently adopting that meaning. Ordinary flush never renews a held entry's revision.

```ts
// Extend the existing queue-engine dependency harness with tracker access.
const before = engine.getEntries()[0];
await engine.flush(); // revoked, or restored permission without explicit Retry
expect(send).not.toHaveBeenCalled();
expect(engine.getEntries()[0]).toMatchObject({
  id:before.id,userId:before.userId,accountDate:before.accountDate,
});
```

- [ ] Known denial does not write new protected draft/label copies. Preserve already durable queued data as a retained copy; do not claim this design authorizes clearing it. Current owner/session notifications update capabilities; offline/unknown remote withdrawal is disclosed, not treated as proof of permission. Wrong-owner late UI/cache completions are ignored and never produce optimistic history changes.
- [ ] Reminder/widget tests RED before change: protected rows filtered after observed denial, old cached title not newly persisted, basic reminders unaffected, widget action cannot dispatch with missing/stale capability, already delivered copies not called recalled. Cancel only affected Eiyu-owned scheduled IDs through the existing public Notifications APIs; do not change OS permissions/channels or unrelated reminders. Preserve tested same-ID/later-event receiver behavior. A headless action fetches/rechecks its owner/current capability and still requires an explicit action/eligible original date.
- [ ] Focused native component/store/queue/widget/reminder tests, affected lint and TypeScript GREEN. Keep offline behavior limitations explicit. Do not install a scratch probe or new candidate until Task8 identifies and verifies its exact artifact.

### Task8: Integrated verification, one candidate and batched acceptance

**Create:** `docs/plans/2026-10-23-s02-tracker-consent-verification.md`; ignored workspace guarded synthetic HTTP/physical drivers only after their refusal/owner-preservation tests are RED then GREEN.

**Modify:** closure ledger, continuation/release/device ledger pointers with qualified results; update implementation checkboxes only after actual evidence. Preserve history rather than append the same full checkpoint to every document.

- [ ] Run one guarded actual-local Auth/RPC rehearsal with synthetic users and real gateway/Storage boundaries. Simulate authority decisions explicitly; no real guardian/contact/provider messages. Compare all original account/quest/history/selected metadata in RAM. Retain new fixtures, no permanent account/GIF deletion. Exercise no-grant basic success, custom/fitness refusal, independent grants/withdrawal, live captured-revision races, canonical AI input with fake provider only and owner-bound export field coverage.
- [ ] Run full shared/web/native suites once after both clients and interfaces settle, plus three TypeScript checks and affected lint. Run local web build once. Full backend gate from Task4 is reused unless subsequent backend changes justify another run. Diagnose actual failures with focused RED/GREEN; rerun only affected broader checks after a new change/failure. Historical totals are not expected counts for this changed source.
- [ ] Preserve the currently installed repaired Dev APK/data and scratch input/output before-images. Stage one matching full candidate, unique runtime, correct Dev package/signing/callback scheme, loopback origin and disabled OTA identified as **local-only**. Detached hidden build with bounded sanitized polling. Verify compiled artifact/source markers before any data-preserving installation. Existing exact-artifact approvals are not blanket approval for any APK; if installation/forwarding needs an artifact-specific decision, present the verified candidate and the whole physical batch once. Never uninstall/clear data.
- [ ] Batch on the same authorized unlocked Oppo and matching local web origin: basic habit/chain create/progress, custom/fitness just-in-time notice/decline/grant/withdrawal, protected legacy read-only, current-mailbox-independent basic action, under12 pause, held stale grant/account switch, original-date queue Retry, direct/held fitness upload and widget/reminder restriction. Use synthetic local records only, guarded existing flows, no raw screenshots containing credentials or real private data. Count actual server effects; do not accept a UI-only checkbox as authority/consent rehearsal. Local bridges remain qualified separately from deployed Deno.
- [ ] Large-text checks are of required notice readability on the matching candidate at cold1.6, not a new hot-font hypothesis/probe or repair claim. Font repair remains open until separately accepted. Preserve existing notification settings; do not repeat the completed mailbox races, local recovery or export expiry experiment unless a changed dependency genuinely invalidates that specific evidence.
- [ ] Restore Default font, direct57321 forwarding/no57326 and any temporary test setting/helper. Compare repaired-baseline/installed candidate identities as actually observed; do not claim both are installed. Restore preserved staging files/output exactly and retain every artifact/new fixture. If a temporary synthetic permission/expiry changed, restore only its owned state and record comparison/cleanup results. No broad cleanup.
- [ ] Use only the original authorized read-only reviewer if available. If unavailable, retain independent review as OPEN; do not spawn/delegate to a replacement. Document source/process failures and their qualification, not only passing totals. Keep authority sufficiency, retention, old clients/global drain, font, callbacks/origins/final hosted parity and public release open. No028/S03/S04 on the strength of this branch alone.

## Plan self-review and review boundary

Self-review resolved: current-boolean-only stale regrant bypass; generic legacy names misclassified as basic; deleted-root provenance loss; read-triggered protected effects; direct Storage path replay; arbitrary client AI text; existing setter/event revision collisions; global bypasses to keep old tests green; mixed totals silently treated basic; queue Retry retimestamping; old APK approval applied to an unrelated new artifact. Tests/tasks above own each case.

This is one coordinated contract across existing tracker paths, not separate deployable subsystems. Partial backend drafts stay in rollback-only iterations; apply the complete boundary atomically before local client acceptance. No deployment/inference or new scheduler is part of execution. No automatic commit or numbered handoff step is included.

The owner must review this concrete plan before implementation. Inline execution is already selected; do not ask for the method again. Plan approval permits only its scoped local test-first work, not actual authority/legal findings, retained-data erasure, production activation or closure of allS02 gates.

Planning verification: all19 local Markdown links across plan/design/closure ledger resolved, code fences/whitespace/placeholder checks passed, eight tasks and26 unique gateway operations matched the plan, canonical053–056 and028 remain absent, and `git diff --check` exited0. Ignored result: `.superpowers/s02-closure-20261023/tracker-plan-review.json`. No product tests, local schema application, build, installation or physical run occurred during planning; no independent review is implied.
