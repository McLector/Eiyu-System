-- Slice 4: one-time quests get a schedulable date instead of being
-- pinned to their creation day. scheduled_date is the new source of
-- truth for "is this one-time quest on today's board" (replaces
-- created_at-range matching, which offered no way to defer a quest).

alter table public.habits add column if not exists scheduled_date date;

update public.habits
  set scheduled_date = (created_at at time zone 'utc')::date
  where quest_type = 'one_time' and scheduled_date is null;
-- `at time zone 'utc'` (not a bare `::date` cast, which resolves in the
-- session/connection timezone) so the backfill lands on the same UTC day
-- toDateKey(created_at) would compute — a bare cast can silently backfill
-- the wrong day depending on what timezone the migration is run under.
-- New one-time habits insert scheduled_date explicitly going forward
-- (habitColumns), so no column default is needed post-backfill.

drop index if exists habits_one_time_created_idx;
create index if not exists habits_one_time_scheduled_idx
  on public.habits (user_id, scheduled_date)
  where quest_type = 'one_time' and not archived;
