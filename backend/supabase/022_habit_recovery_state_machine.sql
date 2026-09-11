-- Phase 2: persisted, authoritative one-calendar-day streak recovery.
-- Recovery deadlines are absolute instants copied from the missed occurrence's
-- original account timezone. A later schedule/timezone edit cannot move them.

alter table public.habit_occurrences
  add column if not exists time_zone text,
  add column if not exists day_ends_at timestamptz;

update public.habit_occurrences o
set time_zone = coalesce(p.time_zone, 'UTC'),
    day_ends_at = ((o.occurrence_date + 1)::timestamp at time zone coalesce(p.time_zone, 'UTC'))
from public.profiles p
where p.user_id = o.user_id
  and (o.time_zone is null or o.day_ends_at is null);

alter table public.habit_occurrences
  alter column time_zone set not null,
  alter column day_ends_at set not null;

create table if not exists public.habit_recovery_windows (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  missed_on date not null,
  preserved_streak integer not null check (preserved_streak >= 0),
  opened_at timestamptz not null,
  deadline_at timestamptz not null,
  status text not null check (status in ('open', 'recovered', 'expired')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (habit_id, missed_on),
  check (deadline_at > opened_at),
  check ((status = 'open' and resolved_at is null) or (status <> 'open' and resolved_at is not null)),
  foreign key (habit_id, missed_on)
    references public.habit_occurrences (habit_id, occurrence_date)
    on delete cascade
);

create unique index if not exists habit_recovery_windows_one_open_idx
  on public.habit_recovery_windows (habit_id)
  where status = 'open';
create index if not exists habit_recovery_windows_user_status_idx
  on public.habit_recovery_windows (user_id, status, deadline_at);

alter table public.habit_recovery_windows enable row level security;
create policy "habit_recovery_windows_select_own"
  on public.habit_recovery_windows for select to authenticated
  using ((select auth.uid()) = user_id);

alter table public.streaks
  add column if not exists current_streak integer not null default 0 check (current_streak >= 0),
  add column if not exists recovery_armed boolean not null default true,
  add column if not exists last_processed_on date,
  add column if not exists active_recovery_id uuid references public.habit_recovery_windows (id) on delete set null;

-- Existing best values remain untouched. Existing completion/occurrence history
-- is replayed deterministically on first reconciliation; there was no persisted
-- frozen timestamp in migrations 001-021 to migrate directly.
update public.streaks s
set current_streak = 0,
    recovery_armed = true,
    last_processed_on = h.schedule_start_on - 1,
    active_recovery_id = null
from public.habits h
where h.id = s.habit_id and s.last_processed_on is null;

-- Phase 1 occurrence materialization, now pinning the timezone and absolute
-- local-midnight end instant on every row.
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

-- Internal single-habit reconciler. It is deliberately not executable by API
-- roles because p_now exists only to make migrations/support tooling auditable;
-- public entrypoints always pass statement_timestamp().
create or replace function public.reconcile_one_habit_recovery(
  p_habit_id uuid,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_habit public.habits%rowtype;
  v_state public.streaks%rowtype;
  v_window public.habit_recovery_windows%rowtype;
  v_occurrence public.habit_occurrences%rowtype;
  v_today date;
  v_time_zone text;
  v_window_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select * into v_habit from public.habits
  where id = p_habit_id and user_id = v_user_id and quest_type = 'habit';
  if not found then
    raise exception 'habit % not found for calling user', p_habit_id;
  end if;

  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = v_user_id;
  v_today := (p_now at time zone v_time_zone)::date;
  perform public.ensure_habit_occurrences(v_today);

  insert into public.streaks (
    habit_id, user_id, best, current_streak, recovery_armed, last_processed_on
  ) values (
    v_habit.id, v_user_id, 0, 0, true, v_habit.schedule_start_on - 1
  ) on conflict (habit_id) do nothing;

  select * into v_state from public.streaks
  where habit_id = p_habit_id and user_id = v_user_id
  for update;

  loop
    if v_state.active_recovery_id is not null then
      select * into v_window from public.habit_recovery_windows
      where id = v_state.active_recovery_id and user_id = v_user_id
      for update;

      if not found or v_window.status <> 'open' then
        v_state.active_recovery_id := null;
      elsif p_now < v_window.deadline_at then
        update public.streaks
        set current_streak = v_state.current_streak,
            recovery_armed = v_state.recovery_armed,
            last_processed_on = v_state.last_processed_on,
            active_recovery_id = v_state.active_recovery_id,
            best = greatest(best, v_state.current_streak),
            updated_at = p_now
        where habit_id = p_habit_id;
        return;
      else
        update public.habit_recovery_windows
        set status = 'expired', resolved_at = p_now
        where id = v_window.id and status = 'open';
        v_state.current_streak := 0;
        v_state.recovery_armed := false;
        v_state.active_recovery_id := null;
      end if;
    end if;

    select * into v_occurrence
    from public.habit_occurrences
    where habit_id = p_habit_id
      and user_id = v_user_id
      and occurrence_date > coalesce(v_state.last_processed_on, v_habit.schedule_start_on - 1)
      and day_ends_at <= p_now
    order by occurrence_date
    limit 1;

    if not found then exit; end if;

    if exists (
      select 1 from public.habit_completions
      where habit_id = p_habit_id
        and user_id = v_user_id
        and completed_on = v_occurrence.occurrence_date
    ) then
      v_state.current_streak := v_state.current_streak + 1;
      v_state.recovery_armed := true;
      v_state.last_processed_on := v_occurrence.occurrence_date;
    elsif v_state.recovery_armed then
      insert into public.habit_recovery_windows (
        habit_id, user_id, missed_on, preserved_streak,
        opened_at, deadline_at, status, resolved_at
      ) values (
        p_habit_id,
        v_user_id,
        v_occurrence.occurrence_date,
        v_state.current_streak,
        v_occurrence.day_ends_at,
        (((v_occurrence.occurrence_date + 2)::timestamp) at time zone v_occurrence.time_zone),
        case
          when p_now < (((v_occurrence.occurrence_date + 2)::timestamp) at time zone v_occurrence.time_zone)
            then 'open'
          else 'expired'
        end,
        case
          when p_now < (((v_occurrence.occurrence_date + 2)::timestamp) at time zone v_occurrence.time_zone)
            then null
          else p_now
        end
      )
      on conflict (habit_id, missed_on) do update
        set status = public.habit_recovery_windows.status
      returning id into v_window_id;

      v_state.last_processed_on := v_occurrence.occurrence_date;
      if p_now < (((v_occurrence.occurrence_date + 2)::timestamp) at time zone v_occurrence.time_zone) then
        v_state.active_recovery_id := v_window_id;
        update public.streaks
        set current_streak = v_state.current_streak,
            recovery_armed = v_state.recovery_armed,
            last_processed_on = v_state.last_processed_on,
            active_recovery_id = v_state.active_recovery_id,
            best = greatest(best, v_state.current_streak),
            updated_at = p_now
        where habit_id = p_habit_id;
        return;
      end if;

      v_state.current_streak := 0;
      v_state.recovery_armed := false;
      v_state.active_recovery_id := null;
    else
      -- Continued misses after an expired recovery stay reset and cannot open
      -- a new chance until a normal completion or successful recovery resumes progress.
      v_state.current_streak := 0;
      v_state.last_processed_on := v_occurrence.occurrence_date;
    end if;
  end loop;

  update public.streaks
  set current_streak = v_state.current_streak,
      recovery_armed = v_state.recovery_armed,
      last_processed_on = v_state.last_processed_on,
      active_recovery_id = v_state.active_recovery_id,
      best = greatest(best, v_state.current_streak),
      updated_at = p_now
  where habit_id = p_habit_id;
end;
$$;

create or replace function public.reconcile_habit_recoveries()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_habit_id uuid;
  v_now timestamptz := statement_timestamp();
  v_open_count integer;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  for v_habit_id in
    select id from public.habits
    where user_id = v_user_id and quest_type = 'habit'
    order by id
  loop
    perform public.reconcile_one_habit_recovery(v_habit_id, v_now);
  end loop;
  select count(*) into v_open_count
  from public.habit_recovery_windows
  where user_id = v_user_id and status = 'open';
  return jsonb_build_object('open_count', v_open_count);
end;
$$;

create or replace function public.get_open_habit_recoveries()
returns table (
  habit_id uuid,
  missed_on date,
  preserved_streak integer,
  opened_at timestamptz,
  deadline_at timestamptz,
  time_zone text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  perform public.reconcile_habit_recoveries();
  return query
    select w.habit_id, w.missed_on, w.preserved_streak,
           w.opened_at, w.deadline_at, o.time_zone
    from public.habit_recovery_windows w
    join public.habit_occurrences o
      on o.habit_id = w.habit_id and o.occurrence_date = w.missed_on
    where w.user_id = v_user_id and w.status = 'open'
    order by w.opened_at;
end;
$$;

create or replace function public.complete_habit_recovery(p_habit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_window public.habit_recovery_windows%rowtype;
  v_stat public.stat_key;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select stat into v_stat from public.habits
  where id = p_habit_id and user_id = v_user_id and quest_type = 'habit';
  if not found then
    raise exception 'habit % not found for calling user', p_habit_id;
  end if;

  perform public.reconcile_one_habit_recovery(p_habit_id, v_now);
  select * into v_window
  from public.habit_recovery_windows
  where habit_id = p_habit_id and user_id = v_user_id
  order by missed_on desc
  limit 1
  for update;

  if not found then return jsonb_build_object('status', 'no_open_recovery'); end if;
  if v_window.status = 'recovered' then
    return jsonb_build_object('status', 'already_recovered');
  end if;
  if v_window.status = 'expired' then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_now >= v_window.deadline_at then
    update public.habit_recovery_windows
    set status = 'expired', resolved_at = v_now
    where id = v_window.id and status = 'open';
    update public.streaks
    set current_streak = 0,
        recovery_armed = false,
        active_recovery_id = null,
        updated_at = v_now
    where habit_id = p_habit_id and user_id = v_user_id;
    perform public.reconcile_one_habit_recovery(p_habit_id, v_now);
    return jsonb_build_object('status', 'expired');
  end if;

  insert into public.habit_completions (
    user_id, habit_id, completed_on, kind, xp_awarded
  ) values (
    v_user_id, p_habit_id, v_window.missed_on, 'easy', 4
  ) on conflict (habit_id, completed_on) do nothing;

  if found then perform public.increment_stat_xp(v_stat, 4); end if;
  update public.habit_recovery_windows
  set status = 'recovered', resolved_at = v_now
  where id = v_window.id and status = 'open';
  update public.streaks
  set current_streak = v_window.preserved_streak + 1,
      best = greatest(best, v_window.preserved_streak + 1),
      recovery_armed = true,
      active_recovery_id = null,
      updated_at = v_now
  where habit_id = p_habit_id and user_id = v_user_id;
  return jsonb_build_object('status', 'recovered');
end;
$$;

-- Daily reads always reconcile first so correctness survives app absence and
-- missed timers/jobs.
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
  perform public.reconcile_habit_recoveries();
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

-- Normal completion is today-only. Recovery has its own operation and never
-- accepts a client date or client clock.
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
  v_habit public.habits%rowtype;
  v_xp integer;
  v_time_zone text;
  v_today date;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select * into v_habit from public.habits
  where id = p_habit_id and user_id = v_user_id;
  if not found then raise exception 'habit % not found for calling user', p_habit_id; end if;
  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = v_user_id;
  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  if p_completed_on <> v_today then
    raise exception 'normal completion date must be the current account date';
  end if;

  if v_habit.quest_type = 'habit' then
    perform public.reconcile_one_habit_recovery(p_habit_id, statement_timestamp());
  end if;
  perform public.ensure_habit_occurrences(p_completed_on);
  if not exists (
    select 1 from public.habit_occurrences
    where habit_id = p_habit_id and user_id = v_user_id and occurrence_date = p_completed_on
  ) then
    raise exception 'habit % is not eligible on %', p_habit_id, p_completed_on;
  end if;

  v_xp := case p_kind when 'full' then 20 else 4 end;
  insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded)
  values (v_user_id, p_habit_id, p_completed_on, p_kind, v_xp);
  perform public.increment_stat_xp(v_habit.stat, v_xp);
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
  if p_date <> v_today then
    raise exception 'normal completion date must be the current account date';
  end if;
  perform public.reconcile_one_habit_recovery(p_habit_id, statement_timestamp());
  perform public.ensure_habit_occurrences(p_date);
  if not exists (
    select 1 from public.habit_occurrences
    where habit_id = p_habit_id and user_id = v_user_id and occurrence_date = p_date
  ) then raise exception 'habit % is not eligible on %', p_habit_id, p_date; end if;

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

-- Undo is also restricted to the current account date. Besides matching the
-- normal completion boundary, this prevents callers from deleting the
-- server-owned completion that records a successful recovery.
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
  v_time_zone text;
  v_today date;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select h.stat, coalesce(p.time_zone, 'UTC')
  into v_stat, v_time_zone
  from public.habits h
  join public.profiles p on p.user_id = h.user_id
  where h.id = p_habit_id and h.user_id = v_user_id;
  if not found then raise exception 'habit % not found for calling user', p_habit_id; end if;

  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  if p_completed_on <> v_today then
    raise exception 'normal completion date must be the current account date';
  end if;

  delete from public.habit_completions
  where habit_id = p_habit_id
    and completed_on = p_completed_on
    and user_id = v_user_id
  returning xp_awarded into v_xp;
  if v_xp is null then return; end if;
  perform public.increment_stat_xp(v_stat, -v_xp);
end;
$$;

-- Pin every already-materialized boundary before changing account timezone.
create or replace function public.set_account_time_zone(p_time_zone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_time_zone text;
  v_old_today date;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if not public.is_valid_time_zone(p_time_zone) then
    raise exception 'invalid IANA time zone: %', p_time_zone;
  end if;
  select coalesce(time_zone, 'UTC') into v_old_time_zone
  from public.profiles where user_id = v_user_id;
  if v_old_time_zone is null then raise exception 'profile not found for calling user'; end if;
  v_old_today := (statement_timestamp() at time zone v_old_time_zone)::date;
  perform public.ensure_habit_occurrences(v_old_today);
  perform public.reconcile_habit_recoveries();
  update public.profiles
  set time_zone = p_time_zone,
      time_zone_changed_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where user_id = v_user_id;
  return p_time_zone;
end;
$$;

revoke all on table public.habit_recovery_windows from anon, authenticated;
grant select on table public.habit_recovery_windows to authenticated;
revoke insert, update, delete on table public.streaks from anon, authenticated;
grant select on table public.streaks to authenticated;

revoke all on function public.reconcile_one_habit_recovery(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reconcile_habit_recoveries() from public, anon;
revoke all on function public.get_open_habit_recoveries() from public, anon;
revoke all on function public.complete_habit_recovery(uuid) from public, anon;
grant execute on function public.reconcile_habit_recoveries() to authenticated;
grant execute on function public.get_open_habit_recoveries() to authenticated;
grant execute on function public.complete_habit_recovery(uuid) to authenticated;
