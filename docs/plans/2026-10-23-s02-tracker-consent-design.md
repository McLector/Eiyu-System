# S02 tracker-consent branch — proposed design for review

**October23 approval:** owner approved this written design as the basis for implementation planning. The [concrete implementation plan](2026-10-23-s02-tracker-consent-implementation.md) now awaits review; implementation is not authorized by the design approval. Earlier draft-stage statements below retain their historical scope.

October23. Owner authorized developing this remaining branch, **not implementation**. S01 COMPLETE; S02 INCOMPLETE; public release blocked. This extends the [adopted eligibility design](2026-10-20-s02-minimal-data-eligibility-design.md) and resolves the product choice left open in the [notice design](2026-10-20-s02-notice-consent-design.md). It does not settle actual authority applicability, retention after full withdrawal or other gates in the [closure ledger](2026-10-23-s02-closure-ledger.md).

## Intent and important tradeoff

Keep useful ordinary tracking when optional processing permission is declined. Keep history, sign-in/recovery, birthday correction and data-request access. Separate collecting custom tracker content and fitness records from basic tracking and from AI. No IDs, sensitive verification evidence, content inspection by a reviewer or additional identity system.

The current editors require custom names. Names, descriptions, easy versions, chain/stage text, fitness prescriptions and media can reveal sensitive information. A completion also adds information about the quest it belongs to, even if its request contains only an ID. Therefore a warning, blank notes field or a client-selected “ordinary” label cannot create an enforceable separation.

**Recommendation:** add a basic choice inside the existing quest editor, using neutral server-assigned names such as “Quest 1” and existing structured scheduling/completion controls. Optional custom content and fitness tracking have distinct permissions. Declining leaves basic tracking available; pre-existing custom records become read-only rather than silently treated as ordinary. This is a real usability cost: without custom permission, people cannot name basic quests or continue recording progress against unreviewed legacy/custom quests. The design must be accepted on that basis, not described as a checkbox-only change.

## Approaches considered

| Approach | Consequence | Disposition |
| --- | --- | --- |
| Neutral basic tracking plus optional custom/fitness permissions | Server can validate the basic payload; ordinary tracking survives decline. Requires input provenance and target-aware write guards. | Recommended; fits the authorized separation. |
| Let people mark arbitrary free text nonsensitive | Smaller UI change, but arbitrary/stale clients can still submit sensitive text and linked progress without the relevant grant. A declaration is not proof of content classification. | Not sufficient for this proposed enforcement contract; would require a separately accepted risk disposition. |
| Require one permission for every tracker write | Simpler guard, but declining stops ordinary tracking and combines unrelated optional processing. | Reject for this brief. |

“Basic” means restricted input/provenance, **not anonymous or guaranteed nonsensitive**. Schedules and actions still concern an account. The adopted ordinary-processing assessment must remain applicable to the actual basic fields; this design is not legal certification.

## User behavior

Use existing signup/Profile, quest/chain editors, Gym, Board and history screens. Signup keeps its existing age notice; do not add optional custom/fitness checkboxes to registration. Present short notices only when the person chooses the relevant optional editor, with the fuller explanation and Profile controls available there.

| State/action | Proposed behavior |
| --- | --- |
| No custom or fitness grant | Create/use basic quests; read existing ordinary history; use account/privacy flows. No custom editor submission or new fitness record/upload. |
| Custom grant | Existing custom quest/chain creation, editing and progress, subject to existing account controls and applicable authority. Does not grant fitness or AI processing. |
| Fitness grant | Existing Gym routines, prescriptions, weights, sessions and optional media, subject to applicable authority. Does not grant custom quests or AI processing. No media upload is required to use Gym. |
| Decline in an optional editor | Return to the existing Board/basic editor or Gym history; do not submit entered values or mark a grant. No repeated prompt on every mount/foreground event. |
| Withdraw one grant in Profile | Stop that purpose's new submissions, progress, retries, scheduled side effects and new derived processing. Other independently permitted features remain. Protected records are read-only while retention is under the separate reviewed history/request contract. |
| Grant again | Explicit action against current notice/owner/declaration/authority revisions. No automatic replay of held actions. |

Basic quest fields are existing lane/type, account date/timezone, days/time, difficulty/stat enums and target count/progress. No user-controlled name, description, easy-version text, genre text, attachments or other unbounded payload. Binary habits retain the existing easy-version mechanic using a fixed server-owned phrase; quantity habits retain existing rules. Basic chains use neutral parent/stage labels and existing ordering/completion rules. No template catalogue, new quest type, changed reward rule or new calendar behavior is introduced.

