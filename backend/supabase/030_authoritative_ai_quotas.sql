-- F-002: reserve logical user requests and every Gemini provider attempt on
-- the server. Only the verified Edge service-role client may call the two
-- reservation wrappers. The private ledger is never exposed through PostgREST.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table private.ai_quota_config (
  singleton boolean primary key default true check (singleton),
  max_provider_attempts integer not null default 100 check (max_provider_attempts > 0)
);
insert into private.ai_quota_config(singleton, max_provider_attempts)
values (true, 100)
on conflict (singleton) do nothing;

create table private.ai_user_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  action text not null check (action in ('easy-versions', 'stage-breakdown', 'weekly-summary-initial')),
  request_count integer not null default 0 check (request_count between 0 and 2),
  primary key (user_id, usage_date, action)
);

create table private.ai_logical_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('easy-versions', 'stage-breakdown', 'weekly-summary')),
  request_class text not null check (request_class in ('suggestion', 'initial', 'regeneration')),
  account_date date not null,
  week_start date,
  attempt_count integer not null default 1 check (attempt_count between 1 and 4),
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  check ((action = 'weekly-summary' and week_start is not null)
      or (action <> 'weekly-summary' and week_start is null))
);

create table private.ai_provider_daily_usage (
  usage_date date primary key,
  attempt_count integer not null default 0 check (attempt_count >= 0)
);

create table private.ai_provider_attempts (
  request_id uuid not null references private.ai_logical_requests(request_id) on delete cascade,
  attempt_number integer not null check (attempt_number between 1 and 4),
  usage_date date not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (request_id, attempt_number)
);

create table private.ai_pending_weekly_regenerations (
  reservation_id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  account_date date not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  request_id uuid
);
create index ai_pending_weekly_regenerations_owner_week_idx
  on private.ai_pending_weekly_regenerations(user_id, week_start, account_date, created_at)
  where consumed_at is null;

alter table private.ai_quota_config enable row level security;
alter table private.ai_user_daily_usage enable row level security;
alter table private.ai_logical_requests enable row level security;
alter table private.ai_provider_daily_usage enable row level security;
alter table private.ai_provider_attempts enable row level security;
alter table private.ai_pending_weekly_regenerations enable row level security;

revoke all on all tables in schema private from public, anon, authenticated, service_role;
revoke all on all sequences in schema private from public, anon, authenticated, service_role;
revoke all on all functions in schema private from public, anon, authenticated, service_role;

-- Keep the existing public RPC signature for old clients. A reservation is
-- bound to the caller, current account-local date and current account week;
-- the AI RPC consumes its one-use private ticket only after it finds a cache.
create or replace function public.reserve_weekly_summary_regen(p_week_start date)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text;
  v_today date;
  v_week_start date;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select coalesce(nullif(p.time_zone, ''), 'UTC')
    into v_time_zone
  from public.profiles p
  where p.user_id = v_user_id;
  if not found then raise exception 'profile not found for calling user'; end if;

  v_today := (pg_catalog.statement_timestamp() at time zone v_time_zone)::date;
  v_week_start := v_today - (extract(isodow from v_today)::integer - 1);
  if p_week_start is distinct from v_week_start then
    raise exception 'requested week is not the current account week' using errcode = 'P0001';
  end if;

  update public.weekly_summaries s
  set regenerate_count = case
        when s.last_regenerated_date is distinct from v_today then 1
        else s.regenerate_count + 1
      end,
      last_regenerated_date = v_today
  where s.user_id = v_user_id
    and s.week_start = v_week_start
    and (s.last_regenerated_date is distinct from v_today or s.regenerate_count < 2)
  returning s.regenerate_count into v_count;

  if v_count is null then
    if exists (select 1 from public.weekly_summaries s
      where s.user_id = v_user_id and s.week_start = v_week_start) then
      raise exception 'daily summary regeneration limit reached' using errcode = 'P0001';
    end if;
    raise exception 'no weekly summary exists for week % — cannot reserve a regen', v_week_start;
  end if;

  insert into private.ai_pending_weekly_regenerations(
    user_id, week_start, account_date, expires_at
  ) values (
    v_user_id, v_week_start, v_today, pg_catalog.statement_timestamp() + interval '48 hours'
  );
  return v_count;
end;
$function$;

revoke all on function public.reserve_weekly_summary_regen(date) from public, anon;
grant execute on function public.reserve_weekly_summary_regen(date) to authenticated;

