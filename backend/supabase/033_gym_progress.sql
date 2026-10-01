begin;
create table public.gym_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 80),
  unit text not null default 'kg' check(unit in ('kg','lb')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique(id,user_id)
);
create index gym_routines_owner on public.gym_routines(user_id,created_at);
create table public.gym_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 80),
  position integer not null default 0 check(position>=0),
  sets integer not null check(sets between 1 and 99),
  reps text not null check(reps ~ '^[1-9][0-9]{0,3}(-[1-9][0-9]{0,3})?$'),
  rest_seconds integer not null check(rest_seconds between 0 and 86400),
  rir integer not null check(rir between 0 and 10),
  notes text not null default '' check(length(notes)<=2000),
  media_path text check(media_path is null or starts_with(media_path,user_id::text||'/')),
  media_mime text check(media_mime in ('image/gif','video/mp4')),
  foreign key(routine_id,user_id) references public.gym_routines(id,user_id),
  check(media_path is null = (media_mime is null)),
  check(split_part(reps,'-',1)::integer <= coalesce(nullif(split_part(reps,'-',2),'')::integer,split_part(reps,'-',1)::integer))
);
create index gym_exercises_routine on public.gym_exercises(user_id,routine_id,position,id);
create table public.gym_sessions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_name text not null,
  unit text not null check(unit in ('kg','lb')),
  status text not null default 'draft' check(status in ('draft','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key(routine_id,user_id) references public.gym_routines(id,user_id),
  unique(id,user_id),
  check((status='completed')=(completed_at is not null))
);
create unique index gym_one_draft on public.gym_sessions(user_id,routine_id) where status='draft';
create index gym_sessions_history on public.gym_sessions(user_id,routine_id,completed_at desc);
create table public.gym_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null,
  position integer not null,
  prescription jsonb not null check(jsonb_typeof(prescription)='object'),
  weight numeric(10,3) check(weight between 0 and 1000000),
  foreign key(session_id,user_id) references public.gym_sessions(id,user_id) on delete cascade,
  unique(session_id,exercise_id)
);
create index gym_entries_owner_session on public.gym_entries(user_id,session_id,position);

alter table public.gym_routines enable row level security;
alter table public.gym_exercises enable row level security;
alter table public.gym_sessions enable row level security;
alter table public.gym_entries enable row level security;
revoke all on public.gym_routines,public.gym_exercises,public.gym_sessions,public.gym_entries from public,anon,authenticated;
grant select,insert,update on public.gym_routines to authenticated;
grant select,insert,update,delete on public.gym_exercises to authenticated;
grant select on public.gym_sessions,public.gym_entries to authenticated;
create policy gym_routines_own on public.gym_routines for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy gym_exercises_own on public.gym_exercises for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy gym_sessions_read on public.gym_sessions for select to authenticated using((select auth.uid())=user_id);
create policy gym_entries_read on public.gym_entries for select to authenticated using((select auth.uid())=user_id);

create function public.start_gym_session(p_routine_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.gym_routines; sid uuid;
begin
  select * into r from public.gym_routines where id=p_routine_id and user_id=auth.uid() for update;
  if r.id is null or r.archived then raise exception 'Routine not available.'; end if;
  select id into sid from public.gym_sessions where routine_id=r.id and user_id=r.user_id and status='draft';
  if sid is not null then return sid; end if;
  if not exists(select 1 from public.gym_exercises where routine_id=r.id) then raise exception 'Add an exercise before starting a workout.'; end if;
  insert into public.gym_sessions(routine_id,user_id,routine_name,unit) values(r.id,r.user_id,r.name,r.unit) returning id into sid;
  insert into public.gym_entries(session_id,user_id,exercise_id,position,prescription)
    select sid,r.user_id,e.id,e.position,jsonb_build_object('name',e.name,'sets',e.sets,'reps',e.reps,'rest_seconds',e.rest_seconds,'rir',e.rir,'notes',e.notes)
    from public.gym_exercises e where e.routine_id=r.id and e.user_id=r.user_id;
  return sid;
end; $$;
create function public.save_gym_session(p_session_id uuid,p_weights jsonb,p_finish boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare s public.gym_sessions; item jsonb;
begin
  select * into s from public.gym_sessions where id=p_session_id and user_id=auth.uid() for update;
  if s.id is null then raise exception 'Workout not found.'; end if;
  if s.status='completed' then
    if p_finish then return; end if;
    raise exception 'Completed workouts cannot be edited.';
  end if;
  if p_weights is null or jsonb_typeof(p_weights)<>'array' then raise exception 'Workout weights must be an array.'; end if;
  if exists(select 1 from jsonb_array_elements(p_weights) e group by e->>'exercise_id' having count(*)>1) then raise exception 'Duplicate exercise.'; end if;
  for item in select * from jsonb_array_elements(p_weights) loop
    if not exists(select 1 from public.gym_entries where session_id=s.id and exercise_id=(item->>'exercise_id')::uuid) then raise exception 'Exercise not in this workout.'; end if;
    update public.gym_entries set weight=(item->>'weight')::numeric where session_id=s.id and exercise_id=(item->>'exercise_id')::uuid;
  end loop;
  if p_finish then update public.gym_sessions set status='completed',completed_at=now() where id=s.id; end if;
end; $$;
create function public.discard_gym_session(p_session_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.gym_sessions;
begin
  select * into s from public.gym_sessions where id=p_session_id and user_id=auth.uid() for update;
  if s.id is null then raise exception 'Workout not found.'; end if;
  if s.status<>'draft' then raise exception 'Completed workouts cannot be discarded.'; end if;
  delete from public.gym_sessions where id=s.id;
end; $$;
revoke all on function public.start_gym_session(uuid),public.save_gym_session(uuid,jsonb,boolean),public.discard_gym_session(uuid) from public,anon,authenticated;
grant execute on function public.start_gym_session(uuid),public.save_gym_session(uuid,jsonb,boolean),public.discard_gym_session(uuid) to authenticated;
create function public.reorder_gym_exercises(p_routine_id uuid,p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.gym_routines where id=p_routine_id and user_id=auth.uid() for update;
  if not found then raise exception 'Routine not available.'; end if;
  if p_ids is null or cardinality(p_ids)<>(select count(*) from public.gym_exercises where routine_id=p_routine_id)
     or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id)
     or exists(select 1 from unnest(p_ids) id where not exists(select 1 from public.gym_exercises e where e.id=id and e.routine_id=p_routine_id and e.user_id=auth.uid()))
  then raise exception 'Exercise order must contain every routine exercise once.'; end if;
  update public.gym_exercises e set position=i.ord-1 from unnest(p_ids) with ordinality i(id,ord) where e.id=i.id and e.routine_id=p_routine_id;
end; $$;
revoke all on function public.reorder_gym_exercises(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.reorder_gym_exercises(uuid,uuid[]) to authenticated;
commit;
