# Eiyu evolution roadmap — brainstorming draft

Date: 2026-10-11 (Asia/Manila).
Status: proposed roadmap for review; not an approved implementation specification.
Scope: shared backend/domain logic, React/Vite web, Expo SDK 54 mobile.
No product code, external configuration, deployment, or migration was changed during this brainstorming session.

## Intent and confirmed decisions

Make progress tracking more personal, deliberate, reliable, and understandable on both platforms. Preserve accurate statistics while making weekly feedback about the user's actual habits. Improve account trust without blocking ordinary quest tracking.

- Weekly debrief generation is explicit: opening Status or Weekly only reads saved content and allowance. Rename Regenerate to Generate everywhere.
- Exactly two generations TOTAL per account per calendar week, shared by mobile and web. The first generation uses one slot. The user explicitly confirmed this interpretation.
- Users may track quests before email verification. Only weekly debriefs are locked until verification. The user explicitly selected this scope.
- Skills appear below Board profile attributes and in a Skills tab inside Status on both platforms. No separate main Skills board. The user confirmed this layout.
- Enabling a skill on an existing daily quest awards XP for future completions only. No historical backfill. The user confirmed this rule.
- Skill rewards match attribute rewards: currently 20 XP for a full completion and 4 XP for an easy completion. Reuse the shared authoritative reward rules so the two cannot drift. The user explicitly confirmed matching rewards.
- Skill progression also matches the attribute curve: advancing from overall skill level N costs `100 + (N - 1) * 25` XP. Apply the curve continuously across the six tiers and 60 displayed levels, without resetting the cost at a tier boundary. The user explicitly confirmed this curve.
- Required execution boundary: Finish slice -> Create handoff -> Provide continuation prompt -> Stop. Resume the next slice in a new session. Blocked or otherwise incomplete slices do not count as completed.

## Current evidence from the repository

- `packages/shared/src/data/weekly-summary.ts` combines reading and first generation in `fetchOrCreateWeeklySummary`; regeneration currently reserves against a two-per-day cap.
- `mobile/components/status/weekly-debrief.tsx` requests that flow on mount. `web/src/web/WebStatus.tsx` also uses the combined read/create API.
- Server AI quotas, provider failover, and failed-request refunds already exist. Extend their contracts rather than adding a parallel quota system. Refunds after provider failure do not by themselves establish correctness when saving a successful response fails.
- The summary input already includes habit names and full/easy completion counts; it needs richer schedule/evidence context and a revised prompt.
- Mobile uses TanStack Query with AsyncStorage persistence, a seven-day cache lifetime, account-keyed queries, and an offline write queue. Web has TanStack Query, local storage adapters, and existing account cache cleanup. Audit these paths before introducing another storage system.
- Mobile already has local notifications, notification tap routing, and an Android Today widget. These are improvement projects, not new subsystems.
- Mobile radar uses SVG with a fixed maximum of 50. Web uses Recharts, with level data and a `fullMark` field. Reproduce the reported mismatch before declaring a root cause; the field alone does not establish an explicit radial domain.
- `packages/shared/src/logic/legal-content.ts` describes only Gemini even though backend provider configuration supports Gemini and OpenAI-compatible providers. Its broad data statements and export/deletion promises need verification against real behavior.
- Local `supabase/config.toml` disables signup email confirmations. This does not establish the hosted project's configuration.
- Existing handoffs run through `docs/handoff/026-handoff.md`. Handoffs 007-026 are uncommitted by the user's existing preference; preserve them.
- The latest handoff records outstanding physical-device visual checks from earlier work. Do not mistake those old checks for evidence that new changes pass.

## Approach and alternatives

Recommended: evolve the existing shared domain/backend in small vertical slices, delivering equivalent web/mobile behavior together when they share a contract. Keep skills as a separate progression concept linked to daily quests; retain the current attributes and rank.

Alternative: implement all visual additions first. This gives faster previews but postpones quota, verification, and XP contracts and increases rework. Suitable only for explicitly requested throwaway prototypes.

