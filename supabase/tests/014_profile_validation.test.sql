begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local statement_timeout = '30s';

select no_plan();

-- Tracker writes go through public.apply_tracker_write (S02 contract). The
-- fixture roots are legacy rows without provenance, i.e. custom roots.
create function pg_temp.gw(op text, args jsonb, targets jsonb default '[]')
returns jsonb language sql set search_path = '' as $$
  select public.apply_tracker_write(
    op,
    args || jsonb_build_object('p_expected_targets', targets),
    public.get_tracker_processing_access()->'revision'
  );
$$;

select has_function('public', 'update_profile', array['text', 'text']::text[], 'profile edits retain the authenticated RPC');
select ok(
  not has_function_privilege('anon', 'public.validate_profile_edit_text()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.validate_profile_edit_text()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.validate_quest_name_edit()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.validate_quest_name_edit()', 'EXECUTE'),
  'profile and quest trigger validators are not exposed RPCs'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'profile-validation-a@example.invalid', '{"display_name":"Validation A","time_zone":"UTC","birth_date":"2000-01-01"}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb14', 'profile-validation-b@example.invalid', '{"display_name":"Validation B","time_zone":"Asia/Manila","birth_date":"2000-01-01"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  format('select public.update_profile(%L, ''Pathfinder'')', chr(8203)),
  'P0001', 'Enter a display name.', 'the profile RPC rejects a zero-width-space-only name'
);
select throws_ok(
  format('select public.update_profile(%L, ''Pathfinder'')', chr(8204)),
  'P0001', 'Enter a display name.', 'the profile RPC rejects a zero-width-non-joiner-only name'
);
select throws_ok(
  format('select public.update_profile(%L, ''Pathfinder'')', chr(8205)),
  'P0001', 'Enter a display name.', 'the profile RPC rejects a zero-width-joiner-only name'
);
select throws_ok(
  format('select public.update_profile(%L, ''Pathfinder'')', chr(8288)),
  'P0001', 'Enter a display name.', 'the profile RPC rejects a word-joiner-only name'
);
select throws_ok(
  format('select public.update_profile(%L, ''Pathfinder'')', chr(65279)),
  'P0001', 'Enter a display name.', 'the profile RPC rejects a BOM-only name'
);
select throws_ok(
  format('select public.update_profile(%L, ''Pathfinder'')', ' ' || chr(160) || chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279)),
  'P0001', 'Enter a display name.', 'the profile RPC rejects a combined whitespace and formatting-only name'
);

select is(
  (public.update_profile(repeat('😀', 80), 'Pathfinder') ->> 'displayName'), repeat('😀', 80),
  'the profile RPC accepts exactly 80 Unicode code points'
);
select throws_ok(
  format('select public.update_profile(%L, ''Pathfinder'')', repeat('😀', 81)),
  'P0001', 'Display name must be 80 characters or fewer.', 'the profile RPC rejects 81 Unicode code points'
);
select is(
  (public.update_profile('👨' || chr(8205) || '👩' || chr(8205) || '👧' || chr(8205) || '👦', 'ک' || chr(8204) || 'تاب') ->> 'displayName'),
  '👨' || chr(8205) || '👩' || chr(8205) || '👧' || chr(8205) || '👦',
  'the profile RPC preserves internal joiners in a family emoji and visible text'
);
select is(
  (select user_class from public.profiles where user_id = auth.uid()), 'ک' || chr(8204) || 'تاب',
  'the profile RPC preserves an internal non-joiner in visible linguistic text'
);
select is(
  (public.update_profile(chr(8203) || 'Visible' || chr(8203), 'Pathfinder') ->> 'displayName'), 'Visible',
  'the profile RPC strips recognized separators at visible-name boundaries'
);

select throws_ok(
  format('update public.profiles set display_name = %L where user_id = auth.uid()', chr(8203)),
  'P0001', 'Enter a display name.', 'a direct authenticated profile update cannot store invisible-only text'
);
select is(
  (select display_name from public.profiles where user_id = auth.uid()), 'Visible',
  'the failed direct profile update leaves the saved profile unchanged'
);
select lives_ok(
  format('update public.profiles set display_name = %L where user_id = auth.uid()', repeat('😀', 80)),
  'a direct authenticated profile update accepts exactly 80 code points'
);
select throws_ok(
  format('update public.profiles set display_name = %L where user_id = auth.uid()', repeat('😀', 81)),
  'P0001', 'Display name must be 80 characters or fewer.', 'a direct authenticated profile update rejects 81 code points'
);

