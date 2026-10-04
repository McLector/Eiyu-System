# 0013 — Eiyu web theme-consistency & motion polish plan

Handoff: `docs/handoff/004-handoff.md`. Follows plan 0012 / handoff 003.

## Context

The flat/crisp "System window" redesign (Slices 9–13) gave Board, Status, Auth and the Quest Editor one coherent HUD language. Commit `fa86fe4` (plan 0012 — gym, long quests, dialogs, journeys) was mainly a behaviour/data overhaul told to "keep the Eiyu look", but its visual layer was appended as a separate CSS block (`web/src/index.css:815-885`) that overrides the system instead of building on its tokens. The result is three visual dialects in one app: **HUD terminal** (Board/Status/Auth), **generic admin tool** (Gym, shared Dialog, guard, notices) and **painted storybook** (journey art). The user wants it pulled back into one theme and the motion polished.

Inputs: impeccable critique (design review + detector, isolated), emil-design-eng principles, improve-animations audit (AUDIT.md values). Critique score **21/40** (Consistency & Standards = 1/4). All P0/P1 claims below were re-verified at file:line.

**Settled — not to be undone by this plan:** sword cursor, 2 quests/page, "Habit archived ✓" copy, plain-X close with 44×44 hits, content-sized buttons (plan 0012); Auth dark-only (handoff 003); journey painting **kept**, framed as a HUD window (user, this session); all 0012 behaviour (guards, uncertain-save reconciliation, receipts). Mobile untouched.

## Root causes (fix these and most symptoms collapse)

1. **`--c-bg` is undefined** — `.btn-primary` text (`index.css:825`, `WebQuestEditor.tsx:271`) inherits `--c-text` → ~1.2:1 on cyan. Every filled Save/Start/Finish/Create label is near-illegible. **P0.** Also undefined: `--c-panel` (`:599,607,654`), `--c-surface` (`:609`).
2. **`letter-spacing: 0 !important`** on all buttons/inputs/h1-h3 (`index.css:816-817`) erases the tracked uppercase HUD label voice wherever the element is a button/heading. Undocumented in handoff 003 — likely a 320px/200%-zoom overflow guard, so tracking must come back *per class* under the viewport matrix.
3. **Two control systems.** `.btn-ghost` defined twice (`:141-157` cyan pill + `transition: all`; `:818-824` neutral 6px) → two ghost looks; new `btn-*` classes adopted only in Gym/Dialog, while Long Quests/Quest Editor/Auth/Profile/Settings keep inline-styled buttons. Cancel has 4 treatments, Destructive 5, Primary 5; case flips between sentence (Gym/Dialog) and uppercase (everything else).
4. **No semantic or motion tokens.** `#f87171/#4ade80/#fbbf24` hardcoded ~40× (light-theme contrast 1.5–2.6:1); journey palette hardcoded and theme-blind (`index.css:865-877`); no `--ease-*`/`--duration-*`, 9× `transition: all`.

## Cross-cutting constraints (found in the double-check review)