Alternative: replace caching with a complete local database/sync architecture now. This offers more offline control but expands migration and conflict-resolution risk. Only reconsider if measurements show the current persistence/queue cannot meet a specific requirement.

## Proposed behavior

### Weekly debrief and allowance

- Read saved debrief and server allowance without any model invocation, including after opening another tab, retrying a read, foregrounding the app, or navigating between Status views.
- Empty state explains what Generate does. Show `0 of 2 used this week`, then `1 of 2` and `2 of 2`, with the actual reset date. Display the period covered and generation timestamp; saved text does not silently change when new habits are completed.
- Recommend Monday-Sunday in the persisted account timezone, matching the existing week helper. Finalize rollover/timezone-change rules before implementation so timezone changes cannot reset the allowance repeatedly.
- Generation requires a verified email and network access. Reading allowed cached content is a separate operation; define whether an email change hides an existing debrief as part of the verification policy.
- Reserve atomically before the provider call, deduplicate concurrent/double-click requests across devices, and return authoritative usage with the result. Prevent direct API and direct database bypasses.
- Count successfully persisted generations. On failure, preserve the previous saved text and restore the reservation exactly once. Address provider failure, timeout, process crash, client disconnect, and save failure with request IDs, recovery/expiry rules, and durable results. Reconnecting must not accidentally invoke another paid generation.
- Build the week's evidence on the server or validate it against server records; client-supplied counts must not become authoritative.
- Decide how current-week legacy summaries/counters transition, preserving saved content without silently granting extra allowance.

### Habit-focused writing

- Up to two paragraphs, targeting about five sentences each when evidence supports that length. Sparse/no-activity weeks may be shorter rather than padded with invented observations.
- Paragraph one reviews named habits, full/easy completion patterns, consistency, and accurately supported results. Paragraph two evaluates the pattern and suggests one or two feasible adjustments grounded in those habits.
- Include scheduled opportunities, elapsed eligible days, changes to habit lifecycle, and available evidence. A three-days-per-week habit must not be evaluated as seven missed opportunities. Distinguish unscheduled days, skipped activity, future days, missing data, and easy completions.
- Reference attributes where relevant. Completion counts, attribute XP, and attribute levels are different measures; use their correct labels.
- Keep tone constructive. Do not infer medical conditions, personality defects, or reasons for missed habits. Treat habit text as untrusted model input, including instructions embedded in a habit name.
- Show readable paragraphs on web and mobile; preserve an intentional mobile expand/collapse control if needed rather than letting the current 160-character preview hide nearly the whole review.

### Email ownership and Google authentication

- Email format validation improves input quality; it cannot prove ownership. Do not require Gmail or disallow legitimate aliases/custom domains merely to demand a real address.
- Keep quest tracking available to unverified accounts. Do not simply enable a login-blocking signup-confirmation setting contrary to the confirmed requirement.
- Establish server-owned proof of the current email's ownership, preferably using Supabase's supported email OTP/link verification flows. Verify feasibility and legacy behavior first. Do not accept a client boolean or user-editable metadata as proof, or assume an auto-confirmed timestamp proves mailbox access.
- Lock both reading/generating access as agreed in the final verification policy; enforce generation in the server and quota path before any provider spend. UX: `Verify your email to generate your weekly debrief.` Offer Send verification email, resend cooldown, and Check verification status.
- Handle wrong/expired/reused codes or links, email changes, refreshed sessions, old cached verification state, rate limits, delivery failure, and web/mobile callback routing. Bind verification evidence to the account and current email.
- Google login should use the existing Supabase account model. Configure minimal identity scopes, callback allowlists, and separate environment/build identifiers. Resolve existing email/password identities without creating a second profile or losing quest history; test cancellation and linking collisions.
- Trusted provider-verified email evidence may satisfy the same ownership requirement when validated server-side. Do not mark all Google metadata trusted automatically.
- Production verification needs reliable SMTP configuration and an actual inbox test. Google needs Google Console configuration and real OAuth checks. These are user/external prerequisites, not tasks that can be declared complete with mocks.
- If iOS App Store distribution is in scope, assess Apple's equivalent private-email login requirement before shipping Google login; Sign in with Apple may be needed.

