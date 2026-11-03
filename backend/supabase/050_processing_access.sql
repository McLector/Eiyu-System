-- Local S02 draft only. Hosted AI remains paused; no deployment authorized.
-- Declarations/consent and reviewed authority dispositions are not ID proof.
begin;

create table private.processing_consent (
 user_id uuid primary key references auth.users(id) on delete cascade,
 age_granted boolean not null default false, age_notice text,
 ai_granted boolean not null default false, ai_notice text,
 version integer not null default 1 check(version>0),
 changed_at timestamptz not null default statement_timestamp()
);
create table private.processing_consent_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 purpose text not null check(purpose in ('age-screening','weekly-debrief')),
 granted boolean not null, notice_version text not null,
 version integer not null check(version>0),
 changed_at timestamptz not null default statement_timestamp(),
 unique(user_id,version)
);
create table private.processing_authority (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state text not null check(state in ('not-required','pending','approved','revoked')),
 purposes text[] not null check(cardinality(purposes)>0 and purposes<@array['age-screening','weekly-debrief']::text[]),
 age_version integer not null check(age_version>=0),
 version integer not null default 1 check(version>0),
 review_reference uuid not null,
 changed_at timestamptz not null default statement_timestamp()
);
create table private.processing_authority_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 state text not null, purposes text[] not null, age_version integer not null,
 version integer not null, review_reference uuid not null,
 changed_at timestamptz not null default statement_timestamp(),
 unique(user_id,version)
);
alter table private.processing_consent enable row level security;
alter table private.processing_consent_events enable row level security;
alter table private.processing_authority enable row level security;
alter table private.processing_authority_events enable row level security;
revoke all on private.processing_consent,private.processing_consent_events,
 private.processing_authority,private.processing_authority_events from public,anon,authenticated,service_role;
revoke all on sequence private.processing_consent_events_id_seq,private.processing_authority_events_id_seq
 from public,anon,authenticated,service_role;

-- No DOB copies, email, quest text, documents or raw correspondence in these records.
-- Active-account minimal history follows existing verified deletion/cascade handling;
-- final audit/authority retention and real operating applicability remain release gates.
create function private.processing_access(p_user_id uuid) returns jsonb
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
  'authorityVersion',coalesce(g.version,0),'mailboxVersion',coalesce(m_version,0),
  'ageEligible',coalesce(eligible,false),'ageConsent',age_grant,'aiConsent',ai_grant,
  'authorityState',authority,'canReadDebrief',read_allowed,'canGenerateDebrief',read_allowed and ai_grant);
end;$$;
revoke all on function private.processing_access(uuid) from public,anon,authenticated,service_role;

