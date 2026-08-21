-- Habits: the user-defined quests. Every habit must define both a full
-- version (name) and an easy version (R-02) at creation time.
create type public.difficulty as enum ('Easy', 'Medium', 'Hard');

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  easy_version text not null check (char_length(trim(easy_version)) > 0),
  stat public.stat_key not null,
  difficulty public.difficulty not null default 'Medium',
  reminder_time time not null default '08:00',
  -- days of week this habit is scheduled, 0 = Sunday .. 6 = Saturday
  days smallint[] not null default '{0,1,2,3,4,5,6}',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.habits enable row level security;

create index if not exists habits_user_id_idx on public.habits (user_id) where not archived;

create policy "habits_select_own"
  on public.habits for select
  using (auth.uid() = user_id);

create policy "habits_insert_own"
  on public.habits for insert
  with check (auth.uid() = user_id);

create policy "habits_update_own"
  on public.habits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "habits_delete_own"
  on public.habits for delete
  using (auth.uid() = user_id);
