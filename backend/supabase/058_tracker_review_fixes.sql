-- Local S02 only; not approved for deployment. Preserve existing histories.
-- Review fixes for 053-057: an ID that still has retained history cannot be
-- reused as a new root, media attachments are bound to the owner, routine and
-- current tracker tuple, and clients hold no TRUNCATE on tracker tables.
begin;

-- Roots deleted before 053 have no provenance, but their history is kept under
-- the same ID. Reusing that ID would make the old history look basic, so a
-- client-path insert refuses it for any owner. Operator paths are unchanged.
create function private.guard_tracker_root_reuse() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if pg_catalog.current_setting('role',true)='authenticated' then
  if tg_table_name='habits' and exists(select 1 from public.deleted_habit_history d where d.source_habit_id=new.id) then
   raise exception 'Tracker target unavailable.' using errcode='42501';
  end if;
  if tg_table_name='long_quests' and (exists(select 1 from public.long_quest_rewards r where r.quest_id=new.id)
   or exists(select 1 from private.long_quest_definition_receipts d where d.quest_id=new.id)) then
   raise exception 'Tracker target unavailable.' using errcode='42501';
  end if;
 end if;
 return new;
end;$$;
revoke all on function private.guard_tracker_root_reuse() from public,anon,authenticated,service_role;
create trigger guard_tracker_root_reuse before insert on public.habits for each row execute function private.guard_tracker_root_reuse();
create trigger guard_tracker_root_reuse before insert on public.long_quests for each row execute function private.guard_tracker_root_reuse();

-- A new or changed attachment must name an uploaded object in this owner's
-- routine folder under the current tracker tuple, with fitness permission.
-- An unchanged existing attachment (including a legacy path) stays readable.
create function private.gym_media_attach_allowed(p_user_id uuid,p_routine_id uuid,p_path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare parts text[]; a jsonb;
begin
 if p_user_id is null or p_routine_id is null or p_path is null then return false; end if;
 parts:=string_to_array(p_path,'/');
 if cardinality(parts)<>4 or parts[1]<>p_user_id::text or parts[2]<>p_routine_id::text
  or parts[4]!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(gif|mp4)$' then return false; end if;
 a:=private.tracker_processing_access(p_user_id);
 if not (a->>'canWriteFitness')::boolean then return false; end if;
 if parts[3]<>(a#>>'{revision,ageVersion}')||'-'||(a#>>'{revision,consentVersion}')||'-'||(a#>>'{revision,authorityVersion}') then return false; end if;
 return exists(select 1 from storage.objects o where o.bucket_id='gym-exercise-media' and o.name=p_path);
end;$$;
revoke all on function private.gym_media_attach_allowed(uuid,uuid,text) from public,anon,authenticated,service_role;
create function private.guard_gym_media_attach() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if pg_catalog.current_setting('role',true)='authenticated' and new.media_path is not null
  and (case when tg_op='INSERT'
   -- save_gym_exercise upserts: the INSERT pass of an edit that keeps the same path is not a new attachment;
   -- a changed path is checked again on the conflict's UPDATE pass.
   then not exists(select 1 from public.gym_exercises e where e.id=new.id and e.media_path=new.media_path)
   else new.media_path is distinct from old.media_path end)
  and not private.gym_media_attach_allowed(new.user_id,new.routine_id,new.media_path) then
  raise exception 'Tracker media unavailable.' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function private.guard_gym_media_attach() from public,anon,authenticated,service_role;
create trigger guard_gym_media_attach before insert or update of media_path on public.gym_exercises
 for each row execute function private.guard_gym_media_attach();

-- 054 revoked INSERT/UPDATE/DELETE; TRUNCATE was never part of the client contract.
revoke truncate on public.habits,public.habit_completions,public.stats,public.streaks,public.long_quests,public.long_quest_stages,
 public.weekly_quests,public.habit_progress,public.habit_schedule_versions,public.habit_occurrences,public.habit_recovery_windows,
 public.deleted_habit_history,public.habit_archive_intervals,public.long_quest_rewards,public.gym_routines,public.gym_exercises,
 public.gym_sessions,public.gym_entries,public.gym_media_cleanup from public,anon,authenticated;

commit;