-- Remove the old broad UPDATE path. Clients may read rows, insert a first
-- summary with only its three data fields, and update only the paragraph.
-- The reservation RPC above owns both counter columns.
revoke all on table public.weekly_summaries from public, anon, authenticated;
revoke insert (id, user_id, week_start, summary, created_at, regenerate_count, last_regenerated_date),
  update (id, user_id, week_start, summary, created_at, regenerate_count, last_regenerated_date)
  on table public.weekly_summaries from public, anon, authenticated;
grant select on table public.weekly_summaries to authenticated;
grant insert (user_id, week_start, summary) on table public.weekly_summaries to authenticated;
grant update (summary) on table public.weekly_summaries to authenticated;

create or replace function public.ai_begin_request(
  p_user_id uuid,
  p_action text,
  p_request_id uuid,
  p_week_start date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_time_zone text;
  v_today date;
  v_week_start date;
  v_request private.ai_logical_requests%rowtype;
  v_class text;
  v_bucket text;
  v_user_count integer;
  v_project_limit integer;
  v_project_count integer;
  v_pending_id uuid;
  v_utc_date date := (pg_catalog.statement_timestamp() at time zone 'UTC')::date;
begin
  v_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if v_role is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_request_id is null then
    raise exception 'user and request identifiers are required' using errcode = '22023';
  end if;
  if p_action is null or p_action not in ('easy-versions', 'stage-breakdown', 'weekly-summary') then
    raise exception 'unsupported AI action' using errcode = '22023';
  end if;

  select * into v_request from private.ai_logical_requests r where r.request_id = p_request_id;
  if found then
    if v_request.user_id <> p_user_id or v_request.action <> p_action then
      raise exception 'request identifier is already bound to a different request' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'allowed', true, 'requestClass', v_request.request_class,
      'attemptNumber', 1, 'weekStart', v_request.week_start
    );
  end if;

  select coalesce(nullif(p.time_zone, ''), 'UTC')
    into v_time_zone from public.profiles p where p.user_id = p_user_id;
  if not found then raise exception 'profile not found for AI caller'; end if;
  v_today := (pg_catalog.statement_timestamp() at time zone v_time_zone)::date;
  v_week_start := v_today - (extract(isodow from v_today)::integer - 1);

  if p_action = 'weekly-summary' then
    if p_week_start is distinct from v_week_start then
      raise exception 'requested week is not the current account week' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.weekly_summaries s
      where s.user_id = p_user_id and s.week_start = v_week_start) then
      v_class := 'regeneration';
      select r.reservation_id into v_pending_id
      from private.ai_pending_weekly_regenerations r
      where r.user_id = p_user_id and r.week_start = v_week_start
        and r.account_date = v_today and r.consumed_at is null
        and r.expires_at > pg_catalog.statement_timestamp()
      order by r.created_at
      limit 1
      for update;
      if v_pending_id is null then
        return pg_catalog.jsonb_build_object(
          'allowed', false, 'requestClass', v_class, 'reason', 'reservation_required', 'attemptNumber', 0
        );
      end if;
      v_bucket := null;
    else
      v_class := 'initial';
      v_bucket := 'weekly-summary-initial';
    end if;
  else
    v_class := 'suggestion';
    v_bucket := p_action;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || '|' || v_today::text || '|' || p_action, 0)
  );

  -- A same-ID request can arrive while the first reservation transaction is
  -- holding the user lock. Recheck after that lock before charging either
  -- ledger so request reservation stays idempotent under that race.
  select * into v_request from private.ai_logical_requests r where r.request_id = p_request_id;
  if found then
    if v_request.user_id <> p_user_id or v_request.action <> p_action then
      raise exception 'request identifier is already bound to a different request' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'allowed', true, 'requestClass', v_request.request_class,
      'attemptNumber', 1, 'weekStart', v_request.week_start
    );
  end if;

  if v_bucket is not null then
    select u.request_count into v_user_count
    from private.ai_user_daily_usage u
    where u.user_id = p_user_id and u.usage_date = v_today and u.action = v_bucket;
    if coalesce(v_user_count, 0) >= 2 then
      return pg_catalog.jsonb_build_object(
        'allowed', false, 'requestClass', v_class, 'reason', 'user_limit', 'attemptNumber', 0
      );
    end if;
  end if;

  select c.max_provider_attempts into v_project_limit
  from private.ai_quota_config c where c.singleton for update;
  select u.attempt_count into v_project_count
  from private.ai_provider_daily_usage u where u.usage_date = v_utc_date;
  if coalesce(v_project_count, 0) >= v_project_limit then
    return pg_catalog.jsonb_build_object(
      'allowed', false, 'requestClass', v_class, 'reason', 'project_limit', 'attemptNumber', 0
    );
  end if;

  delete from private.ai_pending_weekly_regenerations r
  where r.expires_at <= pg_catalog.statement_timestamp();
  delete from private.ai_logical_requests r
  where r.created_at < pg_catalog.statement_timestamp() - interval '8 days';
  delete from private.ai_user_daily_usage u where u.usage_date < v_utc_date - 35;
  delete from private.ai_provider_daily_usage u where u.usage_date < v_utc_date - 35;

  if v_bucket is not null then
    insert into private.ai_user_daily_usage(user_id, usage_date, action, request_count)
    values (p_user_id, v_today, v_bucket, 1)
    on conflict (user_id, usage_date, action)
    do update set request_count = private.ai_user_daily_usage.request_count + 1;
  end if;

  insert into private.ai_logical_requests(
    request_id, user_id, action, request_class, account_date, week_start, attempt_count
  ) values (
    p_request_id, p_user_id, p_action, v_class, v_today,
    case when p_action = 'weekly-summary' then v_week_start else null end, 1
  );
  insert into private.ai_provider_daily_usage(usage_date, attempt_count)
  values (v_utc_date, 1)
  on conflict (usage_date)
  do update set attempt_count = private.ai_provider_daily_usage.attempt_count + 1;
  insert into private.ai_provider_attempts(request_id, attempt_number, usage_date)
  values (p_request_id, 1, v_utc_date);

  if v_pending_id is not null then
    update private.ai_pending_weekly_regenerations r
    set consumed_at = pg_catalog.statement_timestamp(), request_id = p_request_id
    where r.reservation_id = v_pending_id and r.consumed_at is null;
    if not found then raise exception 'weekly summary reservation was already consumed' using errcode = 'P0001'; end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'allowed', true, 'requestClass', v_class, 'attemptNumber', 1,
    'weekStart', case when p_action = 'weekly-summary' then v_week_start else null end
  );
