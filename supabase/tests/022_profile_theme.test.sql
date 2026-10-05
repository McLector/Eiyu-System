begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local statement_timeout = '30s';

select plan(10);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'theme', 'UPDATE')
  and not has_column_privilege('anon', 'public.profiles', 'theme', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'time_zone', 'UPDATE'),
  'the theme is writable by its owner without opening the timezone column'
);
select ok(
  has_function_privilege('authenticated', to_regprocedure('public.set_profile_theme(text)'), 'EXECUTE')
  and not has_function_privilege('anon', to_regprocedure('public.set_profile_theme(text)'), 'EXECUTE'),
  'only signed-in users can set a theme'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22', 'theme-a@example.invalid', '{"display_name":"Theme A","time_zone":"UTC"}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb23', 'theme-b@example.invalid', '{"display_name":"Theme B","time_zone":"UTC"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select theme from public.profiles where user_id = auth.uid()), 'dark', 'a new account starts dark');
select is(public.set_profile_theme('light'), 'light', 'the RPC stores and returns the theme');
select is((select theme from public.profiles where user_id = auth.uid()), 'light', 'the theme is persisted on the caller''s row');
select is(public.set_profile_theme('dark'), 'dark', 'a later pick replaces the earlier one');

select throws_ok($$select public.set_profile_theme('Light')$$, 'P0001', 'Theme must be dark or light.', 'upper case is rejected');
select throws_ok($$select public.set_profile_theme('system')$$, 'P0001', 'Theme must be dark or light.', 'an unknown theme is rejected');
select throws_ok($$select public.set_profile_theme(null)$$, 'P0001', 'Theme must be dark or light.', 'null is rejected');

reset role;
select is((select theme from public.profiles where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb23'), 'dark', 'another account''s theme is untouched');

select * from finish();
rollback;
