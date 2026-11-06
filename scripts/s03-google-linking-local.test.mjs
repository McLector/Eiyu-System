// S03 T1 spike. Disposable local GoTrue only (eiyu-s02-age-demo). Never use a hosted target.
// Interactive: the owner completes a real Google login in their own browser between steps.
// Usage: node scripts/s03-google-linking-local.test.mjs <setup|R1|R2|R2b|R3|teardown>   (T1 spike, the record)
//        node scripts/s03-google-linking-local.test.mjs <preflight|G1|G2|G2-mutant|G3>  (T4, against migration 063)
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
if (phase !== 'teardown' && phase !== 'preflight') assert.ok(email.includes('@'), 'S03_OWNER_TEST_EMAIL must be set');

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
// execFileSync errors carry the whole argument list and psql echoes the failing query, and many queries
// embed the owner's address; so every failure is redacted before it can reach the output.
const psql = (user, sql) => {
  try {
    return execFileSync('docker', ['exec', '-i', 'supabase_db_eiyu-s02-age-demo', 'psql', '-U', user, '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw new Error(`psql failed: ${redact(`${e.stderr ?? ''}${e.stdout ?? ''}`.trim() || String(e.status))}`);
  }
};

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
const redact = s => (email ? s.split(email).join('<redacted>') : s).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<redacted>');
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
async function createPasswordUser(password = crypto.randomUUID() + '!aA7') {
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
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
  const url = `${status.API_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent('http://127.0.0.1:3999/')}&scopes=${encodeURIComponent('openid')}`;
  // GoTrue already sends "email profile" for Google and appends whatever scopes are passed. Passing 'openid email profile'
  // made it send "email profile openid email profile" and Google answered 400 invalid_scope (seen in G1, 2026-11-06).
  console.log(`\n[${label}] Open this URL in your browser and finish the Google login:\n${url}\n`);
  const raw = await server;
  const landed = JSON.parse(raw);
  console.log(`[${label}] browser landed with:`, landed);
  assert.ok(authLog(startedAt, /"path":"\/callback"/).length > 0, `${label}: the login never reached GoTrue (no /callback in the auth log). Open the URL in a fresh tab; do not reload an earlier landing tab.`);
  return landed;
}

// ---- T4: the real gate (migration 063) ----
const GATE = 'gate_google_identity_link';
const PROOF = 'grant_google_mailbox_proof';
// Run at the start of every G phase. A killed G2-mutant can leave the gate disabled, and a later G3 would then
// pass for the wrong reason; a hook that is off would make G1 fail for the wrong reason.
function preflight() {
  const triggers = psql('supabase_admin', `select coalesce(string_agg(tgname||':'||tgenabled::text, ',' order by tgname),'none') from pg_trigger where tgrelid='auth.identities'::regclass and tgname in ('${GATE}','${PROOF}')`);
  assert.equal(triggers, `${GATE}:O,${PROOF}:O`, `preflight: both 063 triggers must exist and be enabled (got ${triggers})`);
  assert.equal(psql('supabase_admin', "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='s03_before_user_created'"), '1', 'preflight: hook function exists');
  assert.equal(psql('supabase_admin', "select count(*) from pg_trigger where tgname='s03_spike_identity' and not tgisinternal") + psql('supabase_admin', "select count(*) from pg_namespace where nspname='s03_spike'"), '00', 'preflight: no T1 spike objects left');
  const authEnv = spawnSync('docker', ['exec', 'supabase_auth_eiyu-s02-age-demo', 'env'], { encoding: 'utf8' }).stdout ?? '';
  const hookEnabled = /^GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED=(.*)$/m.exec(authEnv)?.[1];
  const hookUri = /^GOTRUE_HOOK_BEFORE_USER_CREATED_URI=(.*)$/m.exec(authEnv)?.[1];
  assert.equal(hookEnabled, 'true', `preflight: the auth container must have the before_user_created hook enabled (got ${hookEnabled})`);
  assert.equal(hookUri, 'pg-functions://postgres/public/s03_before_user_created', `preflight: hook uri (got ${hookUri})`);
  console.log('preflight ok: gate and proof triggers enabled, hook function present and wired, no spike objects');
}
const ownerUser = () => JSON.parse(psql('supabase_admin', `select coalesce(json_agg(json_build_object(
  'id',u.id,
  'provider',u.raw_app_meta_data->>'provider',
  'identities',(select coalesce(json_agg(i.provider order by i.provider),'[]'::json) from auth.identities i where i.user_id=u.id),
  'consent_rows',(select count(*) from private.processing_consent c where c.user_id=u.id),
  'proved',(select m.verified_version is not null and m.verified_version=m.version from private.mailbox_state m where m.user_id=u.id),
  'profiles',(select count(*) from public.profiles p where p.user_id=u.id),
  'habits',(select count(*) from public.habits h where h.user_id=u.id))),'[]'::json) from auth.users u where lower(u.email)='${email}'`));
// public.current_mailbox_verified() as that user, the way the app's debrief gate calls it.
const verifiedAs = id => psql('supabase_admin', `begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',true); select public.current_mailbox_verified(); rollback`).split('\n').filter(l => /^[tf]$/.test(l)).pop();
const authFailure = landed => /server_error/.test(JSON.stringify(landed)) && /unexpected_failure|Error creating identity|Error+creating+identity/.test(JSON.stringify(landed));

async function g2(label) {
  await removeOwnerUsers();
  const created = await createPasswordUser();
  const userId = created.data.user.id;
  const [before] = ownerUser();
  assert.equal(before.proved, false, `${label}: the password account starts without mailbox proof`);
  const since = new Date().toISOString();
  const landed = await drive(label);
  assert.ok(authFailure(landed), `${label} REFUSAL: the browser must receive the generic link error, not a session (got ${JSON.stringify(landed)})`);
  const rows = ownerUser();
  assert.equal(rows.length, 1, `${label}: still one user`);
  assert.equal(rows[0].id, userId, `${label}: same user`);
  assert.deepEqual(rows[0].identities, ['email'], `${label}: no Google identity was created`);
  assert.equal(rows[0].proved, false, `${label}: no mailbox proof was granted`);
  const lines = authLog(since, /Google link refused|EG001/);
  console.log(`${label} auth log lines (redacted):`, lines);
  assert.ok(lines.length > 0, `${label}: the auth log shows the 063 gate refused the link`);
}

if (phase === 'preflight') {
  preflight();
  console.log('counts users/identities/profiles/flow_state =', counts());
} else if (phase === 'G1') {
  // A brand-new Google user: created without consent, with proof, and the debrief gate says verified.
  preflight(); await removeOwnerUsers();
  const before = counts();
  const landed = await drive('G1');
  assert.match(landed.hash, /access_token=<redacted>/, 'G1: login completes with a session');
  const rows = ownerUser();
  console.log('G1 user (ids omitted):', rows.map(({ id, ...rest }) => rest), 'counts', before, '->', counts());
  assert.equal(rows.length, 1, 'G1: exactly one user');
  assert.equal(rows[0].provider, 'google', "G1: raw_app_meta_data.provider is 'google' when the row is inserted (the EP003 exception and the create path rely on it)");
  assert.deepEqual(rows[0].identities, ['google'], 'G1: one Google identity');
  assert.equal(rows[0].consent_rows, 0, 'G1: no consent row until the finish screen');
  assert.equal(rows[0].profiles, 1, 'G1: a profile exists');
  assert.equal(rows[0].proved, true, 'G1: verified Google email grants mailbox proof');
  assert.equal(verifiedAs(rows[0].id), 't', 'G1: current_mailbox_verified() is true for that user');
  await removeOwnerUsers();
  console.log('G1 counts after cleanup (baseline 22/20/22):', counts());
} else if (phase === 'G2') {
  // Unproved password account plus Google with the same email: refused, nothing changes.
  preflight();
  await g2('G2');
  await removeOwnerUsers();
  console.log('G2 counts after cleanup (baseline 22/20/22):', counts());
} else if (phase === 'G2-mutant') {
  // Red proof: with the gate trigger disabled, the same login must link, so G2's refusal assertion must fail.
  preflight();
  let failure = null;
  psql('supabase_admin', `alter table auth.identities disable trigger ${GATE}`);
  try { await g2('G2-mutant'); } catch (e) { failure = e; } finally {
    psql('supabase_admin', `alter table auth.identities enable trigger ${GATE}`);
    await removeOwnerUsers();
  }
  assert.ok(failure, 'G2-mutant: the refusal assertions passed with the gate disabled, so G2 proves nothing');
  assert.match(failure.message, /G2-mutant REFUSAL/, `G2-mutant: failed for the wrong reason: ${redact(failure.message)}`);
  console.log('G2-mutant failed as expected:', redact(failure.message));
  preflight();
  console.log('G2-mutant counts after cleanup (baseline 22/20/22):', counts());
} else if (phase === 'G3') {
  // Proved password account plus Google: links to the same user, history intact, password still works.
  preflight(); await removeOwnerUsers();
  const password = crypto.randomUUID() + '!aA7';
  const created = await createPasswordUser(password);
  const userId = created.data.user.id;
  // The real OTP path is S02's (scripts/s02-mailbox-local.test.mjs); here the proof is set directly.
  psql('supabase_admin', `update private.mailbox_state set verified_version=version, verified_at=now() where user_id='${userId}'`);
  psql('supabase_admin', `insert into public.habits(user_id,name,easy_version,stat) values ('${userId}','S03 link check','S03 link check (easy)','WIS')`);
  const [before] = ownerUser();
  assert.equal(before.proved, true, 'G3: the account starts with mailbox proof');
  assert.deepEqual([before.profiles, before.habits], [1, 1], 'G3: profile and one habit exist before the link');
  const landed = await drive('G3');
  assert.match(landed.hash, /access_token=<redacted>/, 'G3: login completes with a session');
  const rows = ownerUser();
  console.log('G3 user before/after (ids omitted):', [before, ...rows].map(({ id, ...rest }) => rest));
  assert.equal(rows.length, 1, 'G3: still one user');
  assert.equal(rows[0].id, userId, 'G3: same user id');
  assert.deepEqual(rows[0].identities, ['email', 'google'], 'G3: email and Google identities');
  assert.deepEqual([rows[0].profiles, rows[0].habits], [1, 1], 'G3: profile and habit intact');
  assert.equal(rows[0].proved, true, 'G3: proof kept');
  const fresh = createClient(status.API_URL, status.ANON_KEY, options);
  const signIn = await fresh.auth.signInWithPassword({ email, password });
  assert.equal(Boolean(signIn.error), false, `G3: the password still signs in (${signIn.error?.message})`);
  await removeOwnerUsers();
  console.log('G3 counts after cleanup (baseline 22/20/22):', counts());
} else if (phase === 'setup') {
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