1. **Uppercase via CSS, never by rewriting strings.** ~25 vitest assertions and the browser harness select by exact accessible name (`'Leave without saving'`, `'Confirm permanent delete'`, `'Save exercise'`, `'Close SETTINGS'`, `'Keep editing'`…). Apply the HUD case rule with `text-transform: uppercase` in `.btn-*`, `.field-label` and title classes, so source strings and the test selectors stay stable. Chromium can pass transformed text through to assistive tech, so check the result once in the DevTools Accessibility pane rather than assuming it. Existing literal-uppercase strings ("NEW QUEST", "SAVE CHANGES") stay as they are in this pass. Caveat: Maestro and Playwright `text=`/`innerText` matching **does** see transformed text. `web/maestro/flows/00_signup_fresh.yaml` asserts Auth strings, but Auth is already uppercase, so this is low risk. Still re-run it after Phase 2.
2. **Notices must stay reachable inside dialogs.** `Dialog.tsx:24-26` sets every sibling `inert` + `aria-hidden`, and `ArchiveNotice.tsx:65` portals into the active dialog for exactly this reason. The unified feedback surface in Phase 3 must keep that portal-target behaviour. One visual style, but the host stays dialog-aware. Add a test: a notice raised while a dialog is open is inside the dialog and focusable.
3. **Harness in a worktree.** `scripts/verify-web-overhaul-browser.cjs:2` requires `../.temp/plan-011/browser/node_modules/playwright`, and `.temp/` is gitignored (`.gitignore:92`), so it won't exist in a fresh worktree. Junction or copy `.temp/plan-011` into the worktree. Alternatively, point the require at the main checkout. Copying is the safer of the two.
4. **Shared-package changes must not regress mobile.** The contrast tests and any extracted copy module live in `packages/shared`, so run mobile tests and its typecheck too. Mobile UI stays untouched.
5. **Prevent re-drift.** The design spec is gitignored and there's no DESIGN.md, so the next overhaul will drift the same way. Add (a) the token-definition test from Phase 1 and (b) a ratchet test: the count of hex/rgba literals in `index.css` outside the theme blocks may only go down (snapshot the count after Phase 1). At the end, run `impeccable document` to write `web/DESIGN.md`. It contains only design-system facts, no secrets, but the repo is public, so **ask before committing it**. The default is to keep it local and gitignored, like the spec.
6. **`btn-ghost` changes reach Landing** (`web/src/web/Landing.tsx`, 3 uses, Persuade surface). Include Landing in the Phase 2 screenshot batch (the harness covers `/`).
7. **Before baseline:** run the browser harness once on `main` before Phase 1 and keep the screenshots (outside the repo). Each phase's batch is then a real before/after, and unintended changes on untouched screens show up.
8. **Resumability:** save this plan as `docs/plans/astra_opus_plans/0013-eiyu-web-theme-motion-polish.md` and start `docs/handoff/004-handoff.md` using handoff 003's structure (starting context, phase status, current continuation, phase reports, change map). Update it after every phase. Ask before committing either one.
9. **Commits:** one per phase on a feature branch, Conventional Commits, **no Co-Authored-By trailer** (user rule overrides the harness default), only when the user says go. Check README/CHANGELOG/.gitignore before each commit (memory: git commit preferences).

## Phases (ordered by blast radius; each = tests first → implement → verify)

Work in a worktree (`EnterWorktree`, then `git reset --hard main` — origin/main lags; copy `web/.env`, `docs/superpowers/` and `.temp/plan-011` in manually). No commits until the user says go.

### Phase 1 — Tokens (both themes, `web/src/index.css` `:root` + `[data-theme='light']`)
- Tests first: new `web/src/__tests__/css-tokens.test.ts` — parse index.css + all `web/src/**/*.tsx`, assert every `var(--c-*)` referenced is defined in **both** theme blocks (would have caught all 3 undefined tokens). Contrast tests for new tokens in `packages/shared` following `packages/shared/src/logic/color-tint.test.ts` (reuse `contrastRatio`).
- Add `--c-on-accent` (dark `#050b14`; light verify ≥4.5:1 on `#0891b2`), replace `var(--c-bg)` uses.
- Add `--c-danger / --c-success / --c-warning` each with `-border` and `-glass`, light values darker (≈ `#b91c1c / #15803d / #b45309`), modelled on the fire/ice pairs (`index.css:56-61`, `96-101`).
- Delete or define `--c-panel`, `--c-surface` (they currently render transparent — check the 4 rules visually before choosing).
- Motion tokens: `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`, `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`, `--dur-press: 160ms`, `--dur-fast: 150ms`, `--dur-base: 200ms`, `--dur-slow: 300ms`.
- Journey tokens: `--c-journey-route`, `--c-checkpoint-{done,available,locked}-{bg,border}`, `--c-checkpoint-label-bg` per theme; sword pommel `#e8c977` → palette-consistent value in both SVGs (`web/public/art/sword-*.svg`).
- Sweep hardcoded `#f87171/#4ade80/#fbbf24` (and their rgba forms) onto the semantic tokens across **all** `web/src` (index.css plus every tsx, including WebSettings, WebHeatmap, Landing and WebStatus). This is a mechanical 3-hue swap that fixes the light-theme WCAG failures. It isn't the deferred inline-style migration. Extend the ratchet test to these hues in tsx too.