Every existing free-text record is conservatively protected, including apparently generic names. Never inspect titles to relabel them basic. Existing history is not renamed, copied, deleted or migrated into new generic quests. Basic records can be explicitly personalized after the custom grant, becoming protected permanently; withdrawal cannot downgrade them or their linked history to basic. No conversion creates duplicate progress/rewards.

All new tracker writes remain paused for a retained under12 declaration; no permission overrides that rule. Unknown legacy users retain ordinary basic tracking, but unknown/pending ages remain AI-denied. Applicable authority for optional purposes uses the existing conditional review contract; do not require a guardian for every teen or copy an age/AI-only authority decision into new purposes. Mailbox proof stays independent of ordinary tracking.

## Consent and retention semantics

Two proposed purpose keys, `custom-tracker` and `fitness-tracking`, extend existing private purpose/version/event controls. Notices explain data, tracking purpose, Supabase storage, consequences of decline/withdrawal and existing rights/contact access. No affirmative legacy backfill, prechecked choice, implied grant from saving, blanket Terms grant, advertising/training purpose or new verification data. Authority remains server-owned and purpose-scoped. Any material purpose change requires its reviewed notice/grant; new purpose labels alone do not validate an old decision.

A new grant covers the described future processing of relevant saved records as well as new submissions; it does not retroactively validate past collection. Record only purpose/notice, account and declaration/authority revisions, decision and server time in consent evidence, without copying titles, correspondence, birthdays or media. Existing account/profile fields keep their separate reviewed purpose; this tracker design does not classify arbitrary profile text as nonsensitive.

Candidate short choices:

- Custom: “I agree to Eiyu saving and using my custom quest names, descriptions and progress to run my tracker. What I choose to add may include sensitive information. This does not give permission for AI reviews.”
- Fitness: “I agree to Eiyu saving and using my fitness routines, exercise details, weights and workout progress to run Gym. These records may reveal sensitive information. I can choose whether to attach exercise media. This does not give permission for AI reviews.”

Withdrawal must be available in the same Profile control without requiring support approval. Explain the server-confirmed result; an offline/pending request must not be shown as already effective everywhere. Failed saves leave the server decision unchanged. A separately requested erasure/dispute uses the adopted request process and does not require granting either optional purpose.

