-- Full-wave feature (R-32-R-33). Schema only for now — not wired into the
-- app until Phase 10, created here so migrations don't need to churn later.
create table if not exists public.long_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  stat public.stat_key not null,
  deadline date,
  created_at timestamptz not null default now()
);

create table if not exists public.long_quest_stages (
  id uuid primary key default gen_random_uuid(),
  long_quest_id uuid not null references public.long_quests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  position smallint not null,
  done boolean not null default false,
  unique (long_quest_id, position)
);

alter table public.long_quests enable row level security;
alter table public.long_quest_stages enable row level security;

create policy "long_quests_select_own"
  on public.long_quests for select using (auth.uid() = user_id);
create policy "long_quests_insert_own"
  on public.long_quests for insert with check (auth.uid() = user_id);
create policy "long_quests_update_own"
  on public.long_quests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "long_quests_delete_own"
  on public.long_quests for delete using (auth.uid() = user_id);

create policy "long_quest_stages_select_own"
  on public.long_quest_stages for select using (auth.uid() = user_id);
create policy "long_quest_stages_insert_own"
  on public.long_quest_stages for insert with check (auth.uid() = user_id);
create policy "long_quest_stages_update_own"
  on public.long_quest_stages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "long_quest_stages_delete_own"
  on public.long_quest_stages for delete using (auth.uid() = user_id);
