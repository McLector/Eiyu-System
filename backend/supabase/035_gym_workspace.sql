begin;
alter table public.gym_exercises add column rir_max integer;
alter table public.gym_exercises add constraint gym_rir_range check(rir_max is null or (rir_max > rir and rir_max <= 10));
alter table public.gym_routines add column deleted_at timestamptz;
revoke insert,update on public.gym_routines from authenticated;
grant insert(id,user_id,name,unit,archived),update(name,unit,archived) on public.gym_routines to authenticated;

create table public.gym_media_cleanup (
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null check(starts_with(path,user_id::text||'/')),
  created_at timestamptz not null default now(),
  primary key(user_id,path)
);
alter table public.gym_media_cleanup enable row level security;
revoke all on public.gym_media_cleanup from public,anon,authenticated;

create function private.guard_gym_routine() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.deleted_at is not null then raise exception 'Routine deleted.'; end if;
  if tg_op='INSERT' or new.name is distinct from old.name then
    new.name:=public.trim_profile_text(new.name);
  end if;
  return new;
end; $$;
create trigger guard_gym_routine before insert or update on public.gym_routines for each row execute function private.guard_gym_routine();

create function private.guard_gym_exercise() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.gym_routines; old_path text;
begin
  select * into r from public.gym_routines where id=case when tg_op='DELETE' then old.routine_id else new.routine_id end for update;
  if r.id is null then return old; end if;
  if tg_op<>'DELETE' and r.deleted_at is not null then raise exception 'Routine deleted.'; end if;
  if tg_op='UPDATE' and (new.routine_id<>old.routine_id or new.user_id<>old.user_id or new.id<>old.id) then raise exception 'Exercise identity cannot change.'; end if;
  if tg_op<>'DELETE' then
    new.name:=public.trim_profile_text(new.name);
    if new.rir_max=new.rir then new.rir_max:=null; end if;
  end if;
  if tg_op<>'DELETE' and new.media_path is not null and exists(select 1 from public.gym_media_cleanup where user_id=new.user_id and path=new.media_path) then raise exception 'Media is pending cleanup. Upload a new file.'; end if;
  if tg_op in ('DELETE','UPDATE') then
    old_path:=old.media_path;
    if old_path is not null and (tg_op='DELETE' or old_path is distinct from new.media_path) then
      insert into public.gym_media_cleanup(user_id,path) values(old.user_id,old_path) on conflict do nothing;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger guard_gym_exercise before insert or update or delete on public.gym_exercises for each row execute function private.guard_gym_exercise();
revoke all on function private.guard_gym_routine(),private.guard_gym_exercise() from public,anon,authenticated;

