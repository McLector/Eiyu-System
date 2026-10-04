# 004 - Eiyu web theme-consistency and motion polish handoff

Started 2026-10-04. Source: `docs/plans/astra_opus_plans/0013-eiyu-web-theme-motion-polish.md`. Follows plan 0012 / handoff 003.

## Starting context

- Worktree `.claude/worktrees/web-polish-0013`, branch `worktree-web-polish-0013`, created from local `main` at ac7ee46. Nothing committed, pushed, or deployed. Commits only when the user says go (Conventional Commits, no Co-Authored-By trailer).
- Web only. Mobile UI untouched. `packages/shared` untouched so far.
- Inputs: Impeccable critique (21/40), emil-design-eng principles, improve-animations audit. Decisions confirmed by the user: HUD uppercase case rule; Long Quest editor moves into the shared `Dialog` (Phase 3); scope is Phases 1-6, Phase 7 deferred; journey painting kept, framed as a HUD window.
- Windows PowerShell, Node 22.18.0. The worktree needed its own `npm ci` (a junction to the main checkout's node_modules would resolve workspace links to main's `packages/shared`).
- Gitignored support files copied into the worktree by hand: `web/.env`, `docs/superpowers/`, `.temp/plan-011` (Playwright for the harness), `.temp/plan-012/demonstration.mp4`.
- AGENTS.md says to read the Expo v54 docs before writing code. This pass is web-only (Vite/React, no Expo APIs); the v54 docs index was read once after Phase 1 code had begun and has nothing that applies. Recorded here rather than skipped silently.

## Phase status

