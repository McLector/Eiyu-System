-- S03b phase 0, "open tracker". The age and permission layer of S02 was heavier than a habit tracker needs, and it
-- blocked people who already had quests: every quest from before 053 has no provenance row, so it counted as
-- "custom" and could not be completed or edited without a birthday plus the custom permission.
--
-- This migration makes custom quests, chains and Gym follow the basic write rule. The only thing that still stops
-- tracker writes is the under-12 pause (049), which phase 1 removes together with the birthday field.
--   1. private.tracker_processing_access reports canWriteCustom and canWriteFitness equal to canWriteBasic. Every
--      reader goes through it: the 054/057 gateway, get_tracker_targets, 055 preparation, the 055/058 Gym media
--      checks and the 056 debrief input.
--   2. private.custom_purpose_paused_on (059) now pauses a day only between go-live (when 054 revoked the old write
--      paths) and this migration (the unblock), and only for a person with no custom grant in force that day. Days
--      before go-live keep their pre-S02 behaviour; days from the unblock on are never paused. So nobody gets a miss
--      or a broken streak for a day they could not complete, and older gaps are not forgiven.
--   3. Retention is off: the withdrawal trigger is dropped, the job does nothing, pending removals are cancelled.
--      Records already removed stay recorded. The pg_cron job is unscheduled separately by the operator.
--
-- Apply note: go-live cannot be read from the database, so the operator passes it. Run the file in a session that
-- first did   set eiyu.go_live_at = '<timestamptz>';   An empty database (no users yet) needs nothing. With users and
-- no value the migration stops rather than guess. The unblock is recorded as the moment this file runs.
begin;

create table private.tracker_open_settings (
 singleton boolean primary key default true check (singleton),
 go_live_at timestamptz not null,
 unblocked_at timestamptz not null,
 check (go_live_at<=unblocked_at)
);
alter table private.tracker_open_settings enable row level security;
revoke all on private.tracker_open_settings from public,anon,authenticated,service_role;

do $$
declare v_now timestamptz:=pg_catalog.clock_timestamp(); v_text text:=nullif(pg_catalog.current_setting('eiyu.go_live_at',true),''); v_go timestamptz;
begin
 if v_text is not null then v_go:=v_text::timestamptz;
 elsif exists(select 1 from auth.users) then
  raise exception 'Set eiyu.go_live_at to the moment 054 went live before applying 065.' using errcode='22023';
 else v_go:=v_now; end if;
 insert into private.tracker_open_settings(go_live_at,unblocked_at) values(least(v_go,v_now),v_now);
end;
$$;

-- 1. Custom and fitness writes follow basic. The consent and authority fields stay reported as recorded.
create or replace function private.tracker_processing_access(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a private.account_age%rowtype; c private.processing_consent%rowtype;
 basic boolean; custom_grant boolean; fitness_grant boolean; custom_state text; fitness_state text;
begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
  raise exception 'authentication required' using errcode='42501';
 end if;
 select * into a from private.account_age where user_id=p_user_id;
 select * into c from private.processing_consent where user_id=p_user_id;
 basic:=not private.tracker_writes_paused(p_user_id);
 custom_grant:=coalesce(c.custom_granted and c.custom_notice='2026-10-23-custom-tracker-v1',false);
 fitness_grant:=coalesce(c.fitness_granted and c.fitness_notice='2026-10-23-fitness-tracking-v1',false);
 custom_state:=private.tracker_purpose_authority_state(p_user_id,'custom-tracker');
 fitness_state:=private.tracker_purpose_authority_state(p_user_id,'fitness-tracking');
 return jsonb_build_object('contractVersion',1,'revision',jsonb_build_object('userId',p_user_id,
  'ageVersion',coalesce(a.version,0),'consentVersion',coalesce(c.version,0),
  'authorityVersion',private.processing_authority_version(p_user_id)),
  'canWriteBasic',basic,'customConsent',custom_grant,'fitnessConsent',fitness_grant,
  'customAuthorityState',custom_state,'fitnessAuthorityState',fitness_state,
  'canWriteCustom',basic,'canWriteFitness',basic);
end;$$;

-- 2. The pause window.
create or replace function private.custom_purpose_paused_on(p_user_id uuid,p_day date,p_time_zone text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((
  select p_day>=(s.go_live_at at time zone p_time_zone)::date
   and p_day<(s.unblocked_at at time zone p_time_zone)::date
   and not coalesce((
    select e.granted from private.processing_consent_events e
    where e.user_id=p_user_id and e.purpose='custom-tracker'
     and (e.changed_at at time zone p_time_zone)::date<=p_day
    order by e.changed_at desc,e.version desc,e.id desc limit 1),false)
  from private.tracker_open_settings s),false);
$$;

-- 3. Retention off. The trigger function stays as a no-op so nothing that names it breaks.
drop trigger if exists track_tracker_retention on private.processing_consent_events;
create or replace function private.track_tracker_retention() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 return null;
end;$$;
create or replace function private.run_tracker_retention(p_now timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_now is null then raise exception 'A clock is required.' using errcode='22023'; end if;
 return jsonb_build_object('reminded',0,'removed',0);
end;$$;
delete from private.tracker_retention_state where removed_at is null;

-- Export inventory (052/056/060/061/062 pattern): the settings are operational, not the owner's data.
alter function private.owner_export_manifest() rename to owner_export_manifest_before_open_tracker;
create function private.owner_export_manifest() returns jsonb
language sql immutable set search_path='' as $$
 with base as (select private.owner_export_manifest_before_open_tracker() m)
 select jsonb_build_object(
  'tables',(select jsonb_agg(e order by ord) from base,jsonb_array_elements(base.m->'tables') with ordinality t(e,ord))
   ||'[{"table":"private.tracker_open_settings","export":[],"exclude":["singleton","go_live_at","unblocked_at"],"scope":"global"}]'::jsonb,
  'foreignKeys',(select base.m->'foreignKeys' from base));
$$;
revoke all on function private.owner_export_manifest_before_open_tracker(),private.owner_export_manifest() from public,anon,authenticated,service_role;
alter function private.owner_export_manifest_before_open_tracker() owner to postgres;
alter function private.owner_export_manifest() owner to postgres;

commit;
