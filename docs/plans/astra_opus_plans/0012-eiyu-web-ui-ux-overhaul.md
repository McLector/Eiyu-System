# 0012 — Eiyu web UI/UX overhaul: final reviewed plan

## Summary

Implement the requested improvements for **web only**, retaining Eiyu's fantasy HUD identity, palette and font families. Mobile UI remains separate.

Final review adds four corrections:

- Bounded data reads: the configured 1,000-row API limit must not truncate workout history or previous-weight calculations.
- A history screen that actually exposes workouts belonging to deleted routines.
- Safe reconciliation of uncertain saves before retrying writes or deleting uploaded media.
- Separate migrations for phases that are applied and verified at different times.

The earlier review's 15 baseline tests passed. This final pass inspected code/configuration and passed `git diff --check`; proposed behavior still requires implementation acceptance.

Save this plan as `docs/plans/astra_opus_plans/0012-eiyu-web-ui-ux-overhaul.md` and initialize `docs/handoff/003-handoff.md`. Neither file was written while Plan mode remained active.

## Implementation phases

### Phase 1 — Documentation and continuation baseline

- Save this complete plan, initialize handoff 003 following handoff 002, and preserve the supplied reference image in a durable documentation asset.
- Record branch/commit, working-tree state, SQL capabilities, verification environment and review evidence.
- Initialize implementation phases as pending. Keep inherited production/device acceptance separate.
- Recheck repository and environment state when implementation begins.

### Phase 2 — Shared controls, dialogs and feedback

- Establish content-sized primary, secondary, quiet and destructive buttons, consistent fields, validation messages and action footers.
- Use Rajdhani for headings/actions, Inter for forms/body and JetBrains Mono for numerical progress. Self-host existing licensed font assets.
- Replace circular X controls with plain icons, accessible labels, 44 × 44 hit areas and visible focus.
- Consolidate dialog implementations: unique titles, one scrolling body, topmost keyboard handling, focus containment/restoration and live theme updates.
- Introduce one authenticated navigation-guard coordinator. Editors register dirty/pending state; they do not independently register router blockers.
- Opening account overlays preserves the underlying Gym draft. Closing editors, route changes, routine switching and logout receive appropriate unsaved-change handling. Refresh uses native browser protection.
- Preserve local editor input during background refreshes.
- Use one account-scoped notification queue, accessible within the active dialog when applicable.
- Distinguish confirmed success, confirmed failure and uncertain outcome. Refresh failure cannot undo a committed save; uncertainty requires reconciliation before retry or cleanup.

### Phase 3 — Archive and account-menu makeover

- After confirmed success, show “Habit archived ✓”, profile/archive guidance, View archived habits, and plain X dismissal.
- Assign each event an ID and owner. Repeated events restart the eight-second timer; hover/focus pauses it. Discard old-account events and late responses.
- Rebuild the dropdown with aligned icons, grouped actions and separated sign-out.
- Support arrow keys, Home/End, Escape and focus restoration.
- Restyle Edit profile, Settings and Archived habits.
- Preserve overlay URLs, Back/Forward, details, restore and guarded permanent deletion.

### Phase 4 — Gym persistence and complete data reads

Append canonical migration **035**, after confirming numbering.

**RIR**

- Preserve numeric `rir`; add nullable `rir_max`.
- Accept whole-number values or ascending ranges within 0–10, including `1-2` and `1–2`. Equal endpoints normalize to a scalar.
- Include ranges in new snapshots; historical snapshots remain unchanged and readable.

**Deletion**

- Add a server-controlled routine deletion timestamp and an owner-checked, idempotent deletion RPC.
- Remove routine/exercise definitions from use, preserve completed sessions/snapshots, and require explicit consent to discard a draft.
- Enforce tombstones through grants, policies and RPC checks, including older clients. Serialize exercise mutations against deletion.
- Persist removed media paths in a protected cleanup manifest. Provide owner-only list/acknowledge operations; retain failed cleanup for retry after refresh.
- Delete only confirmed, unreferenced media through Storage. Never delete an upload while its database-save outcome remains uncertain.

**Reads**

- Replace assumptions that one request returns every record.
- Load definitions with stable, bounded pagination; load the active draft explicitly.
- Resolve previous weights server-side from all completed history, independently of the loaded history page.
- Return each exercise's latest non-null weight, source unit and completion date using deterministic ordering.
- Ignore drafts/blanks, preserve explicit zero, convert display units, and keep Current Weight initially blank.
- Page completed history separately and fetch entry snapshots for the sessions being viewed.