| Phase | Status |
|---|---|
| 1 Tokens | Done and verified (see report) |
| 2 Control system and HUD type voice | Done and verified (see report) |
| 3 States, feedback, voice, Long Quest dialog | Mostly done; copy pass awaiting user approval (see Phase 3 report) |
| 4 Board and Gym layout consistency (inserted after the user's review) | Done and verified (see report) |
| 5 Journey framed as a HUD window (was 4) | Done and verified (see report) |
| 6 Motion (was 5) | Done and verified (see report) |
| 7 Cleanup (was 6) | Done and verified (see report) |

## Evidence locations (all gitignored, outside the repo's tracked files)

- Baseline on untouched main, 214 screens / 9 flows, passed: `<main checkout>/.temp/plan-013/before/`
- After Phase 1: `<worktree>/.temp/plan-013/after-p1/`
- Latest run: `<worktree>/.temp/plan-012/browser-evidence/`

## Running the browser harness (synthetic fixtures only, no real backend)

1. From `<worktree>/web`: set `VITE_SUPABASE_URL=http://127.0.0.1:54399` and `VITE_SUPABASE_ANON_KEY=synthetic-anon-key` in the process environment (never the saved `.env`), then `npx vite --host 127.0.0.1 --port 5176 --strictPort` detached to a log.
2. From the worktree root: `node scripts/verify-web-overhaul-browser.cjs`. Port 5176 is hardcoded. Output: `Browser fixture acceptance passed: N screens, M flows.`
3. Do not edit `web/src` while it runs (the dev server serves live files). Stop the server when finished.
4. Move `.temp/plan-012/browser-evidence` aside before each run so runs do not mix.

## Phase reports

### Phase 1 - Tokens
- Tests first: `web/src/__tests__/css-tokens.test.ts` (every `var(--token)` read is defined; new tokens exist in both themes; motion token values; the red/green/amber hues are tokens not literals; a ratchet on colour literals outside the theme blocks, ceiling 8) and new contrast cases in `design-tokens.test.ts`. They were red first: the undefined-token test found exactly `--c-bg`, `--c-panel`, `--c-surface`.
- Added `--c-on-accent`, `--c-danger/-success/-warning` (+ `-border`, `-glass`) with darker light values (`#b91c1c`, `#166534`, `#92400e`, all >= 4.5:1 on the light page), journey/checkpoint tokens (same value in both themes for now, because the chrome sits on the painted terrain), and motion tokens (`--ease-*`, `--dur-*`).
- `--c-panel` / `--c-surface` were undefined and rendered transparent; replaced with an explicit `transparent` so nothing changes visually. The `scrollbar-color` track on the lane tabs is now valid too.
- Swept every `#f87171/#4ade80/#fbbf24` literal across `web/src` onto tokens. The difficulty picker in `WebQuestEditor.tsx` previously concatenated hex alpha (`color + '18'`); it now uses per-difficulty tone tokens.
- Verified: 41 token tests, full web suite, `tsc`, lint, and the full harness (214 screens / 9 flows). Screenshot comparison: the "Finish workout" label was pale text on cyan before and is now a dark, legible label in both themes.
- Deliberate non-change: stat colours (`STAT_COLORS`, `packages/shared`) are identity colours and stay as they are.

### Phase 2 - Control system and HUD type voice
- Tests first (red, then green): `StatChip.test.tsx`, `WebQuestEditor.pressed.test.tsx`, a Gym confirm-label test, and a `control system` block in `css-tokens.test.ts`.
- Removed the global `letter-spacing: 0 !important` on buttons/inputs/headings. Tracking and case now live on the classes: `.btn-*` (`.08em`, uppercase, 4px radius), `.field-label` (`.12em`), `.page-title`, dialog titles. Source strings are unchanged so every existing test and harness selector still matches. User-provided text is never uppercased (AI-suggestion chips use `.choice-chip`; routine and quest names are untouched).
- Deleted the old standalone `.btn-ghost` (50px pill, `transition: all`). `.btn-ghost` is now an alias of `.btn-secondary`. Removed the `.protected-main .btn-ghost` 32px override and the dead `.phase4-primary/.phase4-secondary` classes.
- New `components/StatChip.tsx` (icon + label, `aria-pressed`, label >= 11px) used by both quest editors; difficulty chips now expose `aria-pressed` too.
- Buttons migrated by role across Quest Editor, Long Quests, Auth, Account dialog, Settings, History, Status, Board, Archived habits, Gym, pagination. Cancel is secondary, save is primary, in an `.action-footer`. Gym "Remove" and "Discard draft" are now destructive. Gym confirmation buttons carry the action name instead of "Confirm".
- Icons: new `DumbbellIcon` (Gym nav) and `SignOutIcon`; the account menu uses `GearIcon` for Settings. Gym move-up/down use `ChevronIcon` instead of Unicode arrows.
- Dialog shell moved to the 4px `panel-flat` radius with one modest shadow. Gym table is hairline rows (no bordered box or per-row cards), HUD column headers, solid hairline upload box. Inputs keep the global focus ring (`outline: none` removed).
- Verified: 136 web tests (28 files) pass, `tsc` and lint clean, `vite build` passes, `git diff --check` clean, and the full harness passes (214 screens / 9 flows) across both themes, 7 viewports and 200% zoom. Screenshots inspected: no new overflow at 320x568 for Quest Editor, Gym or Long Quests; "NEW QUEST" and the "GYM PROGRESS" nav tab already wrapped at 320px in the baseline, so those are not regressions. Auth's "ENTER SYSTEM" is now a filled primary with a legible label.
- Not run: `scripts/verify-board-gym-browser.cjs` and the Maestro web flow `web/maestro/flows/00_signup_fresh.yaml` (the plan asks for both after Phase 2, because uppercase display affects `innerText` matching). Both are still to do; neither was attempted. Mobile and shared tests were not run (nothing in `packages/shared` or mobile changed so far).
- Not done / deviations from the plan text: the Gym heading was not restructured into "one primary action plus a compact group" (Start/Finish stay in the session footer; the buttons are now consistently styled instead). Contrast tests live in `web/src/__tests__/design-tokens.test.ts` (which already reads live CSS) rather than `packages/shared`, because they measure the CSS tokens. Landing keeps its inline-styled buttons (Persuade surface, not migrated); they pick up the new `.btn-ghost` look through the class.

### Phase 3 - States, feedback, Long Quest dialog (copy pass NOT applied)
- Tests first, red then green: `WebBoard.toast.test.tsx` (second toast keeps its own 2s; unmount-safe), `WebLongQuests.announce.test.tsx` (one status announcement per completion), `ArchiveNotice.dialog.test.tsx` (notice lands inside the topmost dialog and is reachable; tone attribute), `WebLongQuests.dialog.test.tsx` (13 cases: modal open, focus, Escape, guard, Keep editing, success, uncertain save, no-stage, edit seeding, focus restore), `StateBlock.test.tsx`.
- Fixes: Board toast timer held in a ref and cleared (was never cleared). The Long Quest notice is a status region only when no reward card carries it.
- One feedback surface: `.feedback-card` with `data-tone` (info/success/warning/danger) on the Board XP toast, archive/save notices and the reward card. `announceFeedback(message, owner, tone)` takes an optional tone (default success). Reward `<progress>` kept, drawn like the Board XP bar.
- `StateBlock` component (loading = status, error = alert + retry, empty) now used on Board, Long Quests, Gym, History and Archived habits. Strings and retry labels are unchanged.
- Long Quest create and edit moved into the shared `Dialog` via the new `LongQuestEditorDialog.tsx`, registered with the NavigationGuard. Harness steps in `scripts/verify-web-overhaul-browser.cjs` rewritten (dialog is inert behind, Escape asks, Keep editing keeps input, focus returns to EDIT).
- Gym "Check save result" and "Retry media cleanup" moved up beside the error line.
- Verified: 159 web tests (33 files), `tsc`, lint, build and `git diff --check` clean; full harness 214 screens / 9 flows passed twice.
- Deviations: no nested stage-delete confirm exists in the editor (stages remove immediately), so the only nested dialog is the NavigationGuard confirm, which is tested. No new copy module in `packages/shared` yet because no copy has changed.
- NOT run: `scripts/verify-board-gym-browser.cjs` and Maestro `00_signup_fresh.yaml`. The first needs an isolated stack and its JWT secret; the only stack on 54321 belongs to another project (supabase-luna), so it was not touched. Maestro writes to the live project. Mobile and shared tests not run (nothing there changed).
- Not screenshot-reviewed: the Long Quest dialog itself at 320px (the harness does not open it with a screenshot).

### Phase 4 - Board and Gym layout consistency
- Source: the user's screenshot plus the worktree renders. Plan: `C:\Users\morad\.claude\plans\the-web-is-almost-cosmic-breeze.md`.
- Tests first (red, then green): `WebBoard.cards.test.tsx`, `WebGym.layout.test.tsx`, and a `board and gym layout consistency` block in `css-tokens.test.ts` (no board/gym type under 11px, 4px radius on lanes and cards, `.btn-compact` after the shared block, bespoke board button rules retired, accent checkbox).
- Board: card actions are now one row (primary left, Details/Archive/Delete right) using `btn-quiet`/`btn-destructive` + the new `btn-compact` modifier; catalog and archived cards use the same idiom. Sub-11px type raised, lane/card radius 4px, XP bar uses a visible `--c-bar-track` token (both themes), lane empty states use `StateBlock`.
- Gym: archived toggle sits beside the routine select as a styled checkbox; routine actions are grouped Add (secondary), Edit/Archive (quiet), Delete (destructive, set apart); per-row actions are a compact quiet group; exercise names are text-coloured (accent on hover), notes muted; session footer is right-aligned with DOM order Discard, Save, Finish (Tab order equals visual order) and sticks to the bottom only at >=768px wide and >=700px tall.
- Real bug found by the board-gym script: `PaginatedList` counted its own padding as usable space when computing how many cards fit, so taller cards overflowed the lane. It now subtracts padding and uses the flex gap. The script's overflow assertion now names the offending screens.
- Deviations: pagination was not merged into the Gym footer (it lives in the shared `FlowList`); the routine heading row was kept as its own zone rather than folded into the toolbar. `Show note` still opens the editor (label unchanged, awaiting the user's decision).
- Verified: 178 web tests, `tsc`, lint, build, `git diff --check`; fixture harness 214 screens / 9 flows; `verify-board-gym-browser.cjs` passed on the disposable luna stack (JWT secret read at run time, one process); Maestro `00_signup_fresh.yaml` passed after Phase 3.
- Open: the Maestro run used `maestro-p3@example.invalid`. The dev server for it may have read `web/.env` (live project) instead of the disposable stack because env vars do not persist between tool calls; unverified. Delete that account if it exists.

### Phase 5 - Journey framed as a HUD window
- Tests first: `JourneyMap.hud.test.tsx` (decorative terrain `alt=""`, map is a named group, checkpoints are named `Map checkpoint N: <stage>. <state>` and numbered across segments so they never share a name with the checklist row), `WebLongQuests.journey.test.tsx` (stat named once, plain `.stage-row` checklist rows), and a `journey as a HUD window` block in `css-tokens.test.ts`.
- Expanded map gets a hairline `--c-panel-border` frame with corner brackets (collapsed strip stays quiet); a per-theme `--c-journey-overlay` tint sits under route, checkpoints and hero (z-index 1/2/3); `object-fit: cover` replaces the distorting `fill`; labels are 11px (hidden visually under 480px where five labels would collide, the icon and accessible name still carry the state). Stage rows are plain hairline checklist rows with a stat-tinted box; the duplicated stat line under the card title and the repeated visible "Complete earlier stages first." are gone (reason stays in `title` and the accessible name).
- Also fixed: `.page-title` had no colour of its own, so the Long Quests heading was nearly invisible in the light theme (it lost its inline colour in Phase 2; the Gym title only worked because `.gym-page` set one). Now tested.
- Harness findings: `questFlows` and the other profile steps only run with `--profiles`, so the Phase 3 dialog rewrite had not actually executed until now. Running it exposed three stale steps (pager lookup behind the inert dialog, checkpoint name format, Discard confirm label), all fixed. Added expanded-journey screenshots (3 sizes x 2 themes).
- A U+FEFF byte-order mark that my PowerShell `Set-Content -Encoding utf8` had added to `index.css` was caught by the watermark hook and stripped. Avoid `Set-Content -Encoding utf8` on repo files in Windows PowerShell 5.1.
- Verified: 196 web tests, `tsc`, build; default fixture harness 214 screens / 9 flows; `--profiles` 6 + 248 screens / 7 + 19 flows (keyboard, 200% zoom, empty/large/long/representative profiles); expanded-journey screenshots inspected at 1440 dark and light and 320 dark.
- Not checked visually: the journey at 390 and 1440 light beyond the three inspected; `object-position` was chosen from those captures only.

### Phase 6 - Motion
- Tests first: `motion.test.ts` (no keyframe or transition animates paint/layout properties or `all`; button/chip press scale; entrances live in a no-preference media block; reduced-motion rules) and `motion.components.test.tsx` (toggle knob uses transform, hero travels on a wrapper, flame glow static, level pulse only on level-up).
- Done: press scale (0.97, 160ms, `--ease-out`) on every `.btn-*` and chip, enabled only; the 4 inline `transition: 'all'` replaced with explicit properties; Status and Board XP bars use `scaleX` with `--dur-slow`/`--ease-in-out`; Settings knob moves by `translateX`; the hero moves by translating a full-size wrapper (600ms); logo glow and streak-flame glow are static; the available-checkpoint pulse animates opacity on a pseudo-element; chevrons use the tokens; dialog overlay fades, dialog panel and account menu scale in from 96/97% (centre / top right), feedback cards slide in as transitions, the reward card rises on `--ease-drawer` 500ms, and the level label pulses once on level-up. Exits stay instant. Under reduced motion only fades remain (the transform entrances sit in a `prefers-reduced-motion: no-preference` block).
- Chromium check added to the harness: the dialog entrance has `opacity` + `transform` transitions, and only `opacity` under reduced motion. Screenshots now wait 320ms so captures are not taken mid-fade.
- Not done: no animation was added to quest check-off beyond press scale (by design: it is a 100+/day action). The heatmap glow keeps its existing transform/opacity loop. A hands-on slow-motion feel check in DevTools was not done; the values come from the plan and the Chromium assertions above.

### Phase 7 - Cleanup
- Deleted 15 dead CSS classes (`board-card-note`, `board-delete-*`, `board-lane-body`, `board-recovery-list`, `board-section-heading`, `board-state`, `divider`, `glass`, `glass-sm`, `history-dialog*`, `web-board-grid`, `web-board-overview`), the unused `fadeOut` keyframes and `Sidebar.tsx` (no importers). A test now fails on any class no component uses, any unused keyframes, and any thick one-sided accent stripe.
- Not done as planned: folding the Plan 012 block into the sections it overrides. A whole-file reorder carries cascade risk for no visible gain, so the per-plan patch comments were renamed to section headings instead. `!important` is down to 8, each overriding an inline style or the sword cursor, and is capped by a ratchet test. The remaining one that is inline-style debt: `.status-tabs button { padding-inline: 8px !important }`.

## End-of-plan results
- `impeccable detect --json web/src`: after fixing one finding I had introduced (a 3px left stripe on the feedback card, flagged as "side-tab"), only `overused-font` (Inter, 3 places) remains. Inter is part of the settled Rajdhani + Inter + JetBrains Mono system and was left alone.
- The formal impeccable critique was NOT re-run, so there is no new score against 21/40. Use /impeccable critique if you want one.
- Final verification: 221 web tests (40 files), `tsc`, lint, build, `git diff --check`; default harness 214 screens / 10 flows; `--profiles` 254 screens / 26 flows; `verify-board-gym-browser.cjs` passed on the disposable luna stack after Phase 6 (not re-run after the Phase 7 deletions, which remove only unused CSS). Mobile and shared tests were not run: nothing outside `web/`, `docs/` and `scripts/` changed.
- Still open: the Phase 3 Hunter-voice copy table is unapproved and unapplied; `Show note` label decision; the possible stray `maestro-p3@example.invalid` account; whether to commit plan 0013, this handoff and a `web/DESIGN.md` (not written).

## Close-out pass (after the user said "check, fix, and do what needs me")
- **Copy pass applied** from the Phase 3 table plus the weekly-review error, via a new `packages/shared/src/logic/web-copy.ts` (unit-tested: no jargon, System voice, real ellipsis, cleanup marker). The Gym "Retry media cleanup" button used to depend on the word "cleanup" in the notice text; that marker is now exported and tested (`isGymCleanupNotice`). `Show note` became `Edit note` (it opens the editor).
- `formatError` printed `[object Object]` for a non-Error object with no message; it now returns "Unknown error" (tested, shared and mobile unaffected).
- Contrast audit found real AA failures and fixed them: the light-theme cyan (3.29:1) was used as text everywhere, so a `--c-accent-text` token (4.79:1) now carries all cyan text; inactive nav text and input placeholders were about 2:1 and now use the AA muted tokens. A generic test checks every text token on the page in both themes.
- Formal critique re-run (dual-agent): **27/40, up from 21/40**, 0 P0, 2 P1 (Board action density, Gym control cluster). Snapshot is in `.impeccable/critique/` (local, not committed). Fixed from it: hardcoded radar/tooltip colours, five inline sizes under 11px. Recommendations left as design decisions: one prominent Board action with an overflow menu, a Gym overflow and draft chip, an all-zero weekly empty state, a clearer light-theme lightness step.
- Flaky focus race fixed: choosing a map checkpoint focuses the checklist row on the next frame, which could land before the row mounted; it now retries for up to 10 frames. Board-gym script 5/5 after the fix (it failed 3 of 8 before).
- Harness: slow-motion check added (10% speed, dialog caught mid-transition then settles to opacity 1 and no transform).
- Maestro sign-up flow: the MCP driver now refuses connections ("Connection refused") although the app answers on IPv4 and IPv6, so the same sign-up steps were run with Playwright against the disposable stack instead (passed, user deleted afterwards). Earlier evidence: the first Maestro run's account `maestro-p3@example.invalid` never appeared in either local auth log (a later signup does log its email), so it went to the **remote project through `web/.env`**. It cannot be checked or deleted from here (production access was denied); delete it from the dashboard if present.
- `web/DESIGN.md` written (kept untracked on purpose; the repo is public).
- Not run: DevTools hands-on feel check (replaced by the CDP slow-motion assertion).

## Follow-up after the critique (user chose: Board first, overflow menu)
- Board card actions: Complete (or the stepper) is the single prominent action; Details, Archive and Delete moved into a new `ActionMenu` (`web/src/components/ActionMenu.tsx`, 18 unit tests), on both the daily and the All Habits cards. Archived cards keep Restore and Delete visible. Accessible names are unchanged (`Archive X`, `Delete X`, `Open X details`), now as `menuitem`s.
- Real-browser bug jsdom could not see: focusing the first item scrolled the page at 320px, which fired the menu's own dismiss-on-scroll handler, so the menu closed with focus still inside it and focus fell to `<body>`. Fixed (focus with `preventScroll`; a scroll or resize that closes the menu with focus inside returns focus to the trigger), with unit tests, and a harness flow now checks the menu inside the viewport at 320 and 1440 in both themes and that Escape returns focus.
- Selecting an item returns focus to the trigger before the action runs, so the Delete confirmation dialog restores focus correctly.
- Colour literals outside the theme blocks dropped from 8 to 2 (black shadows and the recovery tint now use `color-mix`); the ratchet is now 2. The account menu radius is 4px.
- `web/DESIGN.md` made the detector check the stylesheet against it. It reports `design-system-*` drift: 19 radii (5 to 14px, older chrome), 4 off-ramp font sizes, about 10 tint colours. These are the deferred type/radius scale work, not regressions; DESIGN.md says so instead of claiming 4px everywhere.
- Not done: the second critique P1, the Gym control cluster (overflow menu and draft status chip). Next up if wanted.

## Remaining work

Decisions only: approve or edit the copy table, decide the `Show note` label, delete the possible stray Maestro account, and say go on commits (one per phase on a feature branch, Conventional Commits, no Co-Authored-By trailer).

Phases 3-6 per the plan. Phase 3 includes moving the Long Quest create/edit forms into `Dialog` (tests first, including a nested stage-delete confirm and the harness steps at `scripts/verify-web-overhaul-browser.cjs` ~246-296). Run the full gate after each phase. At the end: `impeccable detect --json web/src` (read the JSON, the exit code is 0 even with findings), re-run the critique to compare against 21/40, and decide with the user whether to commit this plan, this handoff, and any `web/DESIGN.md`.
