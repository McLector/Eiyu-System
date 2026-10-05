begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local statement_timeout = '30s';

select plan(12);

select has_column('public', 'profiles', 'palette', 'profiles carry a palette');
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'palette', 'UPDATE')
  and not has_column_privilege('anon', 'public.profiles', 'palette', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'time_zone', 'UPDATE'),
  'the palette is writable by its owner without opening the timezone column'
);
select ok(
  has_function_privilege('authenticated', to_regprocedure('public.set_profile_palette(text)'), 'EXECUTE')
  and not has_function_privilege('anon', to_regprocedure('public.set_profile_palette(text)'), 'EXECUTE'),
  'only signed-in users can set a palette'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', 'palette-a@example.invalid', '{"display_name":"Palette A","time_zone":"UTC"}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb22', 'palette-b@example.invalid', '{"display_name":"Palette B","time_zone":"UTC"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select palette from public.profiles where user_id = auth.uid()), null, 'a new account has no palette');
select is(public.set_profile_palette('violet'), 'violet', 'the RPC stores and returns the palette');
select is((select palette from public.profiles where user_id = auth.uid()), 'violet', 'the palette is persisted on the caller''s row');
select is(public.set_profile_palette('jade'), 'jade', 'a later pick replaces the earlier one');

select throws_ok($$select public.set_profile_palette('Violet')$$, 'P0001', 'Palette must be 1 to 20 lowercase letters.', 'upper case is rejected');
select throws_ok($$select public.set_profile_palette('<script>')$$, 'P0001', 'Palette must be 1 to 20 lowercase letters.', 'markup is rejected');
select throws_ok($$select public.set_profile_palette(null)$$, 'P0001', 'Palette must be 1 to 20 lowercase letters.', 'null is rejected');

select is((select count(*) from public.profiles where palette = 'jade'), 1::bigint, 'only the caller''s row changed and is visible');

reset role;
select is((select palette from public.profiles where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb22'), null, 'another account''s palette is untouched');

select * from finish();
rollback;
