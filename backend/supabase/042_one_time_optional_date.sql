-- 042_one_time_optional_date.sql
-- One-time quests may have no date, and a quest dated in the future is on
-- today's board and can be completed now. A "missed" day is still only an
-- occurrence nobody finished, so occurrences are written on the day a quest is
-- completed (or when its date arrives), never for an undated or upcoming quest
-- that has simply been waiting.
-- Apply by hand in the SQL editor, after 041. One transaction: if any
-- statement fails (for example because the deployed schema has drifted from the
-- committed files), nothing is applied.
--
-- Before applying, compare the deployed bodies of ensure_habit_occurrences,
-- complete_habit, undo_habit_completion and get_habits_for_date with 025, 022,
-- 022 and 038: this file re-issues all four.
--
-- Rollback: re-run the function bodies from 025 (ensure_habit_occurrences), 022
-- (complete_habit, undo_habit_completion) and 038 (get_habits_for_date), then
--   drop trigger habits_one_time_date_guard on public.habits;
--   drop function public.guard_one_time_date_change();
--   alter table public.habits drop constraint habits_one_time_time_needs_date;
begin;

-- 1. A time needs a date. Rows that predate optional dates may hold a null
--    date with a set time; clear the time first so the check can be added. They
--    will also start appearing on the board as undated quests.
update public.habits
set time_set = false
where quest_type = 'one_time' and scheduled_date is null and time_set;

alter table public.habits drop constraint if exists habits_one_time_time_needs_date;
alter table public.habits add constraint habits_one_time_time_needs_date
  check (quest_type <> 'one_time' or scheduled_date is not null or not time_set);

-- 2. Occurrence materializer (025). One new rule: a one-time quest that already
--    has a completion gets no more occurrences, so a quest finished early does
--    not reappear as open when its date arrives.
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
      (
        h.quest_type = 'one_time'
        and d.day::date = h.scheduled_date
        and not exists (select 1 from public.habit_completions c where c.habit_id = h.id)
      )
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

-- 3. Completion (022). A one-time quest completes once. An undated or upcoming
--    one writes today's occurrence now, because that is the day it was done.
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
  if v_habit.quest_type = 'one_time' and not v_habit.archived then
    if exists (select 1 from public.habit_completions c where c.habit_id = p_habit_id) then
      raise exception 'one-time quest % is already completed', p_habit_id;
    end if;
    if v_habit.scheduled_date is null or v_habit.scheduled_date > v_today then
      insert into public.habit_occurrences (habit_id, user_id, occurrence_date, time_zone, day_ends_at)
      values (p_habit_id, v_user_id, v_today, v_time_zone,
              (((v_today + 1)::timestamp) at time zone v_time_zone))
      on conflict (habit_id, occurrence_date) do nothing;
    end if;
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

-- 4. Undo (022). Undoing an undated or upcoming one-time quest also removes the
--    occurrence the completion wrote, so it leaves no "missed" day behind.
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
  v_quest_type text;
  v_scheduled date;
  v_time_zone text;
  v_today date;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select h.stat, h.quest_type, h.scheduled_date, coalesce(p.time_zone, 'UTC')
  into v_stat, v_quest_type, v_scheduled, v_time_zone
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

  if v_quest_type = 'one_time' and (v_scheduled is null or v_scheduled > v_today) then
    delete from public.habit_occurrences
    where habit_id = p_habit_id and user_id = v_user_id and occurrence_date = p_completed_on;
  end if;
end;
$$;

-- 5. The board read (038). On the account's today it also returns active
--    one-time quests that are undated or upcoming, have no completion at all and
--    no occurrence yet (so a row is never returned twice). A quest finished
--    today still comes back through the occurrence its completion wrote.
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
  perform public.rollover_unfinished_one_time_quests();
  return query
    select h.*
    from public.habits h
    left join public.habit_occurrences o
      on o.habit_id = h.id and o.user_id = v_user_id and o.occurrence_date = p_date
    where h.user_id = v_user_id
      and not h.archived
      and (
        (o.habit_id is not null and p_date <= v_today)
        or (
          o.habit_id is null
          and p_date = v_today
          and h.quest_type = 'one_time'
          and (h.scheduled_date is null or h.scheduled_date > v_today)
          and not exists (select 1 from public.habit_completions c where c.habit_id = h.id)
        )
      )
    order by h.reminder_time;
end;
$$;

-- 6. The date of a one-time quest is editable until it is finished. Only a real
--    change counts (the clients always send scheduled_date, even on a rename),
--    and only while the row stays one-time, so the moves and the rollover pass.
create or replace function public.guard_one_time_date_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_time_zone text;
  v_today date;
begin
  if old.quest_type <> 'one_time' or new.quest_type <> 'one_time'
     or new.scheduled_date is not distinct from old.scheduled_date then
    return new;
  end if;
  if exists (select 1 from public.habit_completions c where c.habit_id = old.id) then
    raise exception 'the date of a finished quest is fixed';
  end if;
  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = old.user_id;
  v_today := (statement_timestamp() at time zone coalesce(v_time_zone, 'UTC'))::date;
  if auth.uid() is not null and new.scheduled_date is not null and new.scheduled_date < v_today then
    raise exception 'a quest cannot be moved to a past date';
  end if;
  -- Today's (or a later) occurrence belonged to the old date; drop it so the
  -- quest is not "missed" on a day it was no longer due. Clients cannot write
  -- occurrences, hence the definer.
  delete from public.habit_occurrences o
  where o.habit_id = old.id and o.occurrence_date >= v_today;
  return new;
end;
$$;

drop trigger if exists habits_one_time_date_guard on public.habits;
create trigger habits_one_time_date_guard
  before update of scheduled_date on public.habits
  for each row execute function public.guard_one_time_date_change();

revoke all on function public.guard_one_time_date_change() from public, anon, authenticated;
-- create or replace keeps the existing grants on the four re-issued functions.

commit;
