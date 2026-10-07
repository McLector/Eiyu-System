begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = public, extensions;
set local statement_timeout = '30s';

select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('d1300000-0000-4000-8000-000000000001', 'quota-owner@example.invalid', '{"display_name":"Quota Owner","time_zone":"UTC"}'::jsonb),
  ('d1300000-0000-4000-8000-000000000002', 'quota-second@example.invalid', '{"display_name":"Quota Second","time_zone":"UTC"}'::jsonb);

select ok(to_regnamespace('private') is not null, 'the private quota schema exists');
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE')
    and not has_schema_privilege('authenticated', 'private', 'USAGE')
    and not has_schema_privilege('service_role', 'private', 'USAGE'),
  'private quota tables are not directly exposed to API roles'
);
select ok(
  (select bool_and(c.relrowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relkind = 'r'),
  'all private quota tables have RLS enabled'
);

select ok(
  has_table_privilege('authenticated', 'public.weekly_summaries', 'SELECT')
    and not has_table_privilege('authenticated', 'public.weekly_summaries', 'INSERT')
    and not has_table_privilege('authenticated', 'public.weekly_summaries', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.weekly_summaries', 'DELETE')
    and has_column_privilege('authenticated', 'public.weekly_summaries', 'user_id', 'INSERT')
    and has_column_privilege('authenticated', 'public.weekly_summaries', 'week_start', 'INSERT')
    and has_column_privilege('authenticated', 'public.weekly_summaries', 'summary', 'INSERT')
    and not has_column_privilege('authenticated', 'public.weekly_summaries', 'regenerate_count', 'INSERT')
    and not has_column_privilege('authenticated', 'public.weekly_summaries', 'last_regenerated_date', 'INSERT')
    and has_column_privilege('authenticated', 'public.weekly_summaries', 'summary', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.weekly_summaries', 'regenerate_count', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.weekly_summaries', 'last_regenerated_date', 'UPDATE'),
  'weekly summary client grants preserve only owner reads, initial insert fields, and summary updates'
);

select ok(to_regprocedure('public.ai_begin_request(uuid,text,uuid,date)') is not null, 'the server-side logical request reservation RPC exists');
select ok(to_regprocedure('public.ai_reserve_next_attempt(uuid,integer)') is not null, 'the provider attempt reservation RPC exists');
select ok(
  coalesce((select has_function_privilege('service_role', p.oid, 'EXECUTE')
    from pg_proc p where p.oid = to_regprocedure('public.ai_begin_request(uuid,text,uuid,date)')), false)
    and coalesce((select not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE')
      from pg_proc p where p.oid = to_regprocedure('public.ai_begin_request(uuid,text,uuid,date)')), false),
  'only the trusted service role can begin a logical AI request'
);
select ok(
  coalesce((select has_function_privilege('service_role', p.oid, 'EXECUTE')
    from pg_proc p where p.oid = to_regprocedure('public.ai_reserve_next_attempt(uuid,integer)')), false)
    and coalesce((select not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE')
      from pg_proc p where p.oid = to_regprocedure('public.ai_reserve_next_attempt(uuid,integer)')), false),
  'only the trusted service role can reserve additional provider attempts'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.weekly_summaries (user_id, week_start, summary)
    values (auth.uid(), current_date - (extract(isodow from current_date)::integer - 1), 'Cached summary')$$,
  'the existing owner initial-summary insert remains valid'
);
select throws_ok(
  $$insert into public.weekly_summaries (user_id, week_start, summary, regenerate_count)
    values (auth.uid(), current_date - (extract(isodow from current_date)::integer - 1), 'Forged counter', 0)$$,
  '42501', 'permission denied for table weekly_summaries',
  'clients cannot insert server-owned regeneration counters'
);
select lives_ok(
  $$update public.weekly_summaries set summary = 'Updated cached summary'
    where user_id = auth.uid()$$,
  'the existing summary-only update remains valid'
);
select throws_ok(
  $$update public.weekly_summaries set regenerate_count = 0 where user_id = auth.uid()$$,
  '42501', 'permission denied for table weekly_summaries',
  'clients cannot reset regeneration counters'
);
select throws_ok(
  $$update public.weekly_summaries set last_regenerated_date = null where user_id = auth.uid()$$,
  '42501', 'permission denied for table weekly_summaries',
  'clients cannot reset the regeneration date'
);
select throws_ok(
  $$delete from public.weekly_summaries where user_id = auth.uid()$$,
  '42501', 'permission denied for table weekly_summaries',
  'clients cannot delete the cached summary to reset initial-generation quota'
);
select is(
  public.reserve_weekly_summary_regen(current_date - (extract(isodow from current_date)::integer - 1)),
  1,
  'first current-week regeneration reservation keeps the integer client contract'
);
select is(
  public.reserve_weekly_summary_regen(current_date - (extract(isodow from current_date)::integer - 1)),
  2,
  'second current-week regeneration reservation is allowed'
);
select throws_ok(
  format($sql$select public.reserve_weekly_summary_regen(%L::date)$sql$,
    current_date - (extract(isodow from current_date)::integer - 1)),
  'P0001', 'daily summary regeneration limit reached',
  'third same-day regeneration reservation is denied'
);
select throws_ok(
  format($sql$select public.reserve_weekly_summary_regen(%L::date)$sql$,
    current_date - (extract(isodow from current_date)::integer - 1) - 7),
  'P0001', 'requested week is not the current account week',
  'arbitrary historical week reservations are denied'
);

reset role;
-- The local independent-connection race starts before this transaction uses
-- the project counter. Its fixture is committed only on the isolated local
-- database connection and is deleted before the test finishes. Run this suite
-- as the isolated stack's supabase_admin: credential-free dblink socket
-- connections require a superuser caller. No connection secret is stored here.
select lives_ok($$select extensions.dblink_connect('quota_a', 'dbname=postgres user=postgres')$$, 'opens quota race connection A');
select lives_ok($$select extensions.dblink_connect('quota_b', 'dbname=postgres user=postgres')$$, 'opens quota race connection B');
select lives_ok($$select extensions.dblink_connect('quota_c', 'dbname=postgres user=postgres')$$, 'opens quota race connection C');

select lives_ok($sql$
  select extensions.dblink_exec('quota_a', $remote$
    do $cleanup$
    declare v_attempts integer;
    begin
      select count(*) into v_attempts
      from private.ai_provider_attempts attempt
      join private.ai_logical_requests request using (request_id)
      where request.user_id = 'd1300000-0000-4000-8000-000000000099';
      update private.ai_provider_daily_usage
        set attempt_count = greatest(0, attempt_count - v_attempts)
        where usage_date = (statement_timestamp() at time zone 'UTC')::date;
      delete from auth.users where id = 'd1300000-0000-4000-8000-000000000099';
    end;
    $cleanup$;
    insert into auth.users (id, email, raw_user_meta_data)
    values ('d1300000-0000-4000-8000-000000000099', 'quota-race@example.invalid', '{"display_name":"Quota Race","time_zone":"UTC"}'::jsonb)
  $remote$)
$sql$, 'creates a clean committed fixture for independent quota connections');

select lives_ok($sql$select extensions.dblink_exec('quota_a', $remote$set role service_role$remote$)$sql$, 'sets the trusted role on connection A');
select lives_ok($sql$select extensions.dblink_exec('quota_b', $remote$set role service_role$remote$)$sql$, 'sets the trusted role on connection B');
select lives_ok($sql$select extensions.dblink_exec('quota_c', $remote$set role service_role$remote$)$sql$, 'sets the trusted role on connection C');
select lives_ok($sql$select extensions.dblink_exec('quota_a', $remote$set "request.jwt.claim.role" = 'service_role'$remote$)$sql$, 'sets the role claim on connection A');
select lives_ok($sql$select extensions.dblink_exec('quota_b', $remote$set "request.jwt.claim.role" = 'service_role'$remote$)$sql$, 'sets the role claim on connection B');
select lives_ok($sql$select extensions.dblink_exec('quota_c', $remote$set "request.jwt.claim.role" = 'service_role'$remote$)$sql$, 'sets the role claim on connection C');
select lives_ok($sql$select extensions.dblink_exec('quota_a', $remote$set "request.jwt.claims" = '{"role":"service_role"}'$remote$)$sql$, 'sets the JWT claims on connection A');
select lives_ok($sql$select extensions.dblink_exec('quota_b', $remote$set "request.jwt.claims" = '{"role":"service_role"}'$remote$)$sql$, 'sets the JWT claims on connection B');
select lives_ok($sql$select extensions.dblink_exec('quota_c', $remote$set "request.jwt.claims" = '{"role":"service_role"}'$remote$)$sql$, 'sets the JWT claims on connection C');
select is(extensions.dblink_send_query('quota_a', $$select public.ai_begin_request('d1300000-0000-4000-8000-000000000099', 'easy-versions', 'd1300000-0000-4000-8000-000000000091', null)$$), 1, 'launches quota request A');
select is(extensions.dblink_send_query('quota_b', $$select public.ai_begin_request('d1300000-0000-4000-8000-000000000099', 'easy-versions', 'd1300000-0000-4000-8000-000000000092', null)$$), 1, 'launches quota request B');
select is(extensions.dblink_send_query('quota_c', $$select public.ai_begin_request('d1300000-0000-4000-8000-000000000099', 'easy-versions', 'd1300000-0000-4000-8000-000000000093', null)$$), 1, 'launches quota request C');

create temporary table quota_race_results (
  connection_name text primary key,
  response jsonb not null
) on commit drop;

-- Submission order does not determine which connection wins the row lock.
-- Collect all responses, then assert the cap independently of scheduling.
select lives_ok($$insert into quota_race_results
  select 'a', value from extensions.dblink_get_result('quota_a') as result(value jsonb)$$,
  'collects concurrent reservation A');
select lives_ok($$select * from extensions.dblink_get_result('quota_a') as result(value text)$$, 'drains concurrent result A');
select lives_ok($$insert into quota_race_results
  select 'b', value from extensions.dblink_get_result('quota_b') as result(value jsonb)$$,
  'collects concurrent reservation B');
select lives_ok($$select * from extensions.dblink_get_result('quota_b') as result(value text)$$, 'drains concurrent result B');
select lives_ok($$insert into quota_race_results
  select 'c', value from extensions.dblink_get_result('quota_c') as result(value jsonb)$$,
  'collects concurrent reservation C');
select lives_ok($$select * from extensions.dblink_get_result('quota_c') as result(value text)$$, 'drains concurrent result C');
select is((select count(*) from quota_race_results), 3::bigint,
  'all three independent quota requests return a response');
select is((select count(*) from quota_race_results where (response->>'allowed')::boolean), 2::bigint,
  'exactly two concurrent user reservations are accepted');
select is((select count(*) from quota_race_results where not (response->>'allowed')::boolean), 1::bigint,
  'exactly one concurrent user reservation is rejected');
select lives_ok($sql$select * from extensions.dblink_get_result('quota_a') as result(value text)$sql$, 'drains reservation status A');
select lives_ok($sql$select * from extensions.dblink_get_result('quota_b') as result(value text)$sql$, 'drains reservation status B');
select lives_ok($sql$select * from extensions.dblink_get_result('quota_c') as result(value text)$sql$, 'drains reservation status C');
select lives_ok($sql$select extensions.dblink_exec('quota_a', $remote$reset role$remote$)$sql$, 'restores the local owner on connection A');
select is((select count(*) from private.ai_provider_attempts where request_id in (
  'd1300000-0000-4000-8000-000000000091', 'd1300000-0000-4000-8000-000000000092', 'd1300000-0000-4000-8000-000000000093'
)), 2::bigint, 'concurrent reservations charge exactly two provider attempts');
select lives_ok($sql$
  select extensions.dblink_exec('quota_a', $remote$
    do $cleanup$
    declare v_attempts integer;
    begin
      select count(*) into v_attempts
      from private.ai_provider_attempts attempt
      join private.ai_logical_requests request using (request_id)
      where request.user_id = 'd1300000-0000-4000-8000-000000000099';
      update private.ai_provider_daily_usage
        set attempt_count = greatest(0, attempt_count - v_attempts)
        where usage_date = (statement_timestamp() at time zone 'UTC')::date;
      delete from auth.users where id = 'd1300000-0000-4000-8000-000000000099';
    end;
    $cleanup$;
  $remote$)
$sql$, 'removes committed race fixtures and restores the shared local attempt count');
select is((select count(*) from auth.users where id = 'd1300000-0000-4000-8000-000000000099'), 0::bigint, 'race fixture is removed after the independent-connection check');
select lives_ok($$select extensions.dblink_disconnect('quota_a')$$, 'closes quota race connection A');
select lives_ok($$select extensions.dblink_disconnect('quota_b')$$, 'closes quota race connection B');
select lives_ok($$select extensions.dblink_disconnect('quota_c')$$, 'closes quota race connection C');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000002', 'easy-versions', 'd1300000-0000-4000-8000-000000000101', null
)->>'allowed'), 'true', 'first easy-version request is reserved');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000002', 'easy-versions', 'd1300000-0000-4000-8000-000000000102', null
)->>'allowed'), 'true', 'second easy-version request is reserved');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000002', 'easy-versions', 'd1300000-0000-4000-8000-000000000103', null
)->>'allowed'), 'false', 'third easy-version request exceeds the per-user daily cap');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000002', 'stage-breakdown', 'd1300000-0000-4000-8000-000000000104', null
)->>'allowed'), 'true', 'stage-breakdown has an independent action bucket');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000002', 'stage-breakdown', 'd1300000-0000-4000-8000-000000000105', null
)->>'allowed'), 'true', 'second stage-breakdown request is reserved');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000002', 'stage-breakdown', 'd1300000-0000-4000-8000-000000000106', null
)->>'allowed'), 'false', 'third stage-breakdown request is denied');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000002', 'weekly-summary', 'd1300000-0000-4000-8000-000000000107',
  current_date - (extract(isodow from current_date)::integer - 1)
)->>'allowed'), 'true', 'first weekly-summary cache miss may be generated');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000002', 'weekly-summary', 'd1300000-0000-4000-8000-000000000108',
  current_date - (extract(isodow from current_date)::integer - 1)
)->>'allowed'), 'true', 'second failed initial-summary attempt remains available');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000002', 'weekly-summary', 'd1300000-0000-4000-8000-000000000109',
  current_date - (extract(isodow from current_date)::integer - 1)
)->>'allowed'), 'false', 'third initial-summary attempt is denied');
select throws_ok(
  format($sql$select public.ai_begin_request(
    'd1300000-0000-4000-8000-000000000002', 'weekly-summary', 'd1300000-0000-4000-8000-000000000110',
    %L::date
  )$sql$, current_date - (extract(isodow from current_date)::integer - 1) - 7),
  'P0001', 'requested week is not the current account week',
  'caller cannot choose a different weekly-summary week'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$insert into public.weekly_summaries (user_id, week_start, summary)
    values (auth.uid(), current_date - (extract(isodow from current_date)::integer - 1), 'Persisted cache')$$,
  'successful first generation can persist through the existing client insert contract'
);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000002', 'weekly-summary', 'd1300000-0000-4000-8000-000000000111',
  current_date - (extract(isodow from current_date)::integer - 1)
)->>'allowed'), 'false', 'a cached summary cannot be regenerated without a pending manual reservation');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000001', 'weekly-summary', 'd1300000-0000-4000-8000-000000000112',
  current_date - (extract(isodow from current_date)::integer - 1)
)->>'requestClass'), 'regeneration', 'manual reservation is consumed only by its verified owner and week');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000001', 'weekly-summary', 'd1300000-0000-4000-8000-000000000113',
  current_date - (extract(isodow from current_date)::integer - 1)
)->>'allowed'), 'true', 'each pending manual reservation authorizes one request');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000001', 'weekly-summary', 'd1300000-0000-4000-8000-000000000114',
  current_date - (extract(isodow from current_date)::integer - 1)
)->>'allowed'), 'false', 'a consumed or absent pending reservation cannot be replayed');
select ok(public.ai_reserve_next_attempt('d1300000-0000-4000-8000-000000000112', 2), 'retry reserves one provider-attempt slot');
select ok(public.ai_reserve_next_attempt('d1300000-0000-4000-8000-000000000112', 2), 'replaying the same attempt number succeeds idempotently');
reset role;
select is((select count(*) from private.ai_provider_attempts where request_id = 'd1300000-0000-4000-8000-000000000112'), 2::bigint, 'one logical request and its retry use two unique provider slots');
select is(
  (select attempt_count::bigint from private.ai_provider_daily_usage where usage_date = (statement_timestamp() at time zone 'UTC')::date),
  (select count(*) from private.ai_provider_attempts where usage_date = (statement_timestamp() at time zone 'UTC')::date),
  'an idempotent retry replay does not add a provider quota charge'
);

