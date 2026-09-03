# Eiyu System — Feature Batch Design (Quest Model Extensions + Fixes)

Status: draft — Slice 1 shipped (merged to main). Slice 2 has an implementation
plan (`docs/superpowers/plans/2026-09-03-slice-2-weekly-regen-and-quest-descriptions.md`)
and is next to execute. Slices 3-6 still need plan docs, written one at a
time after the slice ahead of them lands (see "Open decisions — resolved
2026-09-03", item 4).
Date: 2026-08-30, updated 2026-09-03

## Update 2026-09-02 — batch restated + two new items + one bug

The user re-sent a list covering mostly the same nine items (restated after
their own tracking doc got updated) plus three genuinely new asks and one bug
report. Resolution below; no re-litigating already-settled points.

**Confirmed unchanged from the original doc** (restated near-verbatim by the
user, so treated as re-confirmed, not re-opened): weekly-summary regenerate
design (2.1, including the `UPDATE` RLS policy fix), quantity habits as a
`+`/`-` stepper crossing `target_count` before counting complete (Slice 5).

**New items folded in:**
- **Display date on dashboard** — trivial, added to Slice 1 as 1.5.
- **GitHub-commit-style weekly heatmap with star animation** — new Slice 6,
  designed below. Denominator decision: score every day (including past
  days) against the **current** habit set — no historical schema. Trade-off
  accepted: editing/archiving a habit later can retroactively change how old
  dots score. See Slice 6.
- **Bug: mobile recovery banner only ever shows one frozen habit** — added to
  Slice 1 as 1.4 (root-caused below, no schema, ships with the rest of the
  no-schema slice).

**Open decisions resolved by the user's restatement or explicit answer:**
- Backdating one-time quests: **future-only, confirmed** — user's "not only
  limited to today's date" phrasing doesn't ask for the past, and the
  original argument (a backdated quest can never surface on a board that only
  shows "today") stands.
- Heatmap denominator: **current habit set** (see above).
- Slice ordering: **original doc order (1→2→3→4→5), Slice 6 appended after**,
  with Slice 1's bug fix (1.4) going out first since it affects a real
  account today.

**Slice 5's three remaining open items — resolved 2026-09-03**: unit field
(skip, reuse `description`), streak-recovery limitation (accept as
documented v1 gap), XP curve (flat 20 XP on crossing target, matching
`complete_habit`, unchanged). See "Open decisions — resolved 2026-09-03"
near the end of this doc.

### Bug root cause — 1.4, recovery banner shows only one frozen habit (mobile)

Verified two ways: by reading code, and by querying the live database for a
real account exhibiting the symptom.

**Code:** `mobile/app/(tabs)/board.tsx:203` —
```tsx
const frozenQuest = user.quests.find(q => q.frozen && !q.completed);
```
`.find()` returns at most one quest. But `packages/shared/src/data/habits.ts:16`
computes `streakState` independently per habit row — any number of habits can
be `frozen` simultaneously. The board only ever renders a banner
(`board.tsx:290-318`) for whichever one `.find()` happens to pick; the rest
show no recovery affordance at all.

**Web does not have this bug** — confirmed by reading
`web/src/web/WebBoard.tsx:59-86`: `QuestRow` renders its own `FROZEN` badge
and `RECOVER` button per quest, so every frozen habit gets its own recovery
UI independently. Mobile should adopt the same per-quest shape rather than a
single global banner (also incidentally fixes the "which one gets to be the
one banner" arbitrariness).

**Live evidence** (queried directly against project `rrshxkwukhhvioulfqsj`,
2026-09-02 ~13:14 UTC, read-only `execute_sql`): account
`d7afa7d6-4655-49d5-ad41-d156b55399d5` has 4 daily habits, all completed on
`2026-08-31`, none completed on `2026-09-01`. Hand-running `streakState`
against the DB's own `now()` (`2026-09-02 13:14:08 UTC`): `firstMiss =
2026-09-01`, `daysSinceMiss = 1` → **all 4 habits should currently read
`frozen`, with ~11h left in the recovery window** (`deadline =
2026-09-03T00:00 UTC`). This is a live, currently-reproducible window on a
real account, not a hypothetical — worth checking on-device before it closes
rather than only trusting the math.

**Two possible outcomes once checked on-device**, both worth a task:
1. *A banner shows for exactly one of the 4* → confirms the `.find()` bug
   as the sole cause. Fix: render per-quest (mirror `WebBoard.tsx`'s pattern)
   instead of a single global banner.
2. *No banner shows at all* → a second issue is masking the first, most
   likely React Query cache staleness on the `habitsToday` query not
   revalidating on app foreground/open. Needs a follow-up investigation task
   before assuming the `.filter()` fix alone resolves the report.

### Slice 6 — Weekly heatmap (GitHub-commit style, new)

**Placement:** below the stats section on the Status tab (mobile first; web
parity not required in this ask but should follow the same data shape).

**Cell value:** for a given past date, `completedCount / scheduledCount` for
that user, where `scheduledCount` = habits in the **current** habit set
(non-archived) whose `days` mask includes that date's UTC day-of-week —
i.e., the existing `todayQuestsFilter`/`streakState` day-of-week logic,
applied retroactively to historical dates instead of only "today". This
reuses `packages/shared/src/logic/date-utils.ts`'s day-of-week arithmetic,
no new date logic needed.

**Data source:** extend `fetchMonthHistory`
(`packages/shared/src/data/history.ts`) rather than add a second query — it
already fetches `habits` (id, name) and `habit_completions` for the month.
Add `days` and `archived` to the habits `select`, and change the return
shape to also carry per-date `completedCount`/`scheduledCount` (computed
client-side from the now-richer habits array + the day-of-week for each date
in the queried month), alongside the existing per-date completion list
(still needed for tooltip detail — "which habits" on hover).

**Rendering:** a 7-wide grid of dots (or a scrolling month strip — match
whatever layout `status.tsx` already uses for its existing history view, if
any; otherwise a simple 7-column grid keyed by day-of-week, most recent week
at the bottom, matching GitHub's convention). Brightness/opacity scales with
`completedCount / scheduledCount` (0 → dim/empty, 1 → fully lit). A `4/4`
(ratio = 1) day renders as a star shape instead of a dot, with a shine/glow
animation — use `expo-animate`'s guidance for the actual implementation
(Reanimated on mobile) when this slice is built; not designed further here
since it's an implementation detail, not an open decision.

**Hover/tap:** shows `completedCount/scheduledCount` and the habit names for
that day (already available from `fetchMonthHistory`'s existing per-date
completion list).

**Files:** `packages/shared/src/data/history.ts` (extend query + return
shape); a new component, e.g. `mobile/components/eiyu/habit-heatmap.tsx`;
wire into `mobile/app/(tabs)/status.tsx` below the stats section. Web parity
deferred — not requested for web in this ask, flag if wanted later.

## 0. Scope and how to read this doc

Nine requests came in together, spanning both `mobile/` and `web/`, ranging from a
one-line UI fix to a new interaction model. They do **not** ship as one branch.
This doc groups them into five slices, ordered so each slice is independently
shippable and risk increases as you go down the list. Read slice-by-slice; each
one is a candidate for its own branch + its own `docs/superpowers/plans/*.md`
implementation plan once approved.

Every schema claim below was checked directly against the live database
(project `rrshxkwukhhvioulfqsj`) via the Supabase MCP connector, not inferred
from the committed `.sql` files — this project hand-applies migrations, so git
and the deployed DB can diverge (see the `supabase-schema-drift` memory). No
drift was found for any table this doc touches; deployed `complete_habit` /
`undo_habit_completion` / `increment_stat_xp` match `014_server_side_xp.sql`
exactly, and `weekly_summaries` / `long_quests` / `long_quest_stages` /
`habits` match their committed columns with no partial hand-applies sitting
ahead of git.

**Cross-cutting rule for every slice below:** this codebase keeps two
independent store implementations — `mobile/contexts/eiyu-store.tsx` and
`web/src/store/eiyu-store.tsx` — both thin wrappers around the same
`packages/shared/src/data/*` functions. Any new data-layer function needs:
`packages/shared/src/data/*.ts` (the actual Supabase call) → `types/eiyu.ts` /
`types/database.ts` (if shape changes) → **both** stores wired to call it. It
is easy to update one store and ship the other broken; each slice's task list
calls this out explicitly rather than saying "update the store."

Maestro flows live in `mobile/maestro/flows/` (the top-level `maestro/flows/`
is an empty legacy path from before the monorepo split — confirmed empty,
not used).

---

## Slice 1 — UI fixes, no schema (ship first)

Three independent, low-risk fixes. No migration, no new RPC, no behavior
change to data that already exists.

### 1.1 Android modal safe-area overlap

**Problem:** `quest-editor.tsx`, `long-quest-editor.tsx` (and by the same
pattern, any other bottom-sheet route) render their content through the shared
`Screen` component with `edges={[]}`:

```tsx
<Screen edges={[]} fill={false} contentContainerStyle={{ gap: 16 }}>
```

`edges={[]}` means `Screen` never adds `insets.bottom` to the content padding
(see `mobile/components/eiyu/screen.tsx`'s `withSafePadding`) — only the
sheet's own hardcoded `paddingBottom: 32` applies. That's a fixed value; it
doesn't grow for a taller Android gesture-nav or 3-button-nav inset, which is
the reported "buttons superimpose the nav bar" symptom.

**Decision:** change `edges={[]}` → `edges={['bottom']}` in both
`mobile/app/quest-editor.tsx` and `mobile/app/long-quest-editor.tsx`. This is
additive to the existing `paddingBottom: 32` (Screen sums the caller's
padding on top of the inset by design — see the comment block above
`withSafePadding`), not a replacement.

**This is a hypothesis, not a confirmed root cause.** Both screens are
presented via Expo Router as `presentation: 'modal'` (`mobile/app/_layout.tsx`
lines 85–96); it's possible the native modal container already applies some
inset and this change double-pads instead of fixing anything. **Gate:** must
be verified on an actual Android device/emulator in both gesture-nav and
3-button-nav modes before this is called done — a code diff is not evidence
(per this project's own working-style rule). If the diff turns out to be a
no-op or wrong, the real fix is reading `insets.bottom` directly in the
screen and applying it to `sheet`'s style instead of through `Screen`.

**Files:** `mobile/app/quest-editor.tsx`, `mobile/app/long-quest-editor.tsx`.

### 1.2 Web: Long Quest has no delete button

**Problem:** `web/src/store/eiyu-store.tsx` already exposes `removeLongQuest`
(wired to the existing `deleteLongQuest` data function, same as mobile) — the
web store is not missing anything. `web/src/web/WebLongQuests.tsx` simply
never renders a delete affordance anywhere in `LongQuestCard`. This is a
pure UI gap, confirmed by reading both files.

**Decision:** add a delete action to the expanded stage-list footer in
`LongQuestCard` (`WebLongQuests.tsx`), mirroring mobile's confirm-then-delete
UX in `mobile/app/(tabs)/longquests.tsx` (a small text/icon trigger →
confirmation card with Cancel/Delete, not an unconfirmed instant delete).

**Files:** `web/src/web/WebLongQuests.tsx` only.

### 1.3 Separate listing: habit quests vs one-time quests

**Problem:** `user.quests` (habits + one-time, mixed) renders as one flat
list on both `mobile/app/(tabs)/board.tsx` and `web/src/web/WebBoard.tsx`,
sorted by reminder time, distinguished only by a small "TODAY" pill on
one-time rows.

**Decision:** split the rendered list into two sections — "Today's Habits"
and "One-Time Quests" — by `quest.questType`, each keeping its existing
per-row component (`QuestRow` on mobile) and internal time-sort. The
"completed / total" header count stays combined across both sections (no
schema or store change — this is a pure render-grouping change over data
that's already fetched together). Empty-state text needs a per-section
variant (e.g. hide the one-time section entirely when there are none, rather
than showing an empty "0 of 0" block).

**Files:** `mobile/app/(tabs)/board.tsx`, `web/src/web/WebBoard.tsx`. No data
layer changes — `fetchTodayHabits` already returns `questType` on every row.

**Known pre-existing inconsistency, not fixed here:** `WebBoard.tsx:96`
computes `totalToday` via `user.quests.filter(q => q.days.includes(new
Date().getDay()))` — a client-side re-filter using the **local** day-of-week,
even though `user.quests` was already filtered server-side by **UTC**
day-of-week (`todayQuestsFilter`). Splitting the list into two sections
makes this more visible (a habit can render under "TODAY'S HABITS" while not
counting toward `totalToday`'s denominator near the UTC/local day boundary).
Out of scope for this slice — flagging so it isn't mistaken for something
the section split broke.

### 1.4 Bug: mobile recovery banner only shows one frozen habit (new, 2026-09-02)

Root-caused above under "Bug root cause — 1.4". **Decision:** replace
`board.tsx`'s single `frozenQuest = user.quests.find(...)` + one global
banner with a per-quest recovery affordance, mirroring
`WebBoard.tsx:59-86`'s pattern (a `FROZEN` badge + `RECOVER` button rendered
inline on every frozen `QuestRow`, not a separate banner block). Requires an
on-device check first (see root-cause section) to confirm whether the
`.filter()` fix alone closes the report, or whether a second, cache-related
issue needs its own task.

**Files:** `mobile/app/(tabs)/board.tsx` only — this is a pure render change,
`user.quests` already carries `frozen`/`frozenDate`/`frozenHoursLeft` per
quest from the shared data layer.

### 1.5 Display date on dashboard (new, 2026-09-02)

**Decision:** render today's date (local device calendar date, not the UTC
date key used internally for scheduling/streak logic — this is
display-only copy, not a scheduling boundary) in the board header, next to
or below the existing user name/class row in `mobile/app/(tabs)/board.tsx`.
Format: a short human-readable form (e.g. "Wednesday, Sep 2") consistent with
the app's existing display-date formatting, if any exists elsewhere (check
`status.tsx`/`WebBoard.tsx` for a precedent before inventing a new format).

**Files:** `mobile/app/(tabs)/board.tsx` (and `web/src/web/WebBoard.tsx` for
parity, since the user's ask was "Mobile & Web" for the earlier items and
didn't scope this one to mobile-only).

---

## Slice 2 — Additive schema, no existing-query changes

Both items add nullable columns / a policy and leave every current read path
untouched. Safe to land in one migration file or two; grouped here because
neither is individually complex.

### 2.1 Weekly summary regenerate (previously approved, unchanged)

This was fully designed and approved in a prior session (see the
`weekly-summary-regenerate-feature` memory) and is included here only because
the user asked to batch it with this new work — no design changes from that
approval, **except one correction found while re-verifying against the live
schema for this doc:**

**Correction:** `weekly_summaries` currently has only
`weekly_summaries_select_own` and `weekly_summaries_insert_own` RLS policies
— confirmed live, no `UPDATE` policy exists. The regenerate flow needs two
`UPDATE`-shaped writes (the RPC increments the counter; the client then writes
the new summary text), and every RPC in this project is `security invoker`
(RLS applies to the invoking role, not bypassed) — so without a fix, both
writes silently affect zero rows and the feature appears to succeed while
doing nothing. **The migration must add:**

```sql
create policy "weekly_summaries_update_own"
  on public.weekly_summaries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Full design (unchanged from the approved memory):**

- **Columns:** `weekly_summaries.regenerate_count int not null default 0`,
  `weekly_summaries.last_regenerated_date date`. Reset the count whenever
  `last_regenerated_date` isn't today (UTC — `toDateKey`/`date-utils.ts`,
  matching the rest of the app's date handling).
- **Cap:** 2 regenerations/day.
- **RPC** `reserve_weekly_summary_regen(p_week_start date)` (no `p_user_id`
  param — every other RPC in this project resolves the user via `auth.uid()`
  internally, not a passed-in id; matching that convention here too). A
  read-then-write shape here (select the row, decide in application code,
  then update) has the exact same race the 013 migration's `undo_habit_completion`
  exists to close: two rapid taps both read count=0, both decide "allowed,"
  both write count=1, and the cap never actually holds under concurrency.
  Do it as one statement instead — the `UPDATE`'s `WHERE` clause **is** the
  check:
  ```sql
  create or replace function public.reserve_weekly_summary_regen(p_week_start date)
  returns integer
  language plpgsql
  security invoker
  set search_path = public
  as $$
  declare
    v_count integer;
  begin
    update public.weekly_summaries
       set regenerate_count = case when last_regenerated_date is distinct from current_date then 1
                                    else regenerate_count + 1 end,
           last_regenerated_date = current_date
     where user_id = auth.uid() and week_start = p_week_start
       and (last_regenerated_date is distinct from current_date or regenerate_count < 2)
    returning regenerate_count into v_count;

    if v_count is not null then
      return v_count;
    end if;

    -- No row updated: either the cap is hit today, or the week's row doesn't
    -- exist yet. Distinguish so the client can tell "cap hit" from "bug."
    if exists (select 1 from public.weekly_summaries where user_id = auth.uid() and week_start = p_week_start) then
      raise exception 'regen cap reached for week %', p_week_start using errcode = 'P0001';
    else
      raise exception 'no weekly summary exists for week % — cannot reserve a regen', p_week_start;
    end if;
  end;
  $$;

  grant execute on function public.reserve_weekly_summary_regen(date) to authenticated;
  ```
  `current_date` here depends on the database session running in UTC — verify
  `show timezone;` returns `UTC` on this project (Supabase's default) so
  `current_date` agrees with `toDateKey(new Date())`'s UTC day; if it doesn't,
  swap every `current_date` above for `(now() at time zone 'utc')::date`.
- **Flow:** reserve the slot (RPC) → only on success, call Gemini → plain
  `UPDATE ... set summary = $1 where user_id = auth.uid() and week_start =
  $2`. A rejected reservation never burns an AI call.
- **UI:** small "Regenerate" affordance next to "✨ WEEKLY SUMMARY" in
  `mobile/app/(tabs)/status.tsx` (mobile-only per the original scoping — the
  user's list put this under the mobile-specific ask). Debounced while in
  flight. On cap-hit: "You've used both regenerations for today — more
  tomorrow", not a raw error string.
- **Files:** one migration (columns + policy + RPC); a new
  `regenerateWeeklySummary` export in
  `packages/shared/src/data/weekly-summary.ts` reusing the existing
  (currently non-exported) `gatherWeekData` and imported `generateWeeklySummary`
  — export `gatherWeekData` from this file since `regenerateWeeklySummary`
  needs it and it isn't currently exported; `status.tsx` (button + state);
  extend `mobile/maestro/flows/status_weekly_summary_and_cache.yaml` to cover
  regenerate-once-then-cap-out.

### 2.2 Long Quest: optional description, quest-level and per-stage

**Decision:** mirror the existing `habits.description` pattern
(`011_quest_types.sql`) exactly — nullable, trimmed-empty-to-null on write,
same UI copy ("optional").

**Schema:**
```sql
alter table public.long_quests add column if not exists description text;
alter table public.long_quest_stages add column if not exists description text;
```
No RLS change needed — both tables already have `select`/`insert`/`update`
policies covering these columns.

**Data layer:** extend `LongQuestInput` (`packages/shared/src/data/long-quests.ts`)
with `description?: string | null` and per-stage
`stages: { name: string; description?: string | null }[]` (replacing the
current `stageNames: string[]`); update `createLongQuest`'s insert to carry
stage descriptions through; extend `LongQuest`/`QuestStage`
(`packages/shared/src/types/eiyu.ts`) with `description: string | null`.

**Note:** `LongQuestInput`'s shape change (`stageNames: string[]` →
structured stages) is also exactly what Slice 3 (long quest edit) needs to
reconcile stages by identity rather than by name — doing the shape change
once, here, avoids a second breaking change to the same type in Slice 3.
Recommend sequencing 2.2 before 3.1 for this reason even though both are
independent asks.

**UI:** reuse the existing `questNote`/📝 tap-to-expand pattern from
`board.tsx`'s `QuestRow` for both the quest-level note (long quest card
header, mobile + web) and per-stage note (expanded stage row, mobile + web).

**Files:** migration; `packages/shared/src/data/long-quests.ts`;
`packages/shared/src/types/eiyu.ts`; `mobile/app/long-quest-editor.tsx`
(optional description field, same style as `quest-editor.tsx`'s NOTE field);
`mobile/app/(tabs)/longquests.tsx` (render); `web/src/web/WebLongQuests.tsx`
(create form + render). Both stores need no change — `saveLongQuest`'s
signature is unchanged, only its input shape grows.

---

## Slice 3 — Long Quest edit

**Problem:** there is currently no way to edit an existing Long Quest's name,
stat, or stage names/count after creation — `mobile/app/long-quest-editor.tsx`
is create-only (no `id` param, no prefill), and neither `longquests.tsx` nor
`WebLongQuests.tsx` offers an edit entry point. Only per-stage `done` toggling
and whole-quest delete exist today.

**The constraint that makes this non-trivial:**
`long_quest_stages` has `unique (long_quest_id, position)`. Any edit that
reorders stages, inserts a new one mid-list, or removes a middle one and
re-packs positions will hit that constraint mid-statement if done as a naive
per-row `UPDATE ... SET position = ...` loop (two stages can transiently want
the same position number).

**Decision:** one RPC, `reconcile_long_quest_stages`, does the entire stage
diff transactionally:

```sql
create or replace function public.reconcile_long_quest_stages(
  p_long_quest_id uuid,
  p_stages jsonb -- [{ id: uuid | null, name: text, description: text | null }, ...] in final order
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- ownership check
  if not exists (select 1 from public.long_quests where id = p_long_quest_id and user_id = auth.uid()) then
    raise exception 'long quest % not found for calling user', p_long_quest_id;
  end if;

  -- phase 1: bump every existing row for this quest out of the way, so
  -- phase 2's final positions can never collide with a row still holding
  -- its old position (the `unique (long_quest_id, position)` constraint is
  -- checked per-statement, not deferred, so this two-phase shape is required).
  update public.long_quest_stages
    set position = position + 10000
    where long_quest_id = p_long_quest_id;

  -- phase 2: upsert by id (preserves `done` for existing stages), insert new
  -- ones (id is null), at their final 0-based position from p_stages' order.
  with incoming as (
    select
      (elem->>'id')::uuid as id,
      elem->>'name' as name,
      elem->>'description' as description,
      (ord - 1) as position
    from jsonb_array_elements(p_stages) with ordinality as t(elem, ord)
  )
  update public.long_quest_stages s
    set name = i.name, description = i.description, position = i.position
    from incoming i
    where s.id = i.id and s.long_quest_id = p_long_quest_id;

  insert into public.long_quest_stages (long_quest_id, user_id, name, description, position)
    select p_long_quest_id, auth.uid(), i.name, i.description, i.position
    from (
      select elem->>'name' as name, elem->>'description' as description, (ord - 1) as position
      from jsonb_array_elements(p_stages) with ordinality as t(elem, ord)
      where (elem->>'id') is null
    ) i;

  -- delete stages that dropped out of the incoming list entirely
  delete from public.long_quest_stages
    where long_quest_id = p_long_quest_id
      and id not in (select (elem->>'id')::uuid from jsonb_array_elements(p_stages) elem where elem->>'id' is not null);
end;
$$;

grant execute on function public.reconcile_long_quest_stages(uuid, jsonb) to authenticated;
```

Reconciling **by stage id** (not delete-and-recreate) is the load-bearing
choice here — a delete-and-recreate approach would silently wipe every
stage's `done` state on every edit, since a fresh row always starts
`done = false`.

**Decision on the quest row itself (name/stat):** a plain `UPDATE
long_quests set name = $1, stat = $2, description = $3 where id = $4 and
user_id = auth.uid()` — no RPC needed, matches the existing `updateHabit`
pattern (single-table `UPDATE`, no invariant to protect).

**Decision on `MIN_STAGES = 2`:** the edit form keeps blocking removal below
2 stages, matching creation's existing constraint — do not let an edit leave
a quest with fewer than 2 stages.

**Data layer** (`packages/shared/src/data/long-quests.ts`):
```ts
export interface StageInput { id: string | null; name: string; description?: string | null }
export interface LongQuestInput { name: string; stat: Stat; description?: string | null; stages: StageInput[] }
export async function updateLongQuest(id: string, input: { name: string; stat: Stat; description?: string | null }): Promise<void>
export async function reconcileLongQuestStages(longQuestId: string, stages: StageInput[]): Promise<void>
```

**UI:** `mobile/app/long-quest-editor.tsx` gains an `id` param
(`useLocalSearchParams`, same pattern as `quest-editor.tsx`), prefilling
name/stat/description/stages when editing, with each stage input carrying
its original `id` (or `null` for a newly-added one) so the save call can
build `StageInput[]` correctly; header title becomes "EDIT LONG QUEST" when
`id` is present. `mobile/app/(tabs)/longquests.tsx` needs an edit entry point
(e.g. tapping the card header when not expanded, or a pencil icon next to
delete) routing to `/long-quest-editor?id=...`. `web/src/web/WebLongQuests.tsx`
needs the equivalent inline edit form (it currently has no separate
editor route — the create form is inline in the page; edit should reuse the
same inline form shape, prefilled).

**Both stores:** `saveLongQuest` becomes `saveLongQuest(input, existingId?)`
mirroring `saveHabit`'s existing `(input, existingId?)` shape — call
`updateLongQuest` + `reconcileLongQuestStages` when `existingId` is present,
`createLongQuest` otherwise. Update `mobile/contexts/eiyu-store.tsx` and
`web/src/store/eiyu-store.tsx` together.

**Files:** one migration (RPC only, no new columns);
`packages/shared/src/data/long-quests.ts`; `packages/shared/src/types/eiyu.ts`
(if not already covered by 2.2); both stores; `mobile/app/long-quest-editor.tsx`;
`mobile/app/(tabs)/longquests.tsx`; `web/src/web/WebLongQuests.tsx`.

---

## Slice 4 — One-time quest: pick a date (not just today)

**Problem:** a one-time quest is currently recognized as "today's" purely by
`created_at` falling within `[today, tomorrow)` UTC
(`packages/shared/src/logic/quest-recurrence.ts`'s `todayQuestsFilter`,
`packages/shared/src/data/habits.ts`'s `fetchTodayOneTimeHabits`). There is no
way to schedule one for a different day.

**Decision needed — my recommendation: future dates only, no backdating.**
A one-time quest scheduled for a future day behaves exactly like one created
today, just deferred: invisible until its date, then appears on the board
exactly once, and — per the existing "done or gone, no streak" design intent
in `habits.ts`'s comments — disappears the next day whether or not it was
completed. I'm recommending **against** allowing a past date, because a
backdated one-time quest could never appear on the board (the board only
ever shows "today"), so it would be silently unreachable/uncompletable —
that's a worse experience than not offering backdating at all. If the actual
want is "log something I already did yesterday," that needs a different
surface than a board-driven quest, which is out of scope for this batch. This
is the one open point in this doc I'd like explicit confirmation on before
building it — the calendar picker's min-date and the recurrence-filter
rewrite both depend on the answer.

**Schema:**
```sql
alter table public.habits add column if not exists scheduled_date date;
update public.habits
  set scheduled_date = (created_at at time zone 'utc')::date
  where quest_type = 'one_time' and scheduled_date is null;
-- `at time zone 'utc'` (not a bare `::date` cast, which resolves in the
-- session/connection timezone) so the backfill lands on the same UTC day
-- toDateKey(created_at) would compute — a bare cast can silently backfill
-- the wrong day depending on what timezone the migration is run under.
-- new habits insert scheduled_date explicitly going forward (habitColumns), so no default needed post-backfill.

drop index if exists habits_one_time_created_idx;
create index if not exists habits_one_time_scheduled_idx
  on public.habits (user_id, scheduled_date)
  where quest_type = 'one_time' and not archived;
```
The backfill is not optional — every existing one-time habit row needs a
`scheduled_date` before the filter rewrite below can use it, and the old
`created_at`-based partial index must be dropped (nothing will read it after
the filter changes, and it'd be dead weight).

**Filter rewrite** (`quest-recurrence.ts`):
```ts
export function todayQuestsFilter(now: Date): string {
  const dayOfWeek = now.getUTCDay();
  const todayStr = toDateKey(now);
  return (
    `and(quest_type.eq.habit,days.cs.{${dayOfWeek}}),` +
    `and(quest_type.eq.one_time,scheduled_date.eq.${todayStr})`
  );
}
```
This is an equality match now, not a range — simpler than the `created_at`
version, and no longer sensitive to `created_at`'s timestamp precision.

**`fetchTodayOneTimeHabits`** (`habits.ts`, used to re-arm reminders after a
notifications-toggle cycle): filter by `scheduled_date = today` instead of
the `created_at` range — same simplification.

**`scheduleOneTimeReminder`** (`mobile/lib/notifications.ts`) currently
hardcodes `at = new Date()` (today) and only takes `{ name, time }`. It needs
a third input, the scheduled date:
```ts
export async function scheduleOneTimeReminder(
  habitId: string,
  input: { name: string; time: string; date: string } // date: "YYYY-MM-DD"
) {
  ...
  const [hour, minute] = input.time.split(':').map(Number);
  const [y, m, d] = input.date.split('-').map(Number);
  const at = new Date(y, m - 1, d, hour, minute, 0, 0); // local calendar date, local reminder time
  if (at.getTime() <= Date.now()) { /* unchanged: skip + persist cancel */ }
  ...
}
```
Every call site (`eiyu-store.tsx`'s `saveHabit`, and the reminder-resync path
that calls `fetchTodayOneTimeHabits` then `scheduleOneTimeReminder`) needs its
`date` threaded through.

**`HabitInput`** (`habits.ts`) gains `scheduledDate?: string | null` (one-time
only; ignored/null for recurring habits), and `habitColumns()` writes it to
the new column.

**UI:** date picker shown **only** when `questType === 'one_time'`, in
`mobile/app/quest-editor.tsx`, right above or below the existing "REMINDER
TIME (TODAY)" field (whose label should change to "REMINDER TIME" once it's
not always today) — reuse `@react-native-community/datetimepicker` with
`mode="date"`, same trigger-button pattern already used for the time picker.
Default value: today (unchanged behavior if the user never touches it,
matching the "recommendation: no backdating" decision above, `minimumDate`
= today). Web needs the equivalent — a plain `<input type="date" min={today}>`
in `WebQuestEditor.tsx` is the lowest-lift option and renders a native
calendar affordance in every evergreen browser; recommend that over building
a custom calendar grid unless there's a specific visual reason not to.

**Local date, not UTC, when reading the picker's value.** Both pickers
(native mobile `Date`, HTML `<input type="date">`) hand back a value in the
device's local calendar. `todayQuestsFilter` matches on
`toDateKey(now)` — a UTC day. Converting the picker's `Date` with
`.toISOString().slice(0, 10)` (the naive approach) reads the UTC day of a
local-midnight instant, which is the *previous* calendar day for any
positive UTC offset (e.g. picking "Sept 1" at any local time in UTC+9 yields
`"2026-08-31"`) — the quest would then silently appear a day early. Build
the date key from local calendar fields instead, the same way
`scheduleOneTimeReminder`'s existing `dateToTimeString`-style helpers already
do for time: `` `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` ``.
For the web `<input type="date">`, this is moot — its `value` is already a
plain `"YYYY-MM-DD"` string with no timezone conversion involved.

**Files:** one migration (column + backfill + index swap);
`packages/shared/src/logic/quest-recurrence.ts`;
`packages/shared/src/data/habits.ts` (`HabitInput`, `habitColumns`,
`fetchTodayOneTimeHabits`); `mobile/lib/notifications.ts`
(`scheduleOneTimeReminder` signature); `mobile/contexts/eiyu-store.tsx` (both
call sites threading the date through); `mobile/app/quest-editor.tsx`
(calendar field); `web/src/web/WebQuestEditor.tsx` (date input — this is the
actual form; `web/src/pages/QuestEditorPage.tsx` is just the router wrapper
that resolves `:id` and passes `editingQuest` in, confirmed by reading both).

---

## Slice 5 — Quantity-based habit completion (build last — most complex)

**Problem:** a habit like "drink water 8x a day" currently has only a single
tap-to-complete checkbox — there's no way to track partial progress toward a
daily count.

**Decision — new table, not a column on `habit_completions`.**
`habit_completions` currently means "one row = one full completion, ever,"
which streak calculation (`eiyu-logic.ts`'s `streakState`) and the weekly
summary's per-habit counts both depend on. Overloading that row with a
partial-progress count would break both. Instead:

```sql
alter table public.habits
  add column if not exists target_count integer
    check (target_count is null or target_count > 1);
