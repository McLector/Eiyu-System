# S02 selective AI cache retirement implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Existing inline execution is selected; no new implementation delegate or reviewer is authorized.

**Goal:** Retire only known legacy suggestion caches on compatible clients without losing ordinary local data or creating provider traffic.

**Architecture:** Add an adapter-bound, single-flight retirement operation with explicit status and retry. Initialize it with each real storage adapter; keep ordinary storage/Auth independent. Pause the unused exported stage-suggestion action before any cache/Auth/model call until its separate purpose contract is reviewed; do not silently replace its cache with additional requests.

**Tech stack:** Existing TypeScript/Jest shared package, AsyncStorage mobile adapter and browser localStorage adapter. Expo SDK54 remains unchanged.

**Spec:** [approved-for-planning design](2026-10-21-s02-selective-ai-cache-design.md). The owner selected Approve this design for planning. This plan still needs review before product integration/deletion.

**Execution amendment:** after reviewing this concrete plan, the owner instructed “do what you think is best.” Inline implementation is authorized and underway; do not request the same approval again. See [verification](2026-10-22-s02-selective-ai-cache-verification.md). The earlier review boundary below is historical; native acceptance and final evidence remain open.

## Global constraints

- Preserve Auth/session keys, ordinary query cache, widget, queues, server histories, saved debriefs, fixtures and ignored artifacts.
- Never read/output retired cache values or output owner-bearing key names, credentials, codes or secret digests.
- No inference, deployment, publishing, production configuration, paid spend or S03/S04 change.
- Exact known keys only; do not remove arbitrary descendants or similar prefixes.
- Failure never becomes successful cleanup or ordinary quest denial. Unknown/offline populations and request drain stay separate gates.
- Read exact official SDK54 reference source when its website redirects to latest, before changing mobile code. Read installed AsyncStorage API signatures. Do not install/upgrade dependencies.
- No staging or commits. Existing dirty work is preserved; review final changes against a separately preserved before-snapshot.

## Review focus

1. A key resembling the AI prefix contains unrelated data: preserve it exactly (Task1 matcher tests).
2. Removal fails halfway: fail closed for AI cache, retain ordinary access, explicit retry finishes only remaining known keys (Task1 deferred/failure tests; Task2 startup tests).
3. Two calls race or an old adapter finishes after replacement: one operation per adapter instance, no false status on the replacement (Task1 deferred tests).
4. Startup failure or blocked browser storage breaks sign-in: contain it as a cache-only failed status, with no unhandled rejection or global UI lock (Task2 adapter tests).
5. An old stage-suggestion caller now misses cache: return the deliberate unavailable error before Auth/network/storage reads, rather than generating extra traffic (Task3 negative tests).

## Task1: Exact matcher and adapter-bound retirement state

**Files:** create `packages/shared/src/cache/suggestion-retirement.ts` and `packages/shared/src/cache/__tests__/suggestion-retirement.test.ts`; modify `packages/shared/src/cache/adapter.ts` and public exports in `packages/shared/src/index.ts`.

**Interfaces:** extend `CacheAdapter` with optional `getAllKeys?(): Promise<readonly string[]>`; the real adapters implement it in Task2. Missing enumeration is a failed retirement capability, never permission to clear/read old caches. Export:

```ts
type SuggestionRetirementStatus = 'running' | 'complete' | 'failed';
isRetiredSuggestionKey(key: string): boolean;
getSuggestionCacheRetirementStatus(): SuggestionRetirementStatus;
retrySuggestionCacheRetirement(): Promise<SuggestionRetirementStatus>;
```

`initCacheAdapter(adapter)` remains synchronous for current callers. It creates a new private retirement object bound to that adapter and starts its operation. The operation catches storage errors into the explicit failed result/state, never a successful result, and never rejects unobserved at module initialization. Concurrent `retry` callers receive the same in-progress promise. A complete instance is not re-enumerated until a genuine reinitialization/restart; a failed instance retries only by explicit `retry`. Capturing the instance prevents an older adapter's completion changing the newer instance's state. Do not log errors containing keys/values.

