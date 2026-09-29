// Isolated pre-026 upgrade rehearsal in a new local database. Never resets the
// active Supabase database. Requires DOCKER_CLI; leaves the rehearsal DB for review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const docker = process.env.DOCKER_CLI;
const fresh = process.argv.includes('--fresh');
assert(docker && fs.existsSync(docker), 'DOCKER_CLI required');
const container = 'supabase_db_eiyu-system';
const database = `eiyu_profile_rehearsal_${Date.now()}`;
const owner = 'c1111111-1111-4111-8111-111111111111';
const root = path.resolve(__dirname, '../..');
const sqlDir = path.join(root, 'backend', 'supabase');
const run = (args, options = {}) => execFileSync(docker, args, { encoding: 'utf8', ...options });
const psql = (statement, allowFailure = false) => {
  try {
    return run(['exec', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-c', statement]);
  } catch (error) {
    if (allowFailure) return error;
    throw error;
  }
};
const asOwner = (statement, allowFailure = false) => psql(`begin; set local role authenticated; set local request.jwt.claim.sub = '${owner}'; ${statement}; commit;`, allowFailure);

function main() {
  run(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database]);
  psql(`create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to authenticated;
    grant execute on function auth.uid() to authenticated;`);

  const baseMigrations = fs.readdirSync(sqlDir).filter(name => /^0\d\d_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 25).sort();
  assert.equal(baseMigrations.length, 25, 'expected canonical 001–025 migrations');
  const source = baseMigrations.map(name => `\n-- ${name}\n${fs.readFileSync(path.join(sqlDir, name), 'utf8')}\n`).join('');
  const tempFile = path.join(os.tmpdir(), `${database}.sql`);
  fs.writeFileSync(tempFile, source, 'utf8');
  try {
    run(['cp', tempFile, `${container}:/tmp/${database}.sql`]);
    run(['exec', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-f', `/tmp/${database}.sql`], { stdio: 'pipe' });
  } finally {
    fs.unlinkSync(tempFile);
  }

  const insertOwner = `insert into auth.users (id, email, raw_user_meta_data) values
    ('${owner}', 'profile-rehearsal@example.invalid', '{"time_zone":"UTC"}'::jsonb);
    grant select on table public.profiles to authenticated;`;
  if (!fresh) {
    psql(insertOwner);
    psql(`update public.profiles set display_name = repeat('🧭', 81),
      user_class = chr(160) || 'Legacy' || chr(160), time_zone = 'UTC'
      where user_id = '${owner}'`);
    assert.equal(psql(`select char_length(display_name) from public.profiles where user_id = '${owner}'`).trim(), '81');
  }

  // Apply corrected 026 and 027 to the isolated schema, exactly in migration order.
  for (const name of ['026_profile_editing.sql', '027_profile_compatibility_repair.sql']) {
    run(['cp', path.join(sqlDir, name), `${container}:/tmp/${database}-${name}`]);
    run(['exec', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-f', `/tmp/${database}-${name}`], { stdio: 'pipe' });
  }
  if (fresh) {
    psql(insertOwner);
    const accepted80 = asOwner(`select public.update_profile(repeat('🧭', 80), 'Ranger')->>'displayName'`);
    assert(accepted80.includes('🧭'), '80 code points accepted on fresh install');
    assert.equal(psql(`select char_length(display_name) from public.profiles where user_id = '${owner}'`).trim(), '80');
  } else {
    const changedClass = asOwner(`select public.update_profile(repeat('🧭', 81), chr(65279) || '  Ranger  ')->>'userClass'`);
    assert(changedClass.includes('Ranger'), 'unchanged 81-code-point display name permits valid Class edit');
    assert.equal(psql(`select char_length(display_name) from public.profiles where user_id = '${owner}'`).trim(), '81');
  }
  assert.equal(asOwner(`select public.initialize_account_time_zone('UTC')`).trim().split('\n')[0], 'UTC');
  const invalidName = asOwner(`select public.update_profile(chr(160) || chr(65279), 'Ranger')`, true);
  assert(invalidName instanceof Error, 'NBSP/BOM-only RPC name rejected');
  const tooLong = asOwner(`select public.update_profile(repeat('🧭', 81)${fresh ? '' : " || '!'"}, 'Ranger')`, true);
  assert(tooLong instanceof Error, 'changed over-limit name rejected');
  const directBlank = asOwner(`update public.profiles set user_class = chr(160) || chr(65279) where user_id = '${owner}'`, true);
  assert(directBlank instanceof Error, 'direct blank update rejected');
  asOwner(`update public.profiles set user_class = chr(65279) || chr(160) || 'Mage' || chr(160) where user_id = '${owner}'`);
  assert.equal(psql(`select user_class from public.profiles where user_id = '${owner}'`).trim(), 'Mage', 'direct update normalized');
  assert.equal(psql(`select char_length(display_name) from public.profiles where user_id = '${owner}'`).trim(), fresh ? '80' : '81');
  console.log(JSON.stringify({ pass: true, mode: fresh ? 'fresh' : 'legacy upgrade', isolatedDatabase: database, migrations: '001-027',
    checks: [fresh ? '80 accepted/81 rejected' : 'legacy name retained', 'other field edit', 'timezone read', 'Unicode boundary',
      'NBSP/BOM blank rejection', 'direct-write normalization'] }));
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
