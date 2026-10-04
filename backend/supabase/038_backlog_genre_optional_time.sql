-- 038_backlog_genre_optional_time.sql
-- Backlog quests (ideas without a date), a one-per-quest genre, an optional
-- One-time time, and three server-owned functions: move Backlog -> One-time,
-- move One-time -> Backlog, and the midnight rollover that returns an
-- unfinished One-time quest to Backlog. Apply by hand in the SQL editor.
-- One transaction: if any statement fails (for example because the deployed
-- schema has drifted from the committed files), nothing is applied.
begin;

-- 1. quest_type may be 'backlog'. The check from 011 was added inline, so find
--    it by what it constrains (a check on quest_type alone) rather than by its
--    generated name.
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_catalog.pg_constraint c
    where c.conrelid = 'public.habits'::regclass and c.contype = 'c'
      and c.conkey = array[(
        select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = 'public.habits'::regclass and a.attname = 'quest_type'
      )]::smallint[]
  loop
    execute format('alter table public.habits drop constraint %I', v_name);
  end loop;
end $$;
alter table public.habits
  add constraint habits_quest_type_check check (quest_type in ('habit', 'one_time', 'backlog'));

-- 2. Backlog quests have no penalty, like One-time quests (keeps the 020 quantity exemption).
alter table public.habits drop constraint if exists habits_easy_version_present;
alter table public.habits add constraint habits_easy_version_present
  check (
    quest_type in ('one_time', 'backlog')
    or target_count is not null
    or (easy_version is not null and char_length(trim(easy_version)) > 0)
  );

-- 3. Genre (One-time and Backlog only), optional time, and the Backlog row shape.
alter table public.habits add column if not exists genre text;
alter table public.habits drop constraint if exists habits_genre_check;
alter table public.habits add constraint habits_genre_check
  check (genre is null or genre in ('tool', 'concept', 'article', 'software_idea', 'todo'));
alter table public.habits drop constraint if exists habits_genre_scope;
alter table public.habits add constraint habits_genre_scope
  check (genre is null or quest_type in ('one_time', 'backlog'));
-- reminder_time stays NOT NULL (installed mobile builds read it); untimed quests store 08:00.
alter table public.habits add column if not exists time_set boolean not null default true;
alter table public.habits drop constraint if exists habits_backlog_shape;
alter table public.habits add constraint habits_backlog_shape
  check (quest_type <> 'backlog' or (scheduled_date is null and days = '{}' and target_count is null));

-- 4. The retained-history ledger may describe a quest that is now in Backlog.
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_catalog.pg_constraint c
    where c.conrelid = 'public.deleted_habit_history'::regclass and c.contype = 'c'
      and c.conkey = array[(
        select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = 'public.deleted_habit_history'::regclass and a.attname = 'quest_type'
      )]::smallint[]
  loop
    execute format('alter table public.deleted_habit_history drop constraint %I', v_name);
  end loop;
end $$;
alter table public.deleted_habit_history
  add constraint deleted_habit_history_quest_type_check check (quest_type in ('habit', 'one_time', 'backlog'));

