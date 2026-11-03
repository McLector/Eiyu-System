-- Local S02 only; not approved for deployment. Preserve existing histories.
-- Owner decision 14: days inside a custom-tracker pause are not scheduled for
-- protected roots, so preparation after a regrant cannot record them as
-- missed. Basic roots are unaffected. The pause comes from the existing
-- consent events: a day is paused when the latest custom-tracker decision on
-- or before it is a withdrawal, or when no grant exists yet (legacy rollout).
begin;

create function private.custom_purpose_paused_on(p_user_id uuid,p_day date,p_time_zone text) returns boolean
language sql stable security definer set search_path='' as $$
 select not coalesce((
  select e.granted from private.processing_consent_events e
  where e.user_id=p_user_id and e.purpose='custom-tracker'
   and (e.changed_at at time zone p_time_zone)::date<=p_day
  order by e.changed_at desc,e.version desc,e.id desc limit 1),false);
$$;
revoke all on function private.custom_purpose_paused_on(uuid,date,text) from public,anon,authenticated,service_role;
-- The retained materializer is owned by the migration owner role.
grant execute on function private.custom_purpose_paused_on(uuid,date,text) to postgres;

-- Occurrence materialization (055) with paused days skipped for protected roots.
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
  and (exists(select 1 from private.tracker_input_provenance pv
        where pv.object_kind='habit' and pv.object_id=h.id and pv.user_id=h.user_id and pv.input_kind='basic')
   or not private.custom_purpose_paused_on(h.user_id,d.day::date,v_time_zone))
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

commit;
