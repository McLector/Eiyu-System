# 003 - Eiyu web UI/UX overhaul implementation handoff

Started 2026-10-02. Source: `docs/plans/astra_opus_plans/0012-eiyu-web-ui-ux-overhaul.md`.

## Starting context

- Branch main; baseline e363228. Initial tree contained only existing private untracked .mcp.json, untouched. No commit, push, reset, remote SQL or deployment.
- Canonical SQL initially through 034; API limit 1,000. Web UI only, backward-compatible shared interfaces, no mobile UI changes.
- Read exact Expo v54 docs before code, plus Supabase/Postgres/task-observer skills. Handoff 002 and supplied 15-test review remain inherited evidence, not acceptance of this work.
- Windows PowerShell; Node 22.18.0, installed Expo 54.0.37, TypeScript 5.9.3, Vite 8.2.2, Supabase JS 2.112.4. Isolated verification: PGlite 0.5.8, Playwright 1.63.0/Chrome and FFmpeg.
- Docker/psql unavailable. Handoff 002 disposable 54322 runtime was not assumed live; personal 55322 untouched. Existing databases never reset.
- Original reference image not attached or found among tracked documentation assets. Preservation/comparison remain pending; generated art does not replace reference acceptance.
- Skill-observation directories unavailable; no external observation files written.

## Phase status

| Phase | Status |
|---|---|
| 1 Documentation/baseline | Saved; original reference pending |
| 2 Controls/dialogs/feedback | Implemented; local tests/main browser flows passed |
| 3 Archive/account | Implemented; timing/owner/focus/navigation tests passed |
| 4 Gym persistence/reads | 035 and bounded reads implemented; disposable SQL passed; native concurrency/Storage pending |
| 5 Gym experience | Implemented; viewport/workout flows passed; extended acceptance pending |
| 6 XP receipts | 036 and confirmed feedback implemented; SQL/browser passed; native concurrency pending |
| 7 Atomic Long Quests | 037/forms/paged reads implemented; local tests passed; extended acceptance pending |
| 8 Journeys | Assets/maps/provenance implemented, screenshots inspected; reference comparison pending |
| 9 Cursor/consistency | Implemented; fixture-backed screen/theme/zoom matrix passed; extended edge cases pending |
| 10 Integrated acceptance | Local verification passed; external acceptance/rollout pending |

## Current continuation

Implementation and local acceptance are substantially complete, but the plan is NOT fully accepted. Resume using the Remaining work checklist below. Start with R4/R5 browser edge cases and R1 test-harness preparation, which can proceed without a database; run native R1-R3 only after confirming a disposable full Supabase stack. Request the missing reference for R6. Finish with R7 rollout rehearsal, not production deployment. The fixture-backed matrix does not certify native services. Do not infer pending acceptance passed.

### Resume checklist

1. Read this handoff, plan 0012 and handoff 002 for historical context. Recheck git status and HEAD; at this documentation checkpoint HEAD is still e363228 on main, with the overhaul uncommitted. Preserve all existing edits and the private .mcp.json. No commit/push is authorized.
2. Recheck tools, permissions and processes instead of trusting stored PIDs. Port 5177 was the normal preview; 5176 was the synthetic fixture server and was stopped. The normal preview is not a migrated-backend acceptance environment.
3. Exact Expo v54 documentation must be read before further code changes. Keep scope web-only, retain Eiyu identity, no Gym XP and no mobile UI redesign.
4. Use the evidence and commands below as a baseline, not as proof after new edits. After each work item: implement -> verify -> resolve failures -> update this handoff. Record failed/unavailable checks as pending.
5. Before any native SQL operation, record the disposable project/container identity, API/DB ports and proof it contains no personal/production data. Never reset an existing database. Do not run root db:verify or db:reset as a shortcut: scripts/local-db.ps1 targets the root configuration and db:verify resets it automatically; that configuration uses personal ports 55321/55322 and excludes Auth, Storage and REST services when starting.

### Environment correction

The earlier PATH-only check overstated CLI absence. The repo-local Supabase executable and command shim exist under node_modules. During this documentation checkpoint, invoking the executable with --agent no --version failed with EPERM while attempting a telemetry write under the user profile outside the writable workspace; no database command was run. Docker/psql were not found on PATH, the Program Files Docker candidate was absent, and inspection of the per-user Docker candidate was permission-denied. Native runtime availability remains unconfirmed, not disproven. Resolve CLI permission/runtime setup deliberately; do not bypass protection or assume the historical disposable stack is live.

### Remaining work

Every item below remains unchecked until its stated evidence is recorded. Partial local coverage is explicitly identified so the next session does not repeat all work or mistake mocks for native acceptance.

