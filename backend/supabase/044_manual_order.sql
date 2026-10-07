-- 044_manual_order.sql
-- A stored manual order for the three Board lanes (Daily = quest_type 'habit',
-- One-time, Backlog) and for the Chain list. `position` is per user and per lane
-- (per user for chains); lower comes first. The clients sort by it, keep
-- finished quests at the bottom, and fall back to today's auto-sort whenever a
-- row has no position (a database that has not had this applied yet).
--
-- * Existing rows are numbered from today's auto-sort (backfill_manual_order),
--   so nothing moves the day this is applied.
-- * A new quest, and a quest that changes lane (the menu move, a drag, the
--   midnight rollover), lands at the top of its lane. Done by triggers, so the
--   move functions from 038 and 042 are not re-issued. A trigger that fires on
--   "update of quest_type" also fires for every edit that merely resends the
--   same type, so the body compares old and new before it does anything.
-- * reorder_quests(lane, ids) and reorder_long_quests(ids) take the visible,
--   unfinished ids in their new order and put them into the slots those ids
--   already hold, so a quest the screen does not show (a habit not scheduled
--   today, a finished or past quest) keeps its place. The lane is renumbered
--   0..n-1, which also settles ties.
--
-- Apply by hand in the SQL editor, after 043. It is safe in either deploy order:
-- a client from before this migration ignores the column and auto-sorts, and a
-- client from after it hides the reorder controls until positions arrive. One
-- transaction: if any statement fails nothing is applied.
--
-- Before applying, check the triggers already on habits and long_quests (the
-- repo expects habits_one_time_date_guard, habits_record_archive_interval,
-- habits_record_schedule_version, habits_set_schedule_start,
-- habits_validate_name_length, long_quests_validate_name_length,
-- preserve_long_quest_first_completion, validate_long_quest_order_mode). Checked
-- 2026-10-07 against the live project: exactly those, and no column-level grants.
--
-- Rollback:
--   drop trigger habits_place_on_top on public.habits;
--   drop trigger long_quests_place_on_top on public.long_quests;
--   drop function public.place_habit_on_top(), public.place_long_quest_on_top(),
--     public.reorder_quests(text, uuid[]), public.reorder_long_quests(uuid[]),
--     public.backfill_manual_order(uuid);
--   alter table public.habits drop column position;
--   alter table public.long_quests drop column position;
-- The clients go back to auto-sort on their own.
begin;

alter table public.habits add column if not exists position integer;
alter table public.long_quests add column if not exists position integer;

