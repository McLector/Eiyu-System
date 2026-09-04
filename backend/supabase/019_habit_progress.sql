-- 019_habit_progress.sql
-- Slice 5: quantity-based habit completion. target_count marks a habit as
-- quantity-based (null = ordinary binary habit, unchanged behavior).
-- habit_progress holds one row per (habit, day) with today's running count;
-- habit_completions keeps its existing single meaning ("a full completion
-- happened on this date") — increment_habit_progress calls complete_habit/
-- undo_habit_completion on crossing the target rather than duplicating
-- their XP logic.

alter table public.habits
  add column if not exists target_count integer
    check (target_count is null or target_count > 1);

create table if not exists public.habit_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  progress_date date not null,
  -- named progress_count, not `count`: a bare `count` column is legal but
  -- shadows the count(...) aggregate in any query that references it
  -- unqualified — a landmine for every query written against this table later.
  progress_count integer not null default 0 check (progress_count >= 0),
  unique (habit_id, progress_date)
);

alter table public.habit_progress enable row level security;

create policy "habit_progress_select_own" on public.habit_progress for select using (auth.uid() = user_id);
create policy "habit_progress_insert_own" on public.habit_progress for insert with check (auth.uid() = user_id);
create policy "habit_progress_update_own" on public.habit_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.increment_habit_progress(
  p_habit_id uuid,
  p_date date,
  p_delta integer
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target integer;
  v_old integer;
  v_new integer;
begin
  select target_count into v_target from public.habits where id = p_habit_id and user_id = auth.uid();
  if v_target is null then
    raise exception 'habit % is not a quantity habit', p_habit_id;
  end if;

  insert into public.habit_progress (user_id, habit_id, progress_date, progress_count)
    values (auth.uid(), p_habit_id, p_date, 0)
    on conflict (habit_id, progress_date) do nothing;

  -- FOR UPDATE locks the row: without it, two rapid taps can both read the
  -- same v_old before either writes, and one increment is silently lost —
  -- the same race migration 013's undo_habit_completion exists to close.
  select progress_count into v_old from public.habit_progress
    where habit_id = p_habit_id and progress_date = p_date
    for update;
  v_new := greatest(0, least(v_target, v_old + p_delta));

  update public.habit_progress set progress_count = v_new
    where habit_id = p_habit_id and progress_date = p_date;

  if v_old < v_target and v_new >= v_target then
    perform public.complete_habit(p_habit_id, p_date, 'full');
  elsif v_old >= v_target and v_new < v_target then
    perform public.undo_habit_completion(p_habit_id, p_date);
  end if;

  return v_new;
end;
$$;

grant execute on function public.increment_habit_progress(uuid, date, integer) to authenticated;
