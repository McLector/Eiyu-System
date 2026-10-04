# 005 - Eiyu web redesign round handoff

Started and finished 2026-10-04, branch `web-redesign-0014`. Follows handoff 004 (theme and motion polish).

## What shipped (web only)

- **Board.** Compact quest cards at a fixed 80px (one-line title, non-wrapping chips), so a lane pages four cards at 1366x650 and 1280x600. Lanes are Daily Quest, One Time Quest and a new **Backlog**. All Habits moved from a lane into a dialog opened from the Daily lane. A card opens a read-only **Details** dialog; Edit Quest, Move, Archive and Delete live in the card's menu.
- **Backlog.** One-time quests without a date. A Backlog card moves to One-time (today, no time) and back, by its menu or by dragging its grip onto the other lane. An unfinished One-time quest returns to Backlog at midnight (server side).
- **Quest editor.** One editor for Habit, One-time and Backlog. The type is chosen on create and never changed by editing. One-time and Backlog quests take an optional genre (Tool, Concept, Docs / article, Software idea, To-do); One-time has a "No set time" toggle. Habits keep the Penalty.
- **Dialogs.** One shell for every dialog (title, accent rule, corner brackets, pill footer). The quest, Gym routine and exercise editors, Details, confirms and Archived habits fit without scrolling at 1366x650, 1280x600 and 390x660.
- **Chain Progression** replaces the Long Quests journey map: a full-width page with a stats row, a progress bar and one row per stage marked Done, Current or Locked.
- **Gym Progress** is a list and a detail pane; the video guide plays inline on demand.
- **Archive notice** with Undo and a timer bar; restyled Archived habits.
- **Cursor** is the browser default again.

## Database: migration 038

`backend/supabase/038_backlog_genre_optional_time.sql` adds the `backlog` quest type, `habits.genre`, `habits.time_set`, the Backlog row shape check, and three server functions: `move_backlog_to_one_time`, `move_one_time_to_backlog` and `rollover_unfinished_one_time_quests` (called from `get_habits_for_date`). It re-issues `get_habits_for_date` and `archive_habit`. It runs in one transaction, so a drifted schema rolls it back whole. It was applied and tested only on the disposable local stack.

## Release steps (in this order)

1. **Preflight the live database for drift.** In the Supabase SQL editor, run:
   ```sql
   select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
   from pg_constraint
   where conrelid in ('public.habits'::regclass, 'public.deleted_habit_history'::regclass) and contype = 'c'
   order by 1, 2;

   select proname, md5(pg_get_functiondef(oid)) as body_md5
   from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('get_habits_for_date', 'archive_habit');
   ```
   Expected, before 038:
   - `archive_habit` = `91c2cb52d309671fd94fb05a637c59ef`, `get_habits_for_date` = `413d243e4fc8fb4921f9aee2de679c70`.
   - Check constraints:
     - `habits_easy_version_check`: `CHECK ((char_length(TRIM(BOTH FROM easy_version)) > 0))`
     - `habits_easy_version_present`: `CHECK (((quest_type = 'one_time'::text) OR (target_count IS NOT NULL) OR ((easy_version IS NOT NULL) AND (char_length(TRIM(BOTH FROM easy_version)) > 0))))`
     - `habits_name_check`: `CHECK ((char_length(TRIM(BOTH FROM name)) > 0))`
     - `habits_quest_type_check`: `CHECK ((quest_type = ANY (ARRAY['habit'::text, 'one_time'::text])))`
     - `habits_target_count_check`: `CHECK (((target_count IS NULL) OR (target_count > 1)))`
     - `deleted_habit_history_check`: `CHECK ((((completion_kind IS NULL) AND (xp_awarded = 0)) OR (completion_kind IS NOT NULL)))`
     - `deleted_habit_history_quest_type_check`: `CHECK ((quest_type = ANY (ARRAY['habit'::text, 'one_time'::text])))`
     - `deleted_habit_history_xp_awarded_check`: `CHECK ((xp_awarded >= 0))`

   A different constraint **name** is fine (038 finds the quest_type check by its column). A different **hash** means the live function drifted: stop, and rebuild the re-issued body in 038 from the live definition first.
2. **Apply 038 by hand** in the SQL editor, then run the migration marker query in `backend/supabase/README.md`; the `038 backlog` row must be `t`.
3. **Only then merge and deploy the web client.** The new web client calls the 038 functions and columns; an older database makes Backlog fail.
4. The midnight rollover starts the day **after** 038 is applied (its cutover is the UTC apply date + 1). One-time quests left unfinished before that stay where they are.

## Deviations from the spec

