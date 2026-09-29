# Board, habit lifecycle, and navigation implementation plan

> **Current status (2026-09-29):** Phases 0–6 were subsequently landed, then the post-landing review reopened their acceptance. Repairs A–E are on `codex/board-refresh-repairs`; the requirement-level verdict is in `board-refresh/review-evidence/2026-09-29-repair-final-review.md`. Android interaction, actual 200% zoom on changed surfaces, and rollout schema verification remain open. The historical halt checkpoint below records the 2026-09-13 state and is no longer an instruction to stop the user-authorized repair work.

Date: 2026-09-13
Implementation model: **Luna (`gpt-5.6-luna`), extra-high reasoning (`xhigh`)**
Supervisor: parent Codex agent
Baseline: local `main`, `b840bb7` (`test: complete quest product journey`)
Status: **HALTED AT USER REQUEST — Phase 0 is incomplete; no phase is approved or committed.**

## Current progress and restart boundary

Updated after the user's halt instruction on 2026-09-13. This section and the user-review rules below supersede the earlier instruction to advance automatically after parent review.

- Current branch: `codex/board-refresh-phase-00`. Its HEAD and local `main` are both `b840bb723229ba34a19a8a73a07ff3da7e952d81`. No board-refresh commit, merge, push, deployment, or production migration occurred.
- This plan and `docs/plans/board-refresh/luna-handoff.md` are uncommitted.
- Luna (`gpt-5.6-luna`, `xhigh`) began Phase 0 and left two uncommitted test-only files: `packages/shared/src/test-support/board-refresh-fixtures.ts` and `packages/shared/src/logic/__tests__/board-refresh-fixtures.test.ts`. No runtime feature code or SQL changed.
- Parent review prompted moving the fixture helper outside Jest's `__tests__` discovery path, removing a no-op type assertion, and including the missed Sunday in the recovery fixture's schedule. Those edits are present. The fixture's noon recovery deadline still needs checking against the authoritative recovery contract before reuse as database evidence.
- The parent verified the **pre-fixture** baseline: shared 201 tests, web 26 tests, mobile 16 tests. No verified result for Luna's new fixture tests, full Phase 0 gate, DB rehearsal, browser/native execution, or Phase 0 report was returned. Earlier baseline passes do not verify the new candidate.
- `phase-00-report.md` and `phase-00-executive-summary.md` do not exist. Phase 0 is **incomplete**, not review-ready. Phases 1–6 have not started.
- Luna terminated with a workspace-credit error. The parent issued a halt/interrupt after the user's instruction and found it already errored. Restored credits do not authorize an automatic restart or replacement agent.
- Preserve current work and unrelated `skill-observations/`. This documentation update does not authorize implementation, test execution, commits, or a new dispatch.

**Next action only after a new user go-ahead:** resume Phase 0, review the unfinished fixtures, verify their tests and remaining foundation gates, prepare the report and executive summary, and stop again for user review. Permission to resume Phase 0 does not authorize Phase 1.

## 1. Outcome and authority

Make habit management honest and reversible where appropriate, turn the board into four recognizable card lanes, move desktop navigation to a horizontal header, and make account controls available through the existing player identity card. Improve use of space without hiding content or reducing readability.

This is an operational app for completing real habits and reviewing progression. Preserve its existing EIYU identity, stat colors, Rajdhani/Inter/JetBrains Mono typography, dark/light themes, rewards, account-local dates, recovery rules, and ordered Long Quests. This is a layout and behavior update, not a rebrand. Existing code is more current than the older `docs/web-ui-brief.md`, which still describes superseded web styling.

The user explicitly chose: **permanently delete the habit itself while keeping past completions in History and Weekly Review**. Archive also preserves history. This decision is binding; do not implement cascading history destruction or another hidden archive under a Delete label.

The user authorized phased implementation by Luna and commits to `main` only after each phase passes tests, reviews, and evaluations. The latest instruction adds a **user-controlled stop after every phase**: Luna must produce an executive summary mapped to requirements and wait for the user's go-ahead. The user may review personally or ask another AI to review against this plan, the handoff, the summary, the diff, and evidence. Parent/model approval alone never authorizes integration or the next phase. Local commits follow the approval protocol below. Remote push, production database changes, release publishing, and deployment are separate actions and are not required here.

Read the repository's `AGENTS.md` and the exact [Expo SDK 54 reference](https://docs.expo.dev/versions/v54.0.0/) before writing code. Keep SDK 54 and the existing compatible React Native stack. Follow relevant nested instructions if present.

## 2. Requirements and ownership

| ID | Requirement | Platforms | Phase |
| --- | --- | --- | --- |
| R1 | Distinct Archive and permanent Delete for active habits | Mobile + web | 1, 2 |
| R2 | Archived habits offer Restore and permanent Delete | Mobile + web | 1, 2 |
| R3 | Four card lanes: Daily Quest, One Time Quest, All Habits, Archived | Mobile + web | 3 |
| R4 | Status icon depicts gender-neutral people | Mobile + web | 4 |
| R5 | Remove Settings from primary navigation | Mobile + web | 4 |
| R6 | Player card opens exactly Edit details, Settings, Logout | Mobile + web | 4 |
| R7 | Edit details and Settings open overlays over the current page | Mobile + web | 4 |
| R8 | Web navigation moves to the top, horizontally | Web | 4 |
| R9 | All protected pages adapt to the recovered width | Web | 4, 5 |
| R10 | Compact, accurate last-seven-days review | Web | 5 |
| R11 | Tests first; reviewed passing phase commits on main | Entire delivery | 0–6 |
| R12 | Deleted habits retain past history, weekly counts, and earned XP | Mobile + web + DB | 1, 2, 6 |
| R13 | Explicit phase acceptance criteria, requirement-mapped executive summaries, and a mandatory stop for the user's go-ahead | Entire delivery | 0–6 |

## 3. Observed implementation and risks