### Skills

- A daily quest gets an optional Track as skill toggle. Proposed initial model: one optional skill per quest, with an editable skill name defaulting to the quest name. Shared skills across several habits are a separate decision, not assumed scope.
- New and existing daily quests can opt in. Enabling begins earning on future completions; disabling pauses awards without deleting earned history. Renaming, archiving, restoring, and deleting a quest must preserve already earned skill progress.
- Six tiers, ten levels each: Novice 1-10, Intermediate 1-10, Advanced 1-10, Master 1-10, Legend 1-10, Transcendent 1-10. Map these to overall levels 1-60. The confirmed attribute curve costs `100 + (N - 1) * 25` XP to advance from overall level N: 100 XP from Novice 1, 125 XP from Novice 2, and 325 XP from Novice 10 to Intermediate 1. Tier transitions do not reset accumulated XP or the curve. Zero XP starts at Novice 1. Maximum-level behavior still needs definition before coding.
- Confirmed rule: skill XP matches the attribute XP awarded for the same eligible completion, currently 20 XP full and 4 XP easy. Reuse shared reward constants/rules rather than duplicating the amounts or introducing a separate multiplier. Attribute rewards remain unchanged. Recovery/progress-action eligibility still needs definition.
- Skill and attribute awards must originate from the same authoritative completion event, atomically. A completion retry, offline replay, or concurrent device action must not award twice. Undo reverses the award tied to that completion, including across a tier boundary.
- Board: compact skill rows below attributes, each showing name, tier/level, and XP progress. Show a small preview with View all when there are many skills; do not make the Board header grow without bound.
- Status: a Skills tab with full progress and an empty state linking to the daily quest form. Web can show denser rows/cards; mobile uses a readable single-column list. Keep attributes legible instead of shrinking them indiscriminately.

### Profile, mobile layout, and radar

- Rename visible Class labels and help text to Perceived title, including profile editing, validation, and accessibility copy. A presentation rename need not rename database fields.
- Bring mobile avatar, name/title, and rank into one cohesive header group with a controlled gap; handle long names and titles without pushing rank away.
- Weekday controls: prefer seven equal columns with short labels and full accessible day names. Measure actual available width; remove the fixed sizing/gaps that leave Saturday alone. Test small screens, landscape, keyboard visibility, and large fonts. If adequate tap areas cannot fit at an extreme width, use a deliberate balanced fallback rather than one orphaned control; settle that exception during visual review.
- Use shared stat order, value semantics, scale rules, and fixtures for radar parity. Guard zero/invalid maximums and out-of-range values; compare zero, equal, uneven, and high-level profiles. Fix placement/labels and clipping based on reproduced screenshots on both platforms.

### Caching and optimization

- Define which reads persist, their freshness rules, schema-version invalidation, and account-bound storage keys. Verify persisted storage, in-memory queries, AI suggestion caches, offline queue entries, and widget snapshots all isolate accounts and are removed appropriately on logout/deletion.
- Cache reads render immediately and refresh in the background. Clearly distinguish stale/pending local progress from server-confirmed XP, skill levels, allowance, and verification.
- Keep AI generation online and explicit. Do not queue it as an automatic offline retry. Use idempotent queued quest writes, bounded retries, and clear terminal-failure handling.
- Include timezone/day/week changes, cache corruption, app upgrades, multi-tab use, logout/login races, and account changes during in-flight requests.
- Measure cold/warm startup, request counts, query payloads, list rendering, image use, and reconnect behavior. Optimize measured bottlenecks and document before/after evidence rather than adding memoization everywhere.

### Developer support