-- 1. Number every lane of one user the way the clients sort it today.
--    Names compare by code point (collate "C"), as the clients do.
create or replace function public.backfill_manual_order(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  select (statement_timestamp() at time zone coalesce(p.time_zone, 'UTC'))::date into v_today
  from public.profiles p where p.user_id = p_user_id;
  v_today := coalesce(v_today, (statement_timestamp() at time zone 'UTC')::date);

  update public.habits h set position = r.pos
  from (
    select x.id, row_number() over (
      order by (coalesce(x.time_set, true) = false), left(x.reminder_time::text, 5) collate "C", x.name collate "C", x.id
    ) - 1 as pos
    from public.habits x where x.user_id = p_user_id and x.quest_type = 'habit'
  ) r where h.id = r.id;

  update public.habits h set position = r.pos
  from (
    select x.id, row_number() over (
      order by
        case when x.scheduled_date is null then 1 when x.scheduled_date > v_today then 2 else 0 end,
        case when x.scheduled_date > v_today then x.scheduled_date end,
        (coalesce(x.time_set, true) = false), left(x.reminder_time::text, 5) collate "C", x.name collate "C", x.id
    ) - 1 as pos
    from public.habits x where x.user_id = p_user_id and x.quest_type = 'one_time'
  ) r where h.id = r.id;

  update public.habits h set position = r.pos
  from (
    select x.id, row_number() over (order by x.created_at desc, x.id) - 1 as pos
    from public.habits x where x.user_id = p_user_id and x.quest_type = 'backlog'
  ) r where h.id = r.id;

  update public.long_quests q set position = r.pos
  from (
    select x.id, row_number() over (order by x.created_at, x.id) - 1 as pos
    from public.long_quests x where x.user_id = p_user_id
  ) r where q.id = r.id;
end;
$$;
revoke all on function public.backfill_manual_order(uuid) from public, anon, authenticated;

do $$
declare
  v_user uuid;
begin
  for v_user in
    select user_id from public.habits union select user_id from public.long_quests
  loop
    perform public.backfill_manual_order(v_user);
  end loop;
end;
$$;

-- The default only exists so an insert that bypasses the triggers (a data load,
-- a replica-mode fixture) still succeeds; the triggers below treat 0 on insert
-- as "not set".
alter table public.habits alter column position set default 0;
alter table public.long_quests alter column position set default 0;
alter table public.habits alter column position set not null;
alter table public.long_quests alter column position set not null;

-- 2. New rows and lane changes land at the top. Old clients never send a position
--    (so it arrives as the default 0, or null when written explicitly).
create or replace function public.place_habit_on_top()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.position is not null and new.position <> 0 then return new; end if;
  elsif old.quest_type is not distinct from new.quest_type then
    return new;
  end if;
  select coalesce(min(h.position), 0) - 1 into new.position
  from public.habits h
  where h.user_id = new.user_id and h.quest_type = new.quest_type and h.id <> new.id;
  return new;
end;
$$;
revoke all on function public.place_habit_on_top() from public, anon, authenticated;

drop trigger if exists habits_place_on_top on public.habits;
create trigger habits_place_on_top
before insert or update of quest_type on public.habits
for each row execute function public.place_habit_on_top();

create or replace function public.place_long_quest_on_top()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is null or new.position = 0 then
    select coalesce(min(q.position), 0) - 1 into new.position
    from public.long_quests q where q.user_id = new.user_id and q.id <> new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.place_long_quest_on_top() from public, anon, authenticated;

drop trigger if exists long_quests_place_on_top on public.long_quests;
create trigger long_quests_place_on_top
before insert on public.long_quests
for each row execute function public.place_long_quest_on_top();

-- 3. Reorder. The ids are the quests the screen can move, in their new order.
create or replace function public.reorder_quests(p_quest_type text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_quest_type is null or p_quest_type not in ('habit', 'one_time', 'backlog') then
    raise exception 'Unknown quest lane.';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 1000
     or cardinality(p_ids) <> (select count(distinct i) from unnest(p_ids) i) then
    raise exception 'Quest order must list each quest once.';
  end if;

  perform 1 from public.habits h
  where h.user_id = v_user_id and h.quest_type = p_quest_type
  order by h.id for update;

  if (select count(*) from public.habits h
      where h.user_id = v_user_id and h.quest_type = p_quest_type and not h.archived and h.id = any(p_ids))
     <> cardinality(p_ids) then
    raise exception 'Quest order is out of date. Reload and try again.';
  end if;

  with lane as (
    select h.id, row_number() over (order by h.position, h.id) as rn
    from public.habits h
    where h.user_id = v_user_id and h.quest_type = p_quest_type
  ), slots as (
    select l.rn, row_number() over (order by l.rn) as k from lane l where l.id = any(p_ids)
  ), given as (
    select t.id, t.ord as k from unnest(p_ids) with ordinality t(id, ord)
  ), placed as (
    select l.rn, coalesce(g.id, l.id) as id
    from lane l
    left join slots s on s.rn = l.rn
    left join given g on g.k = s.k
  )
  update public.habits h set position = p.rn - 1
  from placed p
  where h.id = p.id and h.user_id = v_user_id;
end;
$$;

create or replace function public.reorder_long_quests(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 1000
     or cardinality(p_ids) <> (select count(distinct i) from unnest(p_ids) i) then
    raise exception 'Quest order must list each quest once.';
  end if;

  perform 1 from public.long_quests q where q.user_id = v_user_id order by q.id for update;

  if (select count(*) from public.long_quests q where q.user_id = v_user_id and q.id = any(p_ids))
     <> cardinality(p_ids) then
    raise exception 'Quest order is out of date. Reload and try again.';
  end if;

  with lane as (
    select q.id, row_number() over (order by q.position, q.id) as rn
    from public.long_quests q where q.user_id = v_user_id
  ), slots as (
    select l.rn, row_number() over (order by l.rn) as k from lane l where l.id = any(p_ids)
  ), given as (
    select t.id, t.ord as k from unnest(p_ids) with ordinality t(id, ord)
  ), placed as (
    select l.rn, coalesce(g.id, l.id) as id
    from lane l
    left join slots s on s.rn = l.rn
    left join given g on g.k = s.k
  )
  update public.long_quests q set position = p.rn - 1
  from placed p
  where q.id = p.id and q.user_id = v_user_id;
end;
$$;

revoke all on function public.reorder_quests(text, uuid[]) from public, anon, authenticated;
revoke all on function public.reorder_long_quests(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_quests(text, uuid[]) to authenticated;
grant execute on function public.reorder_long_quests(uuid[]) to authenticated;

commit;