### Phase 5 — Gym board, editors and workout experience

- Recompose the page into heading/actions, routine switcher, summary, workout panel and session footer.
- Preserve the eight desktop columns; use labeled cards below 1200px.
- Give Start/Finish primary emphasis; keep management controls compact. Make full notes accessible.
- Use stable exercise pagination: six rows on desktop, three narrow-screen cards. Preserve entered values and the focused exercise across resizing; keyboard-height changes must not change page capacity.
- Use themed confirmations for removal, routine deletion, discard and unsaved changes.

**Editors and media**

- Compact labeled sections, plain X controls and content-sized Cancel/Save.
- Accessible upload panel with preview, filename, replace/remove, pending and retry states.
- Preserve private GIF/MP4 storage, 20 MiB limits, signature/decode checks and signed-access renewal.
- Defaults: **3 sets, 6-10 reps, 150 seconds rest, RIR 2**. Existing values remain intact.
- Keep raw input strings until validation; clearing a field must not become zero.
- Match applicable Unicode character limits to shared/server validation.
- Give new drafts stable creation IDs; helpers return persisted IDs. Reconcile uncertain creation before retrying or cleaning uploads.
- Revoke preview URLs on replacement/close.

**Workouts and history**

- Validate all exercises, including offscreen pages. Invalid values block Finish; accepted weights must fit database precision.
- Blank weights show their count/names with Review fields / Finish with blanks. Review navigates to and focuses the first blank.
- Confirmed blanks save as null; zero is valid. Failures preserve inputs; saved drafts resume.
- Current drafts retain prescription/unit snapshots. Definition changes apply to future workouts.
- History defaults to All workouts, including deleted routines. Preserve snapshot names/units and clearly identify deleted routines.
- Clicking an exercise name starts its demonstration: muted inline MP4 autoplay with controls and a Play fallback; GIF starts when displayed. Pause video on close.

### Phase 6 — Confirmed XP feedback

Append canonical migration **036** for reward receipts.

- Preserve the existing completion RPC and mobile behavior.
- Add an owner-checked receipt RPC with constrained privileges and consistent quest/stage/stat locking. Clients receive no stats-write permission.
- Return actual transition/reward components and total XP before/after from the authoritative ledger.
- Preserve **20 XP per phase and 20 XP final bonus**, captured stats, sequence enforcement, legacy exemptions, undo/redo and duplicate protection.
- Web actions show pending state; completion, hero travel and XP animation follow confirmation.
- Show the actual stat gain, such as “INT +20 XP”, with a level-aware progress bar. Represent final bonuses and multiple affected stats accurately.
- Animate approximately 600ms, hold four seconds, then dismiss. Reduced motion shows the final value immediately.
- Do not fabricate XP for duplicates or legacy exemptions. Reconcile uncertain results without replaying celebrations.
- Keep receipt animations separate from newer background stats and surface refresh failures.

### Phase 7 — Atomic Long Quest forms and pagination

Append canonical migration **037** for atomic definition saves. **Do not amend an already-applied migration 036.**

- Save metadata and stage reconciliation in one transaction.
- Preserve old shared/mobile interfaces; redesigned web forms use the atomic helper.
- Use stable creation IDs and reconcile uncertain results before retry.
- Preserve existing stage IDs, descriptions, completion history and earned rewards.
- Start new forms with two rows, allow valid single-stage quests to remain editable, and provide a zero-stage repair state.
- Preserve unchanged legacy names; enforce changed-name validation server-side.
- Read quests/stages in stable batches so API limits cannot silently truncate the checklist.
- Use shared validation and dirty-state protection.

Card order:

1. Compact illustrated journey.
2. Stat icon, name and expand control.
3. Stat and completed-stage count.
4. Expanded journey and checklist.

Use two quests per page with stable membership. Flow-layout pagination follows the full cards; remove conflicting fixed-height constraints. Protect unsaved forms, clamp after deletion and restore focus. Keep height-aware pagination for compact Board lanes. Replace hover-dependent deletion with a proper confirmation dialog.

### Phase 8 — Illustrated animated journeys

