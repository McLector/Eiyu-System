-- Atomic XP increment, called from the app on completion/undo, so two rapid
-- taps can't race and clobber each other the way a read-then-write from the
-- client would. Uses auth.uid() rather than a passed-in user_id so a caller
-- can never increment another user's stats.
create or replace function public.increment_stat_xp(p_stat public.stat_key, p_delta integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.stats
  set xp = greatest(0, xp + p_delta), updated_at = now()
  where user_id = auth.uid() and stat = p_stat;
end;
$$;

grant execute on function public.increment_stat_xp(public.stat_key, integer) to authenticated;
