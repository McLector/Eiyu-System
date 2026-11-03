-- Test-only templates, embedded in rollback tests/owned dblink connections.
-- Exercise retained quota/processing policy beneath051, not live legacy ingress.
-- Real instrumented admission/legacy refusal is covered by033/034.
create function pg_temp.ai_policy_begin(p_user_id uuid,p_action text,p_request_id uuid,p_week_start date)
returns jsonb language sql security definer set search_path='' as $$
 select private.ai_begin_request_before_admission(p_user_id,p_action,p_request_id,p_week_start);
$$;
create function pg_temp.ai_policy_reserve(p_request_id uuid,p_attempt_number integer)
returns boolean language sql security definer set search_path='' as $$
 select private.ai_reserve_next_attempt_before_admission(p_request_id,p_attempt_number);
$$;
create function pg_temp.ai_policy_check(p_request_id uuid,p_age_version integer)
returns boolean language sql security definer set search_path='' as $$
 select private.ai_check_request_age_before_admission(p_request_id,p_age_version);
$$;
alter function pg_temp.ai_policy_begin(uuid,text,uuid,date) owner to postgres;
alter function pg_temp.ai_policy_reserve(uuid,integer) owner to postgres;
alter function pg_temp.ai_policy_check(uuid,integer) owner to postgres;
revoke all on function pg_temp.ai_policy_begin(uuid,text,uuid,date),pg_temp.ai_policy_reserve(uuid,integer),pg_temp.ai_policy_check(uuid,integer) from public,anon,authenticated;
grant execute on function pg_temp.ai_policy_begin(uuid,text,uuid,date),pg_temp.ai_policy_reserve(uuid,integer),pg_temp.ai_policy_check(uuid,integer) to service_role;
