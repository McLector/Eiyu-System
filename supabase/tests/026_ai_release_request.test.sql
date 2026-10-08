begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local statement_timeout = '30s';

select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('d2600000-0000-4000-8000-000000000001', 'refund-a@example.invalid', '{"display_name":"Refund A","time_zone":"UTC"}'::jsonb),
  ('d2600000-0000-4000-8000-000000000002', 'refund-b@example.invalid', '{"display_name":"Refund B","time_zone":"UTC"}'::jsonb);

-- Shape and privileges.
select ok(to_regprocedure('public.ai_release_request(uuid)') is not null, 'the refund RPC exists');
select ok(
  exists (select 1 from information_schema.columns
    where table_schema = 'private' and table_name = 'ai_logical_requests' and column_name = 'refunded_at'),
  'logical requests remember when they were refunded'
);
select ok(
  coalesce((select has_function_privilege('service_role', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    from pg_proc p where p.oid = to_regprocedure('public.ai_release_request(uuid)')), false),
  'only the trusted service role can refund a request'
);

-- Fill user A's easy-versions bucket (cap 2) and refund one request.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is((public.ai_begin_request('d2600000-0000-4000-8000-000000000001', 'easy-versions', 'd2600000-0000-4000-8000-000000000101', null)->>'allowed'), 'true', 'first request is reserved');
select is((public.ai_begin_request('d2600000-0000-4000-8000-000000000001', 'easy-versions', 'd2600000-0000-4000-8000-000000000102', null)->>'allowed'), 'true', 'second request is reserved');
select is((public.ai_begin_request('d2600000-0000-4000-8000-000000000001', 'easy-versions', 'd2600000-0000-4000-8000-000000000103', null)->>'reason'), 'user_limit', 'the bucket is full');

select is(public.ai_release_request('d2600000-0000-4000-8000-000000000101'), true, 'refunding a live request reports true');
reset role;
select is((select request_count from private.ai_user_daily_usage
  where user_id = 'd2600000-0000-4000-8000-000000000001' and action = 'easy-versions'
    and usage_date = (statement_timestamp() at time zone 'UTC')::date), 1, 'the refund gives one attempt back');
select isnt((select refunded_at from private.ai_logical_requests where request_id = 'd2600000-0000-4000-8000-000000000101'), null, 'the refund is stamped');
select is((select refunded_at from private.ai_logical_requests where request_id = 'd2600000-0000-4000-8000-000000000102'), null, 'other requests are not stamped');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.ai_release_request('d2600000-0000-4000-8000-000000000101'), false, 'a double refund is a no-op');
reset role;
select is((select request_count from private.ai_user_daily_usage
  where user_id = 'd2600000-0000-4000-8000-000000000001' and action = 'easy-versions'
    and usage_date = (statement_timestamp() at time zone 'UTC')::date), 1, 'a double refund does not give a second attempt back');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((public.ai_begin_request('d2600000-0000-4000-8000-000000000001', 'easy-versions', 'd2600000-0000-4000-8000-000000000104', null)->>'allowed'), 'true', 'the refunded attempt can be used again');

select is(public.ai_release_request('d2600000-0000-4000-8000-0000000009ff'), false, 'an unknown request id is a no-op');
select is(public.ai_release_request(null), false, 'a null request id is a no-op');

-- The provider-attempt ledger is not refunded: the provider calls did happen.
reset role;
select is((select count(*) from private.ai_provider_attempts where request_id = 'd2600000-0000-4000-8000-000000000101'), 1::bigint, 'a refund keeps the provider-attempt record');

-- Never below zero, even if the counter has drifted.
update private.ai_user_daily_usage set request_count = 0
  where user_id = 'd2600000-0000-4000-8000-000000000001' and action = 'easy-versions';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$select public.ai_release_request('d2600000-0000-4000-8000-000000000102')$$, 'refunding with a zero counter does not fail');
reset role;
select is((select request_count from private.ai_user_daily_usage
  where user_id = 'd2600000-0000-4000-8000-000000000001' and action = 'easy-versions'
    and usage_date = (statement_timestamp() at time zone 'UTC')::date), 0, 'the counter never goes below zero');

-- Weekly summary: the initial bucket is the one that is refunded.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((public.ai_begin_request('d2600000-0000-4000-8000-000000000002', 'weekly-summary', 'd2600000-0000-4000-8000-000000000201',
  current_date - (extract(isodow from current_date)::integer - 1))->>'requestClass'), 'initial', 'a weekly summary starts as an initial request');
select is(public.ai_release_request('d2600000-0000-4000-8000-000000000201'), true, 'a weekly summary can be refunded');
reset role;
select is((select request_count from private.ai_user_daily_usage
  where user_id = 'd2600000-0000-4000-8000-000000000002' and action = 'weekly-summary-initial'
    and usage_date = (statement_timestamp() at time zone 'UTC')::date), 0, 'the weekly-summary-initial bucket is refunded');

-- A regeneration charges no per-user bucket, so refunding it touches nothing.
insert into private.ai_user_daily_usage (user_id, usage_date, action, request_count)
values ('d2600000-0000-4000-8000-000000000002', (statement_timestamp() at time zone 'UTC')::date, 'easy-versions', 1);
insert into private.ai_logical_requests (request_id, user_id, action, request_class, account_date, week_start)
values ('d2600000-0000-4000-8000-000000000202', 'd2600000-0000-4000-8000-000000000002', 'weekly-summary', 'regeneration',
  (statement_timestamp() at time zone 'UTC')::date, current_date - (extract(isodow from current_date)::integer - 1));
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.ai_release_request('d2600000-0000-4000-8000-000000000202'), false, 'a regeneration has no bucket to refund');
reset role;
select is((select sum(request_count)::integer from private.ai_user_daily_usage
  where user_id = 'd2600000-0000-4000-8000-000000000002' and action = 'easy-versions'), 1, 'refunding a regeneration leaves other buckets alone');

-- Callers other than the service role are refused.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2600000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select public.ai_release_request('d2600000-0000-4000-8000-000000000102')$$, '42501', null, 'an authenticated user cannot refund');
reset role;
set local role anon;
select throws_ok($$select public.ai_release_request('d2600000-0000-4000-8000-000000000102')$$, '42501', null, 'an anonymous caller cannot refund');
reset role;

select * from finish();
rollback;
