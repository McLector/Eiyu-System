-- Local-only S02 draft. Apply only with the complete reviewed053–056 bundle.
-- No consent/authority backfill, hosted change, inference or erasure authorized.
begin;

alter table private.processing_consent
 add column custom_granted boolean not null default false,
 add column custom_notice text,
 add column fitness_granted boolean not null default false,
 add column fitness_notice text;
alter table private.processing_consent_events drop constraint processing_consent_events_purpose_check;
alter table private.processing_consent_events add constraint processing_consent_events_purpose_check
 check(purpose in ('age-screening','weekly-debrief','custom-tracker','fitness-tracking'));

create table private.tracker_purpose_authority (
 user_id uuid not null references auth.users(id) on delete cascade,
 purpose text not null check(purpose in ('custom-tracker','fitness-tracking')),
 state text not null check(state in ('not-required','pending','approved','revoked')),
 age_version integer not null check(age_version>=0),
 version integer not null default 1 check(version>0),
 review_reference uuid not null,
 changed_at timestamptz not null default statement_timestamp(),
 primary key(user_id,purpose)
);
create table private.tracker_input_provenance (
 object_kind text not null check(object_kind in ('habit','chain')),
 object_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 input_kind text not null check(input_kind in ('basic','custom')),
 ordinal integer not null check(ordinal>0),
 next_stage_ordinal integer not null default 1 check(next_stage_ordinal>0),
 primary key(object_kind,object_id), unique(user_id,object_kind,ordinal)
);
-- No live-root FK: history/receipt classification survives root deletion.
alter table private.tracker_purpose_authority enable row level security;
alter table private.tracker_input_provenance enable row level security;
revoke all on private.tracker_purpose_authority,private.tracker_input_provenance from public,anon,authenticated,service_role;

create function private.preserve_processing_authority_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  if exists(select 1 from auth.users where id=old.user_id) then
   raise exception 'Processing revision must be retained.' using errcode='22023';
  end if;
  return old;
 end if;
 if new.user_id is distinct from old.user_id or new.version<old.version then
  raise exception 'Processing revision cannot decrease.' using errcode='22023';
 end if;
 return new;
end;$$;
revoke all on function private.preserve_processing_authority_revision() from public,anon,authenticated,service_role;
create trigger preserve_processing_authority_revision before update or delete on private.processing_authority
 for each row execute function private.preserve_processing_authority_revision();
create trigger preserve_tracker_authority_revision before update or delete on private.tracker_purpose_authority
 for each row execute function private.preserve_processing_authority_revision();