-- Direct table writes are denied to clients; the name triggers are exercised
-- as the table owner, and the gateway's own name validation is checked below.
reset role;
insert into public.habits (user_id, name, easy_version, stat, difficulty, days)
values (auth.uid(), repeat('😀', 80), 'One minute', 'INT', 'Medium', '{0,1,2,3,4,5,6}');
select lives_ok(
  format('insert into public.habits (user_id, name, easy_version, stat, difficulty, days) values (%L, %L, ''One minute'', ''INT'', ''Medium'', ''{0,1,2,3,4,5,6}'')', auth.uid(), repeat('😀', 80)),
  'a habit accepts an 80-code-point name'
);
select throws_ok(
  format('insert into public.habits (user_id, name, easy_version, stat, difficulty, days) values (%L, %L, ''One minute'', ''INT'', ''Medium'', ''{0,1,2,3,4,5,6}'')', auth.uid(), repeat('😀', 81)),
  'P0001', 'Quest name must be 80 characters or fewer.', 'a habit rejects an 81-code-point name'
);
select throws_ok(
  format('insert into public.habits (user_id, name, easy_version, stat, difficulty, days) values (%L, %L, ''One minute'', ''INT'', ''Medium'', ''{0,1,2,3,4,5,6}'')', auth.uid(), chr(8203) || chr(8204) || chr(8205) || chr(8288)),
  'P0001', 'Enter a quest name.', 'a habit rejects invisible-only text'
);

insert into public.long_quests (user_id, name, stat) values (auth.uid(), repeat('🧭', 80), 'INT');
select lives_ok(
  format('insert into public.long_quests (user_id, name, stat) values (%L, %L, ''INT'')', auth.uid(), repeat('🧭', 80)),
  'a long quest accepts an 80-code-point name'
);
select throws_ok(
  format('insert into public.long_quests (user_id, name, stat) values (%L, %L, ''INT'')', auth.uid(), repeat('🧭', 81)),
  'P0001', 'Quest name must be 80 characters or fewer.', 'a long quest rejects an 81-code-point name'
);
select throws_ok(
  format('insert into public.long_quests (user_id, name, stat) values (%L, %L, ''INT'')', auth.uid(), chr(8203) || chr(8204) || chr(8205) || chr(8288)),
  'P0001', 'Enter a quest name.', 'a long quest rejects invisible-only text'
);

set local role authenticated;
select throws_ok(
  'insert into public.habits (user_id, name, easy_version, stat, difficulty, days) values (auth.uid(), ''client write'', ''One minute'', ''INT'', ''Medium'', ''{0,1,2,3,4,5,6}'')',
  '42501', 'permission denied for table habits', 'clients cannot insert habits directly'
);
select throws_ok(
  'insert into public.long_quests (user_id, name, stat) values (auth.uid(), ''client write'', ''INT'')',
  '42501', 'permission denied for table long_quests', 'clients cannot insert long quests directly'
);
select public.set_tracker_processing_consent(
  'custom-tracker', true, '2026-10-23-custom-tracker-v1',
  public.get_tracker_processing_access()->'revision'
);