### Phase 2 — One control system + HUD type voice
- Tests first: stat/difficulty chips expose `aria-pressed` (`WebQuestEditor.tsx:235,254`, `WebLongQuests.tsx:236,375`); Gym confirm buttons carry verb labels (`WebGym.tsx:259`).
- Single `.btn-*` block: delete the old `.btn-ghost` (`:141-157`); `.btn-ghost` becomes the cyan secondary-quiet variant (decide: alias of `.btn-secondary` or `.btn-quiet` — one look). `.btn-destructive` uses `--c-danger*`. Radius aligns with the system (4px, matching `panel-flat`).
- **Inline tracking resurfaces.** Inline `letterSpacing` appears 16× in WebQuestEditor, 15× in WebLongQuests, 12× in Landing, 11× in WebStatus and 9× in WebAuth. It currently does nothing because of the `!important`, and it beats any class once the `!important` is removed. Remove inline `letterSpacing` from every button and heading migrated in this phase. Landing, Status and Settings aren't being migrated, so their old values come back. Name them explicitly in the 320×568 / 200% overflow screenshot gate.
- Replace `index.css:816-817` with per-class tracking: `.btn-*` `letter-spacing:.08em`, dialog/page titles `.06em`, labels `.12em` — plus the case rule chosen in Open Decision A. Keep `overflow-wrap:anywhere`.
- Shared `.field-label` class (exemplar: `WebQuestEditor.tsx:118` — Rajdhani 11/700 .12em uppercase); apply to Gym form (`index.css:741`) and profile labels (`:246`).
- One `StatChip` component (Quest Editor's icon+label tinted design) used by both editors.
- Migrate buttons role-by-role (Primary → Cancel → Destructive → Create/Add → Retry → Pagination) across WebLongQuests, WebQuestEditor, WebAuth, AccountShell, WebSettings, WebHistory; footers use `.action-footer`. Gym "Discard draft"/"Remove" → destructive. Exemplar footer: `WebGym.tsx:43`.
- Icons: GYM nav gets its own icon (not `StatusIcon`, `AccountShell.tsx:27`); menu Settings → existing `GearIcon` (`Icons.tsx:89`), Logout → a sign-out glyph, not `ChevronIcon` (`:180-184`). Replace stray Unicode (`◇ ↑ ↓ ↻ ×`) with Icons.tsx glyphs where an icon exists.
- Page titles: one pattern (level, case, tracking) for Gym `h1`, Long Quests `h2`, dialogs.
- **Dialog shell** (the user flagged dialogs): `.phase4-dialog` `index.css:240,831`. Move it to the `panel-flat` treatment History/QuestEditor already shipped: 4px radius, `--c-panel-border`. Keep one modest elevation shadow, since a modal really does float, but drop the stacked 8px radius + border + `0 24px 80px` combination. Collapse the triple padding (`WebHistory.tsx:56`, `index.css:240,712`).
- **Gym re-skin** (it reads as a generic admin tool today, not just its buttons): table and row cards (`index.css:745,790,843`) → hairline `--c-divider-flat` rows like Board/Status; column headers → HUD labels (`index.css:747`; exemplar `.weekly-review-table caption` `index.css:421-428`); heading area → one primary action (Start/Finish) plus a compact secondary group (it currently shows 4 heading actions plus a toolbar); dashed upload box → hairline. Keep 0012's 8 desktop columns and the card layout below 1200px.
- **Focus:** remove `outline:none` from `.phase4-form input` (`index.css:247`) and `.field` (`:330`), or replace it with the global accent ring. Unify disabled opacity: global `.45` (`index.css:829`) vs inline `.6` (`WebQuestEditor.tsx:271`).
- **320px check:** the Quest Editor day chips (7×28px, `WebQuestEditor.tsx:188-207`) sit in a `1fr 1fr` grid inside a dialog about 270px wide. Verify there's no overflow inside the dialog body. The harness checked overflow on the document, not inside the dialog.

### Phase 3 — States, feedback and voice
- Tests first: Board XP toast timer — two completions within 2s keep the second visible (fake timers; bug at `WebBoard.tsx:296-297`, timer never cleared → store in ref + `clearTimeout`); one Long Quest completion produces exactly one status announcement (remove duplicate `<p role=status>` at `WebLongQuests.tsx:354`).
- One feedback surface: Board XP toast, `RewardFeedback`, `ArchiveNotice` share one position/stack and a severity tone (info/success/warning/danger via semantic tokens). Reward card keeps the native `<progress>` (`RewardFeedback.tsx:15`; `RewardFeedback.test.tsx:20,30` assert role `progressbar` and the `value` attribute). Restyle it to match the stat-coloured XpBar look (`WebBoard.tsx:64-70`) via `appearance:none`, `::-webkit-progress-bar`/`::-webkit-progress-value`/`::-moz-progress-bar`; on phones it must not cover the Gym footer.
- Shared state blocks: one loading / empty / error treatment (exemplar `.board-state`, `WebBoard.tsx:306-311`) applied to Gym, Long Quests, History, Status weekly, ArchivedHabits; errors get `role="alert"` + `--c-danger` (missing at `WebQuestEditor.tsx:151,267`, `WebAuth.tsx:262`). Move Gym "Check save result"/"Retry media cleanup" next to the thing they refer to.
- Extract the new strings into a shared copy module (`packages/shared/src/logic/`, same pattern as `auth-copy.ts`/`boardSummaryLine`) so they're unit-testable and mobile can reuse them. Update the vitest/harness assertions on any string that changes. Gym confirm verbs (`WebGym.tsx:259`) are among them.
- Hunter-voice pass (exemplars `WebStatus.tsx:69,72`, `WebHistory.tsx:79,82`) over: Gym loading/empty/success strings, internal-jargon leaks ("Refresh failed", "reconciled", "Check save result", "cleanup needs retry"), Long Quests empty state, NavigationGuard copy, Board recovery copy, Status weekly error. Show a before/after copy table for approval before applying (copy is product truth).
- Long Quest editor placement per Open Decision B.

### Phase 4 — Journey framed as a HUD window (art kept)
- Tests first: terrain `<img>` has `alt=""` (`JourneyMap.tsx:29`); checkpoint and checklist entry have distinct accessible names (`JourneyMap.tsx:39` vs `WebLongQuests.tsx:152`).
- Checkpoints/labels/route on Phase-1 journey tokens, so the map follows the theme.
- HUD framing: hairline `--c-panel-border` frame with SignaturePanel-style corner brackets *only on the expanded map* (keeps signature-panel restraint), a subtle desaturate/tint + `--c-page-flat` overlay so the painting sits under the UI rather than competing.
- `object-fit: fill` (`index.css:864`) distorts the art up to ~5×. Moving to `cover` crops under the %-positioned route/checkpoints — treat as a **feel-check across 320→1920px** (cap max width or anchor `object-position`), not a mechanical swap. Make the SVG route follow the painted path where feasible.
- Checkpoint labels ≥ 11px (currently 9–10px, `index.css:870,878`).
- Stage rows: bordered, tinted 8px cards (`WebLongQuests.tsx:146-160`) → the plain checklist rows spec §8.6 calls for. Remove the duplicated stat name on each card (`WebLongQuests.tsx:119` vs `133`).
- Light theme: the painting has no light variant. Tune the overlay per theme so the map doesn't become the darkest block on a light page. Feel-check it in both themes.

### Phase 5 — Motion (improve-animations findings, exact values)
| # | Where | Change |
|---|---|---|
| 1 | `.btn-*` (after Phase 2) | `transition: transform var(--dur-press) var(--ease-out), background-color 150ms ease, border-color 150ms ease, color 150ms ease`; `:active { transform: scale(0.97) }` on all `.btn-*`, `.board-action-button`, `.board-progress-stepper button`. Hover glow removed (spec reserves glow). |
| 2 | 8 inline `transition: 'all 0.15s'` (WebStatus:148, WebQuestEditor:204/240/261, WebLongQuests:212, WebAuth:231, WebSettings:18/88) | Move to a shared `.chip` / control class with explicit `background-color, border-color, color 150ms ease`. |
| 3 | `WebStatus.tsx:107` width bar | `scaleX` + `transform-origin:left`, `transform 300ms var(--ease-in-out)` (copy XpBar). |
| 4 | `WebBoard.tsx:68` XpBar | `400ms ease` → `300ms var(--ease-in-out)`. |
| 5 | `WebSettings.tsx:22,25` toggle | `left` → fixed `left:2` + `translateX(20px)`, `transform 200ms var(--ease-in-out), background-color 200ms ease`. |
| 6 | `.journey-hero` `index.css:866`, `JourneyMap.tsx:35` | Wrap hero in an `inset:0` positioned wrapper; move via `transform: translate(x%, y%)` on the wrapper (hero keeps its own `translate(-50%,-100%)` anchor); `transform 600ms var(--ease-in-out)` (rare moment, 600ms OK). Reduced-motion rule kept. |
| 7 | `FireStreak.tsx:24`, `index.css:529-532` | Animated `filter: drop-shadow` → static glow, or separate layer animating `opacity` only. |
| 8 | `.phase4-brand-mark` `index.css:773-774` | Infinite text-shadow pulse → static glow (or one pulse on load). |
| 9 | `checkpoint-light` `index.css:872,877` | box-shadow loop → pseudo-element with static shadow, animate `opacity`. |
| 10 | Chevrons `WebLongQuests.tsx:128`, `Icons.tsx:168` | `transform 200ms var(--ease-in-out)`. |
| 11 | Dialog `Dialog.tsx:51-52` | Overlay `@starting-style{opacity:0}` 200ms `--ease-out`; panel `@starting-style{opacity:0;transform:scale(0.96)}` 200ms, centre origin. Exit stays instant (unmount). |
| 12 | Account menu `.phase4-account-menu` | Same at 150ms, `scale(0.97)`, `transform-origin: top right`. |
| 13 | Toast stack (Phase 3 surface) | `@starting-style{opacity:0;transform:translateY(-100%)}`, 200ms `--ease-out`, transitions (not keyframes) so rapid re-triggers retarget. |
| 14 | Reward card | Enter `translateY(100%)` with `transform 500ms var(--ease-drawer), opacity 200ms var(--ease-out)`; one `scale(1.06)` pulse on level label when level increases. |
- Global `@media (prefers-reduced-motion: reduce)`: keep fades, drop all translate/scale entrances. Existing per-component rules stay.
- No animation on keyboard-initiated or 100+/day actions (quest check-off gets press-scale only, no celebration).

### Phase 6 — Cleanup
Delete dead CSS classes (16 confirmed: `glass`, `glass-sm`, `divider`, `board-delete-*`, `board-card-note`, `board-lane-body`, `board-recovery-list`, `board-section-heading`, `web-board-grid`, `web-board-overview`, `history-dialog(-header)`, `btn-quiet` if unused after Phase 2), unused `@keyframes fadeOut` (`:492`), unused `web/src/web/Sidebar.tsx` (verify no import first). Fold the `/* Plan 012 */` block into the sections it overrides so the cascade reads top-down without `!important`.

### Optional Phase 7 — older debt (only if Open Decision C says so)
Migrate remaining inline style objects (318 sites; Landing 47, WebStatus 29, WebHeatmap 18, WebSettings 15) to classes/tokens; type & radius scale (currently 18 font sizes, 16 radii); header `backdrop-filter` removal; touch targets ≥ 44px (Gym row actions 28px, day chips 28px, History chevrons ~24px); heatmap cell accessible names.

## Verification (each phase, real output shown)
- `npm test -w web`, `npm test -w packages/shared` (or the workspace's vitest), mobile tests, typecheck for web + shared + mobile (mobile UI is untouched but shared changes reach it), `npm run lint`, `npm run build -w web`, `git diff --check`. The handoff 003 baseline was 88 web + 255 shared + 92 mobile = 435 passing; the count should only go up.
- After Phase 2: re-run `node scripts/verify-board-gym-browser.cjs` and the Maestro web flow `web/maestro/flows/00_signup_fresh.yaml`, because text-transform affects `innerText` matching.
- Visual: `node scripts/verify-web-overhaul-browser.cjs` (Playwright present at `.temp/plan-011/browser`) — both themes × 320/390/768/1024/1280/1440/1920 + real 200% zoom. Phase 2 (tracking) is gated on **no new overflow at 320×568 and 200%**. Inspect screenshots in one batch per phase, fix together, one confirmation pass.
- Live feel-check in the dev server for motion (DevTools Animations panel at 10–25% speed): press scale, dialog/menu entry, toast retarget on rapid completes, hero travel, reduced-motion emulation.
- Once at the end: `impeccable detect --json web/src` — read the JSON (it exits 0 even with findings). Re-run `impeccable critique` to compare against 21/40.

## Decisions (confirmed by user 2026-10-04)
- **A. Case rule — HUD uppercase.** Tracked uppercase Rajdhani for actions, titles, labels; sentence case only for body/help text. Gym and Dialog/NavigationGuard titles and buttons switch to uppercase.
- **B. Long Quest create/edit — move into shared `Dialog`** (`web/src/components/Dialog.tsx`), registering dirty/pending state with the existing NavigationGuard coordinator like the Gym editors do. Add tests first: open/close, Escape with dirty form triggers guard, focus restores to the trigger, atomic save path unchanged, a stage-delete confirm nested inside the editor dialog gets keyboard/Escape handling as the topmost dialog. Rewrite the browser-harness steps that drive the inline form (`verify-web-overhaul-browser.cjs` ~246-296: `'Quest name'`, `'Keep editing'`, `'Unsaved changes'`, `'Next Long Quests page'`), and re-verify 0012's focus-restore and post-delete pagination clamping.
- **C. Scope — Phases 1–6 only.** Phase 7 deferred to a later pass.