create function private.processing_authority_version(p_user_id uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare v bigint;
begin
 select coalesce((select version::bigint from private.processing_authority where user_id=p_user_id),0)
  +coalesce((select sum(version::bigint) from private.tracker_purpose_authority where user_id=p_user_id),0) into v;
 if v>2147483647 then raise exception 'Processing revision exhausted.' using errcode='22003'; end if;
 return v::integer;
end;$$;
revoke all on function private.processing_authority_version(uuid) from public,anon,authenticated,service_role;

create function private.tracker_purpose_authority_state(p_user_id uuid,p_purpose text) returns text
language plpgsql stable security definer set search_path='' as $$
declare g private.tracker_purpose_authority%rowtype; age_version integer;
begin
 select * into g from private.tracker_purpose_authority where user_id=p_user_id and purpose=p_purpose;
 select coalesce((select version from private.account_age where user_id=p_user_id),0) into age_version;
 if g.user_id is null then return case when private.adult_declared(p_user_id) then 'not-required' else 'pending' end; end if;
 if g.state='revoked' then return 'revoked'; end if;
 if g.age_version<>age_version then return 'pending'; end if;
 return g.state;
end;$$;
revoke all on function private.tracker_purpose_authority_state(uuid,text) from public,anon,authenticated,service_role;

create function private.tracker_processing_access(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a private.account_age%rowtype; c private.processing_consent%rowtype;
 basic boolean; eligible boolean; custom_grant boolean; fitness_grant boolean; custom_state text; fitness_state text;
begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
  raise exception 'authentication required' using errcode='42501';
 end if;
 select * into a from private.account_age where user_id=p_user_id;
 select * into c from private.processing_consent where user_id=p_user_id;
 basic:=not private.tracker_writes_paused(p_user_id);
 eligible:=coalesce(a.birth_date is not null and a.pending_birth_date is null
  and private.tracker_age_on(a.birth_date,(statement_timestamp() at time zone 'Asia/Manila')::date),false);
 custom_grant:=coalesce(c.custom_granted and c.custom_notice='2026-10-23-custom-tracker-v1',false);
 fitness_grant:=coalesce(c.fitness_granted and c.fitness_notice='2026-10-23-fitness-tracking-v1',false);
 custom_state:=private.tracker_purpose_authority_state(p_user_id,'custom-tracker');
 fitness_state:=private.tracker_purpose_authority_state(p_user_id,'fitness-tracking');
 return jsonb_build_object('contractVersion',1,'revision',jsonb_build_object('userId',p_user_id,
  'ageVersion',coalesce(a.version,0),'consentVersion',coalesce(c.version,0),
  'authorityVersion',private.processing_authority_version(p_user_id)),
  'canWriteBasic',basic,'customConsent',custom_grant,'fitnessConsent',fitness_grant,
  'customAuthorityState',custom_state,'fitnessAuthorityState',fitness_state,
  'canWriteCustom',basic and eligible and custom_grant and custom_state in ('not-required','approved'),
  'canWriteFitness',basic and eligible and fitness_grant and fitness_state in ('not-required','approved'));
end;$$;
revoke all on function private.tracker_processing_access(uuid) from public,anon,authenticated,service_role;

create function public.get_tracker_processing_access() returns jsonb
language sql stable security definer set search_path='' as $$select private.tracker_processing_access(auth.uid());$$;
revoke all on function public.get_tracker_processing_access() from public,anon,authenticated,service_role;
grant execute on function public.get_tracker_processing_access() to authenticated;

create function private.validate_tracker_revision(p_expected jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_expected) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_expected))<>4
  or not(p_expected ?& array['userId','ageVersion','consentVersion','authorityVersion'])
  or jsonb_typeof(p_expected->'userId') is distinct from 'string'
  or (p_expected->>'userId')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  or exists(select 1 from jsonb_each(p_expected) e where e.key<>'userId'
   and (jsonb_typeof(e.value)<>'number' or e.value::text!~'^(0|[1-9][0-9]*)$'
    or length(e.value::text)>10)) then
  raise exception 'Invalid tracker revision.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_each(p_expected) e where e.key<>'userId' and e.value::text::bigint>2147483647) then
  raise exception 'Invalid tracker revision.' using errcode='22023';
 end if;
end;$$;
revoke all on function private.validate_tracker_revision(jsonb) from public,anon,authenticated,service_role;