- Coffee icon beside the profile control, with accessible label Support the developer. Opens a modal explaining the optional contribution and a real hosted payment destination.
- Stripe is optional; hosted payment links avoid building card handling into Eiyu. Choose the provider only after checking payout country, currency, fees, and actual account availability. No credentials/card data in clients.
- Proposed contributions unlock no skills, XP, rank, badges, or generation allowance. Use wording appropriate to voluntary developer support, not unverified charitable or tax-deductible claims.
- Evaluate each mobile distribution channel and storefront separately. External checkout alone does not establish app-store compliance. Google Play and Apple have specific conditions for gifts/tips; do not assume contributions to an app developer automatically qualify.
- A real payment URL/account is a completion prerequisite for the integration slice. Test cancel/return behavior and avoid asserting payment success based solely on returning to the app.

### Notifications and widgets

- Audit existing reminders before adding more prompts. Test explicit opt-in, permission denial/revocation, duplicate prevention, edits, completion, archive/delete, logout, timezone/DST changes, and notification tap routing.
- Add useful preference controls only where justified: quiet hours, daily digest, or per-quest reminders. Keep reminder scheduling failures distinct from successful quest saves. Do not assume dependable background JS execution on mobile.
- Recommended Android widget evolution: keep Today/All and add Daily-only and 1-Time-only views through the existing snapshot/rendering pipeline. Determine whether the installed library supports per-instance configuration or requires separate registered widget variants.
- Test multiple instances, empty/loading/stale data, resizing, midnight rollover, logout privacy, deep links, and offline completion behavior if widget actions support it. Widgets must not generate AI summaries.
- Android is the existing widget implementation. iOS widgets require a separate native scope and build investigation; do not promise parity automatically.

### Privacy and terms

- Start with an actual data-flow inventory: account identity, habit content/history, skill data, local storage, AI providers, email delivery, logs, payments, and exports/deletion. Verify the existing claims rather than just expanding the prose.
- Update AI disclosure for every configured provider and failover path, what habit evidence is sent, the purpose, and relevant retention/processing terms. Show understandable disclosure where Generate is used.
- Review controller/contact details, lawful grounds, retention, international transfers, user rights, security descriptions, minors/age scope, and support-payment terms against the actual operator and intended launch countries. Do not infer jurisdiction solely from the user's timezone.
- Verify export and deletion cover new skills, verification records, cached content, queued writes, and relevant retention exceptions. Update store privacy declarations when applicable.
- Distinguish engineering checks from legal signoff. Published wording must reflect real practices; identify any points needing jurisdiction-specific professional review.

## Proposed slice order and completion gates

Each numbered row is one session-sized boundary. Split further before execution if discovery shows the row cannot be completed and validated reliably in one slice. Every row ends in the mandatory handoff/prompt/stop sequence.

| Slice | Deliverable | Required evidence before completion |
| --- | --- | --- |
| S01 | Data/privacy inventory and verification feasibility; settle release markets, week rules, and rollout constraints | Source/live configuration comparison where accessible; ownership-proof approach demonstrated in a safe test environment; decisions recorded without secrets |
| S02 | Email verification, debrief eligibility, and existing-account rollout | Tests written first; direct-server bypass tests; real email delivery/callback; unverified users still track quests |
| S03 | Google authentication on web/mobile | Identity/linking/cancellation tests; actual Google login in scoped environments/builds; preserved existing profile/history |
| S04 | Manual weekly Generate and two-total-per-week allowance on both platforms | No model call on navigation; concurrent request, week rollover, verification, failure/refund/save recovery, and server quota tests |
| S05 | Habit-focused debrief evidence and writing | Deterministic evidence tests and representative model-output review: scheduled, easy, empty, sparse, archived/deleted and hostile habit text |
| S06 | Perceived title, mobile header spacing, weekday form layout | Component/accessibility tests first; measured web/mobile widths and large-font visual checks |
| S07 | Reproduced radar defect and parity fix | Shared value/scale fixtures; component tests; comparable web and mobile screenshots |
| S08 | Account-safe persisted caching and measured performance improvements | Cold/warm/offline/reconnect/account-switch checks; queue replay tests; measured before/after results |
| S09 | Skill schema, XP rules, and completion/undo integration | SQL/RLS and concurrency tests; no duplicate awards; tier boundaries; future-only activation; migration validation |
| S10 | Daily quest skill form, Board preview, and Status Skills tab | Web/mobile form, empty/error, overflow and accessibility tests; live completion/undo and device visual checks |
| S11 | Developer support icon, modal, and real payment destination | Provider/storefront eligibility settled; real link, navigation/cancel checks; appropriate terms and disclosures |
| S12 | Notification audit and agreed improvements | Reminder lifecycle tests; OS permission/channel and real-device delivery/tap checks |
| S13 | Daily-only and 1-Time-only Android widgets | Snapshot/variant tests; actual widget build/install, multi-instance, resize, day rollover and logout checks |
| S14 | Final privacy/terms, integrated regression, and agreed release scope | Data inventory reconciled with final implementation; export/deletion checks; web build/types/lint/tests, mobile/shared checks, DB and AI checks; required device/live evidence |

