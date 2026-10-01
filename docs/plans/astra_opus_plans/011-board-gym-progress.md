# 011 — Board refinement, Long Quest rewards, and Gym Progress

Approved 2026-10-01. Web first; shared reward behavior also supports the existing Expo v54 mobile client. Phase reports live in `docs/handoff/002-handoff.md`. No commit, push, or production deployment is part of local implementation.

## Confirmed decisions

- Desktop: Profile | Daily Quest | One Time Quest | All Habits. Use account name/class, not hard-coded Mesvara/developer.
- Profile contains all attributes, date, completed/total quests, board status and Hero Rank.
- Separate quest creation forms and Add buttons. Editing retains the saved type.
- Below 1200 CSS pixels, use tabs. Paginate long lists; preserve accessible scrolling for forms, dialogs, zoom and short displays.
- Archived habits move into a profile-menu dialog, retaining details/restore/delete and earned history. Successful archive shows a check-mark notice with an Open archived habits action.
- Gym Progress is an authenticated page with named routines and dated workout sessions.
- Columns: # | Exercise | Sets × Reps | Rest | RIR | Notes | Previous Weight | Current Weight.
- Optional GIF/MP4 demonstration per exercise, maximum 20 MiB, private account-owned storage.
- Units kg/lb, default kg. Previous Weight uses the latest completed session for the routine and stable exercise identity. Current Weight starts empty, zero supports bodyweight.
- Long Quest: 20 XP per stage plus a 20 XP final bonus. Undo reverses recorded rewards; redo restores without duplication. Previously completed stages/quests are exempt from backdated rewards, including undo/redo.
- Preserve theme, schedules, recovery, first-completion timestamps and earned-history deletion semantics.

## Phase 1 — Handoff and quest creation

Save this plan and initialize handoff 002. Add typed creation callback/routes: `/quest-editor?type=habit` and `?type=one_time`. Existing IDs take precedence; missing/invalid types default to habit. Remove the type switch and expose only the matching fields. Verify correct creation, editing, deep links, validation and cancellation.

## Phase 2 — Board composition and pagination

Move profile/attributes/today into one compact card beside the three lanes at >=1200px. Below that use Profile/Daily/One Time/All Habits tabs. Replace lane scrolling with height-aware pagination (at least one row), compact rows and detail dialogs. Clamp pages after mutations/resizing. Preserve account-scoped lane selection; obsolete Archived selection falls back to Daily. Recovery becomes a prominent summary opening existing recovery controls/deadlines in a dialog. Verify layout, every item reachable and recovery usable.

## Phase 3 — Archived profile dialog

Remove Archived lane/tab. Extend account overlays with `?account=archived`. List all archived definitions with Details/Restore/Delete. Show Habit archived (or Quest archived) only after success, with profile guidance and Open archived habits. Guard repeated submissions and expose failures. Verify history retention, restore/delete, Escape, focus, browser Back and focus restoration.

## Phase 4 — Authoritative Long Quest rewards

Append canonical numbered SQL after 031. Server-owned ledger records original stat, amount, active state and legacy exemption. Completion/reversal and existing stage-order checks execute atomically under parent quest locks, including permitted direct completion writes. Final bonus only results from completion, not structural editing. Keep RPC signature and immutable first-completion timestamp. Deleting definitions retains earned XP/ledger records. Refresh Long Quests and stats in web/mobile; display confirmed reward feedback on web. Test ownership, duplicate/concurrent requests, undo/redo, captured stat, legacy exemption, rollback and structural-edit bypasses.

## Phase 5 — Gym persistence

Owned routine/exercise/session/entry records, RLS, explicit grants and indexes. Exercises store ordered prescriptions and optional media. Sessions snapshot details/weights; definition edits do not rewrite history. Support create/edit/order/archive routines and remove exercises, retaining completed history. One draft per routine, Start/Save/Resume/Discard and atomic idempotent Finish. No gym XP. Previous values missing from latest completed session display —. Preserve historical units; convert previous values for display if routine unit changes. Test ownership, persistence, snapshots, draft resume and duplicate Finish.

## Phase 6 — Gym page and media

Add `/gym` and GYM PROGRESS navigation, routine selector, table and paginated narrow-screen cards. Require exercise name, positive sets/reps or ascending rep range, nonnegative rest and RIR 0–10. Notes/media/finite nonnegative weight optional. Upload at top of editor; exercise name opens media/empty-state dialog. Validate type/size/browser decoding. Private `gym-exercise-media` bucket, account paths, short-lived signed URLs. GIF playback; video controls without automatic audio. Replace upload before reference change; clean abandoned uploads and report cleanup failures. Add paginated completed history. Verify complete routine/session/next-session journey, uploads/failures/replacements/expired URLs and keyboard dialogs.

## Phase 7 — Consistent density and theme

Hunter Rank → Hero Rank without rank calculation changes. Compact authenticated pages/editor/dialog spacing; paginate/tab large groups. Do not transform/zoom whole pages. Theme remaining scrollbars and native selection/focus. Static themed arrow/interactive cursors retaining native text/resize/disabled cursors. Soft star-like Eiyu-mark glow, no header movement, static under reduced motion. Verify both themes, narrow/zoomed text and readable controls.

## Phase 8 — Integrated acceptance and rollout preparation

Run web/shared/mobile tests, three TypeScript projects, lint, web build and diff check. SQL tests on a verified disposable database only; never root reset/default verify wrappers against existing databases. Browser matrix: 320×568, 390×844, 768×1024, 1024×768, 1280×720, 1440×900, 1920×1080; themes, keyboard, reduced motion and real 200% zoom. Empty/typical/large data, long content, recovery, failed saves, refresh/account switching. Batch visual inspection, fix reproduced issues, confirm. Extend canonical README capability markers and prepare ordered SQL/storage-before-client rollout. Unavailable runtime checks and production rollout remain pending, never counted as passed.

## Commands

```powershell
npm.cmd run test --workspace @eiyu/web -- --maxWorkers=2
npm.cmd run test --workspace @eiyu/shared -- --runInBand
npm.cmd run test --workspace @eiyu/mobile -- --runInBand
npx.cmd tsc --noEmit -p web/tsconfig.json
npx.cmd tsc --noEmit -p packages/shared/tsconfig.json
npx.cmd tsc --noEmit -p mobile/tsconfig.json
npm.cmd run lint
npm.cmd run build --workspace @eiyu/web
git diff --check
```

## Mandatory phase handoff

Implement → verify → resolve failures → update 002 → continue. Each passed phase reports context/objective, changes and interfaces, problems/root causes/fixes, exact checks/results/evidence, before/after result, limitations and continuation files/migration/environment/next action. Keep a status table and append reports. A failed or unavailable required check leaves the phase incomplete; report the continuation step before stopping. Keep inherited acceptance separate. Never store credentials/expiring URLs. Read https://docs.expo.dev/versions/v54.0.0/ before mobile code; no SDK upgrade.