- [ ] **R1 - Native database and concurrency acceptance (phases 4, 6, 7, 10).** Prepare/update dedicated tests for 035-037, then run them and existing pgTAP on a confirmed disposable Postgres/Supabase stack. Race routine deletion against exercise save/reorder, Start and Finish; race duplicate receipt requests, different quests affecting the same stats, atomic definition saves and completion/edit operations. Verify no deadlock, duplicate creation/XP, revived tombstone, unauthorized write, lost completed snapshot or partial definition. Use independent connections and retain exact results. Existing 017 reward concurrency tests exercise the older completion interface; they do not certify new receipt/definition locking. The 55 PGlite assertions already cover sequential ownership, ledger and rollback behavior, not these races.
- [ ] **R2 - Real Storage acceptance (phases 4, 5, 10).** Run GIF/MP4 upload and signed retrieval through actual Storage HTTP. Verify private/foreign/anonymous access denial, 20 MiB/MIME/signature/decode boundaries, actual signing expiry/renewal, autoplay rejection/retry, and pause on close. Replace/remove media and delete definitions; referenced uploads must survive, only confirmed unreferenced paths may be removed, failed deletion must remain in the protected manifest and retry after refresh. Verify owner-only list/ack and race safety. Teardown must remove all created media even after definitions disappear. Component tests cover upload retention, preview cleanup and scheduled renewal; SQL bucket/RLS assertions alone do not prove HTTP privacy or cleanup.
- [ ] **R3 - Real committed-but-unconfirmed outcomes (phases 2, 4-7, 10).** Against the disposable stack, commit writes while withholding their responses, also fail reconciliation reads, then restore connectivity. Cover routine/exercise/quest creation, draft/Finish, deletion and reward receipts. Stable creation/request IDs must prevent duplicates; uncertain input must remain protected; no referenced media may be cleaned; reconciliation must unblock later changed saves without replaying XP celebrations. A committed save followed by refresh failure must stay successful. Switch accounts while requests resolve and verify no stale notification/receipt/warning leaks. Shared/component tests cover these contracts locally; network-backed acceptance remains pending.
- [ ] **R4 - Remaining editor/journey interaction coverage (phases 2, 5, 7, 8).** Exercise zero-stage repair, existing single-stage editing and many-stage quests in the actual web UI. Test dirty close/collapse/page changes, deletion cancellation/failure/retry, page clamping and focus restoration, retained stage IDs/descriptions/rewards, more than five checkpoint segment navigation, locked checkpoint explanations/focus, and artwork after confirmed undo/edits/completion. Test routine switching with a dirty workout, definition/unit edits while a snapshot draft exists, clearing numeric prescriptions without coercion to zero, Unicode/long notes and background refresh while typing. Persisted zero/single/legacy/Unicode cases and generic FlowList clamping are already tested; that is not full integrated editor coverage.
- [ ] **R5 - Empty/large/long-content and keyboard matrix (phases 3, 5, 7-10).** Extend browser fixtures/native datasets beyond the current representative 5 quests/8 exercises/12 habits. Include empty accounts, large catalogs/history, long profile/exercise/quest/stage names/descriptions, full note dialogs and validation messages. Verify keyboard menu arrows/Home/End/Escape, nested confirmations and focus restoration, Back/Forward with dirty Gym plus profile, notification accessibility in the active dialog, text/disabled/drag/resize cursor fallbacks, and offscreen/background motion pause. Reuse both themes at all seven specified sizes and actual 200% zoom; check every relevant control is reachable without overlap. Current 214 captures cover representative screens, not every state/dataset. Auth was tested only in its supported default theme; do not claim its light-theme acceptance without a verified implementation or an explicitly recorded scope decision.
- [ ] **R6 - Reference preservation and visual acceptance (phases 1, 8, 10).** Obtain the original user-supplied reference image, save it durably under docs/assets/0012, record its source and compare the implemented HUD/journey screens. Generated art provenance is already preserved but cannot substitute for this reference. Keep missing-art fallback functional while treating missing artwork as failed visual acceptance. Inspect new screenshots in a batch, fix reproduced issues together, then perform a confirmation pass.
- [ ] **R7 - Ordered upgrade rehearsal and final acceptance (phase 10).** On a confirmed disposable environment containing representative pre-overhaul data, verify prerequisites/capability markers through 034. Apply and verify 035, then 036, then 037 separately; record each result and its ownership/concurrency/compatibility checks. Verify retained historical snapshots, drafts, legacy exemptions and old shared/mobile interfaces. Updated clients must use the restricted Gym mutation RPCs; old direct-DML clients cannot be assumed compatible. Rerun the full verification commands below after fixes, update all phase statuses and record evidence/limitations. Production deployment remains a separate user-authorized operation; no commit, push or production migration is part of this handoff.

### Harness preparation and verification commands

Before running scripts/verify-board-gym-browser.cjs against a real disposable stack, update its stale Long Quest behavior: around lines 80-85 it still expects checkpoint clicks to complete stages. Checkpoints now focus checklist entries only; explicitly activate the checklist completion control and assert confirmed receipts/XP. Review the rest of this older runner against current observable UI before claiming acceptance. Its hard-coded API 54321/web 5175 require a separately verified isolated stack, in-memory PLAN011_JWT_SECRET and matching temporary Vite environment. Never put credentials or signed URLs in this document. The root db:start helper excludes services this runner needs.

Local baseline commands, safe without resetting a database:

```powershell
npm.cmd run test --workspace web -- --maxWorkers=2
npm.cmd run test --workspace packages/shared -- --runInBand
npm.cmd run test --workspace mobile -- --runInBand
npx.cmd tsc --noEmit -p web/tsconfig.json
npx.cmd tsc --noEmit -p packages/shared/tsconfig.json
npx.cmd tsc --noEmit -p mobile/tsconfig.json
npm.cmd run lint
npm.cmd run build --workspace web
node scripts/verify-web-overhaul-db.cjs
git diff --check
```

The PGlite command creates its own fresh in-memory database. Its isolated dependency directory must exist; it is not a replacement for native R1. For synthetic browser checks, start a temporary web server at 5176 with VITE_SUPABASE_URL=http://127.0.0.1:54399 and a synthetic anon key, without changing saved .env files. Then run node scripts/verify-web-overhaul-browser.cjs (or --edge-only). All synthetic backend requests are intercepted by Playwright. Stop that fixture server when done; preserve the separate normal preview. Do not point the fixture runner at production.