| Surface | Current source | Observation / consequence |
| --- | --- | --- |
| Habit transport | `packages/shared/src/data/habits.ts` | Only `archiveHabit` exists. No restore or permanent-delete operation. |
| Store mutations | `web/src/store/eiyu-store.tsx`, `mobile/contexts/eiyu-store.tsx` | Both expose `archiveQuest`; new mutations must update caches and reminders consistently. |
| Editors | `web/src/web/WebQuestEditor.tsx`, `mobile/app/quest-editor.tsx` | Delete handlers call archive. The label and persisted action disagree. |
| Board selection | `packages/shared/src/logic/quest-recurrence.ts` | Archived habits are mixed into `allHabits`; recovery and one-time selectors need explicit archive exclusion. |
| Board rendering | `web/src/web/WebBoard.tsx`, `mobile/app/(tabs)/board.tsx` | Vertical sections; archive is nested in the habit catalog. Preserve completion, quantity progress, Penalty, and recovery affordances when extracting cards. |
| Web shell | `web/src/web/Sidebar.tsx`, `web/src/ProtectedLayout.tsx` | Fixed 220px side rail and matching left margin; changing only the navigation component leaves wasted space. |
| Mobile shell | `mobile/app/(tabs)/_layout.tsx` | Bottom tabs include Settings. Native navigation should stay at the bottom. |
| Profile | `packages/shared/src/data/profile.ts` | Fetch/timezone functions exist; display-name/class editing needs a real authenticated write. |
| Settings | `web/src/pages/SettingsPage.tsx`, `web/src/web/WebSettings.tsx`, `mobile/app/(tabs)/settings.tsx` | Extract reusable settings content and preserve each platform's actual controls. |
| Weekly review | `web/src/web/WebStatus.tsx` | Five repeated vertical bar groups, repeated day labels, fixed max=3, 9px labels. Values above three can visually clip. |
| History readers | `history.ts`, `weekly-review.ts`, `weekly-quest.ts`, `weekly-summary.ts` in shared data | Readers join current habit definitions. Merely retaining completion rows is insufficient after deletion. AI summary currently excludes archived definitions; fix this inconsistency within history preservation. |
| SQL | `backend/supabase/001_*.sql` through `024_*.sql` | Habit completions and other dependent records use cascading habit FKs. Use an atomic preservation strategy, not a client-side read/delete sequence. |
| Local DB | `supabase/config.toml`, `scripts/local-db.ps1` | Canonical numbered SQL is applied via `db.seed.sql_paths`; no `supabase/migrations` directory currently exists. Preserve this established repository convention. |
| Scrolling | `web/src/index.css` | Global scrollbar suppression hides overflow affordances. Board lanes need discoverable scrolling. |

Baseline tests were rerun during planning and passed: shared **22 suites / 201 tests**, web **8 files / 26 tests**, mobile **7 suites / 16 tests**. These results do not substitute for candidate-phase checks. The untracked `skill-observations/` directory predates this work; do not include it in product commits or remove it.

