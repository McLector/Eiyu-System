-- 045: AI provider failover support.
--   * the per-user daily AI cap moves from a literal 2 to
--     private.ai_quota_config.max_user_requests_per_action (still 2), so it can
--     be raised with one UPDATE instead of a migration;
--   * private.ai_provider_exhaustion remembers which providers hit a daily quota
--     until their own reset time (Gemini resets at midnight Pacific, so the
--     Edge Function sends each provider's time zone);
--   * ai_begin_request now also returns "exhaustedProviders" (a JSON array of
--     provider names to skip). Every existing key and the signature are
--     unchanged, so an Edge Function from before 045 keeps working;
--   * ai_mark_provider_exhausted(request, provider, zone) lets the Edge
--     Function record a daily-quota failure (service role only).
--
-- Rollout: apply after 044 and verify the 045 marker in README.md. Either
-- deploy order is safe: a function from after 045 on a database from before it
-- treats a missing exhaustedProviders field as "none" and ignores a missing mark
-- RPC; a function from before 045 ignores the extra field.
--
-- Drift: the live ai_begin_request / ai_reserve_next_attempt bodies were compared
-- with 030 on 2026-10-07 (identical apart from line endings), the config table
-- had only (singleton, max_provider_attempts), and the only check on
-- ai_user_daily_usage.request_count was request_count between 0 and 2. Compare
-- again before applying if anything touched them since.
--
-- Rollback: re-run the ai_begin_request definition from 030_authoritative_ai_quotas.sql,
-- then: drop function public.ai_mark_provider_exhausted(uuid, text, text);
-- drop function private.ai_exhausted_providers(); drop function private.ai_next_midnight(text, timestamptz);
-- drop table private.ai_provider_exhaustion;
-- alter table private.ai_quota_config drop column max_user_requests_per_action;
-- (and, only if no row has more than 2, restore the 0..2 check on request_count).
begin;

alter table private.ai_quota_config
  add column max_user_requests_per_action integer not null default 2
    check (max_user_requests_per_action between 1 and 100);

-- The old check capped the stored count at 2, which would reject a raised cap.
do $block$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_catalog.pg_constraint c
    where c.conrelid = 'private.ai_user_daily_usage'::regclass
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%request_count%'
  loop
    execute pg_catalog.format('alter table private.ai_user_daily_usage drop constraint %I', v_name);
  end loop;
end;
$block$;
alter table private.ai_user_daily_usage
  add constraint ai_user_daily_usage_request_count_check check (request_count >= 0);

create table private.ai_provider_exhaustion (
  provider text primary key check (provider ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  exhausted_until timestamptz not null,
  updated_at timestamptz not null default pg_catalog.statement_timestamp()
);
alter table private.ai_provider_exhaustion enable row level security;
revoke all on table private.ai_provider_exhaustion from public, anon, authenticated, service_role;

-- Next local midnight in a time zone, as an instant.
create or replace function private.ai_next_midnight(p_time_zone text, p_from timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $function$
  select (((p_from at time zone p_time_zone)::date + 1)::timestamp) at time zone p_time_zone;
$function$;

create or replace function private.ai_exhausted_providers()
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select coalesce(pg_catalog.jsonb_agg(e.provider order by e.provider), '[]'::jsonb)
  from private.ai_provider_exhaustion e
  where e.exhausted_until > pg_catalog.statement_timestamp();
$function$;

revoke all on function private.ai_next_midnight(text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.ai_exhausted_providers() from public, anon, authenticated, service_role;

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
  v_user_cap integer;
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
      'attemptNumber', 1, 'weekStart', v_request.week_start,
      'exhaustedProviders', private.ai_exhausted_providers()
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
      'attemptNumber', 1, 'weekStart', v_request.week_start,
      'exhaustedProviders', private.ai_exhausted_providers()
    );
  end if;

  if v_bucket is not null then
    select u.request_count into v_user_count
    from private.ai_user_daily_usage u
    where u.user_id = p_user_id and u.usage_date = v_today and u.action = v_bucket;
    select c.max_user_requests_per_action into v_user_cap
    from private.ai_quota_config c where c.singleton;
    if coalesce(v_user_count, 0) >= coalesce(v_user_cap, 2) then
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
    'weekStart', case when p_action = 'weekly-summary' then v_week_start else null end,
    'exhaustedProviders', private.ai_exhausted_providers()
  );
end;
$function$;

create or replace function public.ai_mark_provider_exhausted(
  p_request_id uuid,
  p_provider text,
  p_reset_time_zone text default 'UTC'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_until timestamptz;
begin
  v_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if v_role is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'request identifier is required' using errcode = '22023';
  end if;
  if p_provider is null or p_provider !~ '^[a-z0-9][a-z0-9_-]{0,39}$' then
    raise exception 'invalid provider name' using errcode = '22023';
  end if;
  if p_reset_time_zone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_reset_time_zone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;

  if not exists (select 1 from private.ai_logical_requests r where r.request_id = p_request_id) then
    return false;
  end if;

  v_until := private.ai_next_midnight(p_reset_time_zone, pg_catalog.statement_timestamp());
  insert into private.ai_provider_exhaustion(provider, exhausted_until)
  values (p_provider, v_until)
  on conflict (provider) do update
    set exhausted_until = greatest(private.ai_provider_exhaustion.exhausted_until, excluded.exhausted_until),
        updated_at = pg_catalog.statement_timestamp();
  return true;
end;
$function$;

revoke all on function public.ai_mark_provider_exhausted(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_mark_provider_exhausted(uuid, text, text) to service_role;

-- create or replace keeps the existing grants on ai_begin_request; restate them anyway.
revoke all on function public.ai_begin_request(uuid, text, uuid, date) from public, anon, authenticated;
grant execute on function public.ai_begin_request(uuid, text, uuid, date) to service_role;

commit;
