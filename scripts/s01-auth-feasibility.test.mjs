// S01-only experiment. Never run against a hosted project or migrate the fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const workdir = '.superpowers/s01-auth';
assert.match(readFileSync(`${workdir}/supabase/config.toml`, 'utf8'), /project_id = "eiyu-s01-auth-demo"/);
const status = JSON.parse(execFileSync('node_modules/@supabase/cli-windows-x64/bin/supabase.exe',
  ['--agent', 'no', '--workdir', workdir, 'status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
assert.equal(status.API_URL, 'http://127.0.0.1:56321');
assert.equal(new URL(status.MAILPIT_URL).hostname, '127.0.0.1');
assert.equal(new URL(status.MAILPIT_URL).port, '56324');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const client = () => createClient(status.API_URL, status.ANON_KEY, options);
const ok = (result, label) => assert.equal(Boolean(result.error), false, label);
const denied = (result, label) => assert.equal(Boolean(result.error), true, label);
const mailJson = async path => {
  const response = await fetch(`${status.MAILPIT_URL}/api/v1/${path}`);
  assert.equal(response.ok, true, 'local captured mailbox is reachable');
  return response.json();
};
async function requestLink(email) {
  ok(await client().auth.signInWithOtp({ email, options: { shouldCreateUser: false } }), 'request existing-account proof');
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = await mailJson('messages');
    const item = list.messages.find(message => message.To?.some(to => to.Address === email));
    if (item) {
      const message = await mailJson(`message/${item.ID}`);
      const match = `${message.HTML} ${message.Text}`.match(/token=([^&"\s<>]+)/);
      assert.equal(Boolean(match), true, 'captured link contains a token hash');
      return decodeURIComponent(match[1]);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('local proof mail was not captured');
}

test('fixture setup refuses a session without the explicit disposable-target marker', () => {
  const result = spawnSync('C:/Users/morad/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe',
    ['exec', '-i', 'supabase_db_eiyu-s01-auth-demo', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: readFileSync('scripts/fixtures/s01-auth-proof.sql', 'utf8'), encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /S01 fixture target not authorized/);
});

test('S01 real Auth + current quest schema + server-owned proof experiment', async t => {
  const account = client();
  const email = `s01-${crypto.randomUUID()}@example.test`;
  const signup = await account.auth.signUp({ email, password: crypto.randomUUID() + '!aA7',
    options: { data: { display_name: 'S01 synthetic fixture', time_zone: 'UTC' } } });
  ok(signup, 'signup works with confirmations disabled');
  assert.equal(Boolean(signup.data.session), true, 'unproved signup gets a quest session');
  const userId = signup.data.user.id;
  try {
    await t.test('auto-confirmed timestamp is not ownership proof', async () => {
      assert.equal(Boolean(signup.data.user.email_confirmed_at), true);
      const eligibility = await account.rpc('s01_has_email_proof');
      ok(eligibility, 'isolated proof fixture exists');
      assert.equal(eligibility.data, false);
    });
    await t.test('unproved account creates and completes a real quest; RLS isolates it', async () => {
      const inserted = await account.from('habits').insert({ user_id: userId, name: 'Synthetic quest',
        easy_version: 'Synthetic easy', stat: 'STR', days: [0, 1, 2, 3, 4, 5, 6] }).select('id').single();
      ok(inserted, 'quest insert');
      const date = new Date().toISOString().slice(0, 10);
      ok(await account.rpc('get_habits_for_date', { p_date: date }), 'materialize quest opportunity');
      ok(await account.rpc('complete_habit', { p_habit_id: inserted.data.id, p_completed_on: date, p_kind: 'full' }), 'quest completion');
      const completions = await account.from('habit_completions').select('id').eq('habit_id', inserted.data.id);
      ok(completions, 'read completion');
      assert.equal(completions.data.length, 1);
      const outsider = await client().from('habits').select('id').eq('id', inserted.data.id);
      ok(outsider, 'anonymous read');
      assert.equal(outsider.data.length, 0);
    });
    await t.test('user metadata and direct proof-RPC calls cannot grant eligibility', async () => {
      ok(await account.auth.updateUser({ data: { email_verified: true, s01_verified: true } }), 'metadata edit');
      assert.equal((await account.rpc('s01_has_email_proof')).data, false);
      denied(await account.rpc('s01_record_email_proof', { p_user_id: userId, p_email: email }), 'authenticated forgery denied');
      denied(await client().rpc('s01_record_email_proof', { p_user_id: userId, p_email: email }), 'anonymous forgery denied');
    });
    await t.test('wrong hash fails without proof or replacing the quest session', async () => {
      denied(await client().auth.verifyOtp({ token_hash: 'invalid-synthetic-hash', type: 'email' }), 'wrong proof rejected');
      assert.equal((await account.rpc('s01_has_email_proof')).data, false);
      assert.equal((await account.auth.getUser()).data.user.id, userId);
    });
    await t.test('captured-mail proof verifies the same account; replay fails', async () => {
      const hash = await requestLink(email);
      const verified = await client().auth.verifyOtp({ token_hash: hash, type: 'email' });
      ok(verified, 'mailbox proof verified by Auth');
      assert.equal(verified.data.user.id, userId);
      assert.equal(verified.data.user.email, email);
      const claims = JSON.parse(Buffer.from(verified.data.session.access_token.split('.')[1], 'base64url').toString());
      assert.equal(claims.amr.some(entry => entry.method === 'otp'), true, 'fresh OTP authentication evidence');
      denied(await admin.rpc('s01_record_email_proof', { p_user_id: userId, p_email: 'different@example.test' }), 'current-email mismatch denied');
      assert.equal((await account.rpc('s01_has_email_proof')).data, false);
      ok(await admin.rpc('s01_record_email_proof', { p_user_id: verified.data.user.id, p_email: verified.data.user.email }), 'trusted backend persists matched proof');
      assert.equal((await account.rpc('s01_has_email_proof')).data, true);
      denied(await client().auth.verifyOtp({ token_hash: hash, type: 'email' }), 'reused proof rejected');
      assert.equal((await account.auth.getUser()).data.user.id, userId, 'original quest session preserved');
    });
    await t.test('email changes invalidate proof; stale proof cannot be recorded', async () => {
      const changedEmail = `s01-changed-${crypto.randomUUID()}@example.test`;
      ok(await admin.auth.admin.updateUserById(userId, { email: changedEmail }), 'simulate a completed email change');
      assert.equal((await account.rpc('s01_has_email_proof')).data, false, 'DB current-email check defeats stale token');
      denied(await admin.rpc('s01_record_email_proof', { p_user_id: userId, p_email: email }), 'email-change race rejected');
      ok(await account.rpc('get_habits_for_date', { p_date: new Date().toISOString().slice(0, 10) }), 'quest access survives loss of proof');
    });
  } finally {
    ok(await admin.auth.admin.deleteUser(userId), 'remove synthetic local account');
  }
});