The generic `npm` invocation on this host resolved a broken npm launcher. The working invocation was:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test --workspace @eiyu/shared -- --runInBand
```

Use that explicit Node/npm CLI pair for other npm commands when needed. Do not change dependencies to repair this launcher issue.

### Design assessment provenance

Impeccable was loaded to assess the incumbent navigation and layout. Its independent design and evidence sub-agents were launched, but both terminated with a workspace-credit error. **DEGRADED: final planning assessment is source-based and single-context; no completed independent critique or live screenshot review is claimed.** The evidence agent found no existing browser tabs/authenticated view; native computer APIs were disabled. Repeat the independent review on the implemented candidate when available.

Observed strengths: recognizable EIYU typography/color, shared board selection, and existing server-authoritative quest operations. Priority issues: misleading Delete behavior; poor archive discoverability; fixed-width shell; competing summary and task content; oversized repeated weekly charts; controls without sufficiently strong focus/label/overflow affordances. These are source findings, not measured rendered-contrast or usability scores. Questions skipped for the design critique: the user supplied the requested direction and delegated attribute placement; the material deletion-history question was asked and answered separately.

## 4. Product behavior contract

### 4.1 Archive, restore, delete

| Action | Definition | Board / reminders | History / progression |
| --- | --- | --- | --- |
| Archive | Persist `archived=true`; retain the same habit ID and editable definition | Remove from Daily and All Habits; show in Archived; cancel reminders | Preserve past evidence and earned XP; no new obligations during the archived interval |
| Restore | Reactivate the same definition; do not duplicate it | Remove from Archived; show in All Habits and Daily only when eligible today; reschedule reminders if enabled | Preserve historical evidence; never backfill archived days as missed obligations |
| Delete permanently | Remove the actual habit row and executable scheduling/recovery state | Remove from every lane; cancel reminders; cannot restore/edit/complete it | Preserve immutable historical evidence, completion counts, heatmap denominators, weekly statistics, and earned XP |

Active card/editor actions: **Edit**, **Archive**, **Delete permanently**. Archived card/editor actions: **Restore**, **Delete permanently**; saved details remain readable. Do not expose completion, quantity stepper, or Penalty controls on archived entries. An archived one-time quest must not become unreachable if the editor allows archiving it: fetch archived definitions of both types and label the original type in Archived.

Archive and restore are reversible and can execute immediately with pending state and success/error feedback. Permanent delete uses a dedicated confirmation dialog:

> Delete “{habit name}” permanently? It will be removed from your board and cannot be restored. Past completions, history, and earned XP will stay.

Buttons: **Cancel** and **Delete permanently**. Initial focus is Cancel. The final confirmation calls the delete operation, never archive. Do not show successful deletion or close the confirmation on a failed request. Prevent repeat submissions; preserve context and offer Retry. Failed refresh after a successful mutation must not be presented as a failed deletion or trigger a duplicate destructive call.

Deletion preserves history, not an executable copy of the habit. No restore action is offered in History. Historical names remain readable; optionally use a subdued “Deleted habit” annotation. Existing History drilldown and Weekly Review totals must remain equal before and after deletion.

Archive interval semantics: use the persisted account timezone. Archive pauses future obligations until restoration. Previously recorded completions/occurrences remain immutable. Restore does not fabricate completions, XP, dates, or obligations during the pause. An already-open recovery keeps its original deadline; archiving/restoring never extends it or awards recovery XP. Expired pre-archive recoveries remain expired. Archived recovery cards are hidden; restoring reconciles authoritative state. Legacy archived rows with no interval metadata must resume from restoration without inventing missed archived days; document the conservative migration rule.

### 4.2 Four lanes and their meanings

These lanes are **different views of the same records**, not mutually exclusive workflow states. Never infer quest type, schedule, or completion from a lane position.

| Lane | Membership | Primary interaction | Secondary content |
| --- | --- | --- | --- |
| Daily Quest | Active recurring habits with an authoritative occurrence today | Complete/undo or quantity stepper; existing Penalty/recovery rules apply | Time, stat, difficulty, streak, today progress |
| One Time Quest | Active one-time quests scheduled for today, preserving current scope | Complete/undo | Time, stat, difficulty, note; no streak or Penalty |
| All Habits | All active recurring definitions, including off-day habits | Open/edit definition | Schedule, time, stat, difficulty, Due today / Off day |
| Archived | Archived definitions, including archived one-time items if supported by existing editor | Restore | Original type, schedule, stat; permanent delete |

A due habit appears in both Daily Quest and All Habits intentionally. Use one entity ID and one mutation source; both cards update together. Daily progress counts unique eligible IDs from Daily and today's One Time lane once, never catalog duplicates. Completed tasks stay visible with a clear completed state and Undo where permitted.

Use shared selectors to return `dailyQuests`, `oneTimeQuests`, `allHabits` (active only), `archivedQuests`, and `recoveryRequired` (active only). Update all consumers and old tests deliberately. Derive client visibility from server eligibility; catalog membership must not allow an off-day completion.

Card structure, from top to bottom:

1. Stat accent/tag and difficulty; trailing labeled overflow menu.
2. Habit/quest name, prominent and wrapping; description preview limited to two lines with an explicit expand/details control.
3. Schedule/time, streak or recovery indicator, and quantity fraction when applicable.
4. The lane-appropriate action. Essential status and action are always visible; full descriptions are progressively disclosed.

Cards are separate panels, not divider rows inside one shared list. Use existing flat web surfaces with modest borders and existing native materials. Card padding about 12–16px; gaps 10–12px; 14–16px body text. Real buttons must not be nested inside a clickable card button. Card title is an independent Edit/details target.

Default deterministic order: incomplete before completed in actionable lanes, then reminder time, name, ID; catalog by time/name/ID; archive by name/ID unless a persisted archive timestamp is implemented. No new manual-order persistence is required.

“Kanban” here means visible lanes with cards and lane actions. **Do not add arbitrary drag-and-drop between Daily, One Time, and All Habits**: these are schedule/type views and overlap. Archive/restore menus supply explicit transitions on both platforms. Drag-and-drop and manual ordering are outside this batch unless the user explicitly adds them.

### 4.3 Web layout

```text
┌ EIYU ─── Board   Status   Long Quests ───── Player identity ▾ ┐
│ Board                              Daily progress   + Add │
│ Compact stats / weekly target / recovery summary           │
├ Daily Quest ┬ One Time Quest ┬ All Habits ┬ Archived        ┤
│ task card   │ task card      │ habit card │ archived card   │
│ task card   │ empty state    │ habit card │ Restore · …     │
│ lane scroll │ lane scroll   │ lane scroll│ lane scroll     │
└─────────────┴───────────────┴─────────────┴─────────────────┘
```

Top header: roughly 64–72px tall, full width, EIYU left, the three navigation links next, real player name/class/rank card right. “Mesvara” is account data, never a hardcoded label. Active route uses restrained cyan text/background/underline plus `aria-current`; inactive labels remain readable. Remove the 220px left margin, side border, full-height rail, and duplicated logout/settings links.

Board at desktop widths >=1200px: four equal columns, 16px gaps, 20–24px page gutters. At 1366px, each lane is approximately 315px wide. Give flex/grid ancestors `min-width:0` and `min-height:0` where overflow is owned. Keep page heading, navigation, summary, and lane headers visible; lane bodies scroll independently when needed. A recovery list must not grow until it consumes the entire work area: show count and urgent item with a controlled expandable region.

At 768–1199px: preserve four columns in a horizontally scrollable board region with ~280px minimum lane width and visible scroll affordance. The document itself must not overflow horizontally. At widths below 768px: a compact top header may wrap navigation to a second row; use a lane selector and one full-width lane with all four sections reachable. Preserve the active lane during mutations.

The no-page-scroll goal applies to **normal desktop data and default text size**, not unlimited data. Target 1366×768 and 1440×900: header, summary, lane headings and first cards visible without document scrolling; overflowing lists use their own scroll areas. At 200% zoom, short windows, keyboard display, or enlarged text, allow natural page scrolling. Never use global overflow clipping, CSS scale transforms, tiny fonts, or inaccessible hidden panels to satisfy the goal.

Other routes use available width intentionally: Status uses a bounded character column and flexible detail area; Long Quests use a responsive card grid; History/calendar and editor forms keep readable bounded widths, centered rather than stretched across the screen. The top header stays consistent on every protected route.

### 4.4 Native board and account controls

Keep native bottom navigation for **Board, Status, Long Quests**. Add an accessible compact player identity/menu trigger in the shared tab-screen header so account controls are reachable from every tab; reuse the board's existing identity presentation rather than duplicating a large card. This is the mobile equivalent of the web navigation identity card.

On phone portrait, use four horizontally scrollable lane tabs with counts and one visible lane of full-width cards. Selecting a tab changes the lane without routing away. Optional horizontal paging must not be necessary; tab controls are the reliable accessible path. Native landscape/tablet may show more lanes only if minimum card width and text scaling work. Preserve tab-bar safe padding, keyboard handling, and screen-reader order.

Status uses a custom thin-stroke **two-person head-and-shoulders outline** on both platforms. No gendered hair, clothing, symbols, or body shape. Keep the visible Status label; treat adjacent SVG as decorative. Icon-only instances require an accessible name.

### 4.5 Profile menu and dialogs

The account trigger opens exactly:

1. **Edit details**
2. **Settings**
3. **Logout**

Edit details opens a real modal with Display name and Class fields, prefilled from the authenticated profile. Both are required after trimming; choose shared limits of 80 and 80 Unicode code points and apply them consistently client/server. Existing longer saved values remain viewable and explain the limit when editing. Save persists to `profiles`, invalidates the authenticated profile query, and updates every identity card without resetting XP/rank. Cancel discards only the dialog draft. Errors retain draft input. Do not add email/password/account-security editing under “details.”

Settings opens the existing settings content inside a dialog/sheet, preserving the actual platform controls: web appearance and History access; mobile appearance, notification and reminder settings as currently implemented. No fake browser notification control. Remove profile editing/logout duplicates from this content because the menu owns them. Theme changes apply to both dialog and background. Preserve existing preference storage behavior unless a test demonstrates a required regression fix.

On web use a reusable labeled dialog with proper focus containment, inert background, Escape handling, focus restoration, backdrop and close button. Account menu supports keyboard operation, outside-click dismissal, and correct expanded state. On mobile use the existing SDK-54-compatible modal/sheet approach, proper accessibility isolation, Android Back handling, safe area, and keyboard-aware content. Closing returns to the same page/lane/scroll state. Dirty forms require a discard choice on dismiss; prevent dismissal while the save is pending or define a safe completed-save handling path.

Opening either dialog must not navigate to a new full page. Preserve old `/settings` links through a compatibility entry that opens the Settings overlay over Board when no background route exists; closing it returns to Board without a reopen loop. Hide the legacy mobile Settings tab route and make any retained route open the same overlay. Test browser Back/Forward and native Back. History may still use its existing route after closing Settings.

Logout uses the existing auth sign-out boundary, disables duplicate submissions, clears account-specific cached/persisted state as existing auth requires, and returns to authentication on success. On failure, keep the current page and show an actionable menu error. Never report logout before the auth operation succeeds.

### 4.6 Compact weekly review

Replace the five tall repeated bar groups with a **5×7 activity matrix**: rows STR/INT/DEX/WIS/CHA, columns the seven account-local dates oldest to newest, one shared header, and a Total column. Each cell contains the actual completion count and a subtle stat-colored intensity. Use `Mon 7`-style labels, a date-range caption, zero values as explicit 0, and a common scale `max(1, all 35 cell counts)` for tint intensity. Counts above three remain exact and readable. Colors supplement numbers, never replace them.

Use semantic table markup on web, a caption, row/column headers, and cells with meaningful date/stat/count text for assistive technology. No tooltip-only information. About 32–40px row height and readable 12–14px labels make the matrix approximately 240–300px tall including caption and totals. On narrow screens allow scrolling within the table wrapper or a readable alternate layout; do not shrink labels to 9px.

Keep Stats / Weekly switching and the character/radar area, but use responsive dimensions rather than the existing rigid 340px track. Give weekly summary narrative its own bounded region; long narrative can expand/scroll. Preserve AI regeneration limits, pending/error states, and current caching policy. Deleted and archived habit completions contribute consistently; one-time completions count in the review as before, while weekly quest targets remain recurring-habit-only.

## 5. Persistence and shared architecture

### 5.1 Deletion preserving historical evidence

Preferred implementation: an immutable **history ledger for deleted habits**, written in the same database transaction as deletion. This is historical evidence, not a hidden executable habit. Keep the active data model and its existing cascades; snapshot the evidence before removing the definition.

Suggested ledger fields: authenticated owner ID, original habit UUID, historical date, habit name/stat/type snapshot, whether a scheduled occurrence existed, occurrence timezone/day boundary where needed, optional completion kind and XP awarded. Preserve completion-only dates as well as uncompleted scheduled dates. Unique `(user_id, source_habit_id, date)` makes copying idempotent. Do not FK `source_habit_id` back to the deleted habit. Account deletion still removes the owner's ledger records.

An ownership-checked delete RPC locks the target and coordinates with completion/recovery/progress writes, snapshots all existing dated evidence, then deletes the habit in one transaction. Two racing calls must not double-copy or double-award. Preserve existing stats XP. Reject completion/undo/edit/restore on a deleted definition; historical evidence is read-only. Missing/foreign IDs must not reveal another account's data.

Prevent ordinary authenticated direct DELETE from bypassing the preservation path: revoke that write path or protect it with an equivalent tested database boundary. Do not weaken RLS or use a service-role key in either client. Any privileged function must have explicit owner checks, fixed search path, and restricted EXECUTE grants. Ledger clients get own-row SELECT only; no direct insert/update/delete. If using views for combined history, use invoker security and test both grants and RLS.

Update all history consumers to combine live and retained evidence without duplicates: `fetchHistoryRange`, heatmaps, `fetchWeeklyReview`, `gatherWeekData`, and recurring weekly-quest progress. Prefer one shared normalized history reader or a secured database view over several slightly different unions. Paginate/range-bound reads rather than silently accepting the API's default row cap. Archiving must not remove completions from weekly AI inputs. Existing stored AI narratives can retain their current cache lifecycle; subsequent generation/regeneration must see retained evidence.

A schema alternative is allowed only if it proves the same observable invariants and is recorded before implementation; **do not substitute a `deleted=true` habit row**. Parent review must inspect actual row absence and history preservation, not just board disappearance.

### 5.2 Archive intervals and restore

Persist enough archive interval information to prevent the occurrence generator from retroactively scheduling paused days. Do not simply flip the boolean and rely on today's UI filter. Prefer additive interval metadata or a pause ledger with one open interval per habit and serialized transitions. Repeated archive/restore calls are safe. Existing archive writes from older clients must either go through tested compatibility triggers or fail clearly; they must not bypass interval recording.

Restoration keeps schedule, name, notes, stat, difficulty, target, and ID. Existing immutable occurrence dates are not rewritten. No timezone change is implied. Test same-day archive/restore, multi-day pauses, off-day restoration, legacy archives, expired recovery, and timezone midnight.

### 5.3 Client state and reminders

Expose explicit `archiveQuest`, `restoreQuest`, `deleteQuest`, and profile-update operations from both stores. Shared transport owns request shape/error handling; platform stores own cache/presentation effects. Use user-scoped keys consistently.

On lifecycle success, invalidate/refresh board, catalog, recovery, reminders, history, weekly review/quest/summary inputs, and any editor lookup affected by the entity. Avoid a stale in-flight fetch reinserting a deleted card. Stale persisted mobile caches revalidate on resume; an old deleted ID cannot be resurrected by a stale edit. Other-device changes appear on normal focus/reconnect/refetch without requiring a new realtime subsystem.

Mobile archive/delete cancel that habit's scheduled notifications. Restore reschedules only if notifications are enabled and OS permission permits; no unsolicited permission prompt on restore. A notification failure after a successful database action should be a distinct reminder warning with reconciliation, not a fake database rollback. Account switching cannot reuse another user's profile, board, or ledger data.

## 6. Mandatory tests-first and commit protocol

**No feature implementation code is written until its acceptance tests have been authored and executed against the previous implementation.** Apply this to every feature/slice within a phase, not just the phase's first test file. UI-only changes also need meaningful behavior/accessibility/layout assertions before UI changes, as the user explicitly requested.

For each slice:

1. List acceptance IDs and failure/edge cases from this document. Choose expected outcomes independently of current implementation details.
2. Write tests at the right boundary: pure selector/domain tests, data/store integration tests, real component interaction tests, SQL/RLS tests, and browser/native flows where relevant.
3. Run them before runtime edits. Record the failing assertions and command output as RED evidence. Failures must expose missing behavior, not merely a broken import, typo, unavailable DB, or malformed fixture. A valid module-interface failure may be noted initially, but add behavior-level proof before calling the feature verified.
4. Parent reviews the test contract for missing cases and self-fulfilling mocks. Then Luna implements the smallest complete behavior.
5. Run GREEN checks, refactor, and rerun affected tests. Do not delete assertions, loosen expected values, skip tests, or snapshot-update away failures to fit the implementation. A legitimate requirement/test correction needs a written reason and parent review before changing the oracle.
6. Record the detailed evidence report and separate requirement-mapped executive summary. Parent review checks code, test quality, security/data effects, and rendered/native behavior. Present the package to the user and **stop**; parent review is a recommendation, not permission to integrate or advance.

Test-first evidence should be durable: save sanitized output excerpts and a hash/diff of the test files before runtime work in `docs/plans/board-refresh/phase-NN-report.md`. Tests that already pass are characterization evidence, not RED evidence for a new feature. Infrastructure failures are BLOCKED, never PASS. Do not use source-string assertions as the sole proof of user-visible behavior or DB mocks as the sole proof of RLS/persistence.

### Branch and main rules

- Work one phase at a time on `codex/board-refresh-phase-NN`, created from the latest approved local `main`. Do not reset, clean, stash, stage, or overwrite unrelated changes.
- Keep RED experiments off main. A phase candidate may contain tests and implementation together, with recorded RED provenance; intentionally failing commits must not land on main.
- Before the candidate commit, pass the phase's tests, applicable full regression/static/build checks, code review, and UX/data evaluation. No unresolved P0/P1/P2 issues affecting the requested behavior. Baseline warnings must be separately identified.
- Luna presents the candidate diff, acceptance results, report, and executive summary. When technical checks pass, label the phase **REVIEW READY — AWAITING USER**, then stop. Neither Luna nor the parent may approve on the user's behalf. Do not begin later-phase tests, migrations, scaffolding, or code while waiting.
- Wait for explicit user approval before creating/landing the phase commit on local `main`. A user-designated reviewer can recommend acceptance or corrections; its verdict does not replace the user's go-ahead. For requested fixes, change only that phase, repeat affected checks, update report/summary, and stop again.
- After user approval to land the phase, create its commit and fast-forward local `main`. If main has advanced, rebase/merge carefully, rerun affected gates and review before integration. Never force-update main.
- Verify main contains the exact reviewed candidate and rerun a focused smoke test there. Record the actual candidate/main SHA, not “to be recorded.” Do not amend a landed phase to hide later fixes; a follow-up must repeat the gate.
- A report cannot embed the SHA of its own containing commit. Record the pre-commit base and tested tree in the phase report, then append the actual landed SHA to a separate integration ledger after landing; carry that ledger into the next reviewed commit and include the final mapping in the handoff. This bookkeeping must not rewrite a landed phase or create a circular hash requirement.
- **Do not automatically start the next phase after landing.** It requires successful main integration and the user's explicit go-ahead for that named next phase. The user may approve landing and the next phase in one message; otherwise stop after integration. Permission applies to one phase, never all remaining phases. Silence, elapsed time, restored credits, passing tests, or a reviewer-model verdict is not a go-ahead.
- Every phase, including foundation and final evaluation, has a distinct reviewed commit on main after approval. Record the user's authorization and scope in the integration ledger. No remote push is implied.
- If a required gate cannot run, keep the phase unlanded and report the precise blocker. Completed checks remain evidence, but missing native/browser/DB execution cannot be relabeled as pass.

### Required verification commands

Use the explicit npm CLI prefix from section 3 if the shorthand launcher is broken.

```text
npm run test --workspace @eiyu/shared -- --runInBand
npm run test --workspace @eiyu/web
npm run test --workspace @eiyu/mobile -- --runInBand
npm run lint
node node_modules/typescript/bin/tsc --noEmit -p packages/shared/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p mobile/tsconfig.json
npm run build --workspace @eiyu/web
npm run db:verify
```

Confirm executable locations at Phase 0. Run DB verification on the disposable local stack only and first ensure reset will not destroy a user's active local dataset. Test fresh schema and an upgrade from existing archived/completed fixtures. SQL lives in the existing canonical numbered directory; do not rewrite historical migration files. Consult the repository CLI help before introducing new commands.

For native changes: SDK 54 `expo install --check`, an Android export, affected Maestro journeys on the local development client, and final Android debug build. Reuse `mobile/maestro/README.md` and the known Windows Gradle staging workaround. Maestro flows using the same account run serially. Windows cannot produce an iOS native build; explicitly record iOS as not executed and retain platform-neutral implementation/test coverage. Android device evidence is the required runnable native gate on this host, not an export substituted for interaction testing.

Visual evaluation: one batched desktop/mobile inspection, one grouped correction pass, at most one confirmation pass per phase unless a new functional blocker is discovered. Inspect dark/light, long names, empty/full lanes, errors, focus, 200% zoom, small screen and font scaling. Run Impeccable's detector once on final changed web targets, triage findings with reasons, and do not treat a clean scan as proof of usability. Screenshots and measured geometry, not jsdom, prove viewport layout.

## 7. Sequential implementation phases

### Phase 0 — Foundation, fixtures, and baseline

Requirements covered: **R11, R13**; prepares verification for R1–R10/R12 without claiming their implementation. Also deliver `phase-00-executive-summary.md`.

Deliver: validated plan/handoff, current environment commands, synthetic fixture builders, acceptance-to-test map, available browser/Android/DB runners, and `phase-00-report.md`.

Tests first: add characterization fixtures for active due/off-day habits, quantity habits, completed/uncompleted one-time quests, archived rows, recovery windows, long names, and two isolated accounts. Verify current behavior without modifying product features. Prepare browser/native scenario scripts before visual changes. Do not fake RED for unchanged behavior.

Acceptance criteria (all required):

| ID | Pass condition | Required test/evidence |
| --- | --- | --- |
| P0-AC1 | Fixtures cover all nine declared categories and two owners, return independent mutable objects per call, and use coherent recovery schedule/dates. | Fixture tests; mutate one fixture and prove the second fixture/account is unchanged. Owner labels are not RLS proof. |
| P0-AC2 | Current board behavior is characterized without implementing new selectors or treating existing archive bugs as the future contract. | Characterization tests; explicitly identify expectations that Phase 3 replaces. |
| P0-AC3 | Shared/web/mobile suites, lint, three TypeScript checks, web build, local DB baseline and SDK compatibility pass on the current candidate. | Commands, exits, counts, warnings and sanitized logs. Missing required execution is BLOCKED. |
| P0-AC4 | Disposable DB, authenticated local browser and Android runner paths are identified and available; scenario scripts precede feature changes. | Runner preflight/local-target evidence, scripts and Windows iOS limitation. No production reset/personal data. |
| P0-AC5 | Every later acceptance ID has an intended test boundary; report and summary identify feature work as not started. | Requirements/test manifest, test-quality review, executive summary and mandatory user stop. |

Gate: rerun baseline shared/web/mobile suites, lint, TypeScript, web build, local DB baseline and SDK check; identify real browser and Android execution paths. Review fixture independence and confirm no personal/production data is used. Commit after user approval: `docs: define board refresh contracts and verification baseline`. **Stop with the review package; Phase 1 requires the user's go-ahead.**

### Phase 1 — Safe lifecycle persistence and history preservation

Requirements covered: **R1, R2, R12** at the persistence boundary; **R11, R13** for delivery. UI remains Phase 2. Also deliver `phase-01-executive-summary.md`.

Deliver: additive SQL, retained history reader, archive interval handling, ownership-checked delete/restore transport, database types/exports, and `phase-01-report.md`. No new visible controls until the persistence contract is valid.

Write first:

- `LIFE-01`: delete active and archived definitions; verify actual row absence and removal of executable dependents.
- `LIFE-02`: identical pre/post History details, scheduled denominators, heatmap ratios, weekly review/quest counts, AI summary inputs, XP and rank after deletion; multiple names/stats/date ranges.
- `LIFE-03`: preserve scheduled-but-uncompleted and completion-only dates; no duplication on repeated delete/retry.
- `LIFE-04`: owner succeeds; anonymous/other user/direct-bypass writes fail; ledger cannot be forged or edited; account deletion removes ledger.
- `LIFE-05`: delete racing completion/progress/recovery cannot lose a committed completion or award duplicate XP; two-session DB test.
- `LIFE-06`: archive/restore preserves definition/ID and past history; paused days are never backfilled; restore respects current eligibility.
- `LIFE-07`: same-day transitions, legacy archive, off-day restore, midnight/timezone, expired/open recovery deadlines, and stale writes.
- `LIFE-08`: archive one-time -> reachable archive -> restore/delete, without turning it into a recurring quest.

Acceptance criteria (all required):

| ID | Pass condition | Required test/evidence |
| --- | --- | --- |
| P1-AC1 | Delete removes the actual active/archived habit row and executable dependents; retained evidence is read-only and cannot restore the definition. | LIFE-01/03; real SQL row/count assertions, not UI disappearance. |
| P1-AC2 | History details, scheduled denominators, heatmap ratios, weekly counts/inputs and XP are identical before/after deletion; retries do not duplicate evidence. | LIFE-02/03; mixed-stat completed, incomplete-scheduled and completion-only fixtures; exact normalized comparisons. |
| P1-AC3 | Owner succeeds; anonymous/other-owner/forged-ledger/direct-bypass writes fail; account deletion removes retained data. | LIFE-04; real role sessions, grants/RLS and account-deletion assertions. |
| P1-AC4 | Racing completion either commits and is retained once, or is rejected without XP; no partial snapshot, orphan reward or duplicate evidence survives. | LIFE-05; two DB sessions and transactional outcome assertions. |
| P1-AC5 | Restore retains ID/definition and actual eligibility; pauses never backfill, extend recovery, or fabricate XP, including legacy and midnight cases. | LIFE-06–08; deterministic SQL/shared tests, fresh-schema and populated-upgrade rehearsal. |
| P1-AC6 | All phase checks and security/data review pass; summary distinguishes delivered persistence from UI still pending. | Gate below, R11/R13 review package and mandatory user stop. |

Gate: all shared/data and real pgTAP lifecycle/security/concurrency tests, complete DB regression, clean-reset and upgrade rehearsal, type checks, and security/data review. Keep prior clients' safe behavior documented. Commit after user approval: `feat: add safe habit restore and permanent deletion`. **Stop with the review package; Phase 2 requires the user's go-ahead.**

### Phase 2 — Honest lifecycle controls on mobile and web

Requirements covered: **R1, R2, R12** end-to-end; **R11, R13** for delivery. Also deliver `phase-02-executive-summary.md`.

Deliver: store mutations, reminder reconciliation, active/archived editor actions and confirmations, error/pending feedback, `phase-02-report.md`.

Write first:

- `UI-LIFE-01`: Archive calls archive only; Delete confirmation calls permanent delete only; Cancel performs no mutation.
- `UI-LIFE-02`: archived items expose Restore/Delete, no Complete; restore updates both relevant active views.
- `UI-LIFE-03`: double click/tap sends one pending request; failure retains dialog/item; retry succeeds; successful deletion cannot be undone via stale editor.
- `UI-LIFE-04`: mobile reminder cancel/reschedule, notifications disabled, permission unavailable, and reminder failure after DB success.
- `UI-LIFE-05`: stale in-flight query, reload, focus/refetch, persisted cache, and account switching cannot resurrect or leak records.
- `UI-LIFE-06`: real web -> Android same-account archive/restore/delete and preserved-history journey.

Acceptance criteria (all required):

| ID | Pass condition | Required test/evidence |
| --- | --- | --- |
| P2-AC1 | Both platforms distinguish Archive, Restore and Delete permanently; Cancel sends zero writes and confirmed Delete calls delete only. | UI-LIFE-01–02; real component interactions on active/archived records. |
| P2-AC2 | Repeat taps send one pending request; failure retains context, retry works, archived/deleted records cannot complete or resurrect through stale editors/cache. | UI-LIFE-03/05; deferred/rejected requests and stale-fetch/persisted-cache scenarios. |
| P2-AC3 | Archive/delete cancel reminders; restore respects preferences/permission; reminder failure cannot misreport a successful DB mutation as a DB failure. | UI-LIFE-04; notification-boundary tests and Android evidence. |
| P2-AC4 | Lifecycle state persists across reload/platform/account switch, with identical history/XP and no cross-user leakage. | UI-LIFE-05–06; browser-to-Android journey on disposable local persistence. |
| P2-AC5 | Dialog focus/dismissal/accessibility and complete phase gates pass; summary maps requirements to actual evidence. | Gate below, R11/R13 review package and mandatory user stop. |

Gate: shared/store/component suites, targeted real browser and Android journey, static checks/build/export, keyboard/dialog accessibility review. Commit after user approval: `fix: separate habit archive restore and delete actions`. **Stop with the review package; Phase 3 requires the user's go-ahead.**

### Phase 3 — Four-lane card board on both platforms

Requirements covered: **R3**, regressions for **R1/R2/R12**, and **R11/R13**. Also deliver `phase-03-executive-summary.md`.

Deliver: shared partition contract, reusable lane/card components, desktop four columns, mobile lane selector, compact summary/recovery, `phase-03-report.md`.

Write first:

- `BOARD-01`: exact memberships including due/off-day/archived/one-time/recovery; no duplicates in daily totals.
- `BOARD-02`: same ID in Daily and All Habits reflects one completion/quantity mutation; catalog cannot authorize an off-day completion.
- `BOARD-03`: all four lanes reachable in empty/loading/error/retry states; empty lane offers relevant Create or Restore guidance.
- `BOARD-04`: completion, Undo, quantity, Penalty, recovery, expand note, edit, archive/delete/restore remain reachable with labels.
- `BOARD-05`: desktop lane geometry and independent scrolling; mobile lane switch retains selection; long titles, 0/1/30/100 cards, 200% zoom/font scaling; no clipped controls.

Acceptance criteria (all required):

| ID | Pass condition | Required test/evidence |
| --- | --- | --- |
| P3-AC1 | Four named lanes have section 4.2 memberships; archived items are excluded from actionable/catalog/recovery views, and daily totals count unique IDs. | BOARD-01; exact ID sets/counts for mixed fixtures. |
| P3-AC2 | Daily/catalog copies share one state; off-day catalog cards cannot complete; completion/quantity/Penalty/recovery remain functional where eligible. | BOARD-02/04; actual web and RNTL interactions, not source-string checks. |
| P3-AC3 | Every lane remains understandable/reachable in empty/loading/error/retry states; essential actions never depend on hover. | BOARD-03–04; keyboard/touch tests for each state. |
| P3-AC4 | Four lanes display on desktop; phone selector reaches all four; 30/100 records scroll without clipped actions or document horizontal overflow. | BOARD-05; real >=1200px geometry, smaller-width board scrolling and native lane navigation. |
| P3-AC5 | Both themes, long names and 200% zoom/font scaling remain readable; mutations preserve lane selection; all phase gates pass. | BOARD-05, screenshot/native evaluation, R11/R13 summary and mandatory user stop. |

Gate: shared selectors and behavioral component tests, real browser geometry/keyboard evaluation, Android card/lane journey, regression/static/build/export checks. Commit after user approval: `feat: present quests in a responsive four-lane board`. **Stop with the review package; Phase 4 requires the user's go-ahead.**

### Phase 4 — Horizontal web navigation and account overlays

Requirements covered: **R4–R8**, shell portion of **R9**, and **R11/R13**. Also deliver `phase-04-executive-summary.md`.

Deliver: web header replacing rail, native three-tab shell/account trigger, people Status icon, shared profile validation/write, account menu, Edit details/Settings overlays, compatibility route handling, `phase-04-report.md`.

Write first:

- `NAV-01`: three primary destinations; Settings absent; active link and gender-neutral Status icon semantics.
- `NAV-02`: account trigger uses actual name/class/rank; exactly three menu actions; keyboard and outside-dismiss behavior.
- `NAV-03`: opening Settings/Edit keeps current route, lane, and scroll context; close/Back/Escape restores focus and state; direct old Settings link is usable.
- `PROFILE-01`: trimmed valid values persist/reload across platforms; blank/over-limit values rejected; Unicode inert; owner isolation; XP/rank unchanged.
- `PROFILE-02`: Cancel, dirty dismissal, pending save, failure/retry, and reopening use correct persisted/draft values.
- `SETTINGS-01`: existing settings controls still work inside overlay; no fake platform settings; History remains reachable.
- `AUTH-01`: logout success clears account state; failure remains signed in with error; repeat clicks are suppressed.
- `LAYOUT-01`: no residual side margin; every protected route works at 390, 768, 1024, 1366, 1440, 1920px widths; dialogs avoid keyboard and viewport clipping.

Acceptance criteria (all required):

| ID | Pass condition | Required test/evidence |
| --- | --- | --- |
| P4-AC1 | Web has horizontal top navigation and no 220px rail/margin; native has three bottom tabs; Settings is absent and Status uses gender-neutral people. | NAV-01, LAYOUT-01; semantic/route tests plus rendered geometry/icon review. |
| P4-AC2 | Real identity card opens exactly Edit details, Settings, Logout from every primary destination, usable by keyboard/touch. | NAV-02; action labels/count, open/dismiss/focus interactions. |
| P4-AC3 | Edit/settings overlays preserve background route/lane/scroll; close/Escape/Back restore focus; legacy Settings entry does not reopen forever. | NAV-03; router tests and actual browser/native Back flows. |
| P4-AC4 | Trimmed valid profile changes persist across devices without rank/XP changes; blank/>80-code-point inputs fail; Cancel/dirty/error/pending cases and owner isolation work. | PROFILE-01–02; Unicode/boundary tests, SQL/RLS and cross-platform reload. |
| P4-AC5 | Existing settings work in overlays; Logout succeeds once or reports failure without false sign-out; account caches stay isolated. | SETTINGS-01, AUTH-01; component/boundary and browser/native flows. |
| P4-AC6 | Every protected route/overlay is readable at 390/768/1024/1366/1440/1920px, zoom and keyboard/safe-area conditions; full gate and summary are complete. | LAYOUT-01, gate below, R11/R13 evidence and mandatory user stop. |

Gate: component/router/store tests, profile RLS integration, real browser focus/Back behavior, Android Back/keyboard/settings/logout flows, full regression/static/build/export. Commit after user approval: `feat: move web navigation to header and add account dialogs`. **Stop with the review package; Phase 5 requires the user's go-ahead.**

### Phase 5 — Compact weekly review and page sizing

Requirements covered: remaining **R9**, **R10**, regression protection for **R12**, and **R11/R13**. Also deliver `phase-05-executive-summary.md`.

Deliver: accessible weekly activity matrix, date keys in shared data if needed, responsive Status/Long Quests/History/editor sizing, `phase-05-report.md`.

Write first:

- `WEEK-01`: seven ordered account-local dates with month/year/timezone boundaries and zero-filled days.
- `WEEK-02`: exact 5×7 counts and totals, including values >3, archived/deleted history, and unchanged one-time review semantics.
- `WEEK-03`: one shared date header, meaningful caption/row/column labels, numbers readable without color or tooltips.
- `WEEK-04`: loading/empty/error/retry and AI loading/regeneration limits remain correct.
- `LAYOUT-02`: desktop overview fits target viewport with bounded overflow; mobile/zoom remain readable; large/empty datasets and long summary content are reachable.

Acceptance criteria (all required):

| ID | Pass condition | Required test/evidence |
| --- | --- | --- |
| P5-AC1 | Five stat rows and exactly seven oldest-to-newest account-local date columns; absent days are 0 and month/year/timezone boundaries are correct. | WEEK-01; fixed-time data tests and DOM table assertions. |
| P5-AC2 | Cells/totals equal source data, including 0/1/3/4/10 values and archived/deleted completions; counts >3 are not clipped or misleadingly saturated. | WEEK-02; exact numerical expectations and common-scale assertions. |
| P5-AC3 | Caption/headers/numbers convey meaning without color/tooltips; loading/error/retry and AI regeneration limits still work. | WEEK-03–04; accessibility/interaction tests and screenshots in both themes. |
| P5-AC4 | Ordinary overview fits 1366×768/1440×900 default text size with bounded overflow; long content/200% zoom remain reachable; other pages have readable widths. | LAYOUT-02; geometry/screenshots of Status, Long Quests, History/editors with ordinary/stress fixtures. |
| P5-AC5 | Web/shared regressions, Android shared-data smoke and all phase checks pass; summary maps resizing to R9 and review changes to R10/R12. | Gate below, R11/R13 review package and mandatory user stop. |

Gate: data/component suites, real screenshot/geometry and keyboard review in both themes, all protected-route smoke tests, full regression/static/build checks. Android smoke guards shared-data compatibility. Commit after user approval: `feat: compact weekly review and rebalance web layouts`. **Stop with the review package; Phase 6 requires the user's go-ahead.**

### Phase 6 — Whole-product acceptance and final handoff

Requirements covered: **R1–R13**, a cross-feature audit with fresh evidence. Also deliver `phase-06-executive-summary.md`.

Deliver: end-to-end regression flows, final requirements matrix with evidence, screenshots/paths, actual phase SHAs, known limitations and rollout notes, `phase-06-report.md`.

Write the final scenario before any corrective runtime code: create scheduled and one-time quests -> complete/quantity/Penalty -> archive -> off-day/multi-day restore -> permanently delete active and archived -> verify history/XP -> edit profile -> settings -> navigate all pages -> logout/account switch -> reload on web and Android. Deterministic SQL tests own simulated dates; real UI evidence owns interactions and persistence. Do not manipulate the user's OS clock.

Acceptance criteria (all required):

| ID | Pass condition | Required test/evidence |
| --- | --- | --- |
| P6-AC1 | The complete journey above passes on web/Android with the same disposable account and persists across reload/platform switch. | FINAL-01: E2E flow authored before corrective code, per-step outcomes and artifacts. |
| P6-AC2 | Archived pauses, deleted history, rewards, concurrent writes, authorization and account isolation remain correct together. | FINAL-02: full SQL/security/concurrency regression with persisted before/after values. |
| P6-AC3 | Full automated/static/build gates pass, including Android debug build and actual Android E2E; unavailable iOS build is stated. | FINAL-03: exact suite/build/export/SDK commands and results. |
| P6-AC4 | Desktop/narrow web/native meet the plan in dark/light, zoom/font scaling, long-data and error states; no blocking finding remains. | FINAL-04: screenshots, geometry, accessibility/manual review and resolved finding list. |
| P6-AC5 | R1–R13 map to files, acceptance/test IDs and evidence; phase SHAs/user approvals are traceable; no production deployment is claimed. | FINAL-05: final report, integration ledger, executive summary and final user review stop. |

Gate: all test suites; complete local DB and concurrency/security tests; lint/types; production web build; Expo compatibility/export; Android debug build and Maestro; real desktop/mobile web visual checks; independent parent requirements/code/UX review. Resolve all blocking findings and repeat affected gates. Commit after user approval: `test: verify board lifecycle and navigation journeys`. **Stop for final user review; do not deploy or invent a further phase.**

## 8. Review package, executive summary, and evaluation standard

### Mandatory review package and stop

For **every phase 0–6**, Luna must produce both:

- `docs/plans/board-refresh/phase-NN-report.md`: detailed reproducible evidence and technical review.
- `docs/plans/board-refresh/phase-NN-executive-summary.md`: a standalone explanation for the user or another AI, mapped to requirements and acceptance criteria.

The phase deliverable is incomplete without both documents. Partial or blocked work is **INCOMPLETE/BLOCKED**, with missing criteria listed. When every technical criterion passes, use **REVIEW READY — AWAITING USER**. User acceptance and main integration are separate recorded states.

At review readiness, link the plan, handoff, executive summary, report and diff/revision, state which phase awaits approval, and **end the implementation turn**. Do not use background agents, automations, waits, or automatic follow-up dispatches to continue work. The user supplies the go-ahead after personal or external review. A halt overrides previous dispatch authorization.

### Executive summary template

Keep the opening brief, but include enough matrix rows to cover every phase requirement. A file list or raw log does not explain the outcome.

```markdown
# Phase NN executive summary — [phase name]