- Create optimized fantasy terrain, castle/cave/mine/ruin/vault assets and an armored hero in Eiyu's palette.
- Use a winding dotted route and distinguish completed, available and locked checkpoints through icons/text and color.
- Compact artwork sits above the title; expansion enlarges it without duplication.
- Target 120px desktop/96px narrow banners and approximately 240px expanded maps.
- Show up to five checkpoints per expanded segment with distinctly labeled segment navigation.
- Key artwork by stable stage IDs. Follow confirmed advancement, undo, completion and edits.
- Checkpoint activation focuses its checklist entry, including locked-stage explanations; it does not complete stages.
- Keep text/controls semantic. Animate restrained illumination and hero travel; pause idle motion offscreen/backgrounded and provide static reduced motion.
- Preserve artwork provenance. Missing-art fallback stays functional but cannot count as visual acceptance.

### Phase 9 — Sword cursor and overall consistency

- Add small static sword cursors with accurate tip hotspots, resting/interactive variants and contrast in both themes.
- Apply to fine pointers and portal dialogs; preserve native text, resize, drag and disabled cursors/fallbacks.
- Apply the control system across Board, Status, History, Quest editor, Settings and authentication.
- Improve spacing, hierarchy, validation, empty states and responsive behavior while preserving recovery, schedules and authentication/legal flows.
- Allow document scrolling wherever necessary for readable, reachable content.

### Phase 10 — Integrated acceptance and rollout preparation

- Run web/shared tests, all three TypeScript checks, lint, web build and `git diff --check`.
- Run mobile compatibility regressions without mobile UI changes.
- Verify SQL/ownership/concurrency on a confirmed disposable database.
- Update browser assertions for autoplay, flow layouts and actual theme switching.
- Ensure test teardown removes created media even after definitions are deleted.
- Inspect screenshots in one batch, fix reproduced defects together and perform one confirmation pass.
- Update capability markers and document ordered **035 → 036 → 037** rollout after verifying prerequisites through 034.
- Production deployment remains separate.

## Interfaces and acceptance requirements

New/changed interfaces comprise RIR upper bounds, protected deletion/cleanup operations, paged Gym workspace/history readers, previous-weight results, explicit creation IDs, reward receipts, atomic Long Quest saves, shared dialogs/navigation guards and flow pagination. Separate writable form payloads from server-controlled persisted fields.

Required tests cover:

- Archive success/failure, repeat timing, dismissal and account changes.
- Dirty Gym plus profile overlay, nested confirmations, Back/Forward, logout and refresh.
- RIR boundaries/ranges, invalid inputs, Unicode limits and legacy snapshots.
- **20kg → blank workout → next Previous Weight remains 20kg**, explicit zero, mixed units and exercise identity.
- More than **1,000 workout entries** and enough quest/stage records to cross API limits.
- Blank/invalid offscreen fields, saved-draft resume and keyboard resizing.
- Concurrent deletion/Start/Finish, stale clients, deleted-routine history and durable cleanup.
- Committed-but-unconfirmed saves: no duplicate creation or deletion of referenced media.
- Phase/final rewards, level boundaries, captured stats, legacy exemptions, duplicates, undo/redo and concurrent XP changes.
- Atomic definition failures, single-stage/zero-stage/many-stage quests, expanded geometry and focus.
- Real font loading, media privacy, autoplay blocking, reduced motion and missing assets.

Browser matrix: both themes at 320×568, 390×844, 768×1024, 1024×768, 1280×720, 1440×900 and 1920×1080, plus actual 200% zoom. Test keyboard access, long content and empty/large datasets. Replace brittle source-text assertions with observable behavior where implementation changes.

## Handoff protocol and defaults

Handoff 003 follows 002: **Starting context, Phase status, Current continuation, phase reports, Final change map and operational notes**.

After each phase: **implement → verify → resolve failures → update handoff 003 → continue**.

Record changes/interfaces, problems/fixes, exact verification/evidence, limitations and next action. Add partial checkpoints before expensive checks or interruptions. Failed/unavailable required checks remain pending.

Resume by reading the plan, handoff and working tree, then verifying the recorded environment. Never reset an existing database or infer inherited acceptance passed.

Defaults: web only, Eiyu identity retained, no Gym XP, completed-history retention, canonical numbered SQL, Expo 54 compatibility, and no commit/push/production deployment. Keep credentials and expiring signed URLs out of documentation.
