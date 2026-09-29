// Creates fresh disposable local accounts for rendered board layout review.
// Requires LOCAL_SUPABASE_URL and LOCAL_SUPABASE_ANON_KEY. Never resets data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_ANON_KEY;
assert(url && key && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Local Supabase URL and anon key required');
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = async (promise, label) => {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};
const dateKey = date => date.toISOString().slice(0, 10);
const today = dateKey(new Date());
const yesterday = dateKey(new Date(Date.now() - 86_400_000));

function rowsFor(userId, count) {
  return Array.from({ length: count }, (_, index) => {
    const oneTime = count === 1 || (count >= 30 && index >= count - 5);
    const recovering = count === 100 && index < 30;
    return {
      user_id: userId,
      name: index === 0 && count > 1
        ? `Layout ${count} — a long quest name that must wrap cleanly without hiding actions or progress`
        : `Layout ${count} quest ${String(index + 1).padStart(3, '0')}`,
      easy_version: oneTime ? null : 'Do the two-minute version',
      description: index % 8 === 0 ? 'This is a longer optional note for testing the independent details control and readable wrapping.' : null,
      quest_type: oneTime ? 'one_time' : 'habit',
      stat: ['STR', 'INT', 'DEX', 'WIS', 'CHA'][index % 5],
      difficulty: ['Easy', 'Medium', 'Hard'][index % 3],
      reminder_time: `${String(6 + index % 16).padStart(2, '0')}:00`,
      days: oneTime ? [] : [0, 1, 2, 3, 4, 5, 6],
      scheduled_date: oneTime ? today : null,
      target_count: !oneTime && index % 9 === 0 ? 5 : null,
      created_at: recovering ? `${yesterday}T12:00:00.000Z` : new Date().toISOString(),
    };
  });
}

async function main() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const accounts = {};
  for (const count of [0, 1, 30, 100]) {
    const api = client();
    const email = `layout-${count}-${suffix}@example.test`;
    const password = `Layout-${count}-${suffix}!`;
    const signup = await checked(api.auth.signUp({ email, password }), `signup ${count}`);
    assert(signup.user && signup.session, `signup ${count} did not establish a session`);
    const userId = signup.user.id;
    await checked(api.rpc('initialize_account_time_zone', { p_time_zone: 'UTC' }), `timezone ${count}`);
    const rows = rowsFor(userId, count);
    if (rows.length) await checked(api.from('habits').insert(rows).select('id'), `insert ${count}`);
    const definitions = await checked(api.from('habits').select('id', { count: 'exact' }).eq('user_id', userId), `verify ${count}`);
    assert.equal(definitions.length, count, `definition count ${count}`);
    const recoveries = count === 100 ? await checked(api.rpc('get_open_habit_recoveries', {}), 'open recoveries') : [];
    if (count === 100) assert(recoveries.length >= 30, `expected 30 open recoveries, got ${recoveries.length}`);
    accounts[count] = { email, password, userId, cards: count, recoveries: recoveries.length };
  }
  const output = path.join(__dirname, '..', '..', 'artifacts', 'repair-e', 'layout-accounts.local.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ localOnly: true, createdAt: new Date().toISOString(), today, accounts }, null, 2));
  console.log(JSON.stringify({ pass: true, output, cards: [0, 1, 30, 100], recoveries: accounts[100].recoveries }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