-- 5. archive_habit (025) rejects Backlog quests: archived rows of any type reach installed mobile builds.
create or replace function public.archive_habit(p_habit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_type text;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select quest_type into v_type from public.habits
  where id = p_habit_id and user_id = v_user_id
  for update;
  if not found then raise exception 'habit % not found for calling user', p_habit_id; end if;
  if v_type = 'backlog' then raise exception 'backlog quest % cannot be archived', p_habit_id; end if;

  update public.habits
  set archived = true, updated_at = statement_timestamp()
  where id = p_habit_id and user_id = v_user_id and not archived;
end;
$$;

-- 6. Rollover settings: only quests dated on or after this day are ever swept into Backlog, so
--    One-time quests that were already abandoned do not flood it the first time the board loads.
create table if not exists private.backlog_rollover_settings (
  singleton boolean primary key default true check (singleton),
  cutover date not null
);
insert into private.backlog_rollover_settings (singleton, cutover)
values (true, current_date)
on conflict (singleton) do nothing;
alter table private.backlog_rollover_settings enable row level security;
revoke all on table private.backlog_rollover_settings from public, anon, authenticated, service_role;

-- 7. Midnight rollover: an unfinished One-time quest whose day has passed returns to Backlog.
--    It records occurrences through yesterday first, so History keeps the missed day even when
--    it is called without a board load (it is a callable RPC) or the board read a past date.
create or replace function public.rollover_unfinished_one_time_quests()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text;
  v_today date;
  v_cutover date;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select coalesce(time_zone, 'UTC') into v_time_zone
  from public.profiles where user_id = v_user_id;
  if v_time_zone is null then raise exception 'profile not found for calling user'; end if;
  v_today := (statement_timestamp() at time zone v_time_zone)::date;
  select cutover into v_cutover from private.backlog_rollover_settings;

  perform public.ensure_habit_occurrences(v_today - 1);

  update public.habits h
  set quest_type = 'backlog', scheduled_date = null, days = '{}', target_count = null,
      time_set = false, updated_at = statement_timestamp()
  where h.user_id = v_user_id
    and h.quest_type = 'one_time'
    and not h.archived
    and h.scheduled_date is not null
    and h.scheduled_date < v_today
    and h.scheduled_date >= v_cutover
    and not exists (select 1 from public.habit_completions c where c.habit_id = h.id);
end;
$$;

-- 8. Backlog -> One-time, dated by the server in the account's time zone.
create or replace function public.move_backlog_to_one_time(p_id uuid)
returns void
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
  if v_time_zone is null then raise exception 'profile not found for calling user'; end if;
  v_today := (statement_timestamp() at time zone v_time_zone)::date;

  update public.habits
  set quest_type = 'one_time', scheduled_date = v_today, time_set = false,
      updated_at = statement_timestamp()
  where id = p_id and user_id = v_user_id and quest_type = 'backlog' and not archived;
  if not found then raise exception 'backlog quest % not found for calling user', p_id; end if;
end;
$$;

-- 9. One-time -> Backlog. A quest with a completion keeps its place in History and cannot go back.
--    Today's unfinished occurrence is removed here (clients cannot write occurrences).
create or replace function public.move_one_time_to_backlog(p_id uuid)
returns void
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
  if v_time_zone is null then raise exception 'profile not found for calling user'; end if;
  v_today := (statement_timestamp() at time zone v_time_zone)::date;

  perform 1 from public.habits
  where id = p_id and user_id = v_user_id and quest_type = 'one_time' and not archived
  for update;
  if not found then raise exception 'one-time quest % not found for calling user', p_id; end if;
  if exists (select 1 from public.habit_completions c where c.habit_id = p_id) then
    raise exception 'quest % has a completion and cannot return to the backlog', p_id;
  end if;

  delete from public.habit_occurrences
  where habit_id = p_id and user_id = v_user_id and occurrence_date >= v_today;
  update public.habits
  set quest_type = 'backlog', scheduled_date = null, days = '{}', target_count = null,
      time_set = false, updated_at = statement_timestamp()
  where id = p_id and user_id = v_user_id;
end;
$$;

-- 10. The board read (022) runs the rollover after it has materialized occurrences,
--     so a missed day is recorded before the quest leaves One-time.
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
    join public.habit_occurrences o on o.habit_id = h.id
    where o.user_id = v_user_id
      and o.occurrence_date = p_date
      and p_date <= v_today
      and not h.archived
    order by h.reminder_time;
end;
$$;

revoke all on function public.rollover_unfinished_one_time_quests() from public, anon;
revoke all on function public.move_backlog_to_one_time(uuid) from public, anon;
revoke all on function public.move_one_time_to_backlog(uuid) from public, anon;
grant execute on function public.rollover_unfinished_one_time_quests() to authenticated;
grant execute on function public.move_backlog_to_one_time(uuid) to authenticated;
grant execute on function public.move_one_time_to_backlog(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
