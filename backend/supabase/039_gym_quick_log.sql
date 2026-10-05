-- 039: Gym quick-log. A weight is logged straight from the exercise, with no workout to start or finish.
-- Each log is stored as one completed, single-exercise session, so every existing history reader
-- (previous_gym_weights, the immutable prescription snapshot, RLS) keeps working unchanged.
-- start_gym_session and save_gym_session stay in place for browser tabs still running the previous client.
begin;

-- The draft workflow is retired. A draft that holds at least one typed weight becomes history under its own start
-- date (its blank entries are dropped); a draft with no weights is discarded. Nothing the user typed is lost.
with converted as (
  update public.gym_sessions s
     set status = 'completed', completed_at = s.created_at
   where s.status = 'draft'
     and exists (select 1 from public.gym_entries e where e.session_id = s.id and e.weight is not null)
  returning s.id
)
delete from public.gym_entries e using converted c where e.session_id = c.id and e.weight is null;
delete from public.gym_sessions where status = 'draft';

-- p_log_id is chosen by the client and becomes the session id, so retrying a log whose first attempt may or may not
-- have landed (a network failure) is a no-op instead of a duplicate. The first write wins.
create function public.log_gym_weight(p_log_id uuid, p_exercise_id uuid, p_weight numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.gym_exercises; r public.gym_routines;
begin
  if p_log_id is null then raise exception 'Log id is required.'; end if;
  if exists(select 1 from public.gym_sessions where id = p_log_id and user_id = auth.uid()) then return; end if;
  if p_weight is null or p_weight < 0 or p_weight > 1000000 or p_weight <> round(p_weight, 3) then
    raise exception 'Weight must be from 0 to 1000000 with at most three decimals.';
  end if;
  select * into e from public.gym_exercises where id = p_exercise_id and user_id = auth.uid();
  if e.id is null then raise exception 'Exercise not found.'; end if;
  select * into r from public.gym_routines where id = e.routine_id and user_id = auth.uid() for update;
  if r.id is null or r.archived or r.deleted_at is not null then raise exception 'Routine not available.'; end if;
  -- Read the exercise again under the routine lock: an edit or removal may have landed between the two reads.
  select * into e from public.gym_exercises where id = p_exercise_id and user_id = auth.uid();
  if e.id is null then raise exception 'Exercise not found.'; end if;
  insert into public.gym_sessions(id, routine_id, user_id, routine_name, unit, status, completed_at)
    values (p_log_id, r.id, r.user_id, r.name, r.unit, 'completed', now());
  insert into public.gym_entries(session_id, user_id, exercise_id, position, prescription, weight)
    values (p_log_id, r.user_id, e.id, e.position,
      jsonb_build_object('name', e.name, 'sets', e.sets, 'reps', e.reps, 'rest_seconds', e.rest_seconds,
                         'rir', e.rir, 'rir_max', e.rir_max, 'notes', e.notes),
      p_weight);
end; $$;

-- The two newest logged weights per exercise: recency 1 is Current, recency 2 is Previous.
create function public.recent_gym_weights(p_routine_id uuid)
returns table(exercise_id uuid, weight numeric, unit text, logged_at timestamptz, recency integer)
language sql stable security invoker set search_path = '' as $$
  select x.exercise_id, x.weight, x.unit, x.completed_at, x.recency
  from public.gym_exercises e
  cross join lateral (
    select w.exercise_id, w.weight, s.unit, s.completed_at,
           (row_number() over (order by s.completed_at desc, s.created_at desc, s.id desc, w.id desc))::integer as recency
    from public.gym_entries w join public.gym_sessions s on s.id = w.session_id
    where w.user_id = auth.uid() and w.exercise_id = e.id and w.weight is not null and s.status = 'completed'
    order by s.completed_at desc, s.created_at desc, s.id desc, w.id desc
    limit 2
  ) x
  where e.routine_id = p_routine_id and e.user_id = auth.uid();
$$;

revoke all on function public.log_gym_weight(uuid, uuid, numeric), public.recent_gym_weights(uuid) from public, anon, authenticated;
grant execute on function public.log_gym_weight(uuid, uuid, numeric), public.recent_gym_weights(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
