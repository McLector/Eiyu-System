// Adds a long cached weekly summary to the disposable 30-card layout account.
// No AI call; never changes an existing user account.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_ANON_KEY;
assert(url && key && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Local Supabase URL and anon key required');
const fixturePath = path.join(__dirname, '..', '..', 'artifacts', 'repair-e', 'layout-accounts.local.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
assert(fixture.localOnly && fixture.accounts[30], 'Disposable layout fixture required');
const { email, password, userId } = fixture.accounts[30];
const api = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const monday = new Date();
monday.setUTCHours(0, 0, 0, 0);
monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() || 7) + 1);
const weekStart = monday.toISOString().slice(0, 10);
const summary = Array.from({ length: 12 }, (_, index) =>
  `Week reflection ${index + 1}: consistent small steps across strength, insight, dexterity, wisdom, and charisma can be read without clipping at narrow widths and enlarged text.`
).join(' ');

async function main() {
  const login = await api.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  assert.equal(login.data.user?.id, userId);
  const { error } = await api.from('weekly_summaries').upsert({ user_id: userId, week_start: weekStart, summary }, { onConflict: 'user_id,week_start' });
  if (error) throw error;
  console.log(JSON.stringify({ pass: true, account: 30, weekStart, summaryLength: summary.length }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
