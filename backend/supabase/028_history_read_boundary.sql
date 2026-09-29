-- One owner-scoped snapshot for History and weekly consumers. The function
-- returns normalized rows so clients never merge a live completion request
-- with a separate ledger request while delete_habit moves evidence between
-- them. Keep this in its own migration so profile compatibility repair stays
-- independently deployable.
create or replace function public.read_history_range(
  p_start_date date,
  p_end_date date
)
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  with evidence as (
    select
      o.habit_id as source_habit_id,
      o.occurrence_date as historical_date,
      h.name as habit_name,
      h.stat,
      h.quest_type,
      true as scheduled,
      c.kind as completion_kind
    from public.habit_occurrences o
    join public.habits h on h.id = o.habit_id and h.user_id = (select auth.uid())
    left join public.habit_completions c
      on c.habit_id = o.habit_id
      and c.user_id = (select auth.uid())
      and c.completed_on = o.occurrence_date
    where o.user_id = (select auth.uid())
      and o.occurrence_date >= p_start_date
      and o.occurrence_date < p_end_date

    union all

    select
      c.habit_id,
      c.completed_on,
      h.name,
      h.stat,
      h.quest_type,
      false,
      c.kind
    from public.habit_completions c
    join public.habits h on h.id = c.habit_id and h.user_id = (select auth.uid())
    where c.user_id = (select auth.uid())
      and c.completed_on >= p_start_date
      and c.completed_on < p_end_date
      and not exists (
        select 1 from public.habit_occurrences o
        where o.habit_id = c.habit_id
          and o.user_id = (select auth.uid())
          and o.occurrence_date = c.completed_on
      )

    union all

    select
      dh.source_habit_id,
      dh.historical_date,
      dh.habit_name,
      dh.stat,
      dh.quest_type,
      dh.scheduled,
      dh.completion_kind
    from public.deleted_habit_history dh
    where dh.user_id = (select auth.uid())
      and dh.historical_date >= p_start_date
      and dh.historical_date < p_end_date
  ), ordered as (
    select coalesce(
      jsonb_agg(to_jsonb(e) order by e.historical_date, e.source_habit_id),
      '[]'::jsonb
    ) as rows
    from evidence e
  ), recurring_totals as (
    select stat, count(*) as completed_count
    from evidence
    where quest_type = 'habit' and completion_kind is not null
    group by stat
  )
  select jsonb_build_object(
    'rows', ordered.rows,
    'habits', coalesce(
      (select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'stat', h.stat) order by h.id)
       from public.habits h where h.user_id = (select auth.uid())),
      '[]'::jsonb
    ),
    'recurring_totals', coalesce(
      (select jsonb_object_agg(stat, completed_count) from recurring_totals),
      '{}'::jsonb
    )
  )
  from ordered;
$$;

revoke all on function public.read_history_range(date, date) from public, anon;
grant execute on function public.read_history_range(date, date) to authenticated;