create function public.set_tracker_processing_consent(p_purpose text,p_granted boolean,p_notice_version text,p_expected jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s jsonb; notice text; c private.processing_consent%rowtype; changed boolean; next_version integer;
begin
 perform private.validate_tracker_revision(p_expected);
 if uid is null or uid is distinct from (p_expected->>'userId')::uuid then raise exception 'account changed' using errcode='42501'; end if;
 notice:=case p_purpose when 'custom-tracker' then '2026-10-23-custom-tracker-v1' when 'fitness-tracking' then '2026-10-23-fitness-tracking-v1' end;
 if notice is null or p_notice_version is distinct from notice or p_granted is null then
  raise exception 'Review the current notice before changing this permission.' using errcode='22023';
 end if;
 perform 1 from auth.users where id=uid for update;
 s:=private.tracker_processing_access(uid);
 if s->'revision'<>p_expected then raise exception 'Tracker access changed.' using errcode='ET003'; end if;
 select * into c from private.processing_consent where user_id=uid;
 changed:=case p_purpose when 'custom-tracker' then c.custom_granted is distinct from p_granted or c.custom_notice is distinct from notice
  else c.fitness_granted is distinct from p_granted or c.fitness_notice is distinct from notice end;
 if changed then
  next_version:=coalesce(c.version,0)+1;
  insert into private.processing_consent(user_id) values(uid) on conflict(user_id) do nothing;
  if p_purpose='custom-tracker' then
   update private.processing_consent set custom_granted=p_granted,custom_notice=notice,version=next_version,changed_at=statement_timestamp() where user_id=uid;
  else
   update private.processing_consent set fitness_granted=p_granted,fitness_notice=notice,version=next_version,changed_at=statement_timestamp() where user_id=uid;
  end if;
  insert into private.processing_consent_events(user_id,purpose,granted,notice_version,version) values(uid,p_purpose,p_granted,notice,next_version);
 end if;
 return private.tracker_processing_access(uid);
end;$$;
revoke all on function public.set_tracker_processing_consent(text,boolean,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.set_tracker_processing_consent(text,boolean,text,jsonb) to authenticated;

create function public.get_tracker_targets(p_kind text,p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s jsonb; result jsonb; n integer;
begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('habit','chain') or p_ids is null or cardinality(p_ids)>100
  or array_position(p_ids,null) is not null or cardinality(p_ids)<>(select count(distinct i) from unnest(p_ids) i) then
  raise exception 'Invalid tracker targets.' using errcode='22023';
 end if;
 s:=private.tracker_processing_access(uid);
 with roots as (
  select h.id from public.habits h where p_kind='habit' and h.user_id=uid and h.id=any(p_ids)
  union all select q.id from public.long_quests q where p_kind='chain' and q.user_id=uid and q.id=any(p_ids)
 ), targets as (
  select r.id,coalesce(p.input_kind,'custom') input_kind from roots r left join private.tracker_input_provenance p
   on p.object_kind=p_kind and p.object_id=r.id and p.user_id=uid
 ) select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('kind',p_kind,'id',id,'inputKind',input_kind,
  'canWrite',case when input_kind='basic' then (s->>'canWriteBasic')::boolean else (s->>'canWriteCustom')::boolean end)
  order by array_position(p_ids,id)),'[]'::jsonb) into n,result from targets;
 if n<>cardinality(p_ids) then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
 return result;
end;$$;
revoke all on function public.get_tracker_targets(text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.get_tracker_targets(text,uuid[]) to authenticated;

create function private.record_tracker_processing_authority(p_user_id uuid,p_purpose text,p_state text,p_expected_age_version integer,p_review_reference uuid) returns void
language plpgsql security definer set search_path='' as $$
declare age_version integer; next_version integer; logical_version integer;
begin
 if p_purpose is null or p_purpose not in ('custom-tracker','fitness-tracking') or p_state is null
  or p_state not in ('not-required','pending','approved','revoked') or p_review_reference is null then
  raise exception 'Invalid reviewed authority decision.' using errcode='22023';
 end if;
 perform 1 from auth.users where id=p_user_id for update;
 if not found then raise exception 'account missing' using errcode='42501'; end if;
 select coalesce((select version from private.account_age where user_id=p_user_id),0) into age_version;
 if age_version is distinct from p_expected_age_version then raise exception 'Tracker access changed.' using errcode='ET003'; end if;
 logical_version:=private.processing_authority_version(p_user_id)+1;
 select coalesce((select version from private.tracker_purpose_authority where user_id=p_user_id and purpose=p_purpose),0)+1 into next_version;
 insert into private.tracker_purpose_authority(user_id,purpose,state,age_version,version,review_reference)
  values(p_user_id,p_purpose,p_state,age_version,next_version,p_review_reference)
  on conflict(user_id,purpose) do update set state=excluded.state,age_version=excluded.age_version,version=excluded.version,
   review_reference=excluded.review_reference,changed_at=statement_timestamp();
 insert into private.processing_authority_events(user_id,state,purposes,age_version,version,review_reference)
  values(p_user_id,p_state,array[p_purpose],age_version,logical_version,p_review_reference);
end;$$;
revoke all on function private.record_tracker_processing_authority(uuid,text,text,integer,uuid) from public,anon,authenticated,service_role;

-- Existing old consent setter updates only its old columns on conflict, so new
-- purpose fields survive. Signup still records age-purpose consent only.

create or replace function private.processing_access(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a private.account_age%rowtype; c private.processing_consent%rowtype;
 g private.processing_authority%rowtype; m_version integer; authority text;
 eligible boolean; read_allowed boolean; age_grant boolean; ai_grant boolean;
begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
  raise exception 'authentication required' using errcode='42501';
 end if;
 select * into a from private.account_age where user_id=p_user_id;
 select * into c from private.processing_consent where user_id=p_user_id;
 select * into g from private.processing_authority where user_id=p_user_id;
 select version into m_version from private.mailbox_state where user_id=p_user_id;
 eligible:=a.birth_date is not null and a.pending_birth_date is null and
  private.tracker_age_on(a.birth_date,(statement_timestamp() at time zone 'Asia/Manila')::date);
 age_grant:=coalesce(c.age_granted and c.age_notice='2026-10-20-age-v1',false);
 ai_grant:=coalesce(c.ai_granted and c.ai_notice='2026-10-20-weekly-debrief-v1',false);
 if g.user_id is null then
  authority:=case when private.adult_declared(p_user_id) then 'not-required' else 'pending' end;
 elsif g.state='revoked' then authority:='revoked';
 elsif g.age_version is distinct from coalesce(a.version,0)
  or not (g.purposes @> array['age-screening','weekly-debrief']::text[]) then authority:='pending';
 else authority:=g.state;
 end if;
 read_allowed:=coalesce(eligible and age_grant and authority in ('not-required','approved')
  and private.mailbox_verified(p_user_id),false);
 return jsonb_build_object('contractVersion',1,'userId',p_user_id,
  'ageVersion',coalesce(a.version,0),'consentVersion',coalesce(c.version,0),
  'authorityVersion',private.processing_authority_version(p_user_id),'mailboxVersion',coalesce(m_version,0),
  'ageEligible',coalesce(eligible,false),'ageConsent',age_grant,'aiConsent',ai_grant,
  'authorityState',authority,'canReadDebrief',read_allowed,'canGenerateDebrief',read_allowed and ai_grant);
end;$$;

revoke all on function private.processing_access(uuid) from public,anon,authenticated,service_role;

create or replace function private.record_processing_authority(p_user_id uuid,p_state text,p_purposes text[],
 p_expected_age_version integer,p_review_reference uuid) returns void
language plpgsql security definer set search_path='' as $$
declare age_version integer; next_version integer; logical_version integer;
begin
 if p_state is null or p_state not in ('not-required','pending','approved','revoked')
  or p_review_reference is null or p_purposes is null or cardinality(p_purposes)=0
  or array_position(p_purposes,null) is not null
  or not (p_purposes<@array['age-screening','weekly-debrief']::text[]) then
  raise exception 'Invalid reviewed authority decision.' using errcode='22023';
 end if;
 perform 1 from auth.users where id=p_user_id for update;
 if not found then raise exception 'account missing' using errcode='42501'; end if;
 select coalesce((select version from private.account_age where user_id=p_user_id),0) into age_version;
 if age_version is distinct from p_expected_age_version then
  raise exception 'Processing access changed. Refresh your choices.' using errcode='EP002';
 end if;
 logical_version:=private.processing_authority_version(p_user_id)+1;
 select coalesce((select version from private.processing_authority where user_id=p_user_id),0)+1 into next_version;
 insert into private.processing_authority(user_id,state,purposes,age_version,version,review_reference)
  values(p_user_id,p_state,p_purposes,age_version,next_version,p_review_reference)
  on conflict(user_id) do update set state=excluded.state,purposes=excluded.purposes,
   age_version=excluded.age_version,version=excluded.version,review_reference=excluded.review_reference,
   changed_at=statement_timestamp();
 insert into private.processing_authority_events(user_id,state,purposes,age_version,version,review_reference)
  values(p_user_id,p_state,p_purposes,age_version,logical_version,p_review_reference);
end;$$;

revoke all on function private.record_processing_authority(uuid,text,text[],integer,uuid) from public,anon,authenticated,service_role;

commit;
