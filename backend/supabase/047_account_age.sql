-- Local S02 groundwork only. S01 provider/assurance gates remain INCOMPLETE.
-- Declaration is not independently verified age. Do not deploy this as a
-- validated age-assurance scheme. Mailbox ownership remains a separate gate.
begin;

create table private.account_age (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null,
  pending_birth_date date,
  version integer not null default 1 check (version > 0)
);
alter table private.account_age enable row level security;
revoke all on private.account_age from public, anon, authenticated, service_role;

create function private.adult_on(p_birth_date date, p_today date)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_birth_date <= (p_today - interval '18 years')::date, false);
$$;
create function private.adult_declared(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select a.pending_birth_date is null and private.adult_on(a.birth_date,
    (pg_catalog.statement_timestamp() at time zone 'Asia/Manila')::date)
    from private.account_age a where a.user_id = p_user_id), false);
$$;
revoke all on function private.adult_on(date,date), private.adult_declared(uuid) from public, anon, authenticated, service_role;

create function public.get_account_age() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := auth.uid(); v_age private.account_age%rowtype;
begin
  if v_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into v_age from private.account_age where user_id=v_id;
  return pg_catalog.jsonb_build_object('userId', v_id, 'birthDate', v_age.birth_date,
    'pendingBirthDate', v_age.pending_birth_date, 'correctionPending', v_age.pending_birth_date is not null,
    'adultDeclared', private.adult_declared(v_id), 'version', coalesce(v_age.version,0));