Evidence regeneration prerequisites: .temp/plan-012/node_modules contains PGlite/sharp; .temp/plan-011/browser/node_modules contains Playwright; installed Chrome and the FFmpeg-generated .temp/plan-012/demonstration.mp4 are required. These ignored artifacts are not committed dependencies and may need recreating on another machine. Keep final non-secret summaries here even if temporary screenshots/reports are later removed.

Completion gate: all remaining items have observable evidence or an explicitly approved scope change; every required unavailable/failed check is still marked pending; any newly discovered defect is fixed and rerun. At present the plan is not production-ready by acceptance, despite successful local checks.

## Phase reports

### Phase 1 - Documentation

Complete reviewed plan saved. Baseline, dirty tree, environment and SQL limitations recorded. Generated art provenance/source preserved under docs/assets/0012. Original supplied reference remains unavailable.

### Phase 2 - Shared controls/dialogs/guard

Shared Dialog now provides unique titles, one scrolling body, stacked topmost keys, inert backgrounds, focus containment/restoration, live themes and plain 44px close controls. Board/nested deletion, Quest editor, History and auth/legal use it. One authenticated NavigationGuard owns router blocking and refresh protection; committed profile saves unregister before close. Account overlays preserve workspace drafts. Content-sized controls, action footers and fields retain Rajdhani/Inter/JetBrains Mono; nine licensed assets are self-hosted with licenses. One owner-scoped event queue handles archive/Gym feedback inside the active dialog. Field errors remain contextual; reward animation is separate.

Verification: account/router/nested-delete/legal tests passed; browser preserved dirty Gym under profile, guarded routing and returned to editing. Continuation verified dirty/pending logout guards, native refresh cancellation and keyboard-height focus/capacity; see continuation report below.

### Phase 3 - Archive/account

Only confirmed archive success dispatches an ID and captured owner. Repeats restart eight seconds; hover and focus pause independently; old-owner queued/late events are discarded. View archived habits and plain dismissal remain. Account menu uses aligned existing icons, separated logout, arrows/Home/End/Escape.

Verification: three notification tests cover timing, hover/focus, dismissal/account changes. Eight account tests cover focus, pending failures, confirmed dirty save, Back/Forward and URLs. Lifecycle restore/failure/deletion regressions passed.

Final correction: Board and Quest editor capture notification owner when an archive action starts, not during initial render, avoiding a null owner when queries are already cached. Focused lifecycle/account tests: 17 passed; subsequent full web rerun also passed.

### Phase 4 - Persistence and bounded reads

035 adds RIR ranges, protected routine tombstones, owner-idempotent deletion with explicit draft consent, parent-first exercise RPCs, stale-client DML restrictions and durable cleanup list/ack. Queued paths cannot reattach; Storage refuses referenced-media deletion. Definitions/draft snapshots read stable 500-row batches; history separately pages ten sessions and bounded entries. Previous weights use all completed history, deterministic latest non-null weight/unit/date.

Creation IDs and outcome helpers reconcile uncertain writes before retrying the same payload; fields cannot change while uncertain. Start/remove/archive/discard also reconcile. Unknown uploads are retained, never cleaned speculatively. Completed snapshots survive deletion.

Verification: disposable SQL tests 1,200 historical entries, 20kg -> blank -> 20kg, zero, RIR snapshots, precision/full Finish payload, tombstones/ownership/cleanup. Shared readers loaded 1,207 exercises/snapshots and 1,007 quests/1,207 stages. Native simultaneous mutations and actual Storage HTTP remain pending; configured remote schema not migrated.

### Phase 5 - Gym

Retained eight desktop columns, labeled cards below 1200px, six desktop rows/three narrow cards, full notes, primary Start/Finish, themed confirmations and All workouts/deleted-routine history. FlowList preserves parent input and exercise focus through width changes. Editors use raw strings/defaults 3 / 6-10 / 150s / RIR 2, stable IDs, preview URL revocation and Check save result on uncertainty. Signature/decode/private media/20MiB validation retained; muted inline MP4 autoplay/controls/fallback pauses on close and renews signed access every four minutes.

All snapshots validate before Finish. Native invalid-number input is tracked through onInput because incomplete numbers need not fire React onChange. Invalid/offscreen values block Finish; blank review focuses the field, explicit blanks save null, zero remains valid. Cache confirmation precedes refresh; refresh failure cannot undo save.

Verification: component tests and browser pass dirty overlay/routing, invalid offscreen weight, blank review, saved draft after refresh, null Finish, deleted history and actual MP4 autoplay/pause. Continuation component tests also verify upload retention/ID reuse on uncertainty, payload freezing, preview revocation, confirmed-only replacement cleanup, blocked-autoplay fallback and four-minute signing renewal. Actual Storage privacy/upload cleanup/renewal HTTP still require native acceptance.

### Phase 6 - XP receipts

036 wraps the unchanged completion RPC with private owner receipts/getters and consistent quest/stage/stats locking; no client stats DML. Web advances only after confirmation. Animation uses actual ledger components and before/after totals, 600ms plus four-second hold, level-aware progress, separate bonuses/multiple stats, static reduced motion. Replay/reconciliation does not celebrate again.

SQL verified phase +20, final transition +40, duplicate receipt, captured-stat undo and owner isolation. Continuation also verified redo, differently captured final stage/bonus stats, mixed-stat undo, legacy-exempt transitions, immutable receipts and preservation of a newer unrelated XP gain. Browser verified INT +20 and advancement. Existing shared/mobile completion interfaces unchanged. Native concurrent-XP acceptance remains pending; sequential PGlite is not concurrency certification.

### Phase 7 - Atomic definitions/pagination

