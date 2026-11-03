-- Local S02 only; not approved for deployment. Automated retention (decision 5B).
-- After a person fully withdraws custom-tracker or fitness permission their
-- records stay read-only 30 days (reminder due on day 23), then
-- private.run_tracker_retention removes only that purpose's protected records,
-- within the operating runbook scope (section 5). Consent-evidence rows are not
-- touched. Scheduling is a separate, local-only step (pg_cron is not enabled on
-- the live project; enabling it is a release step). Local scheduling used:
--   create extension if not exists pg_cron;
--   select cron.schedule('tracker-retention','15 18 * * *',
--     'select private.run_tracker_retention(statement_timestamp())');
-- "Fully withdrawn" means consent was granted and is now withdrawn. A dispute
-- pause (authority revoked) is not a withdrawal: it keeps history indefinitely.
begin;

create table private.tracker_retention_state (
 user_id uuid not null references auth.users(id) on delete cascade,
 purpose text not null check(purpose in ('custom-tracker','fitness-tracking')),
 withdrawn_at timestamptz not null,
 reminder_due_on date not null,
 removal_due_on date not null,
 reminded_at timestamptz,
 removed_at timestamptz,
 primary key(user_id,purpose),
 check(removal_due_on>=reminder_due_on)
);
create index tracker_retention_due on private.tracker_retention_state(removal_due_on) where removed_at is null;
alter table private.tracker_retention_state enable row level security;
revoke all on private.tracker_retention_state from public,anon,authenticated,service_role;

-- Maintained from the consent record, which every consent change writes in the
-- same transaction (the consent setter included).
create function private.track_tracker_retention() returns trigger
language plpgsql security definer set search_path='' as $$
declare was_granted boolean; d date;
begin
 if new.purpose not in ('custom-tracker','fitness-tracking') then return null; end if;
 if new.granted then
  -- A regrant before removal cancels it. A completed removal row stays as a record.
  delete from private.tracker_retention_state where user_id=new.user_id and purpose=new.purpose and removed_at is null;
  return null;
 end if;
 select e.granted into was_granted from private.processing_consent_events e
  where e.user_id=new.user_id and e.purpose=new.purpose and e.version<new.version order by e.version desc limit 1;
 if was_granted is true then
  d:=(new.changed_at at time zone 'Asia/Manila')::date;
  insert into private.tracker_retention_state(user_id,purpose,withdrawn_at,reminder_due_on,removal_due_on)
   values(new.user_id,new.purpose,new.changed_at,d+23,d+30)
   on conflict(user_id,purpose) do update set withdrawn_at=excluded.withdrawn_at,reminder_due_on=excluded.reminder_due_on,
    removal_due_on=excluded.removal_due_on,reminded_at=null,removed_at=null;
 end if;
 return null;
end;$$;
revoke all on function private.track_tracker_retention() from public,anon,authenticated,service_role;
create trigger track_tracker_retention after insert on private.processing_consent_events
 for each row execute function private.track_tracker_retention();

