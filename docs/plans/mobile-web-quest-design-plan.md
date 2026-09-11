# Mobile and web quest behavior: design and phased implementation plan

Date: 2026-09-10
Implementer: Sol
Status: Authorized for phased implementation on 2026-09-11; every phase remains subject to the gates below.

## 1. Objective and scope

Deliver the eight requested changes on both mobile and web:

1. A missed habit occurrence provides exactly the following calendar day to recover its frozen streak. Failure to recover resets the streak and unfreezes the habit.
2. Replace the user-facing term “Easy Version” with “Penalty.”
3. Show scheduled habits in Daily Quests only on their selected days.
4. Add a separate All Habits list to the board.
5. Give One-Time Quests their own board list.
6. Enforce sequential long-quest stages, including at the authoritative write boundary.
7. Support optional descriptions on long-quest stages.
8. Update registration's Privacy Policy and Terms and Conditions presentation and stale product references to match the current UI.

This is an implementation contract. Tests must be derived from its observable requirements before production feature code is written. Each phase must pass the complete applicable gate below and land on main before the next phase begins. Do not implement this entire document as one batch.

## 2. Repository discovery and constraints

Repository source and package scripts were inspected during planning. Tests and running UI were not executed; existing code is evidence of implementation intent, not proof that deployed behavior works. Phase 0 must reproduce the reported issues and verify database deployment parity. Proposed field names below express concepts, not mandatory schema names.

### Verified starting points

| Area | Existing files and findings |
| --- | --- |
| Architecture | npm workspaces: `@eiyu/shared`, `@eiyu/mobile`, `@eiyu/web`. Mobile declares Expo `~54.0.36`; web uses Vite. |
| Scheduling | `packages/shared/src/logic/quest-recurrence.ts` already has `todayQuestsFilter` and `splitQuestsByType`. It explicitly uses UTC weekday/date keys and one-time `scheduled_date`. Investigate why observed behavior differs before replacing it. |
| Habit queries | `packages/shared/src/data/habits.ts` exposes `fetchTodayHabits`; it filters to today's items, then fetches 90 days of completions. `fetchAllActiveHabits` exists but returns reminder fields, not a full board catalog. Audit long-streak truncation and recovery visibility; avoid using the today-only query for all habits or off-day recovery. |
| Streak logic | `packages/shared/src/logic/eiyu-logic.ts` already implements `streakState`, an earliest-miss recovery deadline, and `frozenQuests`. The current algorithm remains broken after expiry until progress resolves it; preserve the no-repeated-freeze behavior during an uninterrupted run of misses. |
| Board UI | `mobile/app/(tabs)/board.tsx` and `web/src/web/WebBoard.tsx` already call `splitQuestsByType`; inspect `web/src/pages/BoardPage.tsx` and the store/query wiring too. Requirement 5 may be a regression or incomplete presentation, not absent domain support. |
| Long quests | `packages/shared/src/data/long-quests.ts` currently writes stage completion directly with `.update({ done })`; verify deployed database guards rather than assuming UI locking is enough. It already maps and writes stage descriptions. |
| Description support | `backend/supabase/016_long_quest_descriptions.sql` already adds nullable stage descriptions. `mobile/app/long-quest-editor.tsx` carries them in state and payloads; `mobile/app/(tabs)/longquests.tsx` renders them. Trace missing editing affordances and web parity; do not add duplicate columns. Inspect `017_reconcile_long_quest_stages.sql` for edit/reorder behavior. |
| Registration | `mobile/app/auth.tsx`, `web/src/web/WebAuth.tsx`, `web/src/pages/AuthPage.tsx`, and `packages/shared/src/logic/auth-copy.ts`. Web's visible policy text is inside consent-toggling markup in the inspected source; prove document navigation and consent independence through interaction tests. |
| Backend | SQL lives under `backend/supabase/`; another root `supabase/` also exists. Identify the canonical migration/deployment path before edits. Read applicable Supabase and Postgres skills before database implementation. |
| Existing tests | Shared Jest suites cover recurrence, streak logic, habits, completions, long quests, date utilities, board summary, and auth copy. Mobile uses jest-expo; web uses Vitest. Mobile Maestro flows live under `mobile/maestro/flows/`. |