-- null = ordinary binary habit (unchanged behavior); >1 = quantity habit.

create table if not exists public.habit_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  progress_date date not null,
  -- named progress_count, not `count`: a bare `count` column is legal but
  -- shadows the `count(...)` aggregate in any query that references it
  -- unqualified — a landmine for every query written against this table later.
  progress_count integer not null default 0 check (progress_count >= 0),
  unique (habit_id, progress_date)
);

alter table public.habit_progress enable row level security;

create policy "habit_progress_select_own" on public.habit_progress for select using (auth.uid() = user_id);
create policy "habit_progress_insert_own" on public.habit_progress for insert with check (auth.uid() = user_id);
create policy "habit_progress_update_own" on public.habit_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
(`habit_completions` has no `UPDATE` policy today because nothing ever
updates a completion row in place — `habit_progress` is upserted in place on
every tap, so it needs `UPDATE` from the start; noting this explicitly since
it's the kind of thing that's easy to copy-paste-forget from the
`habit_completions` policy set.)

**RPC — reuses `complete_habit`/`undo_habit_completion` rather than
duplicating their XP logic:**
```sql
create or replace function public.increment_habit_progress(
  p_habit_id uuid,
  p_date date,
  p_delta integer
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target integer;
  v_old integer;
  v_new integer;
begin
  select target_count into v_target from public.habits where id = p_habit_id and user_id = auth.uid();
  if v_target is null then
    raise exception 'habit % is not a quantity habit', p_habit_id;
  end if;

  insert into public.habit_progress (user_id, habit_id, progress_date, progress_count)
    values (auth.uid(), p_habit_id, p_date, 0)
    on conflict (habit_id, progress_date) do nothing;

  -- FOR UPDATE locks the row: without it, two rapid taps (a fast double-tap
  -- of `+`, or the same account open on two devices) can both read the same
  -- v_old before either writes, and one increment is silently lost — the
  -- exact race migration 013's undo_habit_completion exists to close, one
  -- table over. The second call blocks here until the first commits, then
  -- reads the value the first call just wrote.
  select progress_count into v_old from public.habit_progress
    where habit_id = p_habit_id and progress_date = p_date
    for update;
  v_new := greatest(0, least(v_target, v_old + p_delta));

  update public.habit_progress set progress_count = v_new
    where habit_id = p_habit_id and progress_date = p_date;

  if v_old < v_target and v_new >= v_target then
    perform public.complete_habit(p_habit_id, p_date, 'full');
  elsif v_old >= v_target and v_new < v_target then
    perform public.undo_habit_completion(p_habit_id, p_date);
  end if;

  return v_new;
end;
$$;

grant execute on function public.increment_habit_progress(uuid, date, integer) to authenticated;
```
Calling `complete_habit`/`undo_habit_completion` from inside this RPC works
because both run `security invoker` — the nested call still executes as the
original authenticated caller, `auth.uid()` still resolves correctly, and no
new grant beyond the existing ones is needed. This is also why no `p_xp`
param appears anywhere here: XP for a quantity habit's completion/undo is
computed exactly where it already is, inside `complete_habit`
(`v_xp := case p_kind when 'full' then 20 else 4 end`, confirmed live) —
`increment_habit_progress` never touches XP directly.

