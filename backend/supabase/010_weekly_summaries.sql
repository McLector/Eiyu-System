-- Full-wave feature (R-60). One AI-generated summary paragraph per user per
-- week, cached on first read so the AI proxy isn't called on every Status
-- screen visit and the paragraph doesn't change mid-week.
create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- ISO week start date (Monday), one summary per user per week
  week_start date not null,
  summary text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_summaries enable row level security;

create policy "weekly_summaries_select_own"
  on public.weekly_summaries for select using (auth.uid() = user_id);
create policy "weekly_summaries_insert_own"
  on public.weekly_summaries for insert with check (auth.uid() = user_id);
