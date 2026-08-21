-- One row per completion. `kind` distinguishes a full completion from an
-- easy-version / recovery completion (R-06, R-12-R-13); xp_awarded is
-- recorded at write time so historical XP doesn't shift if the XP curve
-- formula changes later.
create type public.completion_kind as enum ('full', 'easy');

create table if not exists public.habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  completed_on date not null default current_date,
  kind public.completion_kind not null,
  xp_awarded integer not null check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  -- one completion per habit per day: R-07 (undo) deletes the row rather
  -- than allowing duplicates
  unique (habit_id, completed_on)
);

alter table public.habit_completions enable row level security;

create index if not exists habit_completions_habit_id_idx on public.habit_completions (habit_id, completed_on desc);

create policy "habit_completions_select_own"
  on public.habit_completions for select
  using (auth.uid() = user_id);

create policy "habit_completions_insert_own"
  on public.habit_completions for insert
  with check (auth.uid() = user_id);

create policy "habit_completions_delete_own"
  on public.habit_completions for delete
  using (auth.uid() = user_id);
