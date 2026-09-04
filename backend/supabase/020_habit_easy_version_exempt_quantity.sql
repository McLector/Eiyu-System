-- 020_habit_easy_version_exempt_quantity.sql
-- Slice 5 follow-up: habits_easy_version_present (011_quest_types.sql) required
-- every habit-type quest to carry a non-empty easy_version. Quantity habits
-- (target_count set) have no easy-version concept by design (no long-press
-- easy-complete gesture — there's nothing to trigger), so they must be
-- exempted the same way one-time quests already are. Found live via this
-- slice's own RPC smoke test insert failing the check constraint.

alter table public.habits drop constraint if exists habits_easy_version_present;
alter table public.habits add constraint habits_easy_version_present
  check (
    quest_type = 'one_time'
    or target_count is not null
    or (easy_version is not null and char_length(trim(easy_version)) > 0)
  );
