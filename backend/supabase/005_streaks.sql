-- Only the all-time best streak is persisted. Current streak and
-- frozen/active/broken state are derived live from habit_completions by
-- lib/eiyu-logic.ts (see design doc: "streak freeze/recovery is computed
-- on read") — storing them would require a background job to keep them
-- correct as days pass with no user action, which Core wave doesn't need.
create table if not exists public.streaks (
  habit_id uuid primary key references public.habits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  best integer not null default 0 check (best >= 0),
  updated_at timestamptz not null default now()
);

alter table public.streaks enable row level security;

create policy "streaks_select_own"
  on public.streaks for select
  using (auth.uid() = user_id);

create policy "streaks_insert_own"
  on public.streaks for insert
  with check (auth.uid() = user_id);

create policy "streaks_update_own"
  on public.streaks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