-- Migration 045: per-user cap from config, exhausted-provider ledger.
reset role;
select is((select max_user_requests_per_action from private.ai_quota_config where singleton), 2,
  'the per-user cap lives in the config row and is still 2');
insert into auth.users (id, email, raw_user_meta_data) values
  ('d1300000-0000-4000-8000-000000000003', 'quota-third@example.invalid', '{"display_name":"Quota Third","time_zone":"UTC"}'::jsonb),
  ('d1300000-0000-4000-8000-000000000004', 'quota-fourth@example.invalid', '{"display_name":"Quota Fourth","time_zone":"UTC"}'::jsonb);
update private.ai_quota_config set max_user_requests_per_action = 3 where singleton;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((public.ai_begin_request('d1300000-0000-4000-8000-000000000003', 'easy-versions', 'd1300000-0000-4000-8000-000000000201', null)->>'allowed'), 'true', 'cap 3: first request is allowed');
select is((public.ai_begin_request('d1300000-0000-4000-8000-000000000003', 'easy-versions', 'd1300000-0000-4000-8000-000000000202', null)->>'allowed'), 'true', 'cap 3: second request is allowed');
select is((public.ai_begin_request('d1300000-0000-4000-8000-000000000003', 'easy-versions', 'd1300000-0000-4000-8000-000000000203', null)->>'allowed'), 'true', 'cap 3: third request is allowed once the config row says 3');
select is((public.ai_begin_request('d1300000-0000-4000-8000-000000000003', 'easy-versions', 'd1300000-0000-4000-8000-000000000204', null)->>'reason'), 'user_limit', 'cap 3: the fourth request is refused as user_limit');
reset role;
update private.ai_quota_config set max_user_requests_per_action = 2 where singleton;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((public.ai_begin_request('d1300000-0000-4000-8000-000000000003', 'easy-versions', 'd1300000-0000-4000-8000-000000000205', null)->>'allowed'), 'false', 'cap back at 2: a user already at 3 stays refused');
reset role;
select throws_ok($$update private.ai_quota_config set max_user_requests_per_action = 0 where singleton$$, '23514', null, 'the cap must be at least 1');
select throws_ok($$update private.ai_quota_config set max_user_requests_per_action = 101 where singleton$$, '23514', null, 'the cap is at most 100');

