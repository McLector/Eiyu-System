-- Stats: exactly 5 fixed rows per user (STR/INT/DEX/WIS/CHA), seeded by the
-- handle_new_user trigger in 008. xp/xp_max drive the level shown in the UI;
-- level itself is derived (see lib/eiyu-logic.ts), not stored, to avoid drift.
create type public.stat_key as enum ('STR', 'INT', 'DEX', 'WIS', 'CHA');

create table if not exists public.stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  stat public.stat_key not null,
  xp integer not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, stat)
);

alter table public.stats enable row level security;

create policy "stats_select_own"
  on public.stats for select
  using (auth.uid() = user_id);

create policy "stats_insert_own"
  on public.stats for insert
  with check (auth.uid() = user_id);

create policy "stats_update_own"
  on public.stats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