end;
$$;
create function public.set_account_birthday(p_birth_date date,p_expected_user_id uuid default auth.uid()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := auth.uid(); v_age private.account_age%rowtype;
begin
  if v_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_expected_user_id is distinct from v_id then raise exception 'account changed' using errcode='42501'; end if;
  if p_birth_date is null or not pg_catalog.isfinite(p_birth_date) or p_birth_date < date '0001-01-01'
    or p_birth_date > (pg_catalog.statement_timestamp() at time zone 'Asia/Manila')::date then
    raise exception 'Enter a valid birthday.' using errcode='22023';
  end if;
  -- Serialize first declarations, corrections and AI reservations for this owner.
  perform 1 from auth.users where id=v_id for update;
  if not found then raise exception 'authentication required' using errcode='42501'; end if;
  select * into v_age from private.account_age where user_id=v_id;
  if not found then
    insert into private.account_age(user_id,birth_date) values(v_id,p_birth_date);
  elsif p_birth_date is distinct from v_age.birth_date or v_age.pending_birth_date is not null then
    -- The owner accepts initial and corrected declarations as screening, not verified age.
    -- Explicit saves clear earlier local pending state and invalidate older in-flight results.
    update private.account_age set birth_date=p_birth_date,pending_birth_date=null,version=version+1 where user_id=v_id;
  end if;
  return public.get_account_age();
end;
$$;
revoke all on function public.get_account_age(), public.set_account_birthday(date,uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_account_age(), public.set_account_birthday(date,uuid) to authenticated;

-- Capture only the initial optional declaration for every auth method. Never
-- authorize from later user_metadata edits; existing accounts remain unknown.
create function private.capture_initial_birthday() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_text text := new.raw_user_meta_data->>'birth_date'; v_date date;
begin
  if v_text is null then return new; end if;
  begin
    v_date := v_text::date;
  exception when others then
    raise exception 'Enter a valid birthday.' using errcode='22023';
  end;
  if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not pg_catalog.isfinite(v_date)
    or v_date < date '0001-01-01' or v_date > (pg_catalog.statement_timestamp() at time zone 'Asia/Manila')::date then
    raise exception 'Enter a valid birthday.' using errcode='22023';
  end if;
  insert into private.account_age(user_id,birth_date) values(new.id,v_date);
  return new;
end;
$$;
revoke all on function private.capture_initial_birthday() from public, anon, authenticated, service_role;
create trigger capture_initial_birthday after insert on auth.users for each row execute function private.capture_initial_birthday();

-- Wrap the quota implementation so denial also covers reused request IDs and
-- retries, without altering existing week/time-zone/accounting contracts.
alter table private.ai_logical_requests add column age_version integer;
alter function public.ai_begin_request(uuid,text,uuid,date) set schema private;
alter function private.ai_begin_request(uuid,text,uuid,date) rename to ai_begin_request_before_age;
revoke all on function private.ai_begin_request_before_age(uuid,text,uuid,date) from public, anon, authenticated, service_role;
create function public.ai_begin_request(p_user_id uuid,p_action text,p_request_id uuid,p_week_start date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.role',true),''),
    nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  perform 1 from auth.users where id=p_user_id for update;
  if not private.adult_declared(p_user_id) then raise exception 'Adult AI eligibility required.' using errcode='EA001'; end if;
  v_result := private.ai_begin_request_before_age(p_user_id,p_action,p_request_id,p_week_start);
  if v_result->>'allowed' = 'true' then
    update private.ai_logical_requests r set age_version=a.version
      from private.account_age a where r.request_id=p_request_id and a.user_id=p_user_id and r.age_version is null;
    return v_result || pg_catalog.jsonb_build_object('ageVersion',
      (select age_version from private.ai_logical_requests where request_id=p_request_id));
  end if;
  return v_result;
end;
$$;
alter function public.ai_reserve_next_attempt(uuid,integer) set schema private;
alter function private.ai_reserve_next_attempt(uuid,integer) rename to ai_reserve_next_attempt_before_age;
revoke all on function private.ai_reserve_next_attempt_before_age(uuid,integer) from public, anon, authenticated, service_role;
create function public.ai_reserve_next_attempt(p_request_id uuid,p_attempt_number integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_age_version integer;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.role',true),''),
    nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select user_id,age_version into v_id,v_age_version from private.ai_logical_requests where request_id=p_request_id;
  if v_id is not null then
    perform 1 from auth.users where id=v_id for update;
    if not private.adult_declared(v_id) or v_age_version is distinct from
      (select version from private.account_age where user_id=v_id) then
      raise exception 'Adult AI eligibility required.' using errcode='EA001';
    end if;
  end if;
  return private.ai_reserve_next_attempt_before_age(p_request_id,p_attempt_number);
end;
$$;
revoke all on function public.ai_begin_request(uuid,text,uuid,date), public.ai_reserve_next_attempt(uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.ai_begin_request(uuid,text,uuid,date), public.ai_reserve_next_attempt(uuid,integer) to service_role;

create function public.ai_check_request_age(p_request_id uuid,p_age_version integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.role',true),''),
    nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select user_id into v_id from private.ai_logical_requests where request_id=p_request_id;
  if v_id is null then return false; end if;
  perform 1 from auth.users where id=v_id for update;
  return coalesce((select r.age_version=p_age_version and a.version=p_age_version
    and private.adult_declared(v_id) and r.refunded_at is null
    from private.ai_logical_requests r join private.account_age a on a.user_id=r.user_id
    where r.request_id=p_request_id),false);
end;
$$;
revoke all on function public.ai_check_request_age(uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.ai_check_request_age(uuid,integer) to service_role;

create function public.adult_ai_declared() returns boolean
language sql stable security definer set search_path = '' as $$ select private.adult_declared(auth.uid()); $$;
revoke all on function public.adult_ai_declared() from public, anon, authenticated, service_role;
grant execute on function public.adult_ai_declared() to authenticated;
create policy weekly_summary_age_gate on public.weekly_summaries as restrictive for all to authenticated
  using ((select public.adult_ai_declared())) with check ((select public.adult_ai_declared()));

alter function public.reserve_weekly_summary_regen(date) set schema private;
alter function private.reserve_weekly_summary_regen(date) rename to reserve_weekly_summary_regen_before_age;
revoke all on function private.reserve_weekly_summary_regen_before_age(date) from public, anon, authenticated, service_role;
create function public.reserve_weekly_summary_regen(p_week_start date) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  perform 1 from auth.users where id=auth.uid() for update;
  if not private.adult_declared(auth.uid()) then raise exception 'Adult AI eligibility required.' using errcode='EA001'; end if;
  return private.reserve_weekly_summary_regen_before_age(p_week_start);
end;
$$;
revoke all on function public.reserve_weekly_summary_regen(date) from public, anon, authenticated, service_role;
grant execute on function public.reserve_weekly_summary_regen(date) to authenticated;
commit;
