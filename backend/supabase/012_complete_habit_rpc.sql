-- Atomic completion (improvement-pass #8/#14 hygiene): folds the completion
-- insert + XP increment - previously two separate client calls - into ONE
-- RPC, so a crash or disconnect between them can never leave history and
-- stats out of sync. Follows 009's conventions: auth.uid() inside (never a
-- passed-in user id), security invoker so RLS still applies, granted to
-- authenticated.
create or replace function public.complete_habit(
  p_habit_id uuid,
  p_completed_on date,
  p_kind public.completion_kind,
  p_xp integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stat public.stat_key;
begin
  select stat into v_stat
    from public.habits
    where id = p_habit_id and user_id = auth.uid();
  if v_stat is null then
    raise exception 'habit % not found for calling user', p_habit_id;
  end if;

  insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded)
    values (auth.uid(), p_habit_id, p_completed_on, p_kind, p_xp);

  perform public.increment_stat_xp(v_stat, p_xp);
end;
$$;

grant execute on function public.complete_habit(uuid, date, public.completion_kind, integer) to authenticated;