-- The gateway validates names before the table triggers can run.
select lives_ok(
  format($sql$select pg_temp.gw('habit-save', jsonb_build_object('p_id', '%s', 'p_create', true, 'p_mode', 'custom',
    'p_input', jsonb_build_object('name', %L, 'easyVersion', 'One minute', 'stat', 'INT', 'difficulty', 'Medium', 'time', '08:00', 'days', jsonb_build_array(0,1,2,3,4,5,6))))$sql$,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1411', repeat('😀', 80)),
  'the gateway accepts an 80-code-point habit name'
);
select throws_ok(
  format($sql$select pg_temp.gw('habit-save', jsonb_build_object('p_id', '%s', 'p_create', true, 'p_mode', 'custom',
    'p_input', jsonb_build_object('name', %L, 'easyVersion', 'One minute', 'stat', 'INT', 'difficulty', 'Medium', 'time', '08:00', 'days', jsonb_build_array(0,1,2,3,4,5,6))))$sql$,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1412', repeat('😀', 81)),
  '22023', 'Enter a valid quest name.', 'the gateway rejects an 81-code-point habit name'
);
select throws_ok(
  format($sql$select pg_temp.gw('habit-save', jsonb_build_object('p_id', '%s', 'p_create', true, 'p_mode', 'custom',
    'p_input', jsonb_build_object('name', %L, 'easyVersion', 'One minute', 'stat', 'INT', 'difficulty', 'Medium', 'time', '08:00', 'days', jsonb_build_array(0,1,2,3,4,5,6))))$sql$,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1413', chr(8203) || chr(8204) || chr(8205) || chr(8288)),
  '22023', 'Enter a valid quest name.', 'the gateway rejects invisible-only habit text'
);
reset role;
alter table public.habits disable trigger habits_validate_name_length;
alter table public.long_quests disable trigger long_quests_validate_name_length;
insert into public.habits (id, user_id, name, easy_version, stat, difficulty, days)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1401', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', repeat('L', 81), 'One minute', 'INT', 'Medium', '{0,1,2,3,4,5,6}');
insert into public.long_quests (id, user_id, name, stat)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1402', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', repeat('Q', 81), 'INT');
insert into public.long_quest_stages (id, long_quest_id, user_id, name, position)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1403', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1402', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', 'Legacy stage', 0);
alter table public.habits enable trigger habits_validate_name_length;
alter table public.long_quests enable trigger long_quests_validate_name_length;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14', true);
select lives_ok(
  format($sql$select pg_temp.gw('habit-save', jsonb_build_object('p_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1401', 'p_create', false, 'p_mode', 'custom',
    'p_input', jsonb_build_object('name', %L, 'easyVersion', 'One minute', 'stat', 'WIS', 'difficulty', 'Medium', 'time', '08:00', 'days', jsonb_build_array(0,1,2,3,4,5,6))),
    '[{"kind":"habit","id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1401","inputKind":"custom"}]')$sql$, repeat('L', 81)),
  'an unchanged legacy habit name remains usable during an unrelated update'
);
select throws_ok(
  format($sql$select pg_temp.gw('habit-save', jsonb_build_object('p_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1401', 'p_create', false, 'p_mode', 'custom',
    'p_input', jsonb_build_object('name', %L, 'easyVersion', 'One minute', 'stat', 'WIS', 'difficulty', 'Medium', 'time', '08:00', 'days', jsonb_build_array(0,1,2,3,4,5,6))),
    '[{"kind":"habit","id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1401","inputKind":"custom"}]')$sql$, repeat('N', 81)),
  '22023', 'Enter a valid quest name.', 'a legacy habit cannot be renamed to a new over-limit name through the gateway'
);
select lives_ok(
  format($sql$select pg_temp.gw('chain-save', jsonb_build_object('p_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1402', 'p_request_id', gen_random_uuid(), 'p_create', false, 'p_mode', 'custom',
    'p_input', jsonb_build_object('name', %L, 'stat', 'WIS', 'stages', jsonb_build_array(jsonb_build_object('id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1403', 'name', 'Legacy stage')))),
    '[{"kind":"chain","id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1402","inputKind":"custom"}]')$sql$, repeat('Q', 81)),
  'an unchanged legacy long quest name remains usable during an unrelated update'
);
select throws_ok(
  format($sql$select pg_temp.gw('chain-save', jsonb_build_object('p_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1402', 'p_request_id', gen_random_uuid(), 'p_create', false, 'p_mode', 'custom',
    'p_input', jsonb_build_object('name', %L, 'stat', 'WIS', 'stages', jsonb_build_array(jsonb_build_object('id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1403', 'name', 'Legacy stage')))),
    '[{"kind":"chain","id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1402","inputKind":"custom"}]')$sql$, repeat('N', 81)),
  'P0001', 'Quest name must contain visible text and be 80 characters or fewer.', 'a legacy long quest cannot be renamed to a new over-limit name through the gateway'
);
-- The table triggers also hold for the owner (clients cannot write directly).
reset role;
select throws_ok(
  'update public.habits set name = repeat(''N'', 81) where id = ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1401''',
  'P0001', 'Quest name must be 80 characters or fewer.', 'the habit name trigger rejects a new over-limit name'
);
select lives_ok(
  'update public.habits set stat = ''DEX'' where id = ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1401''',
  'the habit name trigger tolerates an unchanged legacy name'
);
select throws_ok(
  'update public.long_quests set name = repeat(''N'', 81) where id = ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1402''',
  'P0001', 'Quest name must be 80 characters or fewer.', 'the long quest name trigger rejects a new over-limit name'
);

select finish();
rollback;
