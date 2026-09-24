begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local statement_timeout = '30s';

select plan(17);

select has_function('public', 'update_profile', array['text', 'text']::text[], 'profile editing is an authenticated RPC');
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
  and has_column_privilege('authenticated', 'public.profiles', 'user_class', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'time_zone', 'UPDATE'),
  'authenticated profile writes are limited to presentation columns'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'phase4-profile-a@example.invalid', '{"display_name":"Profile A","time_zone":"UTC"}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'phase4-profile-b@example.invalid', '{"display_name":"Profile B","time_zone":"Asia/Manila"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*) from public.profiles), 1::bigint, 'profile reads remain owner isolated');
select is((public.update_profile('  Profile A 🧭  ', '  Pathfinder  ') ->> 'displayName'), 'Profile A 🧭', 'the RPC trims and stores Unicode display names');
select is((public.update_profile('Profile A 🧭', 'Pathfinder') ->> 'userClass'), 'Pathfinder', 'the RPC returns the persisted class');
select is((select time_zone from public.profiles where user_id = auth.uid()), 'UTC', 'profile editing does not change the account timezone');
select is((select coalesce(sum(xp), 0) from public.stats where user_id = auth.uid()), 0::bigint, 'profile editing does not alter XP');

select throws_ok(
  $$select public.update_profile(' ', 'Pathfinder')$$,
  'P0001',
  'Enter a display name.',
  'blank display names are rejected server-side'
);
select throws_ok(
  format($sql$select public.update_profile(%L, 'Pathfinder')$sql$, repeat('😀', 81)),
  'P0001',
  'Display name must be 80 characters or fewer.',
  'Unicode code points over the limit are rejected server-side'
);
select throws_ok(
  $$select public.update_profile('Profile A', '')$$,
  'P0001',
  'Enter a class.',
  'blank classes are rejected server-side'
);
select throws_ok(
  $$update public.profiles set time_zone = 'Asia/Tokyo' where user_id = auth.uid()$$,
  '42501',
  'permission denied for table profiles',
  'direct timezone writes remain blocked'
);

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', true);
select is((public.update_profile('Profile B Updated', 'Scholar') ->> 'displayName'), 'Profile B Updated', 'the second owner can edit only their own profile');
select is((select display_name from public.profiles where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'), NULL::text, 'the second owner cannot read the first owner profile');
select is((select display_name from public.profiles where user_id = auth.uid()), 'Profile B Updated', 'the second owner reads their own persisted value');
select is((select user_class from public.profiles where user_id = auth.uid()), 'Scholar', 'the second owner reads their own class');
select is((select time_zone from public.profiles where user_id = auth.uid()), 'Asia/Manila', 'the second owner timezone is unchanged');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', true);
select is((select display_name from public.profiles where user_id = auth.uid()), 'Profile A 🧭', 'the first owner still reads their persisted value');

select finish();
rollback;
