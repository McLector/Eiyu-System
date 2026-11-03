-- Local S02 only; not approved for deployment. Preserve existing histories.
-- Birthday declarations remain trusted screening, not verified age/authority.
begin;

create function private.tracker_age_on(p_birth_date date,p_today date) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_birth_date <= (p_today-interval '12 years')::date,false);
$$;
create function private.tracker_writes_paused(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select not private.tracker_age_on(a.birth_date,
  (pg_catalog.statement_timestamp() at time zone 'Asia/Manila')::date)
  from private.account_age a where a.user_id=p_user_id),false);
$$;
-- Match the birthday setter's owner lock so a correction and a tracker write
-- cannot authorize against different declarations. Unknown legacy owners retain
-- tracker access; the existing separate adult AI rules remain unchanged.
create function private.tracker_writes_allowed(p_user_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_user_id is null then return false; end if;
 perform 1 from auth.users where id=p_user_id for share;
 if not found then return false; end if;
 return not private.tracker_writes_paused(p_user_id);
end;
$$;
revoke all on function private.tracker_age_on(date,date),private.tracker_writes_paused(uuid),private.tracker_writes_allowed(uuid) from public,anon,authenticated,service_role;

create function public.tracker_writes_allowed() returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 return private.tracker_writes_allowed(auth.uid());
end;
$$;
revoke all on function public.tracker_writes_allowed() from public,anon,authenticated,service_role;
grant execute on function public.tracker_writes_allowed() to authenticated;

alter function public.get_account_age() set schema private;
alter function private.get_account_age() rename to get_account_age_before_tracker_pause;
revoke all on function private.get_account_age_before_tracker_pause() from public,anon,authenticated,service_role;
create function public.get_account_age() returns jsonb
language sql stable security definer set search_path='' as $$
 select private.get_account_age_before_tracker_pause() || pg_catalog.jsonb_build_object(
  'trackerWritesPaused',private.tracker_writes_paused(auth.uid()));
$$;
revoke all on function public.get_account_age() from public,anon,authenticated,service_role;
grant execute on function public.get_account_age() to authenticated;

create function private.guard_tracker_writes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Operator Auth deletion/cascades and maintenance are separate from tracker
 -- submissions. Keep their existing privileged boundary; clients cannot supply
 -- this exception through editable metadata or a client-side flag.
 if pg_catalog.current_setting('role',true)='authenticated' then
  if (tg_op<>'INSERT' and not private.tracker_writes_allowed(old.user_id))
   or (tg_op<>'DELETE' and not private.tracker_writes_allowed(new.user_id)) then
   raise exception 'Tracker updates are paused for accounts declared under 12. You can read your history, correct your birthday in Profile, or contact privacy@eiyusystem.app.' using errcode='ET001';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
revoke all on function private.guard_tracker_writes() from public,anon,authenticated,service_role;
do $$declare table_name text;
begin
 foreach table_name in array array[
  'habits','habit_completions','stats','streaks','long_quests','long_quest_stages',
  'weekly_quests','habit_progress','habit_schedule_versions','habit_occurrences',
  'habit_recovery_windows','deleted_habit_history','habit_archive_intervals',
  'long_quest_rewards','gym_routines','gym_exercises','gym_sessions','gym_entries','gym_media_cleanup'
 ] loop
  execute pg_catalog.format('create trigger guard_tracker_writes before insert or update or delete on public.%I for each row execute function private.guard_tracker_writes()',table_name);
 end loop;
end$$;

-- These existing board/history preparation helpers must stop materializing new
-- data during the pause, while their callers can still read retained records.
alter function public.ensure_habit_occurrences(date) set schema private;
alter function private.ensure_habit_occurrences(date) rename to ensure_habit_occurrences_before_tracker_pause;
revoke all on function private.ensure_habit_occurrences_before_tracker_pause(date) from public,anon,authenticated,service_role;
create function public.ensure_habit_occurrences(p_through_date date) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if private.tracker_writes_allowed(auth.uid()) then
  perform private.ensure_habit_occurrences_before_tracker_pause(p_through_date);
 end if;
end;
$$;
alter function public.reconcile_habit_recoveries() set schema private;
alter function private.reconcile_habit_recoveries() rename to reconcile_habit_recoveries_before_tracker_pause;
revoke all on function private.reconcile_habit_recoveries_before_tracker_pause() from public,anon,authenticated,service_role;
create function public.reconcile_habit_recoveries() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if private.tracker_writes_allowed(auth.uid()) then
  return private.reconcile_habit_recoveries_before_tracker_pause();
 end if;
 return pg_catalog.jsonb_build_object('open_count',
  (select count(*) from public.habit_recovery_windows where user_id=auth.uid() and status='open'));
end;
$$;
alter function public.rollover_unfinished_one_time_quests() set schema private;
alter function private.rollover_unfinished_one_time_quests() rename to rollover_one_time_before_tracker_pause;
revoke all on function private.rollover_one_time_before_tracker_pause() from public,anon,authenticated,service_role;
create function public.rollover_unfinished_one_time_quests() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if private.tracker_writes_allowed(auth.uid()) then
  perform private.rollover_one_time_before_tracker_pause();
 end if;
end;
$$;
revoke all on function public.ensure_habit_occurrences(date),public.reconcile_habit_recoveries(),public.rollover_unfinished_one_time_quests() from public,anon,authenticated,service_role;
grant execute on function public.ensure_habit_occurrences(date),public.reconcile_habit_recoveries(),public.rollover_unfinished_one_time_quests() to authenticated;

-- Do not attach custom triggers to Supabase's managed Storage schema. These
-- restrictive policies compose with the existing owner/bucket policies.
create policy gym_media_tracker_pause_insert on storage.objects as restrictive for insert to authenticated
 with check ((select public.tracker_writes_allowed()));
create policy gym_media_tracker_pause_update on storage.objects as restrictive for update to authenticated
 using ((select public.tracker_writes_allowed())) with check ((select public.tracker_writes_allowed()));
create policy gym_media_tracker_pause_delete on storage.objects as restrictive for delete to authenticated
 using ((select public.tracker_writes_allowed()));

create function private.reject_initial_under12() returns trigger
language plpgsql security definer set search_path='' as $$
declare value text:=new.raw_user_meta_data->>'birth_date'; birthday date;
begin
 -- Keep the existing validation/unknown-auth-method contract in 047. This
 -- additional admission check acts only on a valid initial declaration.
 if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return new; end if;
 begin birthday:=value::date; exception when others then return new; end;
 if not pg_catalog.isfinite(birthday) or birthday<date '0001-01-01'
  or birthday>(pg_catalog.statement_timestamp() at time zone 'Asia/Manila')::date then return new; end if;
 if not private.tracker_age_on(birthday,(pg_catalog.statement_timestamp() at time zone 'Asia/Manila')::date) then
  raise exception 'New Eiyu accounts are for ages 12 and above.' using errcode='ET002';
 end if;
 return new;
end;
$$;
revoke all on function private.reject_initial_under12() from public,anon,authenticated,service_role;
create trigger reject_initial_under12 before insert on auth.users for each row execute function private.reject_initial_under12();

commit;
