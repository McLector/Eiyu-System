create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;

select plan(18);

select lives_ok(
  $$select extensions.dblink_connect('phase5_a', 'host=host.docker.internal port=55322 dbname=postgres user=postgres password=postgres application_name=phase5_a options=-csearch_path=')$$,
  'opens the first independent database connection'
);
select lives_ok(
  $$select extensions.dblink_connect('phase5_b', 'host=host.docker.internal port=55322 dbname=postgres user=postgres password=postgres application_name=phase5_b options=-csearch_path=')$$,
  'opens the second independent database connection'
);
select lives_ok(
  $test$
    select extensions.dblink_exec('phase5_a', $setup$
      insert into auth.users (id, email, raw_user_meta_data)
      values ('55555555-5555-4555-8555-555555555001', 'phase5-concurrency@example.invalid', '{"display_name":"Phase 5 Concurrency"}'::jsonb);

      insert into public.long_quests (id, user_id, name, stat)
      values ('55555555-5555-4555-8555-555555556001', '55555555-5555-4555-8555-555555555001', 'Concurrent quest', 'STR');

      insert into public.long_quest_stages (id, long_quest_id, user_id, name, position, done)
      values
        ('55555555-5555-4555-8555-555555557001', '55555555-5555-4555-8555-555555556001', '55555555-5555-4555-8555-555555555001', 'Stage 1', 0, false),
        ('55555555-5555-4555-8555-555555557002', '55555555-5555-4555-8555-555555556001', '55555555-5555-4555-8555-555555555001', 'Stage 2', 1, false)
    $setup$)
  $test$,
  'commits concurrency fixtures outside the pgTAP runner transaction'
);
select lives_ok(
  $$select extensions.dblink_exec('phase5_a', 'begin; set local role authenticated; set local "request.jwt.claim.sub" = ''55555555-5555-4555-8555-555555555001''')$$,
  'starts the first authenticated transaction'
);
select lives_ok(
  $$select extensions.dblink_exec('phase5_b', 'begin; set local role authenticated; set local "request.jwt.claim.sub" = ''55555555-5555-4555-8555-555555555001''')$$,
  'starts the second authenticated transaction'
);

select ok(
  extensions.dblink_send_query('phase5_a', $$select public.set_long_quest_stage_done('55555555-5555-4555-8555-555555557001', true)$$) = 1,
  'starts Stage 1 completion on the first connection'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('phase5_a') as result(value text)$$,
  'the first transition succeeds while its transaction keeps the quest lock'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('phase5_a') as result(value text)$$,
  'drains the first asynchronous command status'
);
select ok(
  extensions.dblink_send_query('phase5_b', $$select public.set_long_quest_stage_done('55555555-5555-4555-8555-555555557002', true)$$) = 1,
  'starts Stage 2 completion concurrently'
);
select is(
  extensions.dblink_is_busy('phase5_b'),
  1,
  'the second transition waits for the authoritative quest lock'
);

select lives_ok(
  $$select extensions.dblink_exec('phase5_a', 'commit')$$,
  'commits Stage 1 and releases the quest lock'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('phase5_b') as result(value text)$$,
  'Stage 2 rechecks after the lock and succeeds against committed Stage 1'
);
select lives_ok(
  $$select * from extensions.dblink_get_result('phase5_b') as result(value text)$$,
  'drains the second asynchronous command status'
);
select lives_ok(
  $$select extensions.dblink_exec('phase5_b', 'commit')$$,
  'commits the serialized Stage 2 transition'
);
select is(
  (select count(*) from public.long_quest_stages where long_quest_id = '55555555-5555-4555-8555-555555556001' and done),
  2::bigint,
  'both concurrent transitions persist once in valid order'
);

select lives_ok(
  $$select extensions.dblink_exec('phase5_a', 'delete from auth.users where id = ''55555555-5555-4555-8555-555555555001''')$$,
  'removes the committed concurrency fixtures'
);
select lives_ok($$select extensions.dblink_disconnect('phase5_a')$$, 'closes the first connection');
select lives_ok($$select extensions.dblink_disconnect('phase5_b')$$, 'closes the second connection');

select * from finish();