-- Runbook section 5 scope, narrowed to explicit provenance: roots classified
-- 'custom' only (legacy roots without provenance are left for a manual review).
-- Storage files are queued for the existing cleanup list, never deleted here.
create function private.remove_tracker_purpose_records(p_user_id uuid,p_purpose text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_purpose='custom-tracker' then
  delete from public.habits h where h.user_id=p_user_id and exists(select 1 from private.tracker_input_provenance p
   where p.object_kind='habit' and p.object_id=h.id and p.user_id=p_user_id and p.input_kind='custom');
  delete from public.deleted_habit_history d where d.user_id=p_user_id and exists(select 1 from private.tracker_input_provenance p
   where p.object_kind='habit' and p.object_id=d.source_habit_id and p.user_id=p_user_id and p.input_kind='custom');
  delete from public.long_quests q where q.user_id=p_user_id and exists(select 1 from private.tracker_input_provenance p
   where p.object_kind='chain' and p.object_id=q.id and p.user_id=p_user_id and p.input_kind='custom');
  delete from private.long_quest_definition_receipts r where r.user_id=p_user_id and exists(select 1 from private.tracker_input_provenance p
   where p.object_kind='chain' and p.object_id=r.quest_id and p.user_id=p_user_id and p.input_kind='custom');
 elsif p_purpose='fitness-tracking' then
  delete from public.gym_entries where user_id=p_user_id;
  delete from public.gym_sessions where user_id=p_user_id;
  delete from public.gym_exercises where user_id=p_user_id;
  delete from public.gym_routines where user_id=p_user_id;
  insert into public.gym_media_cleanup(user_id,path)
   select p_user_id,o.name from storage.objects o where o.bucket_id='gym-exercise-media' and starts_with(o.name,p_user_id::text||'/')
   on conflict do nothing;
 else
  raise exception 'Invalid retention purpose.' using errcode='22023';
 end if;
end;$$;
revoke all on function private.remove_tracker_purpose_records(uuid,text) from public,anon,authenticated,service_role;

create function private.run_tracker_retention(p_now timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare today date; r record; s private.tracker_retention_state%rowtype; c private.processing_consent%rowtype;
 permitted boolean; reminded integer:=0; removed integer:=0;
begin
 if p_now is null then raise exception 'A clock is required.' using errcode='22023'; end if;
 today:=(p_now at time zone 'Asia/Manila')::date;
 for r in select t.user_id,t.purpose from private.tracker_retention_state t
  where t.removed_at is null and (t.removal_due_on<=today or (t.reminder_due_on<=today and t.reminded_at is null))
  order by t.user_id,t.purpose loop
  -- Same owner lock as the consent setter: a regrant and the removal serialize here.
  perform 1 from auth.users where id=r.user_id for update;
  if not found then continue; end if;
  select * into s from private.tracker_retention_state where user_id=r.user_id and purpose=r.purpose for update;
  if not found or s.removed_at is not null then continue; end if;
  select * into c from private.processing_consent where user_id=r.user_id;
  permitted:=coalesce(case r.purpose
   when 'custom-tracker' then c.custom_granted and c.custom_notice='2026-10-23-custom-tracker-v1'
   else c.fitness_granted and c.fitness_notice='2026-10-23-fitness-tracking-v1' end,false);
  if permitted then
   delete from private.tracker_retention_state where user_id=r.user_id and purpose=r.purpose;
  elsif today>=s.removal_due_on then
   perform private.remove_tracker_purpose_records(r.user_id,r.purpose);
   update private.tracker_retention_state set removed_at=p_now where user_id=r.user_id and purpose=r.purpose;
   removed:=removed+1;
  elsif today>=s.reminder_due_on and s.reminded_at is null then
   update private.tracker_retention_state set reminded_at=p_now where user_id=r.user_id and purpose=r.purpose;
   reminded:=reminded+1;
  end if;
 end loop;
 return jsonb_build_object('reminded',reminded,'removed',removed);
end;$$;
revoke all on function private.run_tracker_retention(timestamptz) from public,anon,authenticated,service_role;

create function public.get_tracker_retention_notice() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('purpose',t.purpose,'reminderDueOn',to_char(t.reminder_due_on,'YYYY-MM-DD'),
   'removalDueOn',to_char(t.removal_due_on,'YYYY-MM-DD'),'reminded',t.reminded_at is not null) order by t.purpose)
  from private.tracker_retention_state t where t.user_id=uid and t.removed_at is null),'[]'::jsonb);
end;$$;
revoke all on function public.get_tracker_retention_notice() from public,anon,authenticated,service_role;
grant execute on function public.get_tracker_retention_notice() to authenticated;

create function public.operator_list_retention() returns jsonb
language plpgsql security definer set search_path='' as $$
declare op uuid:=private.require_operator(); result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('email',q.email,'purpose',q.purpose,'withdrawnAt',q.withdrawn_at,
  'reminderDueOn',to_char(q.reminder_due_on,'YYYY-MM-DD'),'removalDueOn',to_char(q.removal_due_on,'YYYY-MM-DD'),
  'status',case when q.removed_at is not null then 'removed' when q.reminded_at is not null then 'reminded' else 'pending' end)
  order by q.removal_due_on,q.email,q.purpose),'[]'::jsonb) into result
 from (select u.email::text email,t.purpose,t.withdrawn_at,t.reminder_due_on,t.removal_due_on,
   t.reminded_at,t.removed_at from private.tracker_retention_state t join auth.users u on u.id=t.user_id
   order by t.removal_due_on,u.email,t.purpose limit 200) q;
 perform private.write_operator_audit(op,'list-retention',null,null,null);
 return result;
end;$$;
revoke all on function public.operator_list_retention() from public,anon,authenticated,service_role;
grant execute on function public.operator_list_retention() to authenticated;

-- Export inventory (052/056/060 pattern): the owner's own retention dates.
alter function private.owner_export_manifest() rename to owner_export_manifest_before_retention;
create function private.owner_export_manifest() returns jsonb
language sql immutable set search_path='' as $$
 with base as (select private.owner_export_manifest_before_retention() m)
 select jsonb_build_object(
  'tables',(select jsonb_agg(e order by ord) from base,jsonb_array_elements(base.m->'tables') with ordinality t(e,ord))
   ||'[{"table":"private.tracker_retention_state","export":["user_id","purpose","withdrawn_at","reminder_due_on","removal_due_on","reminded_at","removed_at"],"exclude":[],"scope":"owner"}]'::jsonb,
  'foreignKeys',(select jsonb_agg(e order by e->>'source',e->>'definition')
    from (select jsonb_array_elements(base.m->'foreignKeys') e from base
     union all select x from jsonb_array_elements('[{"source":"private.tracker_retention_state","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"}]'::jsonb) x) f));
$$;
revoke all on function private.owner_export_manifest_before_retention(),private.owner_export_manifest() from public,anon,authenticated,service_role;
alter function private.owner_export_manifest_before_retention() owner to postgres;
alter function private.owner_export_manifest() owner to postgres;

commit;