Verified script entry points (not executed during planning): `npm run test --workspace=@eiyu/shared -- --runInBand`, `npm run test --workspace=@eiyu/mobile -- --runInBand`, `npm run test --workspace=@eiyu/web`, `npm run lint`, and `npm run build --workspace=@eiyu/web`. Determine type-check commands from the actual tsconfigs. Follow `mobile/maestro/README.md` for native dev-client setup and run stateful Maestro flows sequentially, one flow per invocation. Do not copy its shell-specific setup blindly into PowerShell.

The repository instruction requires reading the exact [Expo SDK 54 documentation](https://docs.expo.dev/versions/v54.0.0/) before writing code. This URL was consulted during planning. Sol must read it and relevant versioned package pages before implementation; inspect the installed versions and do not silently upgrade Expo or dependencies as part of this work.

Respect applicable AGENTS.md and skills. Preserve unrelated user changes. Reuse existing architecture and test runners where suitable. Implement shared domain rules once when the architecture permits; avoid independent mobile/web interpretations. Do not invent test commands, files, service capabilities, or legal facts.

## 3. Product decisions and explicit planning defaults

These defaults make the plan executable while distinguishing interpretation from the user's explicit requests. Record any clarified decision before writing its acceptance tests.

| Topic | Contract / planning default |
| --- | --- |
| Penalty | User confirmed: rename Easy Version to Penalty and preserve its current behavior. Do not invent deductions, monetary charges, XP changes, or extra recovery requirements. |
| Scope of freeze | Treat freeze as belonging to the affected habit and its streak. Verify whether the current product uses a global streak; if so, resolve that mismatch before implementing the state machine. |
| Missed day | An incomplete, scheduled habit occurrence whose canonical calendar day has ended. Unscheduled days are never misses. |
| Recovery deadline | The end of the calendar day immediately after the missed scheduled day, even if that recovery day is not a scheduled habit day. It is not a rolling 24-hour period and not the next scheduled occurrence. |
| Product day and timezone | User confirmed the product day starts at the actual start of the user's day: 00:00 in a persisted account IANA timezone. Initialize that value from the device timezone when the account first receives this capability; use the persisted value consistently on mobile, web, and authoritative writes. A later timezone change affects future occurrence boundaries only and must not reinterpret history or an open recovery window. |
| Second chance | One recovery window for the miss that breaks a run, with no extension or nested freeze. After expiry, continued inactivity stays reset and unfrozen; a new chance requires resuming normal progress and later missing again. No lifetime token system is implied. |
| Successful recovery | Preserve the existing successful recovery completion/streak/reward semantics, characterized in Phase 0. This request changes the allowed window and expired state, not the reward formula or the meaning of the Easy Version action. Separate normally scheduled completion must not be accidentally consumed or double awarded. |
| Failed recovery | Reset the affected streak to zero, clear its frozen state, close the recovery opportunity, and keep the habit and its future schedule. Do not delete or permanently disable the quest. |
| Off-day recovery visibility | Show an active recovery action in a clearly labeled recovery area, not as a regular Daily Quest on an unscheduled day. |
| Habit catalog | All Habits lists every saved habit regardless of today's schedule. If archived habits exist, retain access through an explicit archived filter or subsection rather than hiding saved records accidentally. |
| One-time visibility | Preserve current availability, due-date, completed, and archive rules; move eligible one-time quests into their own list without changing their lifecycle. |
| Long Quest placement | User confirmed Long Quests remain in their existing dedicated mobile tab and web route. Keep access from existing navigation, but do not duplicate Long Quests as a board section. |
| Stage descriptions | Optional plain text, trimmed; blank is stored as absent. Proposed maximum: 2,000 characters with matching client/server validation. No rich text or attachments. |
| Registration consent and legal content | User confirmed the existing consent requirement and current legal content are acceptable for now. Phase 7 may improve presentation, navigation, accessibility, and verified stale product terminology, but must not invent or silently broaden consent or data-practice claims. |

If an open decision changes behavior, update this contract and its independently reasoned expected examples first. Do not choose an answer based on what makes existing code easiest to retain.

## 4. Shared behavior and data design

### 4.1 Calendar and schedule model

Calendar terminology in this document uses the account's canonical calendar day. The user selected the local-day variant: a product day begins at 00:00 in a persisted IANA timezone associated with the account. The inspected repository currently uses UTC across recurrence, completion date keys, and streak logic, so Phase 1 must migrate the complete date contract—queries, completion keys, history, reminders, server validation, existing records, and cross-device behavior—before later phases. Never change only `getUTCDay()` while leaving completion keys or authoritative validation in UTC. Initialize the stored timezone from the device when the account first receives the capability, then treat it as explicit account state rather than silently following every device timezone change.

Use calendar-date arithmetic in that timezone. Do not calculate “tomorrow” by adding 24 hours or use the server's timezone implicitly. Inject the clock and timezone into domain tests. Specify a stable weekday encoding in the contract and adapters.

Daily eligibility requires an active habit, a selected weekday matching the current canonical calendar date, and a date on or after creation/effective start. Creating a Monday/Wednesday/Friday habit on Tuesday produces no Tuesday occurrence and no retroactive Monday miss. Its next normal occurrence is Wednesday.

Schedule edits affect future occurrences and do not retroactively create misses, erase earned completions, or cancel an already opened recovery obligation. Timezone changes must not reinterpret already created occurrences or move an existing recovery deadline. Define the effective boundary for new scheduling when implementing these edits.

Conceptually distinguish the habit definition from its dated occurrences. A habit may appear in All Habits and have a linked occurrence in Daily Quests; that must not create two completion records. Reuse the existing model if it can enforce this distinction without a new occurrence table.

### 4.2 Frozen streak state machine

Persist or reliably derive: affected habit, missed canonical date, frozen streak value, recovery opening instant, exclusive deadline, recovery status, and enough history/versioning for idempotent reconciliation. Persist absolute boundary instants computed from the original timezone so later timezone edits cannot extend the window.

| State and event | Required result |
| --- | --- |
| Active; scheduled date completed on time | Record one completion and apply existing normal streak/reward rules once. |
| Active; scheduled date ends incomplete | Freeze the preserved streak and open recovery for the next canonical calendar day. |
| Frozen; valid recovery before deadline | Close recovery and unfreeze with the existing successful recovery semantics. |
| Frozen; deadline reached without recovery | Close recovery, reset streak to zero, and unfreeze. |
| Frozen; another miss within the same recovery window | Do not extend the deadline or open another chance. Resolve the existing window first. |
| Closed recovery; late or duplicate recovery request | Reject late recovery or return the already applied result without duplicate rewards/state changes. |
| App resumes after multiple days | Reconcile elapsed dates chronologically; do not offer a fresh window merely because the app was closed. |

Worked examples (in the persisted account timezone; for example, `Asia/Manila`):

- Monday 2026-09-07 is scheduled and missed. Recovery is valid from Tuesday 2026-09-08 00:00 inclusive until Wednesday 2026-09-09 00:00 exclusive.
- A Tuesday 23:59:59 recovery preserves the streak; a Wednesday 00:00:00 recovery is too late.
- For a Monday/Wednesday/Friday habit, Tuesday still offers recovery in the recovery area. It does not show a normal Tuesday Daily Quest.
- If recovery is missed, Wednesday's regular occurrence is available with an unfrozen reset streak. Completing it starts the new streak using the existing normal rule.
- For an every-day habit, Tuesday recovery and Tuesday normal completion are separate obligations. Do not implicitly satisfy either through the other. If the normal completion happens first, reconcile the recovery result deterministically: preserve that valid completion when recovery fails, applying it after the reset as the first completion of the new streak. Test both request orders.
- If Tuesday recovery succeeds but Tuesday's regular occurrence is missed, that distinct miss may open Wednesday recovery under the existing successful-recovery semantics. If the original Monday recovery fails, Tuesday's simultaneous miss must not reopen or prolong the original freeze. Continued inactivity stays reset and unfrozen; normal progress must resume before a later miss creates a new chance.

Use authoritative time for writes where a server exists. A client countdown is informative, not permission to recover. Unless the system already provides a trustworthy offline event protocol, requests first received after the deadline must not backdate recovery from a device-supplied timestamp. Make offline/pending/failure states explicit in the UI.

Reconciliation must run at relevant reads/writes and app resume; background timers alone are insufficient. Use an existing scheduler if present, but correctness must survive missed jobs. Recovery/reset/completion/reward effects need atomicity or the architecture's equivalent, unique operation keys, and conflict handling across mobile and web.

### 4.3 Board information architecture

Use these distinct, labeled board sections on mobile and web, adapting layout to viewport rather than changing meaning:

1. Daily Quests: today's eligible habit occurrences only, with existing completed-item visibility behavior preserved.
2. Recovery Required: active frozen-habit recovery actions, when present, with an explicit deadline and timezone.
3. One-Time Quests: independent one-time items under existing lifecycle rules.
4. All Habits: saved habit definitions with weekday summary and current status; management actions belong here.

Long Quests remain in their existing dedicated mobile tab and web route, reachable through existing navigation. Do not duplicate their stages or counts onto the board.

All Habits must not provide an unrestricted off-day completion path. If a completion shortcut is retained, route it through the same dated eligibility rules as Daily Quests. Recovery actions must stay reachable from their dedicated area and relevant habit detail.

Separate counts and empty states. An empty Daily Quests list must not imply the habit catalog is empty. Example copy: “No habits scheduled for today.” One-time quests must not be counted as daily habits, and Long Quest stage counts stay in the dedicated Long Quests experience. Reuse existing visual components and navigation; avoid a general redesign.

Verify loading, empty, error, offline, completed, and frozen states; long titles; large text; keyboard and screen-reader access; mobile scrolling and web narrow/wide layouts.

### 4.4 Sequential stages and descriptions

Every long quest has a stable ordered sequence of stages. A stage can be completed only if all preceding stages are completed. The first unfinished stage is actionable; later stages are locked with explanatory text such as “Complete Stage 2 first.” Stage 3 must be rejected at the write boundary while Stage 2 is unfinished even if a modified client submits the request directly.

Check ownership, predecessor state, and completion atomically. Duplicate completion cannot repeat rewards. Complete the long quest and grant its existing completion effects only when every required stage is complete. After a failed optimistic request, restore correct UI state and show the reason.

If undo, deletion, or reordering already exists, preserve the invariant: reject undo of an earlier stage with completed successors; restrict structural edits after progress begins unless the existing product supplies a separately tested safe operation. Do not silently invalidate earned progress. Audit legacy out-of-order progress; preserve earned history, report inconsistencies, and define a deterministic migration policy before altering such records.

Add the optional description to stage creation, editing, storage/transport types, and stage display on both platforms. Existing stages without a description remain valid. Clearing a description persists its removal. Render text safely, preserving line breaks; do not interpret it as HTML. Ensure the optional field does not obscure stage title, order, or completion controls on small screens.

### 4.5 Registration privacy and terms

Inventory current registration UI, legal screens/routes/modals, content sources, and existing consent handling. Update their layout and navigation to fit the current registration UI, including readable typography, scrolling, close/back behavior, safe areas, focus management, contrast, and accessible links.

Review stale product terminology and links against the actual product, including habits, recovery/Penalty, one-time quests, and long quests where those subjects are already described. Confirm the actual data handling before changing any privacy statements. Do not fabricate retention periods, vendors, contact details, legal bases, security guarantees, or legal compliance claims. This phase is a product/content consistency update, not a claim of legal certification.

Preserve existing consent requirements unless an explicit approved product decision changes them. Required consent, if present, starts unchecked and must be enforced at the actual registration boundary. Opening/closing policy content must preserve entered registration data and consent state. Both documents must be readable without an account. Use a single content source when feasible; version substantive changes using existing content/version conventions. If verified facts are missing, flag those exact statements for the owner and keep that release gate unresolved rather than publish invented text.

## 5. Mandatory test-first and main-commit ruling

This section applies to EVERY phase, including setup, copy/UI work, schema changes, and fixes discovered during evaluation.

### 5.1 Required order

1. From the latest passed main, isolate the phase on a branch such as `codex/quest-phase-02`. Record base revision and working-tree state; leave unrelated changes untouched.
2. Convert this phase's acceptance examples into test cases and independently specified expected outcomes. Add executable test code before production implementation. Use public behavior contracts, not private helper details or values generated by the implementation under test.
3. Run the new tests against the current feature and record RED evidence: exact command, failing assertions, test identifiers, and revision/diff. Failures must demonstrate the missing behavior, not broken imports, invalid fixtures, network unavailability, or an unconfigured runner. Minimal test harness/interface scaffolding is permitted when necessary; no feature logic may precede its relevant test.
4. Review the tests against the requirements before implementation. Cover success, rejection, boundary, persistence, and relevant platform behavior. Existing behavior already passing needs explicit characterization evidence; identify the changed behavior that still fails.
5. Implement the smallest coherent feature change that satisfies those tests. Refactor only after green. Run relevant regression suites.
6. Perform the reviews and evaluation series below. For a newly discovered defect, first add a failing regression test, then fix it. Do not weaken expected outcomes to fit the code. A test correction needs a requirement-based explanation and a fresh red/green record.
7. Record the phase report. Only after every required check passes, create the phase's commit and integrate it into main. Prefer one auditable phase commit containing tests, implementation, and evidence. Use repository-required PR/branch protections if present; never bypass them or force-push main.
8. If main moved, integrate latest main on the phase branch and rerun affected checks before landing. Verify the landed main revision with the applicable smoke checks. Start the next phase only after that verification succeeds.

Do not put deliberately failing intermediate tests on main. A branch may retain red/green evidence as logs or permitted branch-local history; main must contain only the passed phase result. A merge conflict, skipped required platform evaluation, unavailable database test environment, or unresolved acceptance failure means the phase has NOT passed. Report the specific blocker and do not claim completion or land the phase prematurely.

### 5.2 Series of required gates

| Gate | Passing standard |
| --- | --- |
| Requirements/test review | Every phase criterion maps to a named executable test, plus any required manual evaluation. Tests contain meaningful rejection and boundary assertions and pre-implementation evidence. |
| Domain tests | All new/affected behavior tests pass with a controlled clock and deterministic fixtures. No skipped or focused tests conceal missing coverage. |
| Integration/persistence | Changed write paths tested through the real application boundary with an isolated test store/service; round trips, authorization, duplicate requests, conflicts, and migration compatibility pass where applicable. Mock-only success is insufficient for persistence/invariant changes. |
| UI/component checks | Changed mobile and web interactions pass behavior tests, including disabled/locked states, validation, and errors. |
| Static/build | Repository-required formatting, lint, type checking, web build, and mobile build/bundle checks pass. Record exact scripts discovered in Phase 0. |
| Regression | Existing relevant suites and all earlier phases' acceptance tests pass. The final phase runs the complete repository suite. |
| Review | Separate requirement/test review, code/data/security review, and UX/accessibility review are documented with findings and resolutions. If Sol self-reviews, label that honestly and use separate passes; do not invent an independent reviewer. |
| Adversarial evaluation | Direct invalid writes, boundary timestamps, stale clients, repeated taps, refresh/resume, and relevant offline cases cannot bypass the contract. Use deliberate fault injection where valuable: removing a guard must make its contract test fail. |
| Platform evaluation | Exercise every changed user flow on web and supported mobile targets, recording browser/device/emulator, build, and results. A bundle build alone does not prove a working mobile flow. Mark unavailable required targets blocked. |
| Main readiness | No unresolved acceptance failures, data-loss/authorization defects, or reproducible broken changed flows. Migration/rollback approach documented where relevant; diff contains only the phase and required evidence. |

Coverage percentages alone never satisfy a gate. Do not waive a failing test because it failed before this phase: investigate and resolve or document a narrowly justified, owner-approved baseline exception before landing. Never label an unrun check as passed.

## 6. Phased delivery

### Phase 0 — Repository map, baseline, and executable test foundation

Status: Complete on `codex/quest-phase-00`; evidence is recorded in `docs/plans/quest-phase-00-report.md`. Main integration is the final gate before Phase 1 begins.

Purpose: make the remaining plan concrete in the actual repository before feature work.

- Read applicable instructions and SDK 54 docs. Locate mobile/web entry points, board selectors, habit schedule logic, streak/recovery code, Easy Version references, quest/stage writes, registration content, schema/migrations, auth, and CI.
- Record the current behaviors and architecture, existing timezone policy, reward rules, platforms supported, exact test/build commands, test environment provisioning, and likely files per subsequent phase. Resolve the freeze scope mismatch if present and record the Penalty interpretation.
- Run and record the baseline. Reuse existing runners; if coverage layers are missing, add the smallest compatible harness. Write a smoke test before harness configuration, demonstrate the initial setup failure, then prove the runner works. Distinguish that infrastructure failure from feature RED evidence required later.
- Add reusable deterministic date fixtures, isolated persistence setup, user fixtures, and platform test utilities as necessary. Ensure no test targets production data.

Exit: repository mapping and decisions appended to this plan or a linked report; baseline understood; test commands reproducible; harness verification and applicable review gates pass. Commit this phase to main before Phase 1.

### Phase 1 — Scheduled habit eligibility

Scope: requirement 3 and the calendar/occurrence foundation required by recovery.

Write these tests FIRST:

- Monday/Wednesday/Friday habit appears on those dates and is absent on Tuesday/Thursday/Saturday/Sunday; test each weekday rather than one example.
- An off-day creates no missed occurrence and does not freeze/reset a streak.
- Creation midweek does not generate historical misses; creation on a scheduled date follows the explicit start-date rule.
- Canonical local midnight, month/year changes, cross-device timezone differences, and 23-hour/25-hour daylight-saving calendar days preserve the persisted IANA-timezone contract.
- Schedule edits preserve existing history and recovery deadlines; mobile and web produce the same eligibility.
- Duplicate retrieval/resume creates no duplicate occurrence; off-day direct completion cannot bypass eligibility.

Then implement shared eligibility and authoritative validation, updating existing Daily Quests behavior before the later visual separation phase. Preserve current valid daily completion behavior.

Exit: scheduling matrix, affected persistence/security checks, and mobile/web daily-flow evaluations pass. Commit to main using the full gate.

### Phase 2 — One-day frozen streak recovery

Scope: requirement 1 and the complete state machine in Section 4.2, including visible recovery access on off-days.

Write these tests FIRST:

- Freeze occurs only after an eligible incomplete day ends and preserves the pre-miss streak.
- Valid recovery, exact deadline rejection, unsuccessful recovery/reset/unfreeze, and a subsequent normal completion match the worked examples.
- No deadline extension from reload, another miss, schedule/timezone edit, or duplicate recovery.
- Tuesday off-day recovery remains accessible for a Monday/Wednesday/Friday habit without creating a Tuesday Daily Quest.
- App absent for several days reconciles correctly; repeating reconciliation produces the same result.
- Recovery and same-day normal completion in either order preserve valid completion records and award each applicable effect at most once.
- Concurrent mobile/web recovery, duplicate submissions, stale state, forged client time, offline late delivery, and unauthorized user actions preserve the invariant.
- Existing frozen records migrate deterministically; expired freezes cannot remain indefinitely frozen. Test migration on representative legacy fixtures, including missing timestamps; document the chosen fallback before implementation.

Then implement state transitions, persistence/reconciliation, deadline display, and recovery errors on both platforms. Inspect current recovery action and rewards instead of inventing a new mechanic.

Exit: state-transition matrix, integration/race checks, migration rehearsal if needed, and real mobile/web recovery evaluations pass. Commit to main using the full gate.

### Phase 3 — Penalty terminology

Scope: requirement 2 under the recorded product decision.

Write tests FIRST asserting “Penalty” in applicable creation/edit forms, cards, detail views, validation, accessible names, recovery prompts, onboarding/help, and localized content. Assert the old user-facing label is absent in active UI and legacy saved values still load and perform the same action. Avoid renaming persisted keys merely to satisfy display text tests.

Then centralize or update labels and associated explanatory copy. Retain internal legacy fields when compatible. The user explicitly confirmed a rename only; preserve current behavior, including quantity-habit exemptions and recovery rewards, with characterization tests. Include AI suggestion labels/help, notifications, and accessibility actions in the terminology inventory. Do not rewrite user-authored saved content merely because it contains the old words.

Exit: terminology inventory covered, both platform flows readable and consistent, and existing data/action compatibility verified. Commit to main using the full gate.

### Phase 4 — Separate board lists

Scope: requirements 4 and 5; finish the board architecture while preserving Phases 1–3.

Write these tests FIRST:

- A mixed dataset routes habit definitions, today's eligible occurrences, active recoveries, and one-time quests into their specified board sections while Long Quests remain reachable only through their dedicated route/tab.
- A Tuesday board shows all Monday/Wednesday/Friday habits in All Habits and none as normal Daily Quests.
- A scheduled habit can be represented in catalog and daily sections with one underlying completion; refresh and a second device show the same state.
- One-time quests never enter Daily Quests or its counts; completing them does not alter a habit streak.
- All Habits remains usable when today's list is empty; management changes update linked views without losing history.
- Recovery remains reachable after regrouping, and long quests retain access.
- Loading/error/offline/empty/completed states and section counts are correct; catalog shortcuts cannot complete off-day occurrences.
- Keyboard/screen-reader navigation and mobile narrow-screen scrolling reach every section and action.

Then update board queries/selectors and responsive rendering. Do not duplicate state, completion handlers, or backend records merely to populate separate lists.

Exit: mixed-data integration scenario and both platform board evaluations pass, alongside all schedule/recovery regressions. Commit to main using the full gate.

### Phase 5 — Strict long-quest stage sequence

Scope: requirement 6.

Write these tests FIRST:

- Only Stage 1 is initially completable; finishing it unlocks Stage 2; Stage 3 cannot complete until Stage 2 completes.
- Direct write/API attempts to skip a predecessor fail without changing progress or rewards.
- Concurrent, repeated, out-of-order, stale, and unauthorized requests cannot bypass sequencing or duplicate rewards.
- Failed optimistic completion rolls back visibly; persisted progress survives reload and appears correctly on the other platform.
- Final quest completion occurs only when every required stage is complete, once.
- Existing undo/reorder/delete routes cannot invalidate the invariant; legacy out-of-order records follow the documented migration policy without silently removing earned history.

Then enforce predecessor validation at the authoritative boundary and reflect it through locked UI with explanatory labels on mobile/web.

Exit: integration tests actually exercise the authoritative guard, legacy policy validated, and sequential user journey passes on both platforms. Commit to main using the full gate.

### Phase 6 — Optional stage descriptions

Scope: requirement 7.

Write these tests FIRST:

- Creating a stage without a description remains valid, including old records and old client payloads.
- Create, edit, clear, reload, and cross-platform reads preserve expected description values.
- Whitespace-only input normalizes to absent; multiline text and Unicode display correctly.
- At-limit and over-limit inputs have consistent validation on both platforms and the write boundary.
- Markup-like content is rendered as inert text; edits require correct ownership.
- Long descriptions remain readable with large text and do not hide sequence/complete controls; editing descriptions cannot bypass Phase 5 locking.

Then make an additive nullable/optional data change where needed, update transport validation and both UIs, and preserve backward compatibility. Avoid a destructive schema rename or forced nonempty backfill.

Exit: migration/round-trip compatibility, security/validation, and mobile/web editing/display evaluations pass. Commit to main using the full gate.

### Phase 7 — Registration privacy and terms refresh

Scope: requirement 8 and Section 4.5.

Write these tests FIRST:

- Both legal documents open from registration without authentication on mobile and web.
- Back/close returns to registration without clearing entered values or changing consent.
- Full text is reachable and scrollable; mobile safe-area/large-text and web keyboard/focus behavior work.
- Links resolve, content matches the intended version, and obsolete product UI references are replaced.
- Existing required-consent rejection and successful registration flows remain enforced through the real registration boundary; if no consent requirement exists, do not introduce one silently.

Then update the presentation and verified content, preserving registration behavior. Review actual data practices and unresolved content facts separately from UI testing. Do not place proposed legal facts in production text as placeholders.

Exit: content accuracy review, accessible rendering, links and registration integration checks pass on both platforms. Any unresolved material content fact blocks that affected release. Commit to main using the full gate.

### Phase 8 — Whole-product evaluation and handoff

Before any stabilization fix, write its failing regression test. Author the cross-feature scenario below before any implementation changes in this phase.

Run a fresh account through registration and both legal documents; create a Monday/Wednesday/Friday habit with Penalty content, a one-time quest, and a three-stage long quest with optional descriptions. Verify distinct board lists on scheduled/off-days. Complete a scheduled occurrence, miss another, recover within the one-day window, then fail a later recovery and verify reset/unfreeze. Exercise the simultaneous normal-completion case. Complete the one-time quest independently. Attempt to skip Stage 2 via UI and direct write, then complete all stages in order. Reload, resume after several days, and switch platforms to confirm persistence and consistent outcomes.

Run all repository tests, static/build checks, applicable migration rehearsal, and mobile/web end-to-end evaluation. Review the complete feature set against all eight user requests. Check unchanged quest rewards/history and registration flows for regressions. Record rollout compatibility and rollback limits, especially where old clients might omit new fields or attempt invalid writes.

Exit: every requirement traced to passing evidence; no unresolved gate failures. Commit final regression tests, any passed fixes, and the handoff report to main as the final phase. Do not claim release deployment merely because main contains the work.

## 7. Required phase report template

Maintain one report per phase, for example `docs/plans/quest-phase-02-report.md`. Use actual discovered paths and commands.

```text
Phase / date / implementer:
Requirements and decisions covered:
Base main revision / candidate revision / landed main revision:
Changed files and purpose:
Acceptance criterion -> test identifier -> result:
RED evidence recorded before feature code (command, assertion, revision/diff):
GREEN evidence (commands, results, run environment):
Integration / migration / authorization / concurrency results:
Mobile target(s), web browser(s), build and evaluation evidence:
Requirement/test review findings and resolutions:
Code/data/security review findings and resolutions:
UX/accessibility evaluation findings and resolutions:
Regression and static/build results:
Skipped/unavailable checks and blocking reasons:
Migration, compatibility, rollback notes:
Gate verdict: PASS or BLOCKED (with reason)
Main integration and post-landing verification:
```

Record candidate evidence before landing and the resulting main revision in the final handoff or subsequent report update without claiming that a commit can contain its own hash. Logs must not include credentials or personal production data.

## 8. Sol execution instruction

Read this document in full. Start with Phase 0. Implement one phase at a time using tests first, record real red/green evidence, perform the complete applicable test/review/evaluation series, and commit/integrate that phase into main only after it passes. Then verify main and proceed. Do not weaken tests to match implementation, bypass branch protections, silently reinterpret unresolved product semantics, combine all phases into one final commit, or describe incomplete/unrun checks as passed. The task is complete only when all eight requested changes work on mobile and web and every phase has a recorded passed result on main.