create function public.delete_gym_routine(p_routine_id uuid,p_discard_draft boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare r public.gym_routines;
begin
  select * into r from public.gym_routines where id=p_routine_id and user_id=auth.uid() for update;
  if r.id is null then raise exception 'Routine not found.'; end if;
  if r.deleted_at is not null then return; end if;
  if exists(select 1 from public.gym_sessions where routine_id=r.id and status='draft') and not p_discard_draft then raise exception 'Explicit consent is required to discard the draft.'; end if;
  delete from public.gym_sessions where routine_id=r.id and status='draft';
  delete from public.gym_exercises where routine_id=r.id;
  update public.gym_routines set deleted_at=now(),archived=true where id=r.id;
end; $$;

create function public.list_gym_media_cleanup(p_after text default '',p_limit integer default 100) returns table(path text)
language sql security definer set search_path='' as $$
  select c.path from public.gym_media_cleanup c where c.user_id=auth.uid() and c.path>p_after
  and not exists(select 1 from public.gym_exercises e where e.media_path=c.path)
  order by c.path limit least(greatest(p_limit,1),100);
$$;
create function public.ack_gym_media_cleanup(p_path text) returns void
language sql security definer set search_path='' as $$
  delete from public.gym_media_cleanup where user_id=auth.uid() and path=p_path
  and not exists(select 1 from public.gym_exercises where media_path=p_path);
$$;
-- Storage is the deletion boundary, including stale clients. Queued paths
-- cannot be attached again, so retrying cleanup cannot remove referenced media.
create function public.gym_media_unreferenced(p_path text) returns boolean
language sql security definer set search_path='' as $$
  select auth.uid() is not null and starts_with(p_path,auth.uid()::text||'/')
  and not exists(select 1 from public.gym_exercises where media_path=p_path);
$$;
drop policy gym_media_delete on storage.objects;
create policy gym_media_delete on storage.objects for delete to authenticated
using(bucket_id='gym-exercise-media' and public.gym_media_unreferenced(name));

create or replace function public.start_gym_session(p_routine_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.gym_routines; sid uuid;
begin
  select * into r from public.gym_routines where id=p_routine_id and user_id=auth.uid() for update;
  if r.id is null or r.archived or r.deleted_at is not null then raise exception 'Routine not available.'; end if;
  select id into sid from public.gym_sessions where routine_id=r.id and user_id=r.user_id and status='draft';
  if sid is not null then return sid; end if;
  if not exists(select 1 from public.gym_exercises where routine_id=r.id) then raise exception 'Add an exercise before starting a workout.'; end if;
  insert into public.gym_sessions(routine_id,user_id,routine_name,unit) values(r.id,r.user_id,r.name,r.unit) returning id into sid;
  insert into public.gym_entries(session_id,user_id,exercise_id,position,prescription)
  select sid,r.user_id,e.id,e.position,jsonb_build_object('name',e.name,'sets',e.sets,'reps',e.reps,'rest_seconds',e.rest_seconds,'rir',e.rir,'rir_max',e.rir_max,'notes',e.notes)
  from public.gym_exercises e where e.routine_id=r.id and e.user_id=r.user_id;
  return sid;
end; $$;

create or replace function public.save_gym_session(p_session_id uuid,p_weights jsonb,p_finish boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare s public.gym_sessions; r public.gym_routines; item jsonb; w numeric;
begin
  select * into s from public.gym_sessions where id=p_session_id and user_id=auth.uid();
  select * into r from public.gym_routines where id=s.routine_id and user_id=auth.uid() for update;
  if r.id is null then raise exception 'Workout not found.'; end if;
  select * into s from public.gym_sessions where id=p_session_id and user_id=auth.uid() for update;
  if s.id is null then raise exception 'Workout not found.'; end if;
  if s.status='completed' then if p_finish then return; end if; raise exception 'Completed workouts cannot be edited.'; end if;
  if r.deleted_at is not null then raise exception 'Routine deleted.'; end if;
  if p_weights is null or jsonb_typeof(p_weights)<>'array' then raise exception 'Workout weights must be an array.'; end if;
  if exists(select 1 from jsonb_array_elements(p_weights) e group by e->>'exercise_id' having count(*)>1) then raise exception 'Duplicate exercise.'; end if;
  if p_finish and jsonb_array_length(p_weights)<>(select count(*) from public.gym_entries where session_id=s.id) then raise exception 'Submit every exercise before finishing.'; end if;
  for item in select * from jsonb_array_elements(p_weights) loop
    if not exists(select 1 from public.gym_entries where session_id=s.id and exercise_id=(item->>'exercise_id')::uuid) then raise exception 'Exercise not in this workout.'; end if;
    w:=(item->>'weight')::numeric;
    if w<0 or w>1000000 or w<>round(w,3) then raise exception 'Weight must be from 0 to 1000000 with at most three decimals.'; end if;
    update public.gym_entries set weight=w where session_id=s.id and exercise_id=(item->>'exercise_id')::uuid;
  end loop;
  if p_finish then update public.gym_sessions set status='completed',completed_at=now() where id=s.id; end if;
end; $$;

create index gym_entries_previous on public.gym_entries(user_id,exercise_id,session_id) where weight is not null;
create function public.previous_gym_weights(p_routine_id uuid) returns table(exercise_id uuid,weight numeric,unit text,completed_at timestamptz)
language sql security invoker set search_path='' as $$
  select e.id,h.weight,h.unit,h.completed_at from public.gym_exercises e
  cross join lateral (
    select w.weight,s.unit,s.completed_at from public.gym_entries w join public.gym_sessions s on s.id=w.session_id
    where w.user_id=auth.uid() and w.exercise_id=e.id and w.weight is not null and s.status='completed'
    order by s.completed_at desc,s.created_at desc,s.id desc,w.id desc limit 1
  ) h where e.routine_id=p_routine_id and e.user_id=auth.uid();
$$;
revoke all on function public.delete_gym_routine(uuid,boolean),public.list_gym_media_cleanup(text,integer),public.ack_gym_media_cleanup(text),public.gym_media_unreferenced(text),public.previous_gym_weights(uuid) from public,anon,authenticated;
grant execute on function public.delete_gym_routine(uuid,boolean),public.list_gym_media_cleanup(text,integer),public.ack_gym_media_cleanup(text),public.gym_media_unreferenced(text),public.previous_gym_weights(uuid) to authenticated;
-- Parent-first RPCs avoid child-row/parent-row inversion during deletion.
revoke insert,update,delete on public.gym_exercises from authenticated;
create function public.save_gym_exercise(p_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.gym_routines; e public.gym_exercises;
begin
  select * into r from public.gym_routines where id=(p_input->>'routine_id')::uuid and user_id=auth.uid() for update;
  if r.id is null or r.deleted_at is not null then raise exception 'Routine not available.'; end if;
  select * into e from public.gym_exercises where id=p_id for update;
  if e.id is not null and (e.user_id<>auth.uid() or e.routine_id<>r.id) then raise exception 'Exercise not found.'; end if;
  insert into public.gym_exercises(id,user_id,routine_id,name,position,sets,reps,rest_seconds,rir,rir_max,notes,media_path,media_mime)
  values(p_id,auth.uid(),r.id,p_input->>'name',(p_input->>'position')::integer,(p_input->>'sets')::integer,p_input->>'reps',(p_input->>'rest_seconds')::integer,(p_input->>'rir')::integer,(p_input->>'rir_max')::integer,p_input->>'notes',p_input->>'media_path',p_input->>'media_mime')
  on conflict(id) do update set name=excluded.name,position=excluded.position,sets=excluded.sets,reps=excluded.reps,rest_seconds=excluded.rest_seconds,rir=excluded.rir,rir_max=excluded.rir_max,notes=excluded.notes,media_path=excluded.media_path,media_mime=excluded.media_mime;
  return p_id;
end; $$;
create function public.remove_gym_exercise(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.gym_routines r join public.gym_exercises e on e.routine_id=r.id where e.id=p_id and r.user_id=auth.uid() for update of r;
  delete from public.gym_exercises where id=p_id and user_id=auth.uid();
end; $$;
revoke all on function public.save_gym_exercise(uuid,jsonb),public.remove_gym_exercise(uuid) from public,anon,authenticated;
grant execute on function public.save_gym_exercise(uuid,jsonb),public.remove_gym_exercise(uuid) to authenticated;
commit;
