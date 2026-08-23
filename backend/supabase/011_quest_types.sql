-- Quest types (improvement-pass #7/#8): recurring habit quests vs one-time
-- "today-only" quests, plus an optional description/note on every quest.
alter table public.habits
  add column quest_type text not null default 'habit'
    check (quest_type in ('habit', 'one_time')),
  add column description text;

-- One-time quests are binary done/not-done with no streak to protect, so they
-- have no easy-version concept. Relax NOT NULL conditionally: habit rows must
-- still carry a real easy version; one-time rows leave it NULL.
--
-- Note the original inline CHECK on easy_version passes for NULL values
-- (SQL CHECK treats UNKNOWN as pass), so the named constraint below is what
-- actually enforces "habit rows keep a real easy version".
alter table public.habits
  alter column easy_version drop not null;

alter table public.habits
  drop constraint if exists habits_easy_version_present;

alter table public.habits
  add constraint habits_easy_version_present
    check (
      quest_type = 'one_time'
      or (easy_version is not null and char_length(trim(easy_version)) > 0)
    );

-- The board's today-filter matches habits by days @> [dow] but one-time
-- quests by their creation date (see lib/habits.ts fetchTodayHabits);
-- this partial index keeps that second path cheap.
create index if not exists habits_one_time_created_idx
  on public.habits (user_id, created_at)
  where quest_type = 'one_time' and not archived;