select ok(to_regclass('private.ai_provider_exhaustion') is not null, 'the exhausted-provider ledger exists');
select ok((select relrowsecurity from pg_class where oid = 'private.ai_provider_exhaustion'::regclass), 'the exhausted-provider ledger has RLS on');
select ok(
  not has_table_privilege('service_role', 'private.ai_provider_exhaustion', 'SELECT')
    and not has_table_privilege('authenticated', 'private.ai_provider_exhaustion', 'SELECT'),
  'API roles cannot read the exhausted-provider ledger directly'
);
select ok(to_regprocedure('public.ai_mark_provider_exhausted(uuid,text,text)') is not null, 'the mark-exhausted RPC exists');
select ok(
  has_function_privilege('service_role', 'public.ai_mark_provider_exhausted(uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.ai_mark_provider_exhausted(uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.ai_mark_provider_exhausted(uuid,text,text)', 'EXECUTE'),
  'only the service role can mark a provider exhausted'
);

select is(private.ai_next_midnight('UTC', '2026-10-07 13:00+00'), '2026-10-08 00:00+00'::timestamptz, 'next UTC midnight');
select is(private.ai_next_midnight('America/Los_Angeles', '2026-10-08 00:30+00'), '2026-10-08 07:00+00'::timestamptz, 'next Pacific midnight is 07:00 UTC in October');
select is(private.ai_next_midnight('America/Los_Angeles', '2026-10-08 08:00+00'), '2026-10-09 07:00+00'::timestamptz, 'a moment after Pacific midnight rolls to the following one');
select is(private.ai_next_midnight('Asia/Manila', '2026-10-07 17:00+00'), '2026-10-08 16:00+00'::timestamptz, 'a zone ahead of UTC resolves to its own midnight');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((public.ai_begin_request('d1300000-0000-4000-8000-000000000004', 'easy-versions', 'd1300000-0000-4000-8000-000000000211', null)->'exhaustedProviders'), '[]'::jsonb, 'no provider is exhausted at first');
select is(public.ai_mark_provider_exhausted('d1300000-0000-4000-8000-000000000211', 'groq', 'UTC'), true, 'a daily-quota failure marks the provider');
select is((public.ai_begin_request('d1300000-0000-4000-8000-000000000004', 'stage-breakdown', 'd1300000-0000-4000-8000-000000000212', null)->'exhaustedProviders'), '["groq"]'::jsonb, 'the next request is told which provider to skip');
select is((public.ai_begin_request('d1300000-0000-4000-8000-000000000004', 'easy-versions', 'd1300000-0000-4000-8000-000000000211', null)->'exhaustedProviders'), '["groq"]'::jsonb, 'a replayed request id also reports exhausted providers');
select is(public.ai_mark_provider_exhausted('d1300000-0000-4000-8000-0000000002ff', 'groq', 'UTC'), false, 'an unknown request id marks nothing');
select throws_ok($$select public.ai_mark_provider_exhausted('d1300000-0000-4000-8000-000000000211', 'Bad Name!', 'UTC')$$, '22023', null, 'a malformed provider name is refused');
select throws_ok($$select public.ai_mark_provider_exhausted('d1300000-0000-4000-8000-000000000211', 'groq', 'Not/AZone')$$, '22023', null, 'an unknown time zone is refused');
select throws_ok($$select public.ai_mark_provider_exhausted(null, 'groq', 'UTC')$$, '22023', null, 'a null request id is refused');
reset role;
select ok((select exhausted_until from private.ai_provider_exhaustion where provider = 'groq')
  = private.ai_next_midnight('UTC', statement_timestamp()), 'the mark lasts until the next midnight in the given zone');
