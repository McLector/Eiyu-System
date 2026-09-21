-- Phase 1: safe lifecycle persistence and retained history.
-- A deleted habit is removed from executable tables. Dated evidence is copied
-- into a read-only, owner-scoped ledger in the same transaction first.

create table if not exists public.deleted_habit_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_habit_id uuid not null,
  historical_date date not null,
  habit_name text not null,
  stat public.stat_key not null,
  quest_type text not null check (quest_type in ('habit', 'one_time')),
  scheduled boolean not null default false,
  completion_kind public.completion_kind,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  time_zone text,
  day_ends_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source_habit_id, historical_date),
  check ((completion_kind is null and xp_awarded = 0) or completion_kind is not null)
);

alter table public.deleted_habit_history enable row level security;
drop policy if exists "deleted_habit_history_select_own" on public.deleted_habit_history;
create policy "deleted_habit_history_select_own"
  on public.deleted_habit_history for select to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists deleted_habit_history_user_date_idx
  on public.deleted_habit_history (user_id, historical_date);
create index if not exists deleted_habit_history_source_idx
  on public.deleted_habit_history (user_id, source_habit_id, historical_date);

-- Archive intervals are date ranges in the account's persisted timezone.
-- [archived_from, restored_on) is paused; a null restored_on is still open.
create table if not exists public.habit_archive_intervals (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  archived_from date not null,
  restored_on date,
  created_at timestamptz not null default now(),
  unique (habit_id, archived_from),
  check (restored_on is null or restored_on >= archived_from)
);

alter table public.habit_archive_intervals enable row level security;
drop policy if exists "habit_archive_intervals_select_own" on public.habit_archive_intervals;
create policy "habit_archive_intervals_select_own"
  on public.habit_archive_intervals for select to authenticated
  using ((select auth.uid()) = user_id);

create unique index if not exists habit_archive_intervals_one_open_idx
  on public.habit_archive_intervals (habit_id)
  where restored_on is null;
create index if not exists habit_archive_intervals_user_date_idx
  on public.habit_archive_intervals (user_id, archived_from, restored_on);

-- The client may read retained history and archive metadata, but cannot forge,
-- edit, or erase either. Security-definer lifecycle functions are the only
-- write boundary and perform explicit auth.uid() ownership checks.
revoke all on table public.deleted_habit_history from public, anon, authenticated;
grant select on table public.deleted_habit_history to authenticated;
revoke all on table public.habit_archive_intervals from public, anon, authenticated;
grant select on table public.habit_archive_intervals to authenticated;

create or replace function public.record_habit_archive_interval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text;
  v_account_date date;
begin
  if new.archived = old.archived then
    return new;
  end if;

  if v_user_id is not null and v_user_id <> new.user_id then
    raise exception 'habit % not found for calling user', new.id;
  end if;

  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles
  where user_id = new.user_id;
  if v_time_zone is null then
    raise exception 'profile not found for habit owner';
  end if;
  v_account_date := (statement_timestamp() at time zone v_time_zone)::date;

  if new.archived then
    insert into public.habit_archive_intervals (habit_id, user_id, archived_from)
    values (new.id, new.user_id, v_account_date)
    on conflict (habit_id, archived_from) do update
      set restored_on = null;
  else
    update public.habit_archive_intervals
    set restored_on = v_account_date
    where habit_id = new.id and restored_on is null;

    if not found then
      -- Legacy archived rows have no pause metadata. Treat all dates before
      -- restoration as paused, preventing a restore from backfilling them.
      insert into public.habit_archive_intervals (
        habit_id, user_id, archived_from, restored_on
      ) values (
        new.id,
        new.user_id,
        least(new.schedule_start_on, v_account_date),
        v_account_date
      ) on conflict (habit_id, archived_from) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists habits_record_archive_interval on public.habits;
create trigger habits_record_archive_interval
  before update of archived on public.habits
  for each row execute function public.record_habit_archive_interval();