037 is separate from 036. Stable IDs/requests serialize and reconcile atomic metadata/stage saves. Existing IDs/descriptions/completed stages/earned XP retained; completed stages cannot be dropped. Changed parent/stage names are validated server-side; unchanged legacy names remain compatible. Two starting rows, valid one-stage editing and zero-stage repair supported. Unknown saves freeze payload; cached cards/editor input survive refresh failures.

Two full quests per flow page, guarded pagination/collapse, no fixed list height, real pending/error deletion dialog. SQL verified retries, atomic rollback and retention; shared tests crossed API limits and prevented unreconciled retries. Form/Unicode/legacy/observable sequence tests passed. Continuation SQL verified zero-stage repair as a valid one-stage definition, unchanged grandfathered names, changed-name validation and Unicode 80/81 boundaries. Extended zero/single/many-stage GUI focus/deletion and native concurrency matrix remain pending.

### Phase 8 - Illustrated journeys

Optimized generated terrain/hero WebP plus source PNG/prompts/provenance. Stable stage IDs, winding route, completed/available/locked icons/text, five checkpoints per segment, focus-only activation. Maps 120px desktop/96px narrow/240px expanded. Confirmed hero travel, offscreen/background idle pause and reduced motion. Missing art retains controls but is not visual acceptance.

Screens inspected in batches. Reproduced 768px header/account overlap and fixed two-row layout through 1023px. Original reference comparison pending.

### Phase 9 - Consistency

Fine-pointer sword resting/interactive cursors with tip hotspots/contrasting outlines across themes/portals; native text/disabled semantics. Font/control/dialog changes cover Board, Status, History, Settings, editors and auth/legal. Document flow scrolling allowed. Mobile UI unchanged. Fixture-backed screen/theme/zoom matrix passed; extended state/long-content acceptance remains pending. Recovery/schedule/legal regressions passed.

### Phase 10 - Exact verification

- Shared: npm.cmd run test --workspace packages/shared -- --runInBand; 31 suites / 255 tests passed on continuation.
- Web: npm.cmd run test --workspace web -- --maxWorkers=2; 24 suites / 88 tests passed on continuation. Original unrestricted run timed out two auth tests under concurrent browser/SQL load; isolated and bounded full reruns passed without weakening assertions.
- Mobile: npm.cmd run test --workspace mobile -- --runInBand; 23 suites / 92 tests passed. Existing overlapping/unawaited act warnings remain.
- All three npx.cmd tsc --noEmit -p checks (web, shared, mobile) passed.
- Root lint exited 0 with 40 existing mobile warnings; final web lint has no warnings/errors.
- Web build passed; existing Vite native-config and >500kB chunk warnings remain. Bundle about 1,011kB raw / 291kB gzip.
- git diff --check passed; ordinary Git commands emit line-ending normalization warnings only.
- node scripts/verify-web-overhaul-db.cjs: all 37 canonical migrations applied to fresh in-memory PGlite; 55 assertions passed on continuation, including every capability marker. Existing databases untouched. Not multi-connection/Storage HTTP certification. One fixture recreates a pre-031 grandfathered name by briefly disabling only its name-validation trigger in the disposable database, then immediately reenabling it before assertions.
- node scripts/verify-web-overhaul-browser.cjs: 214 screenshots/measurements, nine grouped flows, no page errors on continuation. Both themes at all seven requested sizes for Gym, Long Quests, Board, Status/stats/weekly/hero, Settings, History, Quest editor, Profile, Archived habits, Routine editor and Exercise editor. Authentication tested at all seven sizes in its supported default theme. No horizontal overflow; explicit real font loads and artwork checked. Actual Chrome 200%: innerWidth 629, DPR 2, visualViewport scale 1, CDP capture avoids CSS-size cropping; both themes cover Board, Status, Settings, History and account/Quest/Gym editors, plus Long Quests. Reduced motion/missing-art functionality and MP4 playback passed. Screens inspected in batches, including final profile/archive/editor/weekly/hero/auth, zoom and continuation edge contact sheets. Synthetic API fixtures only; no remote account writes.
- Normal configured preview HTTP 200; auth screenshot inspected at 390x844 without signing into/writing a remote account.
- Three verification scripts passed node --check. Older native browser assertions now use actual Settings theme switch, expect autoplay, allow flow scrolling and track uploaded paths plus cleanup manifests for teardown after deletion. Native script/pgTAP not run without disposable stack.

Evidence: ignored .temp/plan-012/browser-evidence/report.json and screenshots. SQL tools under .temp/plan-012/node_modules; inherited Playwright under .temp/plan-011/browser/node_modules. Browser fixture needs .temp/plan-012/demonstration.mp4 (FFmpeg testsrc2). These are isolated verification tools, not production dependencies.

### Continuation 1 - Recovery edge cases

Rechecked environment: Docker, psql and Supabase CLI still unavailable; no existing database touched. New tests reproduced two defects and browser verification uncovered a third:

- Account-menu pointer handling closed the underlying menu when clicking a navigation guard, losing cancellation focus and hiding a returned logout error. Guard-dialog pointer events now preserve the underlying menu; returned/thrown sign-out failures reopen it.
- Reconciled Gym writes could leave uncertainty markers behind, rejecting later changed draft payloads. Every successful routine/exercise/session reconciliation now clears its marker. Shared regression verifies 20 -> reconciled response loss -> 25 saves successfully.
- Installed auth-js removes its local session even on a server sign-out error. SessionProvider now carries a dismissible warning to AuthPage rather than restoring a removed session. It clears on sign-in and drops late errors for a different account. Dirty logout still requires explicit consent; the persisted draft survives, while consenting to leave can discard unsaved input.

