-- Local S02 only: no production rollout approved. Mailbox proof is independent
-- of birthday declaration. Neither supplies validated adult-age assurance.
begin;
create table private.mailbox_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 verified_version integer, verified_at timestamptz,
 challenge_id uuid, challenge_version integer, challenge_expires_at timestamptz,
 challenge_ready boolean not null default false,
 challenge_attempted boolean not null default false,
 last_sent_at timestamptz, window_started_at timestamptz,
 sends integer not null default 0, attempts integer not null default 0
);
alter table private.mailbox_state enable row level security;
revoke all on private.mailbox_state from public,anon,authenticated,service_role;
insert into private.mailbox_state(user_id) select id from auth.users;

create function private.track_mailbox_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then insert into private.mailbox_state(user_id) values(new.id);
 elsif lower(trim(new.email)) is distinct from lower(trim(old.email)) then
  update private.mailbox_state set version=version+1,verified_version=null,verified_at=null,
   challenge_id=null,challenge_version=null,challenge_expires_at=null,
   challenge_ready=false,challenge_attempted=false where user_id=new.id;
 end if;
 return new;
end;
$$;
create trigger track_mailbox_version after insert or update of email on auth.users
 for each row execute function private.track_mailbox_version();
create function private.require_mailbox_service() returns void
language plpgsql set search_path='' as $$
begin
 if coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.role',true),''),
  nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'role') is distinct from 'service_role' then
  raise exception 'service role required' using errcode='42501';
 end if;
end;
$$;
create function private.mailbox_verified(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select m.verified_version=m.version and m.verified_at is not null
  and coalesce(trim(u.email),'')<>'' from private.mailbox_state m
  join auth.users u on u.id=m.user_id where m.user_id=p_user_id),false);
$$;
revoke all on function private.track_mailbox_version(),private.require_mailbox_service(),private.mailbox_verified(uuid)
 from public,anon,authenticated,service_role;

create function public.get_mailbox_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_id uuid:=auth.uid(); v_version integer;
begin
 if v_id is null then raise exception 'authentication required' using errcode='42501'; end if;
 select version into v_version from private.mailbox_state where user_id=v_id;
 return pg_catalog.jsonb_build_object('userId',v_id,'version',coalesce(v_version,0),'verified',private.mailbox_verified(v_id));
end;
$$;