-- Rebuild the occurrence materializer with an explicit pause-range exclusion.
-- Existing occurrence rows are immutable and remain available to history.
create or replace function public.ensure_habit_occurrences(p_through_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text;
  v_today date;
  v_through date;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = v_user_id;
  if v_time_zone is null then raise exception 'profile not found for calling user'; end if;

  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  v_through := least(p_through_date, v_today);

  insert into public.habit_occurrences (
    habit_id, user_id, occurrence_date, time_zone, day_ends_at
  )
  select
    h.id,
    h.user_id,
    d.day::date,
    v_time_zone,
    (((d.day::date + 1)::timestamp) at time zone v_time_zone)
  from public.habits h
  cross join lateral generate_series(
    greatest(
      h.schedule_start_on,
      coalesce(
        (select max(o.occurrence_date) + 1 from public.habit_occurrences o where o.habit_id = h.id),
        h.schedule_start_on
      )
    ),
    v_through,
    interval '1 day'
  ) as d(day)
  where h.user_id = v_user_id
    and not h.archived
    and not exists (
      select 1
      from public.habit_archive_intervals ai
      where ai.habit_id = h.id
        and d.day::date >= ai.archived_from
        and (ai.restored_on is null or d.day::date < ai.restored_on)
    )
    and (
      (h.quest_type = 'one_time' and d.day::date = h.scheduled_date)
      or (
        h.quest_type = 'habit'
        and extract(dow from d.day)::smallint = any(
          coalesce(
            (
              select v.days
              from public.habit_schedule_versions v
              where v.habit_id = h.id and v.effective_from <= d.day::date
              order by v.effective_from desc
              limit 1
            ),
            h.days
          )
        )
      )
    )
  on conflict (habit_id, occurrence_date) do nothing;
end;
$$;

create or replace function public.archive_habit(p_habit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  perform 1 from public.habits
  where id = p_habit_id and user_id = v_user_id
  for update;
  if not found then raise exception 'habit % not found for calling user', p_habit_id; end if;

  update public.habits
  set archived = true, updated_at = statement_timestamp()
  where id = p_habit_id and user_id = v_user_id and not archived;
end;
$$;

create or replace function public.restore_habit(p_habit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  perform 1 from public.habits
  where id = p_habit_id and user_id = v_user_id
  for update;
  if not found then raise exception 'habit % not found for calling user', p_habit_id; end if;

  update public.habits
  set archived = false, updated_at = statement_timestamp()
  where id = p_habit_id and user_id = v_user_id and archived;
end;
$$;

create or replace function public.delete_habit(p_habit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_habit public.habits%rowtype;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  select * into v_habit
  from public.habits
  where id = p_habit_id and user_id = v_user_id
  for update;

  -- Retrying a completed delete is a safe no-op. A foreign account's ID is
  -- indistinguishable from a missing ID and never reveals another row.
  if not found then return; end if;

  with evidence as (
    select
      o.occurrence_date as historical_date,
      true as scheduled,
      c.kind as completion_kind,
      coalesce(c.xp_awarded, 0) as xp_awarded,
      o.time_zone,
      o.day_ends_at
    from public.habit_occurrences o
    left join public.habit_completions c
      on c.habit_id = o.habit_id and c.completed_on = o.occurrence_date
    where o.habit_id = v_habit.id and o.user_id = v_habit.user_id

    union all

    select
      c.completed_on as historical_date,
      false as scheduled,
      c.kind as completion_kind,
      c.xp_awarded,
      null::text as time_zone,
      null::timestamptz as day_ends_at
    from public.habit_completions c
    where c.habit_id = v_habit.id
      and c.user_id = v_habit.user_id
      and not exists (
        select 1 from public.habit_occurrences o
        where o.habit_id = c.habit_id and o.occurrence_date = c.completed_on
      )
  )
  insert into public.deleted_habit_history (
    user_id, source_habit_id, historical_date, habit_name, stat,
    quest_type, scheduled, completion_kind, xp_awarded, time_zone, day_ends_at
  )
  select
    v_habit.user_id,
    v_habit.id,
    e.historical_date,
    v_habit.name,
    v_habit.stat,
    v_habit.quest_type,
    e.scheduled,
    e.completion_kind,
    e.xp_awarded,
    e.time_zone,
    e.day_ends_at
  from evidence e
  on conflict (user_id, source_habit_id, historical_date)
  do update set
    scheduled = public.deleted_habit_history.scheduled or excluded.scheduled,
    completion_kind = coalesce(excluded.completion_kind, public.deleted_habit_history.completion_kind),
    xp_awarded = greatest(public.deleted_habit_history.xp_awarded, excluded.xp_awarded),
    time_zone = coalesce(public.deleted_habit_history.time_zone, excluded.time_zone),
    day_ends_at = coalesce(public.deleted_habit_history.day_ends_at, excluded.day_ends_at);

  delete from public.habits where id = v_habit.id and user_id = v_habit.user_id;
end;
$$;

revoke all on function public.archive_habit(uuid) from public, anon;
revoke all on function public.restore_habit(uuid) from public, anon;
revoke all on function public.delete_habit(uuid) from public, anon;
grant execute on function public.archive_habit(uuid) to authenticated;
grant execute on function public.restore_habit(uuid) to authenticated;
grant execute on function public.delete_habit(uuid) to authenticated;

-- Direct DELETE would bypass the ledger. Existing direct archived updates are
-- retained for older clients because the trigger above records their interval.
revoke delete on table public.habits from anon, authenticated;