- [ ] Write matcher/failure tests before implementation, including this data boundary:

```ts
const owner = '11111111-1111-4111-8111-111111111111';
const legacy = 'eiyu:ai-suggestions';
const scoped = `${legacy}:${owner}:1`;
const preserved = [
  'sb-synthetic-auth-token', 'REACT_QUERY_OFFLINE_CACHE',
  'eiyu.widget.v1', `eiyu.writeQueue.v1.${owner}`,
  `${legacy}-unrelated`, `${scoped}:extra`,
  `${legacy}:not-a-uuid:1`, `${legacy}:${owner}:01`,
  `${legacy}:${owner}:-1`, `${legacy}:${owner}:9007199254740992`,
];
expect(isRetiredSuggestionKey(legacy)).toBe(true);
expect(isRetiredSuggestionKey(scoped)).toBe(true);
for (const key of preserved) expect(isRetiredSuggestionKey(key)).toBe(false);
```

Use Map-backed synthetic storage. Assert `getItem` and `setItem` never called; compare every preserved sentinel value exactly without logging them. Cover UUID case, version0/MAX_SAFE_INTEGER, malformed non-string enumeration, duplicate enumerated keys and empty storage. Enumerate/validate the entire list before deleting; invalid enumeration fails without broad deletion.

- [ ] Add deferred-promise tests for single-flight and adapter replacement. Inject failure on the second removal; assert failed status, no success marker, known earlier deletion allowed, preserved sentinels exact, then explicit retry complete. Reinitialize with the remaining Map contents to simulate restart after interruption; complete idempotently. Failed enumeration and unavailable `getAllKeys` produce failed status with zero removals.
- [ ] Run `npm test --workspace=@eiyu/shared -- --runInBand src/cache/__tests__/suggestion-retirement.test.ts`; record the actual failing assertions.
- [ ] Implement only the exact matcher and state machine. Match UUID shape `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}` case-insensitively; require canonical integer text `0|[1-9][0-9]*` and `Number.isSafeInteger(Number(version))`. Do not impose an arbitrary UUID version restriction or accept trailing suffixes. Capture the adapter in each operation; deduplicate keys before removal; retain no values or persistent success marker.
- [ ] Rerun those tests and shared typecheck. Inspect that no ordinary storage method depends on successful AI retirement. Task1 completes only with the expected failure/retry/replacement behavior, not merely successful removals.

## Task2: Both real adapters and startup containment

**Files:** modify `mobile/lib/supabase.ts`, `web/src/lib/cache-adapter.ts`; create focused adapter tests under `mobile/lib/__tests__/cache-retirement.test.ts` and `web/src/lib/__tests__/cache-adapter.test.ts` following each workspace's installed Jest/mocking conventions. Keep Auth creation/recovery clients unchanged.

**Consumes:** Task1 `CacheAdapter.getAllKeys`, synchronous initialization, explicit status/retry API.

- [ ] Read the version-matched official Expo54 reference source and installed AsyncStorage declarations before edits. Preserve current adapter initialization order and normal Supabase configuration; inspect imports for a real circular dependency instead of assuming it.
- [ ] First write adapter tests that seed synthetic legacy/scoped keys and ordinary sentinels, initialize the actual adapter module, wait through the public retirement API and compare sentinel bytes. Exercise storage exceptions: adapter import/ordinary `getItem` for a non-AI sentinel must still work when that method remains available; retirement status must be failed and retry explicit. Include mobile static rendering without `window`: no native enumeration call/crash and no fabricated successful cleanup of actual device storage. Spy on inference/network methods and assert zero calls. Observe initial RED before implementation.
- [ ] Mobile adapter delegates `getAllKeys` to the installed public AsyncStorage method. Browser adapter snapshots names without values:

```ts
getAllKeys: async () => {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
},
```

The snapshot is built before Task1 starts removing. Access to `window.localStorage` can itself throw; the retirement state captures that failure. Ordinary existing adapter behavior remains intact. Do not add a permission request or app-wide loading gate.
- [ ] Run only the new adapter suites plus existing relevant Auth/signup/recovery initialization tests; run all three TypeScript checks because the exported adapter interface crosses workspaces. Record exact commands/results. No physical install or real storage cleanup follows merely from unit success.

## Task3: Pause unused suggestion entry point and regression/rehearsal

**Files:** modify `packages/shared/src/ai/suggestions.ts` and affected existing tests `age-access.test.ts`, `debrief-owner-race.test.ts`, `suggestions-proxy-error.test.ts`; add `packages/shared/src/ai/__tests__/suggestion-retirement-access.test.ts`. Preserve existing test intent/source snapshots before removing assumptions that this paused action invokes a provider. Weekly-summary request and parsing tests retain their existing coverage.

**Produces:** exported constant `STAGE_SUGGESTIONS_PAUSED_MESSAGE = 'Stage suggestions are unavailable while their privacy requirements are reviewed.'`; `suggestStages(questName, stat): Promise<string[]>` deliberately rejects with that error **before Auth, cache or provider work**. Preserve its public signature; do not introduce a hidden opt-in/fallback or successor namespace.

- [ ] Add failing negative tests using the actual exported entry point with valid/invalid input, fresh legacy cache, fresh scoped cache, retirement pending/failed/complete and owner changes. Each must reject with the deliberate paused message and invoke none of cache reads/writes, Auth queries or `functions.invoke`. This is the adopted no-extra-provider-request boundary, not a simulation of future consent.
- [ ] Observe RED; implement the explicit unavailable result. Remove unreachable persistent stage-cache helpers only after confirming no remaining production call sites; preserve exported pure key/freshness helpers if their public tests/consumers still require them. Do not alter weekly summary generation, its current owner/consent/mailbox revisions, provider routing or S04 policy.
- [ ] Update now-obsolete stage-provider tests to assert the pause and preserve weekly error/race coverage through `generateWeeklySummary` where relevant; never make the suite green by dropping unrelated owner, withdrawal or weekly error tests. Run the affected shared suite, then full shared tests once because public behavior changed. Run web/mobile adapter/Auth regressions and types; run affected lint/web build only if the changed integration warrants them. Resolve observed failures before claiming success.
- [ ] Create an ignored synthetic-only retirement rehearsal using the real adapters on the exact candidate origin/build. Seed only synthetic cache/sentinel bytes in an isolated fixture/profile; do not inspect/delete actual account caches or overwrite retained scratch sources. Verify only known keys removed, ordinary sentinels exact, zero inference, failed-then-retry behavior and restart idempotence. Preserve candidate/baseline and restore ordinary device state. If native/origin access is unavailable, record this physical gate open rather than repeat unrelated historical builds.
- [ ] Amend inventory, continuation, device/release record and existing progress file with exact software/rehearsal scope. Mark unreachable old-client residual retention, unknown deployment population and server drain **still open**. No028 or S03. Existing independent reviewer unavailable remains an open review gate; do not spawn another.

## Self-review and execution boundary

All selective-key, values/privacy, ordinary-data, failure/retry, startup ordering, no-new-model-traffic and explicit availability requirements map to the three tasks. Unsupported enumeration fails closed; browser exceptions do not become global Auth failure. No successor cache format or implicit action bypass is added. Unknown keys are preserved intentionally; complete status means only known-key retirement in this adapter instance, never all historical copies erased.

The plan deliberately does not implement a forced upgrade, new email editor, new guardian evidence, native font coordinator, retention automation or request-drain protocol. Those require separate concrete designs/evidence. Await owner plan review, then preserve the existing inline execution method and TDD workflow. No new execution-method question is needed.