**Retention qualification:** preserving histories during development is mandatory and no deletion is authorized here. It is not a finding that records may be retained indefinitely after full withdrawal of the only applicable consent. NPC Circular2023-04 section13 links continued processing/retention after withdrawal to other applicable grounds and reasonable retention. The operator must record the actual basis, scope and period for retained history, consent evidence and pending requests before this branch can close for release. If no applicable ground remains, a separately authorized removal process is required; a read-only flag is not erasure or a new lawful basis. Do not silently change the adopted7/30-day request targets or import the seven-day execution-metadata period into these records. [Official consent guidance](https://privacy.gov.ph/wp-content/uploads/2023/11/NPC-Circular-No.-2023-04_Guidelines-on-Consent_07Nov2023.pdf).

## Enforcement and in-flight operations

Extend existing controls; do not implement an independent consent service. A new additive tracker-access capability distinguishes basic writes, custom writes and fitness writes, with owner and current consent/authority/declaration revisions. An unavailable capability refuses affected writes without pretending consent or disabling history/recovery. Exact RPC/schema names belong to the implementation plan.

- Server-owned provenance on quest roots identifies validated basic vs custom content; stages/occurrences/completions inherit the relevant root. Existing roots start protected, without inventing historic permission. Clients cannot set/downgrade provenance or use editable Auth metadata as authorization.
- Check both the target's provenance and proposed payload. Validate basic fields on the server, including direct table/RPC/old-client paths; client-hidden fields are not enforcement. Gym records are fitness-scoped even without text/media. Parentless/direct shared-stat writes cannot assert a basic origin.
- Cover security-definer RPCs, bulk/chain operations, direct writes, materialization-on-read, notifications/widgets and derived state. Basic actions may update their existing rewards/counters through verified paths; they must not trigger new protected occurrences, penalties, history copies or recomputation over paused custom activity. Preserve prior totals and week/timezone mechanics. No caller-controlled bypass context.
- Serialize permission changes with owner/target write authorization. A write committed before withdrawal remains an existing result; later protected writes deny. An uncertain response is not proof of cancellation or noncommit. A stale success must not replace another owner's/current UI state.
- Extend Storage policies for direct uploads/updates as well as Gym database guards. Keep existing ownership/bucket and under12 restrictions. Existing authorized orphan cleanup/privacy removal is separate from new collection, with no broader privilege or automatic fixture deletion. No custom triggers on managed Storage tables. Stored media/cached signed read URLs have separate retention/lifetimes; withdrawal cannot promise to recall delivered bytes.

Update the existing export field/relationship inventory for new provenance and purpose records, preserving reviewed security-field omissions and owner binding. Extend rollback-only cascade/field-coverage tests; the qualified permanent disposable deletion rehearsal is not repeated just because columns/purpose values change. New internal authority references must not leak through public status or export by default.

Current source already uses public Storage upload and restrictive under12 Storage policies; database-only guards would leave a bypass. Official [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) were checked October23 for this design. Recheck current backend docs before implementation and exact SDK54 docs before mobile code.

## Queues, drafts and derived copies

Known declined/withdrawn purposes do not accept new protected actions/drafts into durable queues. Unsaved text already in the active editor is not silently transmitted, duplicated into logs or destroyed by accepting this design; show save refusal and use existing explicit close/discard behavior. Preserve old queued entries and their original dates. Existing queue labels may contain custom text, so a held queue is itself a retained copy covered by the retention gate.

On a known purpose denial, hold relevant entries and require explicit Retry after permission returns. Reconcile uncertain outcomes before resubmission using existing identities/state; no fresh-ID duplicate or moving an old action to today. Basic actions continue independently unless another existing restriction applies. Owner changes never transfer drafts/queue entries.

Compatible clients refresh capabilities at relevant foreground/save/retry boundaries. An offline client cannot know every remote withdrawal immediately; cached grants, durable queues and unreachable old binaries are not proof of current permission. Server admission is authoritative. Do not claim remote deletion or perfect prevention of offline local copies. Existing old-client disposition remains a release gate.

Stop new reminders/widget actions for affected protected records after observed withdrawal; avoid newly persisting their titles in surfaces/diagnostics. Preserve basic reminders. Already delivered notifications and old widget/cache copies need their existing copy/retention treatment; no system-wide permission change is proposed.

## AI interaction

Neither tracker grant grants AI permission. AI still requires the adopted declared12+/no-pending/current-mailbox/specific-AI/conditional-authority checks, direct Groq Free20b/global ZDR/no training, and disabled hosted activation boundary. No Gemini fallback, spend or real inference.

Do not send protected tracker content or its derived aggregates for a withdrawn/ungranted purpose merely because the separate AI checkbox remains checked. For the first implementation, if the existing debrief input depends on protected data lacking its purpose permission, refuse new generation rather than silently filter a mixed historical aggregate or fabricate a complete review. A genuinely basic-only input may use the existing AI flow when all its other checks pass. Reuse consent revisions to invalidate held generation/output after relevant withdrawal. Existing saved-content authorization/history rules remain; retention qualification above is not waived. S04 quota/manual-Generate and generation-trigger rules are unchanged.

Use actual input dependencies: lack of fitness permission alone does not block a debrief that uses no fitness records or derived fitness data. Do not add Gym content to a prompt as part of this work.

## Test-first and acceptance boundary

After written-design/plan review, observe failures before implementation. Inventory affected writes from actual canonical source rather than rely only on the earlier under12 table list. Extend existing suites, not a parallel test framework.

| Boundary | Required cases |
| --- | --- |
| Basic/protected provenance | Basic server-assigned payload accepted without optional grants; forged basic/custom text/foreign parent/direct status writes refused; generic-looking legacy record remains protected; basic→custom irreversible; no title scanning. |
| Purposes and authority | Independent grants, missing/stale notice/owner/revisions, no backfill, under12 override refused, applicable pending/revoked authority, no routine teen guardian requirement. |
| Writes and read side effects | Completion/undo/progress/recovery, edit/archive/restore/move/chain/bulk, old clients, Storage upload/update and derived/materializing paths; ordinary basic progress and retained histories unchanged on denial. |
| Races and retries | Actual database lock-wait withdrawal race, owner A→B→A, response loss/uncertain commit, no automatic regrant replay, original-date expiry and unchanged reward/request semantics. |
| UI/copies/AI | Prior just-in-time notice, unchecked independent choices, accessible decline/withdrawal, no durable protected draft on known denial, queue/widget/reminder scope, no provider dispatch with missing purpose and held-output refusal. |

Build one matching candidate only after contract tests settle. Batch Oppo/web acceptance for basic create/progress, optional grant/decline/withdrawal, legacy read-only behavior, original-date Retry, held purpose/owner change, fitness/media refusal, notices at large font and matching source/origins. Reuse already qualified mailbox/recovery/export cases where unchanged. Font repair remains separate; no new font probe or full-suite rerun solely for this design.

No product, Auth, database, package, installed app or device setting changed in this design turn. No commit/staging, deployment, publishing, external mail/provider contact, inference or spend. Independent review remains limited to the original reviewer; no new agent. Written approval is still needed before implementation planning; retention/authority sufficiency and final physical/release gates remain open.