update private.ai_provider_exhaustion set exhausted_until = statement_timestamp() + interval '3 days' where provider = 'groq';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.ai_mark_provider_exhausted('d1300000-0000-4000-8000-000000000211', 'groq', 'UTC');
reset role;
select ok((select exhausted_until from private.ai_provider_exhaustion where provider = 'groq') > statement_timestamp() + interval '2 days', 'a later mark never shortens an existing one');
update private.ai_provider_exhaustion set exhausted_until = statement_timestamp() - interval '1 minute' where provider = 'groq';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((public.ai_begin_request('d1300000-0000-4000-8000-000000000001', 'stage-breakdown', 'd1300000-0000-4000-8000-000000000213', null)->'exhaustedProviders'), '[]'::jsonb, 'an expired mark is not reported');

reset role;
update private.ai_quota_config
set max_provider_attempts = (select attempt_count from private.ai_provider_daily_usage
  where usage_date = (statement_timestamp() at time zone 'UTC')::date) + 1
where singleton;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000001', 'easy-versions', 'd1300000-0000-4000-8000-000000000115', null
)->>'allowed'), 'true', 'the last available project provider slot is reserved');
select is((public.ai_begin_request(
  'd1300000-0000-4000-8000-000000000001', 'easy-versions', 'd1300000-0000-4000-8000-000000000116', null
)->>'allowed'), 'false', 'the project-wide provider-attempt ceiling denies the next request');
reset role;
select is((select attempt_count from private.ai_provider_daily_usage
  where usage_date = (statement_timestamp() at time zone 'UTC')::date),
  (select max_provider_attempts from private.ai_quota_config where singleton),
  'provider attempts never exceed the configured UTC-day ceiling'
);

select * from finish();
rollback;
