-- 014_server_side_xp.sql
-- Security fix: complete_habit previously trusted a client-supplied p_xp,
-- letting any authenticated caller award themselves arbitrary XP by calling
-- the RPC directly (bypassing the app). XP is now computed server-side from
-- p_kind, mirroring lib/eiyu-logic.ts's FULL_XP/EASY_XP constants — keep
-- these two in sync if the XP curve ever changes.
--
-- increment_stat_xp must stay granted to `authenticated`: complete_habit is
-- `security invoker`, so its internal `perform increment_stat_xp(...)` call
-- runs as the invoking (authenticated) role, which needs its own EXECUTE
-- privilege — the grant can't simply be revoked. As defense-in-depth against
-- a direct call to increment_stat_xp itself, it now rejects any |p_delta|
-- greater than 20 (FULL_XP, the largest legitimate single-action delta).
-- SYNC: the 20 in this bound, the 20/4 in the case below, and FULL_XP/EASY_XP
-- in lib/eiyu-logic.ts are three copies of the same constants — move all of
-- them together if the XP curve ever changes.

drop function if exists public.complete_habit(uuid, date, public.completion_kind, integer);

create or replace function public.complete_habit(
  p_habit_id uuid,
  p_completed_on date,
  p_kind public.completion_kind
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stat public.stat_key;
  v_xp integer;
begin
  select stat into v_stat
    from public.habits
    where id = p_habit_id and user_id = auth.uid();
  if v_stat is null then
    raise exception 'habit % not found for calling user', p_habit_id;
  end if;

  v_xp := case p_kind when 'full' then 20 else 4 end;

  insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded)
    values (auth.uid(), p_habit_id, p_completed_on, p_kind, v_xp);

  perform public.increment_stat_xp(v_stat, v_xp);
end;
$$;

grant execute on function public.complete_habit(uuid, date, public.completion_kind) to authenticated;

create or replace function public.increment_stat_xp(p_stat public.stat_key, p_delta integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if abs(p_delta) > 20 then
    raise exception 'p_delta out of range: %', p_delta;
  end if;

  update public.stats
  set xp = greatest(0, xp + p_delta), updated_at = now()
  where user_id = auth.uid() and stat = p_stat;
end;
$$;
