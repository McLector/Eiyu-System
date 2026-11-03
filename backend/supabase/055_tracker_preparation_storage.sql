-- Local S02 only; not approved for deployment. Preserve existing histories.
-- Public reads stop preparing data; every preparation helper filters roots by
-- current tracker permission before it writes. Storage uploads bind the
-- owner, routine and current tracker tuple.
begin;

-- A root is processable when the account may write basic tracking and the
-- root is basic, or its optional purpose is currently granted. Absent
-- provenance means custom. The narrowing setting can only reduce processing.
create function private.tracker_root_permitted(p_user_id uuid,p_kind text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare a jsonb; k text;
begin
 a:=private.tracker_processing_access(p_user_id);
 if not (a->>'canWriteBasic')::boolean then return false; end if;
 select p.input_kind into k from private.tracker_input_provenance p
  where p.object_kind=p_kind and p.object_id=p_id and p.user_id=p_user_id;
 if k='basic' then return true; end if;
 return coalesce(pg_catalog.current_setting('eiyu.tracker_basic_only',true),'')<>'on'
  and (a->>'canWriteCustom')::boolean;
end;$$;
revoke all on function private.tracker_root_permitted(uuid,text,uuid) from public,anon,authenticated,service_role;
-- Retained definer bodies created by the migration owner call this helper.
grant execute on function private.tracker_root_permitted(uuid,text,uuid) to postgres;

-- Occurrence materialization (042 body) restricted to permitted roots.
create or replace function private.ensure_habit_occurrences_before_tracker_pause(p_through_date date)
returns void language plpgsql security definer set search_path='' as $$
declare
 v_user_id uuid:=auth.uid(); v_time_zone text; v_today date; v_through date;
begin
 if v_user_id is null then raise exception 'authentication required'; end if;
 select coalesce(time_zone,'UTC') into v_time_zone from public.profiles where user_id=v_user_id;
 if v_time_zone is null then raise exception 'profile not found for calling user'; end if;
 v_today:=(statement_timestamp() at time zone v_time_zone)::date;
 v_through:=least(p_through_date,v_today);
 insert into public.habit_occurrences(habit_id,user_id,occurrence_date,time_zone,day_ends_at)
 select h.id,h.user_id,d.day::date,v_time_zone,(((d.day::date+1)::timestamp) at time zone v_time_zone)
 from public.habits h
 cross join lateral generate_series(
  greatest(h.schedule_start_on,coalesce((select max(o.occurrence_date)+1 from public.habit_occurrences o where o.habit_id=h.id),h.schedule_start_on)),
  v_through,interval '1 day') as d(day)
 where h.user_id=v_user_id and not h.archived
  and private.tracker_root_permitted(h.user_id,'habit',h.id)
  and not exists(select 1 from public.habit_archive_intervals ai where ai.habit_id=h.id
   and d.day::date>=ai.archived_from and (ai.restored_on is null or d.day::date<ai.restored_on))
  and (
   (h.quest_type='one_time' and d.day::date=h.scheduled_date
    and not exists(select 1 from public.habit_completions c where c.habit_id=h.id))
   or (h.quest_type='habit' and extract(dow from d.day)::smallint=any(
    coalesce((select v.days from public.habit_schedule_versions v where v.habit_id=h.id and v.effective_from<=d.day::date
     order by v.effective_from desc limit 1),h.days)))
  )
 on conflict(habit_id,occurrence_date) do nothing;
end;$$;

-- One-root reconciliation keeps the 022 body behind a permission guard, so the
-- all-root loop, completion and recovery callers process permitted roots only.
alter function public.reconcile_one_habit_recovery(uuid,timestamptz) set schema private;
alter function private.reconcile_one_habit_recovery(uuid,timestamptz) rename to reconcile_one_before_tracker_filter;
revoke all on function private.reconcile_one_before_tracker_filter(uuid,timestamptz) from public,anon,authenticated,service_role;
create function public.reconcile_one_habit_recovery(p_habit_id uuid,p_now timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if private.tracker_root_permitted(auth.uid(),'habit',p_habit_id) then
  perform private.reconcile_one_before_tracker_filter(p_habit_id,p_now);
 end if;
end;$$;
revoke all on function public.reconcile_one_habit_recovery(uuid,timestamptz) from public,anon,authenticated,service_role;

-- Backlog rollover (038 body) moves permitted roots only.
create or replace function private.rollover_one_time_before_tracker_pause() returns void
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_time_zone text; v_today date; v_cutover date;
begin
 if v_user_id is null then raise exception 'authentication required'; end if;
 select coalesce(time_zone,'UTC') into v_time_zone from public.profiles where user_id=v_user_id;
 if v_time_zone is null then raise exception 'profile not found for calling user'; end if;
 v_today:=(statement_timestamp() at time zone v_time_zone)::date;
 select cutover into v_cutover from private.backlog_rollover_settings;
 perform public.ensure_habit_occurrences(v_today-1);
 update public.habits h
 set quest_type='backlog',scheduled_date=null,days='{}',target_count=null,easy_version=null,time_set=false,
  reminder_time=time '08:00',updated_at=statement_timestamp()
 where h.user_id=v_user_id and h.quest_type='one_time' and not h.archived and h.scheduled_date is not null
  and h.scheduled_date<v_today and h.scheduled_date>=v_cutover
  and private.tracker_root_permitted(h.user_id,'habit',h.id)
  and not exists(select 1 from public.habit_completions c where c.habit_id=h.id);
end;$$;

-- Public reads: no preparation, no materialization.
create or replace function public.get_habits_for_date(p_date date) returns setof public.habits
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_time_zone text; v_today date;
begin
 if v_user_id is null then raise exception 'authentication required'; end if;
 select coalesce(time_zone,'UTC') into v_time_zone from public.profiles where user_id=v_user_id;
 v_today:=(statement_timestamp() at time zone v_time_zone)::date;
 return query
  select h.* from public.habits h
  left join public.habit_occurrences o on o.habit_id=h.id and o.user_id=v_user_id and o.occurrence_date=p_date
  where h.user_id=v_user_id and not h.archived
   and ((o.habit_id is not null and p_date<=v_today)
    or (o.habit_id is null and p_date=v_today and h.quest_type='one_time'
     and (h.scheduled_date is null or h.scheduled_date>v_today)
     and not exists(select 1 from public.habit_completions c where c.habit_id=h.id)))
  order by h.reminder_time;
end;$$;
create or replace function public.get_open_habit_recoveries()
returns table(habit_id uuid,missed_on date,preserved_streak integer,opened_at timestamptz,deadline_at timestamptz,time_zone text)
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid();
begin
 if v_user_id is null then raise exception 'authentication required'; end if;
 return query
  select w.habit_id,w.missed_on,w.preserved_streak,w.opened_at,w.deadline_at,o.time_zone
  from public.habit_recovery_windows w
  join public.habit_occurrences o on o.habit_id=w.habit_id and o.occurrence_date=w.missed_on
  where w.user_id=v_user_id and w.status='open' order by w.opened_at;
end;$$;

-- Bulk reorders no longer rewrite omitted siblings that are paused.
create or replace function public.reorder_quests(p_quest_type text,p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid();
begin
 if v_user_id is null then raise exception 'authentication required'; end if;
 if p_quest_type is null or p_quest_type not in ('habit','one_time','backlog') then raise exception 'Unknown quest lane.'; end if;
 if p_ids is null or cardinality(p_ids)=0 or cardinality(p_ids)>1000
  or cardinality(p_ids)<>(select count(distinct i) from unnest(p_ids) i) then
  raise exception 'Quest order must list each quest once.';
 end if;
 perform 1 from public.habits h where h.user_id=v_user_id and h.quest_type=p_quest_type order by h.id for update;
 if (select count(*) from public.habits h where h.user_id=v_user_id and h.quest_type=p_quest_type and not h.archived and h.id=any(p_ids))
  <>cardinality(p_ids) then raise exception 'Quest order is out of date. Reload and try again.'; end if;
 with lane as (
  select h.id,row_number() over (order by h.position,h.id) as rn from public.habits h
  where h.user_id=v_user_id and h.quest_type=p_quest_type
 ),slots as (select l.rn,row_number() over (order by l.rn) as k from lane l where l.id=any(p_ids)),
 given as (select t.id,t.ord as k from unnest(p_ids) with ordinality t(id,ord)),
 placed as (select l.rn,coalesce(g.id,l.id) as id from lane l left join slots s on s.rn=l.rn left join given g on g.k=s.k)
 update public.habits h set position=p.rn-1 from placed p
 where h.id=p.id and h.user_id=v_user_id and h.position is distinct from p.rn-1
  and (h.id=any(p_ids) or private.tracker_root_permitted(v_user_id,'habit',h.id));
end;$$;
create or replace function public.reorder_long_quests(p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid();
begin
 if v_user_id is null then raise exception 'authentication required'; end if;
 if p_ids is null or cardinality(p_ids)=0 or cardinality(p_ids)>1000
  or cardinality(p_ids)<>(select count(distinct i) from unnest(p_ids) i) then
  raise exception 'Quest order must list each quest once.';
 end if;
 perform 1 from public.long_quests q where q.user_id=v_user_id order by q.id for update;
 if (select count(*) from public.long_quests q where q.user_id=v_user_id and q.id=any(p_ids))<>cardinality(p_ids) then
  raise exception 'Quest order is out of date. Reload and try again.';
 end if;
 with lane as (select q.id,row_number() over (order by q.position,q.id) as rn from public.long_quests q where q.user_id=v_user_id),
 slots as (select l.rn,row_number() over (order by l.rn) as k from lane l where l.id=any(p_ids)),
 given as (select t.id,t.ord as k from unnest(p_ids) with ordinality t(id,ord)),
 placed as (select l.rn,coalesce(g.id,l.id) as id from lane l left join slots s on s.rn=l.rn left join given g on g.k=s.k)
 update public.long_quests q set position=p.rn-1 from placed p
 where q.id=p.id and q.user_id=v_user_id and q.position is distinct from p.rn-1
  and (q.id=any(p_ids) or private.tracker_root_permitted(v_user_id,'chain',q.id));
end;$$;

-- Explicit-owner history snapshot (028 projection and keys, every source scoped).
create function private.tracker_history_snapshot(p_user_id uuid,p_start_date date,p_end_date date) returns jsonb
language sql stable security definer set search_path='' as $$
 with evidence as (
  select o.habit_id as source_habit_id,o.occurrence_date as historical_date,h.name as habit_name,h.stat,h.quest_type,
   true as scheduled,c.kind as completion_kind
  from public.habit_occurrences o
  join public.habits h on h.id=o.habit_id and h.user_id=p_user_id
  left join public.habit_completions c on c.habit_id=o.habit_id and c.user_id=p_user_id and c.completed_on=o.occurrence_date
  where o.user_id=p_user_id and o.occurrence_date>=p_start_date and o.occurrence_date<p_end_date
  union all
  select c.habit_id,c.completed_on,h.name,h.stat,h.quest_type,false,c.kind
  from public.habit_completions c
  join public.habits h on h.id=c.habit_id and h.user_id=p_user_id
  where c.user_id=p_user_id and c.completed_on>=p_start_date and c.completed_on<p_end_date
   and not exists(select 1 from public.habit_occurrences o where o.habit_id=c.habit_id and o.user_id=p_user_id and o.occurrence_date=c.completed_on)
  union all
  select dh.source_habit_id,dh.historical_date,dh.habit_name,dh.stat,dh.quest_type,dh.scheduled,dh.completion_kind
  from public.deleted_habit_history dh
  where dh.user_id=p_user_id and dh.historical_date>=p_start_date and dh.historical_date<p_end_date
 ),ordered as (
  select coalesce(jsonb_agg(to_jsonb(e) order by e.historical_date,e.source_habit_id),'[]'::jsonb) as rows from evidence e
 ),recurring_totals as (
  select stat,count(*) as completed_count from evidence where quest_type='habit' and completion_kind is not null group by stat
 )
 select jsonb_build_object('rows',ordered.rows,
  'habits',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'stat',h.stat) order by h.id)
   from public.habits h where h.user_id=p_user_id),'[]'::jsonb),
  'recurring_totals',coalesce((select jsonb_object_agg(stat,completed_count) from recurring_totals),'{}'::jsonb))
 from ordered;
