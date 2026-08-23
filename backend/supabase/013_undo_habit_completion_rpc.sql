-- Symmetric undo for 012's atomic complete_habit (#14 hygiene): folds the
-- completion-row delete + XP reversal - previously two separate client calls -
-- into one RPC, so a crash between them can never leave history and stats out
-- of sync in the undo direction either. Same conventions as 009/012:
-- auth.uid() inside, security invoker, granted to authenticated.
--
-- DELETE ... RETURNING (not a separate SELECT then DELETE) so the read and
-- the consume happen in one statement: two overlapping undo calls for the
-- same completion (a fast double-tap, or the same account open on two
-- devices) can no longer both read xp_awarded before either delete commits
-- and double-decrement the stat. Only one call's DELETE can ever match the
-- row; the other's RETURNING yields no row, so v_xp is null and it no-ops.
create or replace function public.undo_habit_completion(
  p_habit_id uuid,
  p_completed_on date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_xp integer;
  v_stat public.stat_key;
begin
  delete from public.habit_completions
    where habit_id = p_habit_id
      and completed_on = p_completed_on
      and user_id = auth.uid()
  returning xp_awarded into v_xp;

  -- No row deleted = nothing to undo; treat as success so an idempotent
  -- client retry after a partial failure (or a losing concurrent call) doesn't error.
  if v_xp is null then
    return;
  end if;

  select stat into v_stat from public.habits where id = p_habit_id and user_id = auth.uid();
  perform public.increment_stat_xp(v_stat, -v_xp);
end;
$$;

grant execute on function public.undo_habit_completion(uuid, date) to authenticated;