end;
$function$;

create or replace function public.ai_reserve_next_attempt(p_request_id uuid, p_attempt_number integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_request private.ai_logical_requests%rowtype;
  v_utc_date date := (pg_catalog.statement_timestamp() at time zone 'UTC')::date;
  v_project_limit integer;
  v_project_count integer;
begin
  v_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if v_role is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_request_id is null or p_attempt_number is null then
    raise exception 'request and attempt identifiers are required' using errcode = '22023';
  end if;

  select * into v_request from private.ai_logical_requests r
  where r.request_id = p_request_id for update;
  if not found then return false; end if;
  if exists (select 1 from private.ai_provider_attempts a
      where a.request_id = p_request_id and a.attempt_number = p_attempt_number) then
    return true;
  end if;
  if p_attempt_number <> v_request.attempt_count + 1 or p_attempt_number > 4 then
    return false;
  end if;

  select c.max_provider_attempts into v_project_limit
  from private.ai_quota_config c where c.singleton for update;
  select u.attempt_count into v_project_count
  from private.ai_provider_daily_usage u where u.usage_date = v_utc_date;
  if coalesce(v_project_count, 0) >= v_project_limit then return false; end if;

  insert into private.ai_provider_daily_usage(usage_date, attempt_count)
  values (v_utc_date, 1)
  on conflict (usage_date)
  do update set attempt_count = private.ai_provider_daily_usage.attempt_count + 1;
  insert into private.ai_provider_attempts(request_id, attempt_number, usage_date)
  values (p_request_id, p_attempt_number, v_utc_date);
  update private.ai_logical_requests r
  set attempt_count = p_attempt_number where r.request_id = p_request_id;
  return true;
end;
$function$;

revoke all on function public.ai_begin_request(uuid, text, uuid, date) from public, anon, authenticated;
revoke all on function public.ai_reserve_next_attempt(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_begin_request(uuid, text, uuid, date) to service_role;
grant execute on function public.ai_reserve_next_attempt(uuid, integer) to service_role;

commit;
