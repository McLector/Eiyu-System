// S03 T1 spike. Disposable local GoTrue only (eiyu-s02-age-demo). Never use a hosted target.
// Interactive: the owner completes a real Google login in their own browser between steps.
// Usage: node scripts/s03-google-linking-local.test.mjs <setup|R1|R2|R2b|R3|teardown>
// The owner's address comes only from S03_OWNER_TEST_EMAIL; it is never written to a file.
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const workdir = '.superpowers/s02-age';
assert.match(readFileSync(`${workdir}/supabase/config.toml`, 'utf8'), /project_id = "eiyu-s02-age-demo"/);
const status = JSON.parse(execFileSync('node_modules/@supabase/cli-windows-x64/bin/supabase.exe',
  ['--agent', 'no', '--workdir', workdir, 'status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
assert.equal(status.API_URL, 'http://127.0.0.1:57321');
const email = (process.env.S03_OWNER_TEST_EMAIL ?? '').trim().toLowerCase();
const phase = process.argv[2];
assert.ok(phase, 'phase argument required');
if (phase !== 'teardown') assert.ok(email.includes('@'), 'S03_OWNER_TEST_EMAIL must be set');

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const psql = (user, sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_eiyu-s02-age-demo', 'psql', '-U', user, '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();

const SETUP_POSTGRES = `
create schema if not exists s03_spike;
create table if not exists s03_spike.hook_log(id bigserial primary key, at timestamptz default now(), event jsonb);
create table if not exists s03_spike.ident_log(id bigserial primary key, at timestamptz default now(), op text, provider text, user_id uuid, email text, email_verified text);
create table if not exists s03_spike.mode(raise_on_identity boolean not null default false);
insert into s03_spike.mode select false where not exists (select 1 from s03_spike.mode);
create or replace function public.s03_spike_before_user_created(event jsonb) returns jsonb language plpgsql security definer set search_path='' as $f$
begin insert into s03_spike.hook_log(event) values (event); return '{}'::jsonb; end $f$;
revoke all on function public.s03_spike_before_user_created(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.s03_spike_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema s03_spike to supabase_auth_admin;
grant insert on s03_spike.hook_log to supabase_auth_admin;
grant usage on sequence s03_spike.hook_log_id_seq to supabase_auth_admin;`;
const SETUP_ADMIN = `
create or replace function s03_spike.log_identity() returns trigger language plpgsql security definer set search_path='' as $f$
begin
 insert into s03_spike.ident_log(op,provider,user_id,email,email_verified) values (tg_op,new.provider,new.user_id,new.identity_data->>'email',new.identity_data->>'email_verified');
 if (select raise_on_identity from s03_spike.mode) and new.provider='google' then raise exception 's03 spike refusal'; end if;
 return new;
end $f$;
drop trigger if exists s03_spike_identity on auth.identities;
create trigger s03_spike_identity before insert or update on auth.identities for each row execute function s03_spike.log_identity();`;
const TEARDOWN_ADMIN = `drop trigger if exists s03_spike_identity on auth.identities; drop schema if exists s03_spike cascade; drop function if exists public.s03_spike_before_user_created(jsonb);`;

const counts = () => psql('supabase_admin', "select (select count(*) from auth.users)||'/'||(select count(*) from auth.identities)||'/'||(select count(*) from public.profiles)||'/'||(select count(*) from auth.flow_state)");
const hookCalls = () => Number(psql('supabase_admin', 'select count(*) from s03_spike.hook_log'));
const identRows = () => JSON.parse(psql('supabase_admin', "select coalesce(json_agg(json_build_object('op',op,'provider',provider,'user_id',user_id,'verified',email_verified)),'[]') from s03_spike.ident_log where provider='google'"));
const usersWithEmail = () => Number(psql('supabase_admin', `select count(*) from auth.users where lower(email)='${email}'`));
const googleIdentities = () => Number(psql('supabase_admin', `select count(*) from auth.identities where provider='google' and lower(identity_data->>'email')='${email}'`));
const identUpdates = () => JSON.parse(psql('supabase_admin', "select coalesce(json_agg(json_build_object('op',op,'user_id',user_id,'verified',email_verified)),'[]') from s03_spike.ident_log where provider='google' and op='UPDATE'"));
const reset = () => psql('supabase_admin', 'truncate s03_spike.hook_log, s03_spike.ident_log');
// Auth container log lines since a point in time that match a pattern, with the address and ids redacted.
// GoTrue rolls the whole transaction back when a trigger raises, so ident_log stays empty; the log is the evidence.
const redact = s => s.split(email).join('<redacted>').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<redacted>');
function authLog(since, pattern) {
  const out = spawnSync('docker', ['logs', '--since', since, 'supabase_auth_eiyu-s02-age-demo'], { encoding: 'utf8' });
  return `${out.stdout}\n${out.stderr}`.split('\n').filter(l => pattern.test(l)).map(redact);
}
const setRaise = v => psql('supabase_admin', `update s03_spike.mode set raise_on_identity=${v}`);
async function removeOwnerUsers() {
  const ids = psql('supabase_admin', `select id from auth.users where lower(email)='${email}'`).split('\n').filter(Boolean);
  for (const id of ids) assert.equal(Boolean((await admin.auth.admin.deleteUser(id)).error), false, 'delete user');
}

// The S02 admission guard (backend/supabase/050_processing_access.sql, EP003) rejects users without
// a birth date and an age_screening consent for the current notice version.
async function createPasswordUser() {
  const created = await admin.auth.admin.createUser({
    email, password: crypto.randomUUID() + '!aA7', email_confirm: true,
    user_metadata: {
      birth_date: '2000-01-01', display_name: 'S03 spike', time_zone: 'UTC',
      processing_consent: { age_screening: { granted: true, notice_version: '2026-10-20-age-v1' } },
    },
  });
  assert.equal(Boolean(created.error), false, `create password user: ${created.error?.message}`);
  return created;
}

// Landing page for redirect_to: reports query and fragment with token values redacted.
function landing() {
  return new Promise(resolve => {
    let report;
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/report')) {
        report = decodeURIComponent(req.url.slice('/report?'.length));
        res.end('ok');
        setTimeout(() => { server.close(); resolve(report); }, 50);
        return;
      }
      res.setHeader('content-type', 'text/html');
      res.end(`<script>
        const redact = s => s.replace(/(?<![a-z_])(access_token|refresh_token|provider_token|provider_refresh_token|code)=[^&]+/g, '$1=<redacted>');
        fetch('/report?' + encodeURIComponent(JSON.stringify({ query: redact(location.search), hash: redact(location.hash) })));
        document.body.textContent = 'Eiyu spike landing: you can close this tab.';
      </script>`);
    });
    server.listen(3999, '127.0.0.1');
  });
}
async function drive(label) {
  // Guard against a stale landing tab: a reload of an earlier landing page reports its old hash to this
  // listener without ever reaching GoTrue (seen in the first R2b attempt). A real login passes through the
  // GoTrue callback, which the auth log records. (flow_state is no use here: a completed login consumes its row.)
  const startedAt = new Date().toISOString();
  const server = landing();
  const url = `${status.API_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent('http://127.0.0.1:3999/')}&scopes=${encodeURIComponent('openid email profile')}`;
  console.log(`\n[${label}] Open this URL in your browser and finish the Google login:\n${url}\n`);
  const raw = await server;
  const landed = JSON.parse(raw);
  console.log(`[${label}] browser landed with:`, landed);
  assert.ok(authLog(startedAt, /"path":"\/callback"/).length > 0, `${label}: the login never reached GoTrue (no /callback in the auth log). Open the URL in a fresh tab; do not reload an earlier landing tab.`);
  return landed;
}

if (phase === 'setup') {
  psql('postgres', SETUP_POSTGRES); psql('supabase_admin', SETUP_ADMIN);
  console.log('spike objects applied; counts users/identities/profiles/flow_state =', counts());
} else if (phase === 'R1') {
  // New Google user (no password account with this address).
  await removeOwnerUsers(); reset(); setRaise(false);
  const before = counts();
  const landed = await drive('R1');
  console.log('R1 hook calls:', hookCalls(), 'identity rows:', identRows(), 'counts', before, '->', counts());
  assert.equal(hookCalls(), 1, 'R1: hook fires for a brand-new user');
  // Observed 2026-11-05: the S02 admission guard (EP003) rejects a Google-created user that has no
  // birth_date or consent metadata, so the account is NOT created. Record whichever outcome happens.
  const created = /access_token=<redacted>/.test(landed.hash);
  console.log(`R1 outcome: ${created ? 'user created' : 'creation refused'}`);
  if (created) assert.equal(identRows().filter(r => r.op === 'INSERT').length, 1, 'R1: identity INSERT trigger fires');
  else assert.equal(usersWithEmail(), 0, 'R1: a refused signup leaves no user');
  await removeOwnerUsers();
} else if (phase === 'R2') {
  // Existing password account, no mailbox proof, then Google with the same verified email.
  await removeOwnerUsers(); reset(); setRaise(false);
  console.log('R2 baseline counts before the password user (compare with R2b after cleanup):', counts());
  const created = await createPasswordUser();
  const userId = created.data.user.id;
  // The admin createUser call may itself pass through the hook; count from after it so only the login is measured.
  const hookAfterCreate = hookCalls();
  console.log('R2 admin createUser hook calls:', hookAfterCreate);
  const before = counts();
  const landed = await drive('R2');
  assert.match(landed.hash, /access_token=<redacted>/, 'login completes');
  const loginHookCalls = hookCalls() - hookAfterCreate;
  console.log('R2 hook calls from the login:', loginHookCalls, 'identity rows:', identRows(), 'counts', before, '->', counts());
  assert.equal(loginHookCalls, 0, 'R2: hook does NOT fire when Google links to an existing user');
  const rows = identRows().filter(r => r.op === 'INSERT');
  assert.equal(rows.length, 1, 'R2: identity INSERT trigger fires on a link');
  assert.equal(rows[0].user_id, userId, 'R2: the identity attaches to the existing user');
  assert.equal(usersWithEmail(), 1, 'R2: still one user');
} else if (phase === 'R2b') {
  // Returning login for the account linked in R2.
  reset();
  const before = counts();
  const landed = await drive('R2b');
  assert.match(landed.hash, /access_token=<redacted>/, 'login completes');
  console.log('R2b hook calls:', hookCalls(), 'identity rows:', identRows(), 'counts', before, '->', counts());
  // Mechanism C depends on whether a returning login rewrites identity_data (with email_verified).
  console.log('R2b identity UPDATE rows (a finding, not an assertion):', identUpdates());
  assert.equal(hookCalls(), 0, 'R2b: no hook call');
  assert.equal(identRows().filter(r => r.op === 'INSERT').length, 0, 'R2b: no identity INSERT');
  await removeOwnerUsers();
  console.log('R2b counts after deleting the user (should equal the R2 baseline except flow_state):', counts());
} else if (phase === 'R3') {
  // Trigger raises on a link: expect no link and a recorded error.
  await removeOwnerUsers(); reset();
  const created = await createPasswordUser();
  setRaise(true);
  const before = counts();
  const since = new Date().toISOString();
  const landed = await drive('R3');
  setRaise(false);
  console.log('R3 identity rows (empty is expected: the raise rolls the insert back):', identRows(), 'google identities for the address:', googleIdentities(), 'counts', before, '->', counts());
  console.log('R3 error as the browser received it:', landed);
  const lines = authLog(since, /s03 spike refusal|SQLSTATE/);
  console.log('R3 auth log lines (redacted):', lines);
  assert.ok(lines.some(l => /s03 spike refusal/.test(l)), 'R3: the auth log shows the identities trigger refused the link');
  assert.equal(googleIdentities(), 0, 'R3: no Google identity was kept');
  assert.equal(usersWithEmail(), 1, 'R3: still one user');
  await removeOwnerUsers();
} else if (phase === 'teardown') {
  psql('supabase_admin', TEARDOWN_ADMIN);
  if (email) await removeOwnerUsers();
  console.log('spike objects dropped; counts =', counts(), '(baseline 22/20/22/0)');
} else assert.fail(`unknown phase ${phase}`);
