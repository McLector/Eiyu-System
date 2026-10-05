// Runs canonical SQL 001-040 and checks the account colour palette: column, grants, RPC validation and owner isolation.
// PGlite proves shape, ownership and validation; the pgTAP twin is supabase/tests/021_profile_palette.test.sql.
const { PGlite } = require('../.temp/plan-012/node_modules/@electric-sql/pglite');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');

const owner = '40000000-0000-4000-8000-000000000001';
const other = '40000000-0000-4000-8000-000000000099';

async function main() {
  const db = new PGlite();
  let assertions = 0;
  const check = (value, expected, label) => { assert.deepEqual(value, expected, label); assertions++; };
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0] ?? { v: null })[0];
  const fails = async (sql, args, label, message) => { await assert.rejects(db.query(sql, args), { message: new RegExp(message) }, label); assertions++; };
  const as = async user => { await db.exec(`reset role; set role authenticated; set "request.jwt.claim.sub"='${user}';`); };
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_user::text$$;
    grant usage on schema auth,storage,public to authenticated,anon,service_role;
    grant execute on function auth.uid(),auth.role() to authenticated,anon,service_role;
    alter default privileges in schema public grant all on tables to authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
  const dir = join(__dirname, '../backend/supabase');
  const all = readdirSync(dir).filter(f => /^\d+.*\.sql$/.test(f)).sort();
  check(all.filter(f => /^040_/.test(f)).length, 1, 'exactly one 040 migration file');
  for (const file of all.filter(f => Number(f.slice(0, 3)) < 40)) {
    try { await db.exec(readFileSync(join(dir, file), 'utf8')); } catch (error) { throw new Error(`Migration ${file}: ${error.message}`); }
  }
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3),($4,$5,$3)', [owner, 'p40@example.invalid', '{"display_name":"P"}', other, 'o40@example.invalid']);
  // Before 040: the column is absent, so a client's palette read must be able to cope (it ignores the error).
  await assert.rejects(db.query('select palette from public.profiles'), /palette/); assertions++;
  for (const file of all.filter(f => /^040_/.test(f))) await db.exec(readFileSync(join(dir, file), 'utf8'));
  await db.exec(readFileSync(join(dir, all.find(f => /^040_/.test(f))), 'utf8')); assertions++; // re-running is safe

  check(await scalar('select palette from public.profiles where user_id=$1', [owner]), null, 'existing accounts start with no palette');
  check(await scalar(`select has_function_privilege('anon','public.set_profile_palette(text)','EXECUTE')`), false, 'anon cannot call the RPC');
  check(await scalar(`select has_column_privilege('authenticated','public.profiles','time_zone','UPDATE')`), false, 'the timezone column stays closed');
  await as(owner);
  check(await scalar(`select public.set_profile_palette('violet')`), 'violet', 'stores and returns the palette');
  check(await scalar(`select public.set_profile_palette('jade')`), 'jade', 'a later pick replaces it');
  for (const bad of ['Violet', '<script>', '', 'x'.repeat(21), 'jade2', ' jade'])
    await fails('select public.set_profile_palette($1)', [bad], `rejects ${JSON.stringify(bad)}`, 'Palette must be 1 to 20 lowercase letters');
  await fails('select public.set_profile_palette(null)', [], 'rejects null', 'Palette must be 1 to 20 lowercase letters');
  await fails(`update public.profiles set palette='Bad!' where user_id=$1`, [owner], 'the table check rejects a direct bad write', 'profiles_palette_format');
  await db.query(`update public.profiles set palette='lime' where user_id=$1`, [owner]); assertions++;
  check(await scalar('select count(*)::int from public.profiles'), 1, 'only the owner row is visible');
  await as(other);
  check(await scalar('select palette from public.profiles'), null, 'another account is untouched');
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query(`select public.set_profile_palette('jade')`), /permission denied/); assertions++;
  await db.exec('reset role; set role authenticated; reset "request.jwt.claim.sub";');
  await assert.rejects(db.query(`select public.set_profile_palette('jade')`), /authentication required/); assertions++;
  console.log(`Profile palette DB verification passed: ${assertions} assertions.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