New observable tests: dirty/pending/logout-failure/native beforeunload listener lifecycle, FlowList width/keyboard-height focus and deletion clamping, receipt level crossing/600ms animation/bonus/replay/reduced motion, uncertain media creation and previews, auth sign-out error persistence/account isolation. Full tests: 88 web + 255 shared + 92 mobile = 435 passed. All three type checks, root lint and build passed; existing warnings unchanged.

node scripts/verify-web-overhaul-browser.cjs --edge-only passed three screenshots/flows: real Chrome beforeunload dismissal retains 25kg; keyboard-height change preserves three cards/input/focus; cancelled logout restores focus and a 500 server logout warning remains visible on sign-in. Edge screenshots inspected together. Playwright may time out waiting for a load after dismissing beforeunload; the test accepts that only alongside the observed native dialog and unchanged input. Final full expanded browser rerun passed 214 screenshots/measurements and nine flows without page errors. Browser fixtures now use distinct draft IDs across repeat starts. SQL migrations unchanged during this continuation. Synthetic server stopped after verification; normal preview rechecked HTTP 200.

### Continuation 2 - 2026-10-04 (Lane A: baseline, harness, R4/R5, R6 reference)

**Environment correction to the earlier correction.** Docker CLI resolves (`%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe`) but the daemon is down (`dockerDesktopLinuxEngine` pipe missing); `psql` and any native Node Postgres client (`pg`) are absent. Repo-local Supabase CLI binaries exist. The isolated stack config is `.temp/supabase-luna-20260930/config.toml` (project `eiyu-luna-isolated-20260930`, API 56321 / DB 56322; Auth, Storage, Realtime enabled). No listeners were bound on 5175-5177, 54321, 54399, 55321 or 56321. Native stack was NOT started; R1-R3 and R7 remain pending.

**Lane B prerequisite found, not yet addressed.** `supabase/migrations/` does not exist; canonical SQL (`backend/supabase/*.sql`) is applied only as seed files via root `config.toml` `sql_paths`. The isolated config has seeding disabled and its relative `sql_paths` resolves to a non-existent `.temp/backend/supabase`, so a fresh isolated stack starts with an EMPTY database, and no repo path applies 035, 036 and 037 separately. Plan: install `pg` into `.temp/plan-012/node_modules`, start the stack without the `--exclude` list in `scripts/local-db.ps1`, and apply SQL in explicit stages from Node. Never run `db:verify`/`db:reset` (root, personal ports).

**Baseline re-run on the current tree (real output, this session):** web 24 files / 88 tests; shared 31 suites / 255 tests; mobile 23 suites / 92 tests; tsc web, shared and mobile exit 0; root lint exit 0; web build passed (existing >500kB chunk warning); `verify-web-overhaul-db.cjs` 37 migrations / 55 assertions; `git diff --check` exit 0. After the CSS change below, web tests (88), tsc, web lint, build and diff check were re-run and passed.

**Harness fixes.** `scripts/verify-board-gym-browser.cjs`: API/web URLs now read `PLAN011_API_URL` / `PLAN011_WEB_URL` (defaults unchanged). The Long Quest section was stale for a sharper reason than recorded: the journey checkpoint (`JourneyMap.tsx`) and checklist entry (`WebLongQuests.tsx`) share an identical accessible name ("Phase 1. Available"), so name-based locators violate strict mode. It now scopes to `#stage-<id>`, asserts a checkpoint click only focuses its entry and completes nothing, then asserts the "Confirmed XP reward" status shows "WIS +20 XP" and DB XP 20 then 60. It passes `node --check` ONLY; it has not been run, because it needs the native stack. `.gitignore` now ignores `.mcp.json` (it was untracked and unignored in a public repo; contents had no token/key fields).

