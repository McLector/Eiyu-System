-- Slice 2.1: manual weekly-summary regeneration, capped at 2/day per user.
-- Adds the UPDATE policy weekly_summaries never had (insert/select only,
-- confirmed via live schema check 2026-09-03) plus the counter columns and
-- the atomic reserve-a-regen RPC. The RPC does UPDATE-as-check (same
-- pattern 013_undo_habit_completion_rpc.sql uses) so two concurrent
-- regenerate taps can't both pass the cap check and then both write.
alter table public.weekly_summaries
  add column if not exists regenerate_count integer not null default 0,
  add column if not exists last_regenerated_date date;

create policy "weekly_summaries_update_own"
  on public.weekly_summaries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Reserves one regen slot for today (UTC — this project's DB session runs
-- UTC, confirmed via `show timezone;` 2026-09-03) and returns the new
-- count, or raises if today's 2-regen cap is already spent. Callers must
-- only call the AI proxy / write a new summary AFTER this returns
-- successfully, so a rejected reservation never burns an AI call.
create or replace function public.reserve_weekly_summary_regen(p_week_start date)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.weekly_summaries
     set regenerate_count = case when last_regenerated_date is distinct from current_date then 1
                                  else regenerate_count + 1 end,
         last_regenerated_date = current_date
   where user_id = auth.uid() and week_start = p_week_start
     and (last_regenerated_date is distinct from current_date or regenerate_count < 2)
  returning regenerate_count into v_count;

  if v_count is not null then
    return v_count;
  end if;

  if exists (select 1 from public.weekly_summaries where user_id = auth.uid() and week_start = p_week_start) then
    raise exception 'regen cap reached for week %', p_week_start using errcode = 'P0001';
  else
    raise exception 'no weekly summary exists for week % — cannot reserve a regen', p_week_start;
  end if;
end;
$$;

grant execute on function public.reserve_weekly_summary_regen(date) to authenticated;