$$;
revoke all on function private.tracker_history_snapshot(uuid,date,date) from public,anon,authenticated,service_role;
grant execute on function private.tracker_history_snapshot(uuid,date,date) to postgres;
create or replace function public.read_history_range(p_start_date date,p_end_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 return private.tracker_history_snapshot(auth.uid(),p_start_date,p_end_date);
end;$$;

-- Permission-aware preparation behind the gateway's prepare-day operation.
create function private.prepare_tracker_day(p_user_id uuid,p_include_protected boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; tz text; today date; protected boolean; basic_only_inputs boolean; weakest public.stat_key;
begin
 if p_user_id is distinct from auth.uid() then raise exception 'Account changed.' using errcode='42501'; end if;
 a:=private.tracker_processing_access(p_user_id);
 protected:=p_include_protected and (a->>'canWriteCustom')::boolean;
 perform pg_catalog.set_config('eiyu.tracker_basic_only',case when protected then 'off' else 'on' end,true);
 select coalesce(time_zone,'UTC') into tz from public.profiles where user_id=p_user_id;
 if tz is null then raise exception 'profile not found for calling user'; end if;
 today:=(statement_timestamp() at time zone tz)::date;
 perform public.ensure_habit_occurrences(today);
 perform public.reconcile_habit_recoveries();
 perform public.rollover_unfinished_one_time_quests();
 -- Weekly stats aggregate every contributor. Create the lazy row only when each
 -- contributor is attributable as basic or the protected purposes are current.
 basic_only_inputs:=not exists(select 1 from public.habits h where h.user_id=p_user_id and not exists(
   select 1 from private.tracker_input_provenance pv where pv.object_kind='habit' and pv.object_id=h.id and pv.user_id=p_user_id and pv.input_kind='basic'))
  and not exists(select 1 from public.deleted_habit_history d where d.user_id=p_user_id and not exists(
   select 1 from private.tracker_input_provenance pv where pv.object_kind='habit' and pv.object_id=d.source_habit_id and pv.user_id=p_user_id and pv.input_kind='basic'))
  and not exists(select 1 from public.long_quests q where q.user_id=p_user_id and not exists(
   select 1 from private.tracker_input_provenance pv where pv.object_kind='chain' and pv.object_id=q.id and pv.user_id=p_user_id and pv.input_kind='basic'));
 if protected or basic_only_inputs then
  select s into weakest from unnest(enum_range(null::public.stat_key)) s
   left join public.stats st on st.user_id=p_user_id and st.stat=s
   order by coalesce(st.xp,0),s::text limit 1;
  insert into public.weekly_quests(user_id,week_start,stat,target_count)
  values(p_user_id,date_trunc('week',today::timestamp)::date,weakest,5)
  on conflict(user_id,week_start) do nothing;
 end if;
 perform pg_catalog.set_config('eiyu.tracker_basic_only','off',true);
 return jsonb_build_object('basicPrepared',(a->>'canWriteBasic')::boolean,'protectedPrepared',protected,
  'accessChanged',not p_include_protected);
end;$$;
revoke all on function private.prepare_tracker_day(uuid,boolean) from public,anon,authenticated,service_role;

-- Uploads must name the owner, an owned live routine and the current tracker
-- tuple. Existing objects stay readable; a refusal is not proof of byte erasure.
create function public.gym_media_upload_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); parts text[]; a jsonb;
begin
 if uid is null or p_name is null then return false; end if;
 parts:=string_to_array(p_name,'/');
 if cardinality(parts)<>4 or parts[1]<>uid::text
  or parts[2]!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or parts[3]!~'^[0-9]{1,9}-[0-9]{1,9}-[0-9]{1,9}$'
  or parts[4]!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(gif|mp4)$' then return false; end if;
 a:=private.tracker_processing_access(uid);
 if not (a->>'canWriteFitness')::boolean then return false; end if;
 if parts[3]<>(a#>>'{revision,ageVersion}')||'-'||(a#>>'{revision,consentVersion}')||'-'||(a#>>'{revision,authorityVersion}') then return false; end if;
 return exists(select 1 from public.gym_routines r where r.id=parts[2]::uuid and r.user_id=uid and r.deleted_at is null);
end;$$;
revoke all on function public.gym_media_upload_allowed(text) from public,anon,authenticated,service_role;
grant execute on function public.gym_media_upload_allowed(text) to authenticated;
create policy gym_media_tracker_tuple_insert on storage.objects as restrictive for insert to authenticated
 with check (bucket_id<>'gym-exercise-media' or (select public.gym_media_upload_allowed(name)));
create policy gym_media_tracker_tuple_update on storage.objects as restrictive for update to authenticated
 using (true) with check (bucket_id<>'gym-exercise-media' or (select public.gym_media_upload_allowed(name)));

commit;
