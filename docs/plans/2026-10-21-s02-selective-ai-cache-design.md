# S02 selective AI cache retirement — APPROVED FOR PLANNING

S01 investigation COMPLETE; S02 INCOMPLETE. This focused design develops the existing [inventory](2026-10-20-s02-client-cache-inventory.md). It authorizes no deletion, deployment, release or inference. Preserve server histories, ordinary local progress, queues, widget data, fixtures and experiment artifacts.

The owner selected Approve this design for planning on October21. The [implementation plan](2026-10-21-s02-selective-ai-cache-implementation.md) is prepared for review; no product integration or actual cache deletion has occurred.

**Subsequent execution amendment:** the owner reviewed the concrete plan and instructed “do what you think is best.” Local implementation and synthetic-only browser retirement are now verified; isolated native acceptance continues in the [October22 verification record](2026-10-22-s02-selective-ai-cache-verification.md). The initial no-integration statement above describes the planning checkpoint. No real-user/offline-client deletion, residual-copy acceptance or release is inferred.

## Proposed compatible-client behavior

On startup, before the current client can read/write AI suggestion caches, enumerate storage **key names only** in RAM and remove only the exact known legacy key `eiyu:ai-suggestions` and known old scoped keys with the exact schema `eiyu:ai-suggestions:<UUID>:<nonnegative-safe-integer-age-version>`. Do not remove merely similar prefixes, unknown future formats or arbitrary descendants. Never read/cache/log their values or output owner-bearing key names. This operation concerns generated suggestion caches, not saved weekly debriefs or server histories.

Use the existing AsyncStorage/localStorage adapters with an explicit key-enumeration capability. Do not clear storage, change Auth/session keys, delete `REACT_QUERY_OFFLINE_CACHE`, queues or `eiyu.widget.v1`, change an account declaration, or run inference as a migration side effect. Enumerating keys is not an account-content export.

The retirement barrier must be a real awaited operation rather than a fire-and-forget best effort or a swallowed exception. If enumeration/removal fails, ordinary sign-in/quests/recovery remain available; AI suggestion-cache access remains unavailable for this startup and offers an explicit retry through the existing applicable error flow. Do not report cleanup success, write a success marker or authorize a fallback read of the old cache. Retrying after partial removal is idempotent. No broad unreviewed error UI is required.

Retirement must also define what the compatible client may write afterward. Proposed safe boundary: use a **new explicitly versioned cache namespace only after the current action's required owner/permission revisions are validated**. Do not simply purge and immediately recreate an old namespace. Stage suggestions currently have no mobile/web call sites in the source search; this is not permission to add the feature or bypass its existing server eligibility. Before wiring a successor cache, review its purpose/consent contract. Until then, keep that unused action's persistent cache unavailable; do not silently replace caching with extra provider requests. Weekly summaries retain their existing flow and S04 owns its later generation changes.

## Required failing tests and rehearsal

Before product changes, test exact legacy/scoped matches, malformed/resembling prefixes, Auth/query/widget/queue preservation, enumeration/removal failure, partial success then retry, interruption/restart and concurrent calls sharing one startup barrier. Include zero model/network invocation. Test both adapters against synthetic storage only, with unrelated sentinel values compared exactly and no values emitted. Verify import/startup ordering so no AI-cache reader/writer can race ahead of the barrier.

Rehearse reachable synthetic web/mobile storage on the exact candidate origin/build. This does not authorize touching a real user's storage or installing a release. Preserve the retained baseline and all existing histories. A synthetic browser/profile with a different origin proves only that synthetic profile's behavior.

## Limits and separate decisions

An old tab or old binary may still retain or recreate old bytes. No startup migration can erase unreachable/offline clients, OS backups, screenshots or exports. Record reachable variants and unknown population facts truthfully; obtain a separate owner disposition of residual copies before release. **Approval of this local cleanup design would not accept that residual retention.**

Likewise, deleting caches does not drain an in-flight Edge/provider request. Actual request-drain controls, provider-attempt records, deployment populations and final origin/build parity remain separate gates. No timer, sign-out, empty cache or historical hosted pause proves global drain.

## Review decision needed

The destructive part is limited to regenerable AI suggestion-cache entries; nevertheless the owner must review the deletion boundary and the unused stage-action availability rule before product integration. The safer alternative while undecided is to keep release blocked and preserve current bytes. The exact matcher/barrier design and synthetic tests can be prepared without inspecting or deleting any real cache.
