-- S03b phase 1, "simplify age". The birthday, the under-12 pause, the operator review and the Google two-step finish
-- were more than a habit tracker needs. After this migration:
--   * every account has one Terms acceptance on record (private.terms_acceptance); accounts that existed before this
--     file get the earlier Terms version, so only a new account without a row is asked (new Google sign-ups);
--   * the AI weekly review needs an "I'm 18 or older" box (the age-screening consent, new notice version, no birthday),
--     the AI agreement (new notice version) and a verified mailbox;
--   * tracker writes are never paused by age.
-- The access contract keeps its keys (get_processing_access, ai-proxy revision keys): ageVersion is the constant 1,
-- authorityVersion is 0 and authorityState is 'not-required'; ageEligible and ageConsent both mean "the 18+ box is
-- ticked under the current notice". private.account_age stays as an empty table (the export manifest names it).
--
-- Sections: 1 Terms table and backfill, 2 Terms functions, 3 the access rule, 4 the sign-up trigger, 5 the birthday
-- functions and triggers go, 6 the stored birthdays are removed.
--
-- Apply note: section 6 deletes every stored birthday. It stops, rather than guess, unless the session first did
--   set eiyu.birthdays_counted = 'yes';
-- which is the moment the owner has counted the birthdays and approved removing them (the same "stop rather than
-- guess" habit as 065's eiyu.go_live_at). A database with no stored birthdays needs nothing.
begin;

-- 1. One Terms acceptance per account. Existing accounts are backfilled with the earlier Terms.
create table private.terms_acceptance (
 user_id uuid primary key references auth.users(id) on delete cascade,
 version text not null check (version<>''),
 accepted_at timestamptz not null default pg_catalog.statement_timestamp()
);
alter table private.terms_acceptance enable row level security;
revoke all on private.terms_acceptance from public,anon,authenticated,service_role;

insert into private.terms_acceptance(user_id,version,accepted_at)
 select id,'2026-10-20-terms-v1',pg_catalog.now() from auth.users
 on conflict (user_id) do nothing;

-- 2. Reading and recording the acceptance. Only the current version can be accepted; accepting the version already
-- stored keeps the first timestamp, accepting a newer one moves the row to it.
create function public.get_terms_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_id uuid:=auth.uid(); v_version text;
begin
 if v_id is null then raise exception 'authentication required' using errcode='42501'; end if;
 select t.version into v_version from private.terms_acceptance t where t.user_id=v_id;
 return pg_catalog.jsonb_build_object('userId',v_id,'accepted',v_version is not null,'version',v_version);
end;$$;
revoke all on function public.get_terms_status() from public,anon,authenticated,service_role;
grant execute on function public.get_terms_status() to authenticated;

create function public.accept_terms(p_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=auth.uid();
begin
 if v_id is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_version is distinct from '2026-11-08-terms-v2' then
  raise exception 'Review the current Terms before accepting them.' using errcode='22023';
 end if;
 perform 1 from auth.users where id=v_id;
 if not found then raise exception 'authentication required' using errcode='42501'; end if;
 insert into private.terms_acceptance(user_id,version) values(v_id,p_version)
  on conflict (user_id) do update set version=excluded.version,accepted_at=excluded.accepted_at
  where private.terms_acceptance.version is distinct from excluded.version;
 return pg_catalog.jsonb_build_object('userId',v_id,'accepted',true,'version',p_version);
end;$$;
revoke all on function public.accept_terms(text) from public,anon,authenticated,service_role;
grant execute on function public.accept_terms(text) to authenticated;

-- 3. The access rule. Base for processing_access is 050's; the fields and their order are unchanged.
create or replace function private.adult_declared(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select c.age_granted and c.age_notice='2026-11-08-adult-v1'
  from private.processing_consent c where c.user_id=p_user_id),false);
$$;

create or replace function private.tracker_writes_paused(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select false;
$$;

create or replace function private.processing_access(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.processing_consent%rowtype; m_version integer; adult boolean; ai_grant boolean; read_allowed boolean;
begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
  raise exception 'authentication required' using errcode='42501';
 end if;
 select * into c from private.processing_consent where user_id=p_user_id;
 select version into m_version from private.mailbox_state where user_id=p_user_id;
 adult:=coalesce(c.age_granted and c.age_notice='2026-11-08-adult-v1',false);
 ai_grant:=coalesce(c.ai_granted and c.ai_notice='2026-11-08-weekly-debrief-v2',false);
 read_allowed:=adult and private.mailbox_verified(p_user_id);
 return jsonb_build_object('contractVersion',1,'userId',p_user_id,
  'ageVersion',1,'consentVersion',coalesce(c.version,0),
  'authorityVersion',0,'mailboxVersion',coalesce(m_version,0),
  'ageEligible',adult,'ageConsent',adult,'aiConsent',ai_grant,
  'authorityState','not-required','canReadDebrief',read_allowed,'canGenerateDebrief',read_allowed and ai_grant);
end;$$;

-- Same signature as 050. The purposes and their notices change; the AI agreement needs the adult box.
create or replace function public.set_processing_consent(p_purpose text,p_granted boolean,p_notice_version text,
 p_expected_user_id uuid,p_expected_age_version integer,p_expected_consent_version integer,
 p_expected_authority_version integer,p_expected_mailbox_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s jsonb; c private.processing_consent%rowtype;
 expected_notice text; changed boolean;
begin
 if uid is null or uid is distinct from p_expected_user_id then
  raise exception 'account changed' using errcode='42501';
 end if;
 expected_notice:=case p_purpose when 'age-screening' then '2026-11-08-adult-v1'
  when 'weekly-debrief' then '2026-11-08-weekly-debrief-v2' end;
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
 if p_purpose='weekly-debrief' and p_granted and not (s->>'ageConsent')::boolean then
  raise exception 'Confirm you are 18 or older before turning on the AI weekly review.' using errcode='EP001';
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

-- 4. Sign-up records the Terms that the client sent and never refuses a sign-up. The birthday-consent trigger goes.
-- An app version from before this change may still send a birthday and the old consent keys; they are removed from
-- the new account's metadata right away, so a birthday is never kept and the export never meets one.
drop trigger capture_initial_processing_consent on auth.users;
drop function private.capture_initial_processing_consent();

create function private.capture_initial_terms() returns trigger
language plpgsql security definer set search_path='' as $$
declare t jsonb:=new.raw_user_meta_data->'terms';
begin
 begin
  if pg_catalog.jsonb_typeof(t)='object' and pg_catalog.jsonb_typeof(t->'version')='string'
   and t->>'version'='2026-11-08-terms-v2' then
   insert into private.terms_acceptance(user_id,version) values(new.id,'2026-11-08-terms-v2')
    on conflict (user_id) do nothing;
  end if;
 exception when others then
  -- A Terms record must never block a sign-up; the person is asked on the next screen instead.
  null;
 end;
 begin
  if new.raw_user_meta_data ?| array['birth_date','processing_consent'] then
   update auth.users set raw_user_meta_data=raw_user_meta_data-'birth_date'-'processing_consent' where id=new.id;
  end if;
 exception when others then
  null;
 end;
 return new;
end;$$;
revoke all on function private.capture_initial_terms() from public,anon,authenticated,service_role;
create trigger capture_initial_terms after insert on auth.users
 for each row execute function private.capture_initial_terms();

-- 5. The birthday functions and the sign-up triggers that read a birthday are removed. A sign-up that still sends a
-- birthday (an old client) succeeds and the value is ignored. private.account_age stays as an empty table.
drop trigger capture_initial_birthday on auth.users;
drop trigger reject_initial_under12 on auth.users;
drop function private.capture_initial_birthday();
drop function private.reject_initial_under12();
drop function public.finish_google_signup(date,text,uuid,integer,integer,integer,integer);
drop function public.adult_ai_declared();
drop function public.set_account_birthday(date,uuid);
drop function public.get_account_age();

-- 6. Stored birthdays and the old sign-up consent metadata are removed. Kept as a revoked function so a test can
-- drive it; nothing calls it after this file.
create function private.remove_stored_birthdays() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_rows integer; v_keys integer;
begin
 select (select pg_catalog.count(*) from private.account_age)::integer,
  (select pg_catalog.count(*) from auth.users where raw_user_meta_data ?| array['birth_date','processing_consent'])::integer
  into v_rows,v_keys;
 if (v_rows>0 or v_keys>0) and coalesce(pg_catalog.current_setting('eiyu.birthdays_counted',true),'') is distinct from 'yes' then
  raise exception 'Count the stored birthdays and set eiyu.birthdays_counted to yes before removing them.' using errcode='22023';
 end if;
 delete from private.account_age;
 update auth.users set raw_user_meta_data=raw_user_meta_data-'birth_date'-'processing_consent'
  where raw_user_meta_data ?| array['birth_date','processing_consent'];
 return pg_catalog.jsonb_build_object('accountAgeRows',v_rows,'metadataKeys',v_keys);
end;$$;
revoke all on function private.remove_stored_birthdays() from public,anon,authenticated,service_role;
select private.remove_stored_birthdays();

commit;