**Documented limitation (not fixed in this slice):** the existing
streak-freeze recovery flow (`completeRecovery` in both stores) calls
`completeHabit(..., 'easy', frozenDate)` directly — it does not go through
`increment_habit_progress` and will not update a quantity habit's
`habit_progress` row. A recovered quantity habit will show as `completed`
(from `habit_completions`) while its progress bar still reads whatever count
it had before the freeze. This mirrors how recovery already behaves for
ordinary habits (a full-credit override, not a "you actually did the easy
version's quantity" reconciliation) and is called out here as a known,
accepted edge case rather than silently shipped.

**UI — quest row interaction:** for a habit with `target_count` set, `board.tsx`'s
`QuestRow` replaces the checkbox with a `[-]  n/target  [+]` stepper.
`+`/`-` call the new store action (see below); the row visually flips to its
"completed" look (same dimmed/struck-through treatment already keyed off
`quest.completed`) once `n >= target`, but the stepper stays interactive —
tapping `-` after completion is a valid undo, matching the checkbox's
existing toggle-to-undo behavior for ordinary habits. No long-press
easy-complete gesture for quantity habits (there is no "easy version" concept
here to trigger); `quest.easyVersion` stays optional/nullable and the editor
should hide the EASY VERSION field when `target_count` is set, the same way
it's already hidden for `questType === 'one_time'`.

**Data layer:**
```ts
// packages/shared/src/data/habits.ts
export async function incrementHabitProgress(habitId: string, date: string, delta: number): Promise<number>
```
`HabitInput` gains `targetCount?: number | null`; `habitColumns()` writes it.
`Quest` (`types/eiyu.ts`) gains `targetCount: number | null` and
`progressCount: number` (today's count, defaulting to 0 when no
`habit_progress` row exists yet); `fetchTodayHabits` (`habits.ts`) needs a
second query alongside the existing completions fetch — a
`habit_progress` select scoped to today's date for the fetched habit ids —
joined into `toQuest()` the same way `completedToday`/`datesByHabit` already
are.

**Both stores:** a new store action, e.g. `adjustProgress(id: string, delta:
number)`, following the same optimistic-update-with-rollback shape as
`runCompletion` — optimistically bump `progressCount` (and flip `completed`
if it crosses `targetCount`) in the query cache, call
`incrementHabitProgress`, then **write the query cache from the RPC's
returned count** rather than trusting the optimistic value or relying on
invalidation to settle it. `incrementHabitProgress` returns the
server-computed `v_new` specifically so the client has an authoritative
number after the `for update` lock resolves — a rapid string of taps
produces overlapping in-flight calls, and whichever response lands last
should win, not whichever request was issued last. Still invalidate
`stats`/`weeklyQuest` on success (XP/streak effects aren't visible in the
progress count itself). Wire into `mobile/contexts/eiyu-store.tsx` **and**
`web/src/store/eiyu-store.tsx`.

**Editor UI:** `mobile/app/quest-editor.tsx` and the web quest editor gain an
optional "TARGET COUNT" numeric field (e.g. a stepper or plain numeric input,
shown for `questType === 'habit'` only — one-time quests stay binary, no
quantity concept for a todo that only exists once). Leaving it blank/1 keeps
the habit an ordinary binary quest — no behavior change for every existing
habit, matching `target_count`'s nullable default.

**Decision needed — unit label:** the request example ("8x a day") doesn't
name a unit ("glasses", "reps", etc.). Recommendation: skip a separate unit
field for v1 — the existing free-text `description` field already covers
"why/context" and can hold a unit note if the user wants one ("8 glasses"),
and the row can just render the bare count (`3/8`). Flag if a dedicated unit
field is actually wanted; it's a cheap add (one more nullable text column)
but not one to build speculatively.

**Files:** one migration (column + table + policies + RPC);
`packages/shared/src/data/habits.ts`; `packages/shared/src/types/eiyu.ts`;
both stores; `mobile/app/(tabs)/board.tsx` (`QuestRow` stepper);
`mobile/app/quest-editor.tsx`; `web/src/web/WebBoard.tsx`;
`web/src/web/WebQuestEditor.tsx` (the actual form, per the note in Slice 4).

---

## Sequencing summary

| Slice | Adds schema? | Changes an existing query path? | Depends on |
|---|---|---|---|
| 1. UI fixes + date display + recovery-banner bug | No | No | — |
| 2. Descriptions + weekly-summary regen | Yes (additive only) | No | — |
| 3. Long Quest edit | Yes (RPC only) | No | 2.2's `LongQuestInput` reshape (recommended, not required) |
| 4. One-time scheduled date | Yes (column + index swap) | Yes — `todayQuestsFilter` | — |
| 5. Quantity habits | Yes (column + new table) | Yes — `fetchTodayHabits` | — |
| 6. Weekly heatmap | No (reads existing tables) | No (extends `fetchMonthHistory`) | — |

Recommend landing 1 → 2 → 3 → 4 → 5 → 6, each as its own branch and its own
plan doc, with a working, on-device-verified app after every slice. Slice 1
ships first regardless since 1.4 is an active bug on a real account.

## Open decisions — resolved 2026-09-03

1. **Slice 4:** future-dated one-time quests only, no backdating. **Resolved: confirmed, future-only.**
2. **Slice 5:** unit field. **Resolved: skip — reuse `description`.**
3. **Slice 5:** streak-recovery limitation. **Resolved: accept as documented v1 gap.**
4. Slice ordering. **Resolved: 1→2→3→4→5, Slice 6 appended after** (see
   Sequencing summary above). Slice 2 executes one slice at a time — its own
   worktree, plan, implementation, and merge — before Slice 3's plan is
   written, so each plan is written against the tree its predecessor
   actually left behind rather than against this doc's pre-Slice-1 state.
5. **Slice 5:** XP curve. **Resolved: flat 20 XP on crossing target,
   unchanged from `complete_habit`.**