Status: INCOMPLETE/BLOCKED | REVIEW READY — AWAITING USER | APPROVED/LANDED
Date / implementer: Luna (gpt-5.6-luna, xhigh)
Plan version/path / handoff path / base revision / candidate revision or tested tree

## What changed for the user
[Concrete before/after behavior and scope actually delivered.]

## Requirements and acceptance results
| Requirement ID | Requested outcome | What was delivered | Acceptance IDs | Test/evidence links | Result |
| ... | ... | ... | Pn-ACx / behavioral IDs | file:test / report section / artifact | PASS / FAIL / BLOCKED / NOT STARTED |

## Test-first proof and verification
[Tests authored before code, meaningful RED outcome, GREEN results/counts,
regressions/builds/real platform checks, anything not executed.]

## Review findings, limitations, and deviations
[Resolved findings with evidence, remaining risks, plan deviations and reasons.]

## How to review
[Branch/diff/files, reproducible commands, safe local setup and manual steps.]

## Decision needed / next boundary
[Current phase acceptance/landing requested; next phase NOT AUTHORIZED
unless the user explicitly approves it. No automatic continuation.]
```

Another AI must be able to review from this plan, the handoff, summary, diff and linked evidence without chat history. Include **not implemented yet** entries for partially delivered requirements. Phase 1 data-layer tests do not establish completed lifecycle UI; Phase 4 shell changes do not establish all R9 page resizing.

### Technical report template

Every report contains:

```text
Phase / date / Luna model and reasoning effort
Base main SHA / candidate SHA / landed main SHA
Acceptance IDs -> test names -> exact result
RED evidence captured before runtime edits (test hash/diff + failing assertions)
Changed files and why
GREEN commands, exit status, counts, artifact paths
Review findings (severity, file, resolution, verification)
Rendered web / Android evaluation evidence and tested viewports
Data migration, compatibility, privacy, cache and rollback notes
Unexecuted checks and blockers (never called PASS)
Executive summary path / parent or independent reviewer recommendation
User approval text/reference and scope / gate verdict / post-main smoke result
Next phase authorization: NOT AUTHORIZED unless explicit user go-ahead recorded
```

Review in separate passes: (1) requirements and test-oracle independence, (2) correctness/security/concurrency/cache behavior, (3) UX/accessibility/responsive behavior. A severity score is not a substitute for resolving an issue. P0/P1/P2 findings that undermine acceptance block integration. Minor pre-existing unrelated debt may be recorded with evidence and left unchanged.

The phase acceptance tables are mandatory pass/fail contracts. Every row needs named evidence, and every referenced behavioral ID needs a test or explicit failed/blocked status. An aggregate score cannot replace missing checks. Reviewers may request stronger tests; weakening or changing an acceptance criterion requires user agreement and a versioned plan update before proceeding under that change.

Feature success is proven through user actions and persisted results, not a screenshot alone, a large test count, or a compiler pass. Visual success requires recognizable cards/lanes, reachable controls, readable labels, coherent hierarchy, stable modal context, and no clipped content across the specified sizes.

## 9. Rollout and rollback

Apply additive DB changes before clients that call new RPCs, when production rollout is separately authorized. Test both old and new archive behavior against the new schema. Do not ship the new Delete UI against an old database that would silently archive or lose history; missing RPC errors remain explicit and non-destructive.

UI phases can be reverted independently if the new DB interface remains compatible. After historical evidence is moved into a retained ledger, do not drop that ledger or revert readers to live-only queries: doing so hides preserved history. Prefer a forward repair. A rollback of UI is not a rollback of completed user deletions, and deleted habit definitions are not restorable.

The final handoff must distinguish local main commits, local database rehearsal, Android debug artifacts, and production deployment. No production success may be claimed from local tests.

## 10. Documentation consulted

- [Expo SDK 54 reference](https://docs.expo.dev/versions/v54.0.0/) — required version-specific baseline.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) — grants, owner policies, and invoker-security views.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions) — function privilege and transaction-boundary guidance.
- Local `AGENTS.md`, package manifests, current source and canonical SQL; previous phase reports are context, not proof of this candidate's behavior.

Supabase changelog markdown fetch was attempted but rejected by the web tool's content-type handler. The implementer must check relevant current changelog/docs through a supported path before DB implementation; no dependency upgrade is requested.
