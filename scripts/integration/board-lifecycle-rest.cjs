// Disposable local-stack integration probe. Requires LOCAL_SUPABASE_URL and
// LOCAL_SUPABASE_ANON_KEY from `supabase status --output env`.
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_ANON_KEY;
assert(url && key && new URL(url).hostname === '127.0.0.1', 'Local Supabase URL and anon key required');
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = async (promise, label) => {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

async function main() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `batch-a-${suffix}@example.test`;
  const password = `A-probe-${suffix}!`;
  const first = client();
  const signup = await checked(first.auth.signUp({ email, password }), 'sign up');
  assert(signup.user && signup.session, 'Local signup must establish a session');
  const userId = signup.user.id;
  const second = client();
  await checked(second.auth.signInWithPassword({ email, password }), 'second client sign in');
  const today = new Date().toISOString().slice(0, 10);

  const insertOneTime = async name => checked(first.from('habits').insert({
    user_id: userId, name, quest_type: 'one_time', easy_version: null,
    stat: 'WIS', difficulty: 'Easy', reminder_time: '23:00', days: [],
    scheduled_date: today,
  }).select('id').single(), `insert ${name}`);
  const fixture = await insertOneTime('Batch A browser archived one-time');
  const testQuest = await insertOneTime('Batch A transport lifecycle');
  const future = await checked(first.from('habits').insert({
    user_id: userId, name: 'Batch A future one-time', quest_type: 'one_time',
    easy_version: null, stat: 'WIS', difficulty: 'Easy', reminder_time: '23:00',
    days: [], scheduled_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  }).select('id').single(), 'insert future');

  await checked(first.rpc('complete_habit', {
    p_habit_id: testQuest.id, p_completed_on: today, p_kind: 'full',
  }), 'complete one-time');
  const xpBefore = await checked(first.from('stats').select('xp').eq('user_id', userId).eq('stat', 'WIS').single(), 'XP before delete');
  assert.equal(xpBefore.xp, 20);
  await checked(first.rpc('archive_habit', { p_habit_id: testQuest.id }), 'archive');
  await checked(first.rpc('archive_habit', { p_habit_id: fixture.id }), 'archive browser fixture');

  // A fresh authenticated client sees the same archived one-time definition.
  const third = client();
  await checked(third.auth.signInWithPassword({ email, password }), 'reload client sign in');
  const allDefinitions = await checked(third.from('habits').select('id, quest_type, archived, scheduled_date').eq('user_id', userId), 'board definitions');
  assert(allDefinitions.some(row => row.id === testQuest.id && row.quest_type === 'one_time' && row.archived));
  assert(allDefinitions.some(row => row.id === fixture.id && row.quest_type === 'one_time' && row.archived));
  const activeToday = await checked(third.rpc('get_habits_for_date', { p_date: today }), 'today RPC');
  assert(!activeToday.some(row => row.id === testQuest.id || row.id === fixture.id || row.id === future.id));
  const upcoming = await checked(third.from('habits').select('id, scheduled_date')
    .eq('user_id', userId).eq('archived', false).eq('quest_type', 'one_time')
    .gte('scheduled_date', today), 'upcoming reminder definitions');
  assert(upcoming.some(row => row.id === future.id), 'future one-time reminder remains queryable');
  assert(!upcoming.some(row => row.id === testQuest.id || row.id === fixture.id), 'archived reminders are excluded');

  await checked(second.rpc('restore_habit', { p_habit_id: testQuest.id }), 'restore through second client');
  const restored = await checked(third.from('habits').select('archived').eq('id', testQuest.id).single(), 'restored read');
  assert.equal(restored.archived, false);
  await checked(second.rpc('archive_habit', { p_habit_id: testQuest.id }), 'rearchive');
  await checked(second.rpc('delete_habit', { p_habit_id: testQuest.id }), 'delete');
  await checked(second.rpc('delete_habit', { p_habit_id: testQuest.id }), 'repeat delete');
  const stale = await checked(first.from('habits').update({ name: 'Stale update' }).eq('id', testQuest.id).select('id').maybeSingle(), 'stale PATCH');
  assert.equal(stale, null, 'PostgREST zero-row update must be detectable by app boundary');
  const retained = await checked(third.from('deleted_habit_history').select('completion_kind, xp_awarded, quest_type').eq('source_habit_id', testQuest.id).single(), 'retained history');
  assert.deepEqual([retained.completion_kind, retained.xp_awarded, retained.quest_type], ['full', 20, 'one_time']);
  const xpAfter = await checked(third.from('stats').select('xp').eq('user_id', userId).eq('stat', 'WIS').single(), 'XP after delete');
  assert.equal(xpAfter.xp, xpBefore.xp);
  console.log(JSON.stringify({ pass: true, email, password, userId, browserArchivedQuestId: fixture.id,
    verified: ['archive reload', 'restore same ID', 'delete retry', 'stale zero-row PATCH', 'retained History and XP', 'future one-time exclusion', 'future reminder rearm query'] }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
