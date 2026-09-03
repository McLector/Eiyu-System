-- Slice 2.2: optional description on Long Quests and their stages,
-- mirroring the existing habits.description pattern
-- (011_quest_types.sql). No RLS change needed - existing
-- long_quests/long_quest_stages policies already cover all columns.
alter table public.long_quests
  add column if not exists description text;

alter table public.long_quest_stages
  add column if not exists description text;