Dependencies: S02 before verified debrief release; S04 before S05; S09 before S10; S11 requires payment setup; S13 may require a native rebuild. S08 supplies cache rules for skills and widgets. Reconcile privacy disclosures in each relevant slice, with S14 as the final audit.

## Execution and verification protocol

1. Review and approve this roadmap's remaining product decisions. Produce the focused design specification and implementation plan for the next subsystem using the repository's process skills before implementation.
2. At slice start, read AGENTS.md, this roadmap, the last completed handoff, and current Git status/log. Preserve unrelated work and the uncommitted handoffs. Inspect applicable nested instructions.
3. Write meaningful failing tests before software changes. Cover errors, negative cases, authorization, and concurrency where applicable. Use exact Expo SDK 54 docs before mobile code and current Supabase docs for backend/auth.
4. Implement only the active slice. Subagents may work within it, never continue into the next slice automatically.
5. Run relevant project tests and required checks with real output. Available runners include `npm run test --workspace @eiyu/shared`, `npm run test --workspace @eiyu/mobile -- --runInBand`, `npm run test --workspace @eiyu/web`, workspace TypeScript checks, lint, web build, root `db:test`/`db:verify`, and the relevant AI-proxy Deno tests. Confirm exact commands/tool availability at execution time. Run full affected suites before completion; do not claim previous-session counts as current results.
6. Required physical-device/live checks must pass before a slice that includes them is complete. Test mocks/style assertions do not prove layout, OAuth, email delivery, notification delivery, or widget behavior.
7. If blocked, report the unfinished slice, completed work, failed/skipped checks, and exact prerequisite. Preserve work in an in-progress checkpoint if needed, clearly marked INCOMPLETE. Do not create a numbered completed-slice handoff or advance the slice.
8. When all gates pass, create the handoff, verify its continuation prompt matches actual state, return that prompt to the user, and STOP.

External setup is surfaced before dependent work: Google Console access/configuration; email delivery configuration/domain records; payment account/link and payout eligibility; native build/device availability; any deployment credentials/approval required by the agreed release scope. Do not change production auth or publish updates merely because this draft exists.

For later Vercel environment, deployment, and log work, the Vercel CLI is currently absent. Recommend installing it with `npm i -g vercel` to enable `vercel env pull`, `vercel deploy`, and `vercel logs`; this brainstorming session does not install it or authorize deployment.

Model routing for an automode implementor: use `gpt-6-luna` at medium effort for bounded UI/tests/docs and high effort when a well-defined shared change needs more reasoning. Escalate to a stronger currently available model for unresolved authentication, quota concurrency, migration, or sync architecture, or repeated failed verification. Use current tool allowlists, not historical model names. Record delegated tasks and results in the handoff. Agent orchestration does not override the slice stop rule.

## Handoff contract

Continue the existing sequence: the next completed implementation slice uses `docs/handoff/027-handoff.md` only if 026 remains the highest existing number at completion. Re-scan the directory and allocate the next unused three-digit number; never overwrite an existing handoff. Slice IDs and handoff numbers are separate sequences.

