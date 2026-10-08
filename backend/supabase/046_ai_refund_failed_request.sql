-- 046: give a failed AI request's per-user attempt back.
--   * private.ai_logical_requests.refunded_at remembers that a request was
--     refunded, so a second refund of the same request does nothing;
--   * ai_release_request(request) decrements the caller's per-user daily
--     counter (private.ai_user_daily_usage) for that request's bucket, never
--     below 0 (service role only). Buckets are the ones ai_begin_request
--     charges: 'weekly-summary-initial' for an initial summary, the action name
--     for a suggestion; a regeneration charges no bucket, so there is nothing to
--     give back. An unknown request id is a no-op that returns false.
--   * the project-wide provider-attempt ledger is NOT refunded: the provider
--     calls were made and they count against the shared free quota.
--
-- Why: a busy or failing provider used to burn the user's 2 daily attempts
-- without ever returning a result, after which every call got a 429.
--
-- Rollout: apply after 045 and verify the 046 marker in README.md. Either
-- deploy order is safe: a function from before this migration never calls the
-- RPC; a function from after it logs a warning and carries on if the RPC is
-- missing (the response is never changed by a failed refund).
--
-- Rollback: drop function public.ai_release_request(uuid);
-- alter table private.ai_logical_requests drop column refunded_at;
begin;

alter table private.ai_logical_requests add column refunded_at timestamptz;

create or replace function public.ai_release_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_request private.ai_logical_requests%rowtype;
  v_bucket text;
begin
  v_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if v_role is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_request_id is null then
    return false;
  end if;

  -- The row lock makes two concurrent refunds of one request serialize.
  select * into v_request
  from private.ai_logical_requests r
  where r.request_id = p_request_id
  for update;
  if not found or v_request.refunded_at is not null then
    return false;
  end if;

  v_bucket := case v_request.request_class
    when 'initial' then 'weekly-summary-initial'
    when 'suggestion' then v_request.action
    else null
  end;
  if v_bucket is null then
    return false;
  end if;

  update private.ai_logical_requests r
  set refunded_at = pg_catalog.statement_timestamp()
  where r.request_id = p_request_id;
  update private.ai_user_daily_usage u
  set request_count = greatest(0, u.request_count - 1)
  where u.user_id = v_request.user_id
    and u.usage_date = v_request.account_date
    and u.action = v_bucket;
  return true;
end;
$function$;

revoke all on function public.ai_release_request(uuid) from public, anon, authenticated;
grant execute on function public.ai_release_request(uuid) to service_role;

commit;
