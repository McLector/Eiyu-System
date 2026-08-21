-- Full-wave feature (R-30-R-31). Schema only for now — not wired into the
-- app until Phase 9.
create table if not exists public.weekly_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- ISO week start date (Monday), one weekly quest per user per week
  week_start date not null,
  stat public.stat_key not null,
  target_count integer not null check (target_count > 0),
  current_count integer not null default 0 check (current_count >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_quests enable row level security;

create policy "weekly_quests_select_own"
  on public.weekly_quests for select using (auth.uid() = user_id);
create policy "weekly_quests_insert_own"
  on public.weekly_quests for insert with check (auth.uid() = user_id);
create policy "weekly_quests_update_own"
  on public.weekly_quests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