**R4/R5 browser coverage (new `--profiles` mode in `scripts/verify-web-overhaul-browser.cjs`; synthetic Playwright fixtures).** Profiles: empty, representative, large (600 quests / 1,210 stage rows with quest-0's stages beyond the 1,000-row ceiling, 1,100 habits, 1,050 exercises, 1,200 history entries), long (80-char Unicode names, 480-char descriptions, 1,000-char notes). Final confirmation pass: 22 flows, 224 screenshots/measurements, 0 page errors. Flows: zero-stage repair via atomic save; single-stage edit keeps stage id/description with no Remove control; 12-stage quest navigates five checkpoints per segment; dirty collapse and page change guarded with input retained; abandoned edit not saved; deletion cancel restores focus, failure keeps dialog and quest, retry deletes and the page clamps; artwork intact after confirmed completion and undo; routine switch with a dirty workout guarded; background refetch (page clock moved past the 60s stale window, 4 requests observed, new routine name rendered) preserved typed weight and focus; definitions not editable while a draft exists; cleared Sets stays blank and blocks save; account menu arrows/Home/End/Escape and focus restoration; confirmation Escape restores opener focus; text fields keep the native text cursor while buttons use the sword with pointer fallback; empty states; large catalogs page correctly (300 quest pages, 175 exercise pages) and quest-0 shows all 12 stages. Each profile ran 4 screens x both themes x seven sizes. The overlap detector is self-tested (it must see >= 8 controls and must flag a forced overlap), and no control overlap was found at 320/390/768/1280/1440/1920 with a quest expanded: this is the user's item-7 complaint (prev/next on top of a phase checkbox). The original runner still passes: 214 screenshots, 9 flows. Contact sheets were inspected in a batch.

**Defects found and fixed.** Gym routine select was truncated to "Upper bo" at 320px because its label shared a row with the checkbox; `web/src/index.css` now gives it a full-row basis below 480px (verified both themes). Two fixture gaps (no `discard_gym_session`; fixture capped reads at 500 instead of PostgREST's 1,000) were fixed in the harness only.

**Finding NOT fixed (out of plan scope).** `fetchTodayHabits` (`packages/shared/src/data/habits.ts`) reads the habit catalog and `get_habits_for_date` with single unpaged calls, so an account with more than 1,000 habits would be silently truncated (fixture shows "Daily Quest 1000" for 1,100). Pre-existing; not in 0012's bounded-read list; the file is shared with mobile, so a fix needs the Expo v54 docs read first. Unrealistic for a personal tracker; decision for the user.

**R6.** The reference was recovered from local Codex session history (session `rollout-2026-10-01T19-55-41-...`, message of 2026-10-01T16:19Z, the message that requested this plan) and saved to `docs/assets/0012/reference-journey-map.png`; `PROVENANCE.md` updated. It is a bright cartoon sci-fi level-select map. Structural comparison with the implemented journeys (viewed in screenshots): winding dotted route, per-stage checkpoint nodes, and distinct completed/available/locked states are present. Differences, recorded as scope decisions not defects: no star-rating strip (no counterpart in Eiyu's model), locked state uses a diamond glyph plus "Locked" text rather than a padlock, and palette follows Eiyu's theme as the user asked. Formal visual sign-off is the user's.

**Status after this session.** R4: web-level coverage listed above is done; still unexercised are many-stage deletion at scale and retained rewards across native saves. R5: representative/empty/large/long matrix done in both themes at seven sizes; actual 200% zoom was not re-run on the new profiles; Auth light theme remains an unrecorded scope decision. R6: reference preserved and compared; awaiting user acceptance. R1, R2, R3, R7: pending, blocked on starting Docker Desktop and the Lane B bring-up above. Fixture server on 5176 was stopped. Nothing committed, pushed or deployed.

### Continuation 3 - 2026-10-04 (Lane B: native stack, R1, R2, R3, R7)

**Targets, corrected.** Docker Desktop was running. The isolated stack `supabase-luna-20260930` actually serves API **54321** / DB **54322** (verified from container port bindings; the `config.toml` ports 56321/56322 are not runtime truth, and continuation 2's "empty database" worry was wrong: the stack already held 001-034). The personal stack `supabase_db_eiyu-system` (55321/55322) was left untouched. Identity proof before any write: one auth user, email domain `@example.invalid`; zero non-`.invalid` users. Both stacks publish DB ports on all interfaces (Docker Desktop behavior warned about in `scripts/local-db.ps1`); the isolated stack is still running.

**R7 ordered rehearsal (isolated DB, seeded first).** Restore point `.temp/plan-012/pre035.dump` (ignored). Pre-state verified by the marker pgTAP: 001-034 pass, 035-037 fail. Seeded through the old interfaces: two routines, three exercises, a completed workout containing a blank weight, a saved unfinished draft at 25, one Long Quest phase completed via `set_long_quest_stage_done` (INT 20 XP). Then applied one file at a time with markers re-run after each:
- **035:** marker 18 passes; 018 pgTAP 16/16; 019 media 6/6. Seeded data survived: draft kept, 2 snapshots, 3 legacy exercises; `previous_gym_weights` returns **20 kg** (blank entry and the unfinished 25 ignored); direct exercise inserts now blocked for clients.
- **036:** marker 19 passes; 016 rewards 18/18. New receipt RPC: INT 20 -> 40 once; replay returned `replayed=true` with no extra XP; the earlier completed stage stayed done.
- **037:** marker 20 passes; all 20 markers green.
- Full existing pgTAP on the isolated container (005 and 009 deliberately skipped, see below): 001-004, 006-008, 010-012, 014-019 all pass; 013 passes 75/75 after the fix below; 017 concurrency 19/19.

**Defects found by the native run, and what was done.**
1. **036 and 037 created `private.long_quest_reward_receipts` and `private.long_quest_definition_receipts` without row-level security**, breaking the repo invariant that every `private` table has RLS (013 test 3). PGlite never ran 013. Exposure was low (no client USAGE or grants) but it is the established pattern (`030`). Fix: `alter table ... enable row level security` added to 036 and 037 (both unreleased, never deployed); the 036/037 markers in `015_migration_markers.test.sql` now require RLS and were confirmed RED before the fix, GREEN after. Limitation: the disposable DB was reconciled with the identical ALTER statements, not rebuilt from the dump; a fresh PGlite apply of all 37 corrected files passes (55 assertions) and the receipt functions were re-verified through RLS.
2. **Uncommitted `018_gym_progress.test.sql` had never run natively and had two bugs**: payloads omitted the required `notes` (the real client always sends it), and one dollar-quote closed with `$` instead of `$$`. Both fixed in the test; 035 SQL unchanged.
3. **Notification queue starvation (web, found by the native browser run).** The FIFO queue showed "Workout completed. Progress saved." only after a stale "Exercise saved." toast expired (observed sequence over time). Fix in `ArchiveNotice.tsx`: the latest plain message replaces visible and waiting plain messages; action-bearing archive notices keep their place. Two new tests (red first, then green); web suite now 90 tests.
4. **Tests 005 and 009 hardcode `host=host.docker.internal port=55322`, the PERSONAL database, and write to it.** They were NOT run. They need a portable rewrite (like 017) before anyone runs the pgTAP suite against another stack. Not fixed.

**R1 native concurrency (independent `pg` connections, barrier plus random start jitter, 40 iterations per scenario, 0 deadlocks).** Delete vs exercise save (17/23 split), vs Start (19/21), vs Finish (9/31), vs reorder (27/13): both orderings occurred in each; no exercise or draft outlived a deleted routine, a finished workout kept all snapshot entries and weights, and an unfinished one never appeared completed. Three simultaneous identical receipt requests: exactly one change and two replays, XP +20 once. Two quests on one stat: XP +40 exactly. Definition save vs completion: whole definition applied, completed stage kept, one reward (the harness does not record which side won, so both-orderings is NOT claimed here). Duplicate definition create: one quest, two stages. Foreign account delete/save/start/remove rejected. Harness: `.temp/plan-012/r1-races.cjs` (ignored; needs `R1_PGPASSWORD`).

**R2 real Storage over HTTP.** `.temp/plan-012/r2-storage.cjs`, 20 checks: 20 MiB accepted, 20 MiB + 1 byte rejected (413), disallowed MIME types rejected, mp4 accepted, write into another account's folder denied, anonymous upload and signing denied, other account cannot sign, download or delete the owner's object, bucket not publicly readable, signed URL genuinely expires then renews, a referenced upload survives a client delete attempt, removed media is queued, manifest is owner-only, a queued path cannot be reattached, an unacknowledged entry persists, a confirmed-unreferenced object is deleted, acknowledge clears it. Plus the native browser runner (below) covers real upload, signed retrieval with expired-URL retry, MP4 replacement and playback, and old-object cleanup. Signature/decode/20 MiB-in-UI checks remain component-test coverage. Teardown verified: 0 objects, 0 leftover users, empty manifest.

**R3 committed-but-unconfirmed on the real stack.** New env-gated `packages/shared/src/data/__tests__/native-unconfirmed.test.ts` (skipped by default; needs `R3_NATIVE=1` and `R3_JWT_SECRET`; refuses any API but 54321): the fetch wrapper commits the write and then drops the response, with reconciliation reads also failing. 6/6 pass: routine creation (one row, changed payload stays protected, same payload reconciles to the same id, later changed save works), exercise creation, draft Start and Finish (one draft, weights kept), reward receipt (one award, replayed on retry), atomic definition create (one quest, two stages), routine deletion. Not covered natively: committed-save-then-refresh-failure, account switching mid-flight and media-not-cleaned-while-uncertain remain component-test coverage.

**Native browser runner.** `scripts/verify-board-gym-browser.cjs` now passes against the isolated stack (Vite on 5175, now stopped): 8 flows, 56 measurements, no overflow, no page errors, including real Long Quest checkpoint-focus-only and confirmed +20/+60 XP. It now prints visible alerts and a toast timeline on failure.

**Final verification this session.** Shared 255 passed + 6 skipped native; web 90; mobile 92 (not re-run after the web/SQL edits; those touched no mobile code); tsc shared/web/mobile exit 0; root lint exit 0 (40 existing warnings); web build passed; PGlite 37 migrations / 55 assertions; original browser runner 214 screens / 9 flows; profiles runner 22 flows / 224 screens.

**Still open.** R5: actual 200% zoom was not re-run for the new profiles and Auth light theme remains an unrecorded scope decision. R6: user acceptance of the visual comparison. The habit-catalog unpaged-read finding (continuation 2). Rewriting 005/009. Nothing was committed, pushed or deployed; production rollout of 035 -> 036 -> 037 is a separate, user-authorized step and should be rehearsed from `pre035.dump` if the RLS-corrected 036/037 must be proven from a clean apply. The R1 race rows remain on the disposable seed user.

### Continuation 4 - 2026-10-04 (follow-up round: decisions, habits paging, 005/009, route, zoom, clean rehearsal)

**Decisions (the user delegated them).** (1) Auth light theme: scope decision, no code. Theme is applied only inside the authenticated layout (`ProtectedLayout.tsx`, per-account setting); the login page runs before any account exists, so Auth stays dark-only by design. (2) Habits: page, don't truncate (below). (3) R6 sign-off: structural comparison recorded below as the acceptance. (4) `.mcp.json` stays ignored.

**Expo gate.** The Expo SDK 54 docs page was read at the start of this round (nothing in it affects a plain TypeScript data layer). The earlier web, SQL and test edits of this session preceded that read; none touch Expo APIs.

**005 and 009 made safe.** Both hardcoded `host.docker.internal port=55322` (the personal database) and wrote to it. Their four connection strings now use the local-socket form already used by 017. `grep` finds no `55322`/`55321`/`host.docker.internal` under `supabase/tests`. Run on the isolated container only: 005 18/18, 009 37/37; a read-only check of the personal stack found no fixture residue.

**Habits no longer truncate (shared code that mobile also uses).** The Board read was broader than first reported: besides the unpaged catalog and `get_habits_for_date`, the per-habit reads (completions, occurrences, progress) were unpaged AND passed every habit id in one `.in()`. So the 1,000-row API cap also cut streaks short for long histories (a single daily habit passes 1,000 completions in about three years), and 1,000+ habits would likely exceed the request-URL limit. `fetchTodayHabits` now reads the catalog and the RPC in ordered batches (`readBatches`, explicit `.order('id')` for disjoint pages), chunks habit ids at 100 per request, and reads each chunk's history in ordered batches; any failed chunk rejects the whole board. Tests first (red, then green): `habits-paging.test.ts` (1,100 habits, 100-id ceiling, a 1,400-day streak, failed chunk, empty board). Four older `fetchTodayHabits` tests in `habits.test.ts` were updated for the new call shape (a `pageable` wrapper for the RPC mock and `order`/`range` on the builders); their assertions are unchanged. Native proof on the real stack (`native-habits-paging.test.ts`, env-gated): 1,100 habits returned exactly once with no request-size error, and a 1,200-row completion history yields a streak over 1,000. Mobile suite 92/92 unchanged. The fixture runner's large profile now shows all 1,100 on the Board. Each page re-runs the RPC server-side (idempotent but repeated); cost is a handful of extra requests for very large accounts.

**R6 comparison found a real defect: the dotted route was invisible.** Full-resolution crops showed the nodes on the painted terrain but no dotted route, which plan 0012 requires and the reference is built around. Cause: the 100x100 viewBox is stretched over a wide, short box with `preserveAspectRatio="none"`, so the 0.7-unit stroke became about 0.84px thick. Fixed in `JourneyMap.tsx`: a dark halo plus a round-capped dotted line, both `vector-effect="non-scaling-stroke"`. New `JourneyMap.test.tsx` (red first) covers it. Verified visually at desktop expanded and phone width; the original 214-screen runner still passes. Comparison with the reference now: winding dotted route threading numbered checkpoint nodes (present), distinct completed/available/locked states with text labels (present; locked uses a diamond glyph plus "Locked" rather than a padlock), terrain backdrop (present, Eiyu palette per the user's own wording), segment navigation beyond five nodes (present), star-rating strip (intentionally absent: no counterpart in Eiyu's model). Recorded as accepted on that basis.

**Screenshot reliability fix.** The runner's `screenshot()` now waits out any "Reading ...…" loading state and fails if it never clears; an earlier large-board 200%-zoom capture had silently shown "Reading the board…".

**200% zoom on the new profiles.** `--profiles --only=zoom`: empty, large and long, four screens x both themes at actual Chrome zoom (about 640px layout width at DPR 2), 24 captures, no overflow, no page errors; inspected via contact sheet.

**Clean-apply rehearsal of the corrected migrations.** Restored `pre035.dump` into a scratch database `r7_rerun` (never over `postgres`) and applied the RLS-corrected 035, 036, 037 one at a time: pre-state 032-034 pass and 035-037 fail; each file flips exactly one marker; 015 20/20, 016 18/18, 018 16/16, 019 6/6; both receipt tables have RLS. Scratch database dropped. Two things learned: a `--no-owner` restore makes 016 fail ("Long Quest completion is server-managed") because the guard trigger hardcodes `current_user in ('postgres','service_role')` and the award trigger must run as `postgres`, so object ownership is load-bearing; restores must preserve owners. And the main isolated DB has mixed ownership (001-032 objects owned by `postgres`, 033-037 by `supabase_admin` because they were applied through container-local psql as `supabase_admin`). Hosted Supabase applies as `postgres`, so a rollout rehearsal that applies 001-037 as `postgres` end to end remains the only way to prove exact production ownership behavior; not done.

**Housekeeping.** R1 race rows: 215 residue quests removed; the 174 residue routines remain because their completed workouts (history is retained by design) reference them, and no guard was disabled. Reset path: `pre035.dump`. Fixture servers 5175/5176 stopped; the isolated stack and the personal stack were left running (the isolated one publishes its DB port on all interfaces).

**Final verification, this round.** Shared 32 suites / 260 tests passed plus 8 native tests skipped by default; mobile 23 suites / 92 tests; web 25 files / 93 tests; tsc shared/web/mobile exit 0; root lint 0 errors (40 existing warnings); web build passed; PGlite 37 migrations / 55 assertions (the README markers now include the RLS condition, and removing RLS from 036 makes it fail, confirmed red then green); `git diff --check` clean; original runner 214 screens / 9 flows; native pgTAP on the isolated container passes everywhere including 005, 009, 013 and 017.

**Still open, none of it blocking.** Rollout rehearsal as `postgres` end to end (above). Both native Jest files and the three `.temp/plan-012` scripts depend on ignored local tooling and on `R3_JWT_SECRET`/`R1_PGPASSWORD` env vars. Nothing committed, pushed or deployed; deploying 035 -> 036 -> 037 remains a separate, user-authorized step.

## Final change map and operational notes

- SQL: canonical 035 Gym, 036 receipts, 037 atomic definitions; README/markers through 037; older Gym pgTAP adapted to RPC-only definitions and complete Finish payload.
- Shared: persisted types/RIR validation, pagination, safe outcomes, workspace/history/previous readers, receipts/atomic definitions; legacy/mobile interfaces preserved.
- Web: guard/dialog/queue/FlowList/reward/map components, Gym/Long Quest/account/Board/History/Quest/Auth, styles/fonts/art and regression tests. No mobile UI changes.
- Docs: full plan, this handoff, art source/provenance. No credentials or signed URLs.
- Ordered rollout: verify 001-034, then apply/verify 035 -> 036 -> 037 before updated web deployment. Never amend applied 036 for atomic definitions. Older direct-DML Gym clients must upgrade. No production rollout performed.
- Preview http://127.0.0.1:5177/, hidden background Vite PID 17172 using existing local config. Synthetic server 5176 stopped. New backend features require ordered SQL rollout; preview alone does not prove remote schema compatibility.
- Start-Process failed on inherited Path/PATH collision; hidden detached Node child used. Broad CIM inventory denied; no unrelated processes modified. Verification processes complete; only preview remains running.
- Pending: original reference; confirmed native Supabase ownership/Storage/multi-connection tests; extended zero/single/many-stage GUI focus/deletion, real Storage upload/cleanup/privacy/renewal, and concurrent-reward acceptance. Local edge regressions passed as detailed above, not real-service certification. Inherited production/device/AI-provider evidence remains separate. Never reset a database or infer these checks passed.