create function private.require_debrief_generation(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare s jsonb; begin
 s:=private.processing_access(p_user_id);
 if not (s->>'ageEligible')::boolean or not (s->>'ageConsent')::boolean
  or not (s->>'aiConsent')::boolean or s->>'authorityState' not in ('not-required','approved') then
  raise exception 'Debrief processing permission required.' using errcode='EP001';
 end if;
 if not private.mailbox_verified(p_user_id) then
  raise exception 'Verify your email to access your weekly debrief.' using errcode='EM001';
 end if;
 return s;
end;$$;
revoke all on function private.require_debrief_generation(uuid) from public,anon,authenticated,service_role;

create function public.get_processing_access() returns jsonb
language sql stable security definer set search_path='' as $$ select private.processing_access(auth.uid()); $$;
revoke all on function public.get_processing_access() from public,anon,authenticated,service_role;
grant execute on function public.get_processing_access() to authenticated;

create function public.set_processing_consent(p_purpose text,p_granted boolean,p_notice_version text,
 p_expected_user_id uuid,p_expected_age_version integer,p_expected_consent_version integer,
 p_expected_authority_version integer,p_expected_mailbox_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s jsonb; c private.processing_consent%rowtype;
 expected_notice text; changed boolean;
begin
 if uid is null or uid is distinct from p_expected_user_id then
  raise exception 'account changed' using errcode='42501';
 end if;
 expected_notice:=case p_purpose when 'age-screening' then '2026-10-20-age-v1'
  when 'weekly-debrief' then '2026-10-20-weekly-debrief-v1' end;
 if expected_notice is null or p_notice_version is distinct from expected_notice or p_granted is null then
  raise exception 'Review the current notice before changing this permission.' using errcode='22023';
 end if;
 perform 1 from auth.users where id=uid for update;
 s:=private.processing_access(uid);
 if (s->>'ageVersion')::integer is distinct from p_expected_age_version
  or (s->>'consentVersion')::integer is distinct from p_expected_consent_version
  or (s->>'authorityVersion')::integer is distinct from p_expected_authority_version
  or (s->>'mailboxVersion')::integer is distinct from p_expected_mailbox_version then
  raise exception 'Processing access changed. Refresh your choices.' using errcode='EP002';
 end if;
 select * into c from private.processing_consent where user_id=uid;
 changed:=case p_purpose when 'age-screening' then
  c.age_granted is distinct from p_granted or c.age_notice is distinct from expected_notice
  else c.ai_granted is distinct from p_granted or c.ai_notice is distinct from expected_notice end;
 if changed then
  insert into private.processing_consent(user_id,age_granted,age_notice,ai_granted,ai_notice,version)
   values(uid,case when p_purpose='age-screening' then p_granted else coalesce(c.age_granted,false) end,
    case when p_purpose='age-screening' then expected_notice else c.age_notice end,
    case when p_purpose='weekly-debrief' then p_granted else coalesce(c.ai_granted,false) end,
    case when p_purpose='weekly-debrief' then expected_notice else c.ai_notice end,coalesce(c.version,0)+1)
   on conflict(user_id) do update set age_granted=excluded.age_granted,age_notice=excluded.age_notice,
    ai_granted=excluded.ai_granted,ai_notice=excluded.ai_notice,version=excluded.version,changed_at=statement_timestamp();
  insert into private.processing_consent_events(user_id,purpose,granted,notice_version,version)
   values(uid,p_purpose,p_granted,expected_notice,coalesce(c.version,0)+1);
 end if;
 return private.processing_access(uid);
end;$$;
revoke all on function public.set_processing_consent(text,boolean,text,uuid,integer,integer,integer,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.set_processing_consent(text,boolean,text,uuid,integer,integer,integer,integer) to authenticated;

-- Operator-only private procedure. No service/client API can mark a relationship proved.
-- Reference identifies a reviewed case, never a bearer/login reference or document.
create function private.record_processing_authority(p_user_id uuid,p_state text,p_purposes text[],
 p_expected_age_version integer,p_review_reference uuid) returns void
language plpgsql security definer set search_path='' as $$
declare age_version integer; next_version integer;
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
 select coalesce((select version from private.processing_authority where user_id=p_user_id),0)+1 into next_version;
 insert into private.processing_authority(user_id,state,purposes,age_version,version,review_reference)
  values(p_user_id,p_state,p_purposes,age_version,next_version,p_review_reference)
  on conflict(user_id) do update set state=excluded.state,purposes=excluded.purposes,
   age_version=excluded.age_version,version=excluded.version,review_reference=excluded.review_reference,
   changed_at=statement_timestamp();
 insert into private.processing_authority_events(user_id,state,purposes,age_version,version,review_reference)
  values(p_user_id,p_state,p_purposes,age_version,next_version,p_review_reference);
end;$$;
revoke all on function private.record_processing_authority(uuid,text,text[],integer,uuid)
 from public,anon,authenticated,service_role;

create function private.capture_initial_processing_consent() returns trigger
language plpgsql security definer set search_path='' as $$
declare choice jsonb:=new.raw_user_meta_data#>'{processing_consent,age_screening}';
 privileged_import boolean:=session_user in ('supabase_admin','postgres')
  and coalesce(nullif(current_setting('role',true),''),'none') in ('none','supabase_admin','postgres');
begin
 -- Explicit privileged legacy/test imports can preserve missing declarations
 -- and grants. Real Auth connections (including Admin Auth APIs) cannot use it.
 if choice is null and privileged_import then return new; end if;
 if jsonb_typeof(choice) is distinct from 'object' or choice->'granted' is distinct from 'true'::jsonb
  or choice->>'notice_version' is distinct from '2026-10-20-age-v1'
  or new.raw_user_meta_data->>'birth_date' is null then
  raise exception 'Review the birthday notice and give specific permission before signup.' using errcode='EP003';
 end if;
 insert into private.processing_consent(user_id,age_granted,age_notice)
  values(new.id,true,'2026-10-20-age-v1');
 insert into private.processing_consent_events(user_id,purpose,granted,notice_version,version)
  values(new.id,'age-screening',true,'2026-10-20-age-v1',1);
 return new;
end;$$;
revoke all on function private.capture_initial_processing_consent() from public,anon,authenticated,service_role;
create trigger capture_initial_processing_consent after insert on auth.users
 for each row execute function private.capture_initial_processing_consent();

alter function public.set_account_birthday(date,uuid) set schema private;
alter function private.set_account_birthday(date,uuid) rename to set_account_birthday_before_processing;
revoke all on function private.set_account_birthday_before_processing(date,uuid) from public,anon,authenticated,service_role;
create function public.set_account_birthday(p_birth_date date,p_expected_user_id uuid default auth.uid()) returns jsonb
language plpgsql security definer set search_path='' as $$declare uid uuid:=auth.uid(); begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if uid is distinct from p_expected_user_id then raise exception 'account changed' using errcode='42501'; end if;
 if p_birth_date is null or not pg_catalog.isfinite(p_birth_date) or p_birth_date<date '0001-01-01'
  or p_birth_date>(statement_timestamp() at time zone 'Asia/Manila')::date then
  raise exception 'Enter a valid birthday.' using errcode='22023';
 end if;
 perform 1 from auth.users where id=uid for update;
 if not found then raise exception 'authentication required' using errcode='42501'; end if;
 if not exists(select 1 from private.processing_consent where user_id=uid
  and age_granted and age_notice='2026-10-20-age-v1') then
  raise exception 'Review the birthday notice in Profile before saving your declaration.' using errcode='EP001';
 end if;
 -- Specific prior age-purpose permission is separate from authority for optional
 -- debrief processing. It adds no ID check or independent correction veto.
 return private.set_account_birthday_before_processing(p_birth_date,p_expected_user_id);
end;$$;
revoke all on function public.set_account_birthday(date,uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_account_birthday(date,uuid) to authenticated;

create function private.require_processing_service() returns void
language plpgsql set search_path='' as $$begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'service role required' using errcode='42501';
 end if;
end;$$;
revoke all on function private.require_processing_service() from public,anon,authenticated,service_role;

alter table private.ai_logical_requests add column consent_version integer,add column authority_version integer;
alter table public.weekly_summaries add column age_version integer,add column mailbox_version integer,
 add column consent_version integer,add column authority_version integer;
-- 030 deliberately grants client writes by column; extend only provenance fields.
grant insert(age_version,mailbox_version,consent_version,authority_version),
 update(age_version,mailbox_version,consent_version,authority_version) on public.weekly_summaries to authenticated;

create or replace function public.ai_begin_request(p_user_id uuid,p_action text,p_request_id uuid,p_week_start date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; result jsonb; prior private.ai_logical_requests%rowtype;
begin
 perform private.require_processing_service();
 if p_action is distinct from 'weekly-summary' then
  return private.ai_begin_request_before_mailbox(p_user_id,p_action,p_request_id,p_week_start);
 end if;
 perform 1 from auth.users where id=p_user_id for update;
 s:=private.require_debrief_generation(p_user_id);
 select * into prior from private.ai_logical_requests where request_id=p_request_id;
 if found and (prior.user_id is distinct from p_user_id or prior.age_version is distinct from (s->>'ageVersion')::integer
  or prior.mailbox_version is distinct from (s->>'mailboxVersion')::integer
  or prior.consent_version is distinct from (s->>'consentVersion')::integer
  or prior.authority_version is distinct from (s->>'authorityVersion')::integer) then
  raise exception 'Processing access changed. Refresh your choices.' using errcode='EP002';
 end if;
 -- Bypass the retained adult-only wrappers, not the pre-age quota/refund logic.
 result:=private.ai_begin_request_before_age(p_user_id,p_action,p_request_id,p_week_start);
 if result->>'allowed'='true' then
  update private.ai_logical_requests set age_version=(s->>'ageVersion')::integer,
   mailbox_version=(s->>'mailboxVersion')::integer,consent_version=(s->>'consentVersion')::integer,
   authority_version=(s->>'authorityVersion')::integer where request_id=p_request_id;
  result:=result||jsonb_build_object('ageVersion',(s->>'ageVersion')::integer,
   'mailboxVersion',(s->>'mailboxVersion')::integer,'consentVersion',(s->>'consentVersion')::integer,
   'authorityVersion',(s->>'authorityVersion')::integer);
 end if;
 return result;
end;$$;

create function private.processing_request_current(p_request_id uuid,p_age_version integer default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.ai_logical_requests%rowtype; s jsonb;
begin
 select * into r from private.ai_logical_requests where request_id=p_request_id;
 if not found then return false; end if;
 perform 1 from auth.users where id=r.user_id for update;
 if not found then return false; end if;
 -- Reread after the owner lock; withdrawal and final authorization serialize here.
 select * into r from private.ai_logical_requests where request_id=p_request_id;
 s:=private.processing_access(r.user_id);
 return coalesce((s->>'canGenerateDebrief')::boolean and r.refunded_at is null
  and r.age_version=(s->>'ageVersion')::integer
  and (p_age_version is null or r.age_version=p_age_version)
  and r.mailbox_version=(s->>'mailboxVersion')::integer
  and r.consent_version=(s->>'consentVersion')::integer
  and r.authority_version=(s->>'authorityVersion')::integer,false);
end;$$;
revoke all on function private.processing_request_current(uuid,integer) from public,anon,authenticated,service_role;

create or replace function public.ai_reserve_next_attempt(p_request_id uuid,p_attempt_number integer) returns boolean
language plpgsql security definer set search_path='' as $$declare action text; uid uuid; begin
 perform private.require_processing_service();
 select r.action into action from private.ai_logical_requests r where request_id=p_request_id;
 if action is distinct from 'weekly-summary' then
  return private.ai_reserve_next_attempt_before_mailbox(p_request_id,p_attempt_number);
 end if;
 if not private.processing_request_current(p_request_id) then
  select user_id into uid from private.ai_logical_requests where request_id=p_request_id;
  perform private.require_debrief_generation(uid);
  raise exception 'Debrief processing permission required.' using errcode='EP001';
 end if;
 return private.ai_reserve_next_attempt_before_age(p_request_id,p_attempt_number);
end;$$;
create or replace function public.ai_check_request_age(p_request_id uuid,p_age_version integer) returns boolean
language plpgsql security definer set search_path='' as $$declare action text; begin
 perform private.require_processing_service();
 select r.action into action from private.ai_logical_requests r where request_id=p_request_id;
 if action is distinct from 'weekly-summary' then
  return private.ai_check_request_age_before_mailbox(p_request_id,p_age_version);
 end if;
 if p_age_version is null then return false; end if;
 return private.processing_request_current(p_request_id,p_age_version);
end;$$;
create or replace function public.reserve_weekly_summary_regen(p_week_start date) returns integer
language plpgsql security definer set search_path='' as $$declare s jsonb; begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 perform 1 from auth.users where id=auth.uid() for update;
 s:=private.require_debrief_generation(auth.uid());
 return private.reserve_weekly_summary_regen_before_age(p_week_start);
end;$$;

create function public.current_debrief_read_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((private.processing_access(auth.uid())->>'canReadDebrief')::boolean,false);
$$;
create function public.current_debrief_generation_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((private.processing_access(auth.uid())->>'canGenerateDebrief')::boolean,false);
$$;
revoke all on function public.current_debrief_read_allowed(),public.current_debrief_generation_allowed()
 from public,anon,authenticated,service_role;
grant execute on function public.current_debrief_read_allowed(),public.current_debrief_generation_allowed() to authenticated;
drop policy weekly_summary_age_gate on public.weekly_summaries;
create policy weekly_summary_processing_read on public.weekly_summaries as restrictive for select to authenticated
 using((select public.current_debrief_read_allowed()));
create policy weekly_summary_processing_insert on public.weekly_summaries as restrictive for insert to authenticated
 with check((select public.current_debrief_generation_allowed()));
create policy weekly_summary_processing_update on public.weekly_summaries as restrictive for update to authenticated
 using((select public.current_debrief_generation_allowed())) with check((select public.current_debrief_generation_allowed()));
create policy weekly_summary_processing_delete on public.weekly_summaries as restrictive for delete to authenticated
 using((select public.current_debrief_read_allowed()));

create function private.guard_debrief_provenance() returns trigger
language plpgsql security definer set search_path='' as $$declare s jsonb; begin
 -- Quota/refund routines change only counters/dates, including on historical
 -- rows. They must not manufacture provenance or fail after permission withdrawal.
 if tg_op='UPDATE' and row(new.id,new.user_id,new.week_start,new.summary,new.created_at,
  new.age_version,new.mailbox_version,new.consent_version,new.authority_version)
  is not distinct from row(old.id,old.user_id,old.week_start,old.summary,old.created_at,
   old.age_version,old.mailbox_version,old.consent_version,old.authority_version) then return new; end if;
 -- The provider service never persists content in the existing architecture.
 -- Its quota/refund metadata updates above are distinct from account writes.
 if current_setting('role',true)='service_role' then
  raise exception 'Use account-bound debrief persistence.' using errcode='42501';
 end if;
 if current_setting('role',true) in ('authenticated','service_role') then
  if current_setting('role',true)='authenticated' and new.user_id is distinct from auth.uid() then
   raise exception 'account changed' using errcode='42501';
  end if;
  perform 1 from auth.users where id=new.user_id for update;
  s:=private.require_debrief_generation(new.user_id);
  if new.age_version is distinct from (s->>'ageVersion')::integer
   or new.mailbox_version is distinct from (s->>'mailboxVersion')::integer
   or new.consent_version is distinct from (s->>'consentVersion')::integer
   or new.authority_version is distinct from (s->>'authorityVersion')::integer then
   raise exception 'Processing access changed. Refresh your choices.' using errcode='EP002';
  end if;
 end if;
 return new;
end;$$;
revoke all on function private.guard_debrief_provenance() from public,anon,authenticated,service_role;
create trigger guard_debrief_provenance before insert or update on public.weekly_summaries
 for each row execute function private.guard_debrief_provenance();

-- A row trigger is too late for UPDATE lock ordering: the tuple can already be
-- locked while waiting for its owner. Lock the authenticated owner at statement
-- start, before a quota routine can own that owner and wait for the summary row.
create function private.lock_debrief_owner() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if current_setting('role',true)='authenticated' then
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  perform 1 from auth.users where id=auth.uid() for update;
 end if;
 return null;
end;$$;
revoke all on function private.lock_debrief_owner() from public,anon,authenticated,service_role;
create trigger lock_debrief_owner before insert or update on public.weekly_summaries
 for each statement execute function private.lock_debrief_owner();

-- Existing quota wrappers are owned by Supabase's trusted postgres role. A local
-- operator may apply this draft as supabase_admin; preserve the wrappers' owner
-- while granting only that trusted owner the private calls they now require.
grant execute on function private.processing_access(uuid),private.require_processing_service(),
 private.processing_request_current(uuid,integer),private.require_debrief_generation(uuid) to postgres;

commit;
