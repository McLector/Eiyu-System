-- Phase 1: account-local calendar days and authoritative scheduled eligibility.
-- Existing completion date keys are never rewritten. Existing accounts retain
-- a UTC compatibility fallback until a new client initializes time_zone once.

alter table public.profiles
  add column if not exists time_zone text,
  add column if not exists time_zone_changed_at timestamptz;

create or replace function public.is_valid_time_zone(p_time_zone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_time_zone is not null
    and exists (
      select 1 from pg_catalog.pg_timezone_names where name = p_time_zone
    );
$$;

create or replace function public.validate_profile_time_zone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.time_zone is not null and not public.is_valid_time_zone(new.time_zone) then
    raise exception 'invalid IANA time zone: %', new.time_zone;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_validate_time_zone on public.profiles;
create trigger profiles_validate_time_zone
  before insert or update of time_zone on public.profiles
  for each row execute function public.validate_profile_time_zone();

-- Concurrent initialization is first-writer-wins. A device in another zone
-- reads the already persisted value instead of silently changing product day.
create or replace function public.initialize_account_time_zone(p_time_zone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if not public.is_valid_time_zone(p_time_zone) then
    raise exception 'invalid IANA time zone: %', p_time_zone;
  end if;

  update public.profiles
  set time_zone = coalesce(time_zone, p_time_zone),
      time_zone_changed_at = case when time_zone is null then statement_timestamp() else time_zone_changed_at end,
      updated_at = case when time_zone is null then statement_timestamp() else updated_at end
  where user_id = v_user_id
  returning time_zone into v_time_zone;

  if v_time_zone is null then
    raise exception 'profile not found for calling user';
  end if;
  return v_time_zone;
end;
$$;

-- Explicit timezone changes are prospective: occurrence and completion rows
-- keep their existing date keys. Phase 2 will pin open recovery deadlines too.
create or replace function public.set_account_time_zone(p_time_zone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if not public.is_valid_time_zone(p_time_zone) then
    raise exception 'invalid IANA time zone: %', p_time_zone;
  end if;

  update public.profiles
  set time_zone = p_time_zone,
      time_zone_changed_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where user_id = v_user_id;
  if not found then
    raise exception 'profile not found for calling user';
  end if;
  return p_time_zone;
end;
$$;

alter table public.habits add column if not exists schedule_start_on date;

-- Existing rows retain the historical UTC behavior at the migration boundary.
-- The new client initializes profile.time_zone for all subsequent boundaries.
update public.habits
set schedule_start_on = (created_at at time zone 'UTC')::date
where schedule_start_on is null;

alter table public.habits alter column schedule_start_on set not null;

create table if not exists public.habit_schedule_versions (
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  effective_from date not null,
  days smallint[] not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, effective_from),
  check (days <@ array[0,1,2,3,4,5,6]::smallint[])
);

alter table public.habit_schedule_versions enable row level security;
create policy "habit_schedule_versions_select_own"
  on public.habit_schedule_versions for select to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists habit_schedule_versions_user_date_idx
  on public.habit_schedule_versions (user_id, effective_from);

insert into public.habit_schedule_versions (habit_id, user_id, effective_from, days)
select id, user_id, schedule_start_on, days
from public.habits
where quest_type = 'habit'
on conflict (habit_id, effective_from) do nothing;

create table if not exists public.habit_occurrences (
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  occurrence_date date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, occurrence_date)
);

alter table public.habit_occurrences enable row level security;
create policy "habit_occurrences_select_own"
  on public.habit_occurrences for select to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists habit_occurrences_user_date_idx
  on public.habit_occurrences (user_id, occurrence_date);

create or replace function public.set_habit_schedule_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_time_zone text;
begin
  if tg_op = 'UPDATE' then
    -- This is server-owned immutable history. Silently retaining the existing
    -- value keeps older clients that echo every column compatible.
    new.schedule_start_on := old.schedule_start_on;
    return new;
  end if;

  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = new.user_id;
  if v_time_zone is null then
    raise exception 'profile not found for habit owner';
  end if;
  -- Never trust a caller-supplied start date: otherwise a direct insert could
  -- manufacture historical occurrences and bypass the creation cutoff.
  new.schedule_start_on := (new.created_at at time zone v_time_zone)::date;
  return new;
end;
$$;

drop trigger if exists habits_set_schedule_start on public.habits;
create trigger habits_set_schedule_start
  before insert or update of schedule_start_on on public.habits
  for each row execute function public.set_habit_schedule_start();

create or replace function public.record_habit_schedule_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_effective_from date;
  v_time_zone text;
begin
  if new.quest_type <> 'habit' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_effective_from := new.schedule_start_on;
  else
    select coalesce(time_zone, 'UTC') into v_time_zone
    from public.profiles where user_id = new.user_id;
    v_effective_from := (statement_timestamp() at time zone v_time_zone)::date + 1;
  end if;

  insert into public.habit_schedule_versions (habit_id, user_id, effective_from, days)
  values (new.id, new.user_id, v_effective_from, new.days)
  on conflict (habit_id, effective_from)
  do update set days = excluded.days, created_at = statement_timestamp();
  return new;
end;
$$;

drop trigger if exists habits_record_schedule_version on public.habits;
create trigger habits_record_schedule_version
  after insert or update of days, quest_type on public.habits
  for each row execute function public.record_habit_schedule_version();

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
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = v_user_id;
  if v_time_zone is null then
    raise exception 'profile not found for calling user';
  end if;

  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  v_through := least(p_through_date, v_today);

  insert into public.habit_occurrences (habit_id, user_id, occurrence_date)
  select h.id, h.user_id, d.day::date
  from public.habits h
  cross join lateral generate_series(
    greatest(
      h.schedule_start_on,
      coalesce(
        (
          select max(o.occurrence_date) + 1
          from public.habit_occurrences o
          where o.habit_id = h.id
        ),
        h.schedule_start_on
      )
    ),
    v_through,
    interval '1 day'
  ) as d(day)
  where h.user_id = v_user_id
    and not h.archived
    and (
      (h.quest_type = 'one_time' and d.day::date = h.scheduled_date)
      or
      (
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

create or replace function public.get_habits_for_date(p_date date)
returns setof public.habits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text;
  v_today date;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = v_user_id;
  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  perform public.ensure_habit_occurrences(p_date);
  return query
    select h.*
    from public.habits h
    join public.habit_occurrences o on o.habit_id = h.id
    where o.user_id = v_user_id
      and o.occurrence_date = p_date
      and p_date <= v_today
      and not h.archived
    order by h.reminder_time;
end;
$$;

-- Rebuild completion as a guarded security-definer boundary. Direct table
-- inserts are revoked below, so callers cannot bypass eligibility or XP logic.
create or replace function public.complete_habit(
  p_habit_id uuid,
  p_completed_on date,
  p_kind public.completion_kind
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_stat public.stat_key;
  v_xp integer;
  v_time_zone text;
  v_today date;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  select stat into v_stat
  from public.habits
  where id = p_habit_id and user_id = v_user_id;
  if v_stat is null then
    raise exception 'habit % not found for calling user', p_habit_id;
  end if;

  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = v_user_id;
  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  if p_completed_on > v_today then
    raise exception 'habit % is not eligible on %', p_habit_id, p_completed_on;
  end if;

  perform public.ensure_habit_occurrences(p_completed_on);
  if not exists (
    select 1 from public.habit_occurrences
    where habit_id = p_habit_id
      and user_id = v_user_id
      and occurrence_date = p_completed_on
  ) then
    raise exception 'habit % is not eligible on %', p_habit_id, p_completed_on;
  end if;

  v_xp := case p_kind when 'full' then 20 else 4 end;
  insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded)
  values (v_user_id, p_habit_id, p_completed_on, p_kind, v_xp);
  perform public.increment_stat_xp(v_stat, v_xp);
end;
$$;

create or replace function public.undo_habit_completion(
  p_habit_id uuid,
  p_completed_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_xp integer;
  v_stat public.stat_key;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  delete from public.habit_completions
  where habit_id = p_habit_id and completed_on = p_completed_on and user_id = v_user_id
  returning xp_awarded into v_xp;
  if v_xp is null then return; end if;
  select stat into v_stat from public.habits where id = p_habit_id and user_id = v_user_id;
  perform public.increment_stat_xp(v_stat, -v_xp);
end;
$$;

create or replace function public.increment_habit_progress(
  p_habit_id uuid,
  p_date date,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_target integer;
  v_old integer;
  v_new integer;
  v_time_zone text;
  v_today date;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select target_count into v_target from public.habits where id = p_habit_id and user_id = v_user_id;
  if v_target is null then raise exception 'habit % is not a quantity habit', p_habit_id; end if;

  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = v_user_id;
  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  if p_date > v_today then
    raise exception 'habit % is not eligible on %', p_habit_id, p_date;
  end if;

  perform public.ensure_habit_occurrences(p_date);
  if not exists (
    select 1 from public.habit_occurrences
    where habit_id = p_habit_id and user_id = v_user_id and occurrence_date = p_date
  ) then
    raise exception 'habit % is not eligible on %', p_habit_id, p_date;
  end if;

  insert into public.habit_progress (user_id, habit_id, progress_date, progress_count)
  values (v_user_id, p_habit_id, p_date, 0)
  on conflict (habit_id, progress_date) do nothing;
  select progress_count into v_old from public.habit_progress
  where habit_id = p_habit_id and progress_date = p_date for update;
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

-- The weekly-summary daily cap follows the same persisted account day.
create or replace function public.reserve_weekly_summary_regen(p_week_start date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text;
  v_today date;
  v_count integer;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = v_user_id;
  v_today := (statement_timestamp() at time zone v_time_zone)::date;

  update public.weekly_summaries
  set regenerate_count = case when last_regenerated_date is distinct from v_today then 1 else regenerate_count + 1 end,
      last_regenerated_date = v_today
  where user_id = v_user_id and week_start = p_week_start
    and (last_regenerated_date is distinct from v_today or regenerate_count < 2)
  returning regenerate_count into v_count;
  if v_count is not null then return v_count; end if;
  if exists (
    select 1 from public.weekly_summaries where user_id = v_user_id and week_start = p_week_start
  ) then
    raise exception 'regen cap reached for week %', p_week_start using errcode = 'P0001';
  end if;
  raise exception 'no weekly summary exists for week % — cannot reserve a regen', p_week_start;
end;
$$;

-- Capture a valid signup timezone when new clients provide it. Invalid or
-- absent metadata stays null and is initialized by the first capable client.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_time_zone text := new.raw_user_meta_data ->> 'time_zone';
begin
  if not public.is_valid_time_zone(v_time_zone) then v_time_zone := null; end if;
  insert into public.profiles (user_id, display_name, time_zone, time_zone_changed_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'Adventurer'),
    v_time_zone,
    case when v_time_zone is null then null else statement_timestamp() end
  );
  insert into public.stats (user_id, stat)
  select new.id, unnest(enum_range(null::public.stat_key));
  return new;
end;
$$;

revoke all on table public.habit_schedule_versions from anon, authenticated;
revoke all on table public.habit_occurrences from anon, authenticated;
grant select on table public.habit_schedule_versions to authenticated;
grant select on table public.habit_occurrences to authenticated;

revoke insert, update, delete on table public.habit_completions from anon, authenticated;
revoke insert, update, delete on table public.habit_progress from anon, authenticated;
grant select on table public.habit_progress to authenticated;

-- Account timezone changes go through set_account_time_zone so the transition
-- timestamp and prospective-history rule cannot be bypassed. No current app
-- path writes other profile fields directly.
revoke update on table public.profiles from anon, authenticated;

revoke all on function public.initialize_account_time_zone(text) from public, anon;
revoke all on function public.set_account_time_zone(text) from public, anon;
revoke all on function public.ensure_habit_occurrences(date) from public, anon;
revoke all on function public.get_habits_for_date(date) from public, anon;
revoke all on function public.complete_habit(uuid, date, public.completion_kind) from public, anon;
revoke all on function public.undo_habit_completion(uuid, date) from public, anon;
revoke all on function public.increment_habit_progress(uuid, date, integer) from public, anon;
revoke all on function public.reserve_weekly_summary_regen(date) from public, anon;

grant execute on function public.initialize_account_time_zone(text) to authenticated;
grant execute on function public.set_account_time_zone(text) to authenticated;
grant execute on function public.ensure_habit_occurrences(date) to authenticated;
grant execute on function public.get_habits_for_date(date) to authenticated;
grant execute on function public.complete_habit(uuid, date, public.completion_kind) to authenticated;
grant execute on function public.undo_habit_completion(uuid, date) to authenticated;
grant execute on function public.increment_habit_progress(uuid, date, integer) to authenticated;
grant execute on function public.reserve_weekly_summary_regen(date) to authenticated;