- **Stat identity is a whole-border tint, not a 3px left stripe.** The stylesheet test forbids one-sided accent stripes; the stat chip carries the stat.
- **No "Created" date on chains.** The chain model has no such field.
- **Chain nav and page title were renamed on web only.** The empty state still says `NO LONG QUESTS`, because that copy is shared with mobile.
- **The Gym video guide plays inline and no longer autoplays.**
- **Short-viewport editor layout** (found in the first real-browser run, below): on short screens Time, Days and the habit target share one row, stat chips put icon and name side by side, and the name error sits beside its label. Every field is still there.
- **ALL HABITS is icon-only in a narrow lane** (lanes under 380px wide). Measured: icon-only at 1280 (lane 306px) and 1366 (lane 327px), label shown at 1920 (lane 469px). By the lane grid the label returns at about a 1,570px-wide window. Below 1,200px one lane fills the width, so the label shows from a lane of 380px up; at 390px (lane 366px) it is icon-only. Its name stays "ALL HABITS" for assistive tech and as a tooltip. Without this the Daily header wrapped and the lane lost a card.

## Known limitations

- **Installed mobile builds do not know Backlog.** They never show Backlog quests (they are not in `get_habits_for_date` for today) and still schedule an untimed One-time quest's reminder at 08:00, the stored placeholder time.
- **Race between `complete_habit` and `move_one_time_to_backlog`.** `complete_habit` does not lock the habit row, so a completion landing at the same moment as the move can leave a Backlog quest with a completion for today. Low risk (one user drives both), not fixed.
- **The rollover cutover is UTC**, the apply date + 1, not each account's local day.
- **A failed Backlog read shows the whole board's error state**, not a Backlog-only error.
- **Chains have no Created date**, and the **Finished date shows no year** (it uses the app's short display date).
- **Editing a One-time quest resets its date to today.** Confirmed in code: the editor does not load the stored date and saves today's. The board only lists today's One-time quests, so in practice this only matters for a quest whose date is in the future, which the web cannot open for editing anyway.
- **At about 1200x600** the Daily header still wraps (ALL HABITS and ADD QUEST no longer fit beside the title) and the lane shows three cards. The gate (1366x650, 1280x600) shows four.
- **Below about 560px of viewport height** a dialog body may scroll (for example 320x568), as the spec allows.

## Defects found by the first real-browser run, and fixed

All fixed as separate `fix(web)` commits, each with a test where jsdom can see it:

1. The Daily lane header wrapped at 1280x600 and the lane showed three cards (now four).
2. The quest editor overflowed its body: Habit create by 97px at 1366x650 and 145px at 1280x600; One-time and the edit forms scrolled too. The exercise editor scrolled on phones and once a video was picked.
3. Corner brackets were clipped to half width by the dialog's `overflow: hidden`.
4. **Edit Quest on a Backlog card did nothing.** The editor page looked only in the board's quest list and bounced back to the board.
5. A fresh quest or Long Quest editor opened with "Enter a quest name." already shown.
6. The archive notice could stay up forever: a hover pause held by a notice that moved out of a closing dialog never cleared.
7. Locked Chain stages were faded to 70%, putting small text at about 2.7 to 3.1:1. They now read at about 5.1:1 in both themes.

## Verification

Final results are in the next section. Run commands:

- Fixture browser harness (no real backend): from `<worktree>/web` start Vite with `VITE_SUPABASE_URL=http://127.0.0.1:54399` and `VITE_SUPABASE_ANON_KEY=synthetic-anon-key` set in the same command, port 5176, detached to a log. Then `node scripts/verify-web-overhaul-browser.cjs` and `node scripts/verify-web-overhaul-browser.cjs --profiles` (add `--only=board` and so on for one step). Evidence lands in `<worktree>/.temp/plan-012/browser-evidence/`.
- Real-stack harness: `scripts/verify-board-gym-browser.cjs` against the disposable local stack only, with Vite on 5175 pointed at it and the JWT secret read at run time.

## Final results (2026-10-04)

- `node scripts/verify-web-overhaul-browser.cjs`: passed, 218 screens, 12 flows.
- `node scripts/verify-web-overhaul-browser.cjs --profiles`: passed, 268 screens, 28 flows. Measured cards per Daily lane: 4 at 1366x650 and 4 at 1280x600.
- `scripts/verify-board-gym-browser.cjs` on the disposable stack: passed, 8 flows, 56 measurements, no horizontal overflow, no page errors.
- Web: 337 tests in 56 files pass; `tsc --noEmit` clean; lint clean; `vite build` passes (existing chunk-size warning).
- `packages/shared`: 287 passed, 8 skipped (the env-gated native suites). Mobile: 92 passed. Mobile lint: 0 errors, 40 existing warnings.
- pgTAP on the disposable stack: 020 59/59, 015 21/21, 002 31/31, 003 57/57, 008 58/58, 011 10/10.

Not verified: 038 on the live database (it is yours to apply), installed mobile builds against a database with Backlog rows, drag and drop on touch devices (the menu is the touch path), and the Maestro web flow.

The browser scripts were also updated for the redesign: the old journey map, table and sword-cursor steps are gone. Two old assertions changed meaning on purpose: the Gym keyboard-height check now expects the one weight field of the detail pane (the old table had one per row), and the Gym video guide is checked as paused until played.