create function public.mailbox_begin(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.mailbox_state%rowtype; v_email text; v_now timestamptz:=pg_catalog.clock_timestamp(); v_id uuid;
begin
 perform private.require_mailbox_service();
 select lower(trim(email)) into v_email from auth.users where id=p_user_id for update;
 if coalesce(v_email,'')='' then return '{"allowed":false,"retryAfter":60}'::jsonb; end if;
 select * into m from private.mailbox_state where user_id=p_user_id;
 if not found then return '{"allowed":false,"retryAfter":60}'::jsonb; end if;
 if m.window_started_at is null or m.window_started_at<=v_now-interval '10 minutes' then
  update private.mailbox_state set window_started_at=v_now,sends=0,attempts=0 where user_id=p_user_id;
  m.sends:=0; m.attempts:=0; m.window_started_at:=v_now;
 end if;
 if m.last_sent_at>v_now-interval '60 seconds' then
  return pg_catalog.jsonb_build_object('allowed',false,'retryAfter',greatest(1,ceil(extract(epoch from m.last_sent_at+interval '60 seconds'-v_now))::integer));
 end if;
 if m.sends>=5 or m.attempts>=5 then
  return pg_catalog.jsonb_build_object('allowed',false,'retryAfter',greatest(1,ceil(extract(epoch from m.window_started_at+interval '10 minutes'-v_now))::integer));
 end if;
 v_id:=extensions.gen_random_uuid();
 update private.mailbox_state set challenge_id=v_id,challenge_version=version,
  challenge_expires_at=v_now+interval '10 minutes',challenge_ready=false,challenge_attempted=false,
  last_sent_at=v_now,sends=sends+1 where user_id=p_user_id;
 return pg_catalog.jsonb_build_object('allowed',true,'challengeId',v_id,'email',v_email,'version',m.version,'retryAfter',60);
end;
$$;
create function public.mailbox_send_result(p_user_id uuid,p_challenge_id uuid,p_delivered boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_mailbox_service();
 perform 1 from auth.users where id=p_user_id for update;
 update private.mailbox_state set challenge_ready=p_delivered,
  challenge_expires_at=case when p_delivered then challenge_expires_at else pg_catalog.clock_timestamp() end
  where user_id=p_user_id and challenge_id=p_challenge_id and challenge_version=version;
 return found;
end;
$$;
create function public.mailbox_attempt(p_user_id uuid,p_challenge_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.mailbox_state%rowtype; v_email text;
begin
 perform private.require_mailbox_service();
 select lower(trim(email)) into v_email from auth.users where id=p_user_id for update;
 select * into m from private.mailbox_state where user_id=p_user_id;
 if not found or m.challenge_id is distinct from p_challenge_id or not m.challenge_ready
  or m.challenge_version is distinct from m.version or m.challenge_expires_at<=pg_catalog.clock_timestamp()
  or m.attempts>=5 then return '{"allowed":false}'::jsonb; end if;
 update private.mailbox_state set attempts=attempts+1,challenge_attempted=true where user_id=p_user_id;
 return pg_catalog.jsonb_build_object('allowed',true,'email',v_email,'version',m.version);
end;
$$;
create function public.mailbox_finish(p_user_id uuid,p_challenge_id uuid,p_evidence_user_id uuid,p_evidence_email text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_email text;
begin
 perform private.require_mailbox_service();
 select lower(trim(email)) into v_email from auth.users where id=p_user_id for update;
 if p_evidence_user_id is distinct from p_user_id or v_email is null
  or lower(trim(p_evidence_email)) is distinct from v_email then return false; end if;
 update private.mailbox_state set verified_version=version,verified_at=pg_catalog.clock_timestamp(),
  challenge_id=null,challenge_ready=false,challenge_attempted=false,challenge_expires_at=null
  where user_id=p_user_id and challenge_id=p_challenge_id and challenge_version=version
   and challenge_ready and challenge_attempted and challenge_expires_at>pg_catalog.clock_timestamp();
 return found;
end;
$$;
revoke all on function public.get_mailbox_status(),public.mailbox_begin(uuid),public.mailbox_send_result(uuid,uuid,boolean),
 public.mailbox_attempt(uuid,uuid),public.mailbox_finish(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_mailbox_status() to authenticated;
grant execute on function public.mailbox_begin(uuid),public.mailbox_send_result(uuid,uuid,boolean),public.mailbox_attempt(uuid,uuid),public.mailbox_finish(uuid,uuid,uuid,text) to service_role;

-- Extend the existing birthday wrappers, without modifying quota accounting.
alter table private.ai_logical_requests add column mailbox_version integer;
alter function public.ai_begin_request(uuid,text,uuid,date) set schema private;
alter function private.ai_begin_request(uuid,text,uuid,date) rename to ai_begin_request_before_mailbox;
revoke all on function private.ai_begin_request_before_mailbox(uuid,text,uuid,date) from public,anon,authenticated,service_role;
create function public.ai_begin_request(p_user_id uuid,p_action text,p_request_id uuid,p_week_start date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform private.require_mailbox_service();
 perform 1 from auth.users where id=p_user_id for update;
 if not private.adult_declared(p_user_id) then raise exception 'Adult AI eligibility required.' using errcode='EA001'; end if;
 if p_action='weekly-summary' and not private.mailbox_verified(p_user_id) then
  raise exception 'Verify your email to access your weekly debrief.' using errcode='EM001';
 end if;
 v_result:=private.ai_begin_request_before_mailbox(p_user_id,p_action,p_request_id,p_week_start);
 if p_action='weekly-summary' and v_result->>'allowed'='true' then
  update private.ai_logical_requests r set mailbox_version=m.version from private.mailbox_state m
   where r.request_id=p_request_id and m.user_id=p_user_id and r.mailbox_version is null;
  v_result:=v_result||pg_catalog.jsonb_build_object('mailboxVersion',(select mailbox_version from private.ai_logical_requests where request_id=p_request_id));
 end if;
 return v_result;
end;
$$;
alter function public.ai_reserve_next_attempt(uuid,integer) set schema private;
alter function private.ai_reserve_next_attempt(uuid,integer) rename to ai_reserve_next_attempt_before_mailbox;
revoke all on function private.ai_reserve_next_attempt_before_mailbox(uuid,integer) from public,anon,authenticated,service_role;
create function public.ai_reserve_next_attempt(p_request_id uuid,p_attempt_number integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_action text; v_version integer;
begin
 perform private.require_mailbox_service();
 select user_id,action,mailbox_version into v_id,v_action,v_version from private.ai_logical_requests where request_id=p_request_id;
 perform 1 from auth.users where id=v_id for update;
 if v_action='weekly-summary' and (not private.mailbox_verified(v_id) or v_version is distinct from
  (select version from private.mailbox_state where user_id=v_id)) then
  raise exception 'Verify your email to access your weekly debrief.' using errcode='EM001';
 end if;
 return private.ai_reserve_next_attempt_before_mailbox(p_request_id,p_attempt_number);
end;
$$;
alter function public.ai_check_request_age(uuid,integer) set schema private;
alter function private.ai_check_request_age(uuid,integer) rename to ai_check_request_age_before_mailbox;
revoke all on function private.ai_check_request_age_before_mailbox(uuid,integer) from public,anon,authenticated,service_role;
create function public.ai_check_request_age(p_request_id uuid,p_age_version integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_action text; v_version integer;
begin
 perform private.require_mailbox_service();
 select user_id,action,mailbox_version into v_id,v_action,v_version from private.ai_logical_requests where request_id=p_request_id;
 perform 1 from auth.users where id=v_id for update;
 if v_action='weekly-summary' and (not private.mailbox_verified(v_id) or v_version is distinct from
  (select version from private.mailbox_state where user_id=v_id)) then return false; end if;
 return private.ai_check_request_age_before_mailbox(p_request_id,p_age_version);
end;
$$;
revoke all on function public.ai_begin_request(uuid,text,uuid,date),public.ai_reserve_next_attempt(uuid,integer),public.ai_check_request_age(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.ai_begin_request(uuid,text,uuid,date),public.ai_reserve_next_attempt(uuid,integer),public.ai_check_request_age(uuid,integer) to service_role;
create function public.current_mailbox_verified() returns boolean
language sql stable security definer set search_path='' as $$select private.mailbox_verified(auth.uid());$$;
revoke all on function public.current_mailbox_verified() from public,anon,authenticated,service_role;
grant execute on function public.current_mailbox_verified() to authenticated;
create policy weekly_summary_mailbox_gate on public.weekly_summaries as restrictive for all to authenticated
 using((select public.current_mailbox_verified())) with check((select public.current_mailbox_verified()));
alter function public.reserve_weekly_summary_regen(date) set schema private;
alter function private.reserve_weekly_summary_regen(date) rename to reserve_weekly_summary_regen_before_mailbox;
revoke all on function private.reserve_weekly_summary_regen_before_mailbox(date) from public,anon,authenticated,service_role;
create function public.reserve_weekly_summary_regen(p_week_start date) returns integer
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 perform 1 from auth.users where id=auth.uid() for update;
 if not private.adult_declared(auth.uid()) then raise exception 'Adult AI eligibility required.' using errcode='EA001'; end if;
 if not private.mailbox_verified(auth.uid()) then raise exception 'Verify your email to access your weekly debrief.' using errcode='EM001'; end if;
 return private.reserve_weekly_summary_regen_before_mailbox(p_week_start);
end;
$$;
revoke all on function public.reserve_weekly_summary_regen(date) from public,anon,authenticated,service_role;
grant execute on function public.reserve_weekly_summary_regen(date) to authenticated;
commit;