Each completed-slice handoff must include:

- Slice ID/title and explicit COMPLETE status, scope, acceptance gates, and completion date.
- Confirmed requirements, new decisions, exact behavior/contracts, and reasons for material tradeoffs.
- Branch, actual commit hashes if any, uncommitted changes, relevant Git status, and unrelated work to preserve. Do not invent commits or include secrets/personal notes.
- Changed files with purpose; schema/migration/RPC/API/type contracts; dependency/native-build changes; feature flags/configuration names without values.
- Tests and commands with actual results; red-before-green evidence; live/device evidence; any non-required skipped checks explicitly distinguished from required gates.
- Local versus hosted database/function/web/mobile versions, what was deployed, what was not, rollback steps, and external prerequisites for the next slice.
- Known limitations that do not invalidate completion; unresolved decisions and risks for the next slice.
- Exact next slice, prerequisites, first concrete task, and a copy-paste continuation prompt embedded in the handoff.

Keep handoffs local/uncommitted under the existing preference unless the user changes it. This roadmap also remains uncommitted; no public-repository documentation commit is authorized here.

Continuation prompt template (fill all bracketed values from actual completed state):

```text
Continue Eiyu System in C:\Project\portolio-projects\eiyu-system.
Read AGENTS.md, docs/plans/2026-10-11-eiyu-evolution-roadmap.md,
[approved subsystem spec/implementation plan paths], and
docs/handoff/[NNN]-handoff.md first. Inspect current Git status and log;
preserve unrelated changes and existing uncommitted handoffs. Treat the
handoff as a recorded checkpoint and verify any live state that may have changed.

Completed: [slice ID/title and key contracts].
Next: [slice ID/title], with these prerequisites: [exact prerequisites].
Begin with [first concrete task]. Implement ONLY this next slice using
tests first and the currently available tools/models. Use Expo SDK 54
docs before mobile code. Subagents may help within the slice using the
documented Luna-first routing; escalate when justified.

Completion requires [exact acceptance/tests/device/live gates]. Do not
count blocked or partially verified work as a completed slice. Do not
publish/deploy outside the recorded authorization. On completion, create
the next unused docs/handoff/NNN-handoff.md containing the full state and
an exact continuation prompt; provide that prompt to me; then STOP.
Do not begin the following slice in the same session.
```

## Decisions still needed before the relevant slices

- Launch countries/operator identity, age/minor policy, and Android/iOS/store distribution scope.
- Week/reset and timezone-change rules; treatment of legacy saved debriefs and email ownership; debrief visibility after email changes.
- Google account linking policy and whether the selected iOS release requires another login option.
- Skill recovery/progress-action eligibility, maximum behavior, and whether skills ever group multiple habits. Full/easy reward amounts and the continuous level XP curve are settled and match attributes.
- Payment provider/account/currency, actual payment URL, and storefront support treatment.
- Weekday fallback at extreme widths/fonts; notification improvements beyond fixing verified defects; widget configuration/variant support.

## Official references consulted

- Expo SDK 54: https://docs.expo.dev/versions/v54.0.0/
- Expo SDK 54 AuthSession: https://docs.expo.dev/versions/v54.0.0/sdk/auth-session/
- Expo SDK 54 notifications: https://docs.expo.dev/versions/v54.0.0/sdk/notifications/
- Supabase Google auth: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase email/password auth: https://supabase.com/docs/guides/auth/passwords
- Supabase custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Google Play payments/tips: https://support.google.com/googleplay/android-developer/answer/10281818?hl=en
- Apple review guidelines (login services, payments, gifts): https://developer.apple.com/app-store/review/guidelines/
- Stripe hosted payment links (one optional provider): https://docs.stripe.com/payment-links
- Philippine Data Privacy Act (relevance depends on actual operator/markets): https://privacy.gov.ph/data-privacy-act/

These references support the design discussion, not a claim that Eiyu is legally compliant or that any specific payment-provider account is available. Re-check relevant policy and versioned documentation before implementation/release.
