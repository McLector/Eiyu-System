// Explicit local auth/PostgREST integration probe. Creates only disposable users.
// Requires LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON_KEY, and DOCKER_CLI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync, spawn } = require('node:child_process');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_ANON_KEY;
const docker = process.env.DOCKER_CLI;
assert(url && key && new URL(url).hostname === '127.0.0.1', 'Loopback Supabase URL and anon key required');
assert(docker && fs.existsSync(docker), 'DOCKER_CLI required for controlled local transactions');

// Load the actual exported shared data functions without a test mock or a
// persistent build artifact. This hook is scoped to this one Node process.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  module._compile(output, filename);
};
const { initSupabaseClient } = require('../../packages/shared/src/supabase/client.ts');
const { fetchHistoryRange, fetchHistoryEvidence } = require('../../packages/shared/src/data/history.ts');
const { fetchWeeklyReview } = require('../../packages/shared/src/data/weekly-review.ts');
const { fetchOrCreateWeeklyQuest } = require('../../packages/shared/src/data/weekly-quest.ts');
const { gatherWeekData } = require('../../packages/shared/src/data/weekly-summary.ts');

const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = async (promise, label) => {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};
const sql = (userId, statement) => {
  assert(/^[0-9a-f-]{36}$/.test(userId));
  const command = `begin; set local role authenticated; set local request.jwt.claim.sub = '${userId}'; ${statement}; commit;`;
  return execFileSync(docker, ['exec', 'supabase_db_eiyu-system', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', command], { encoding: 'utf8' });
};
const sqlAdmin = (userId, statement) => {
  assert(/^[0-9a-f-]{36}$/.test(userId));
  return execFileSync(docker, ['exec', 'supabase_db_eiyu-system', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', statement], { encoding: 'utf8' });
};
const nextDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const weekStartFor = date => nextDate(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

async function main() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const owner = client();
  const other = client();
  const signup = await checked(owner.auth.signUp({ email: `batch-b-${suffix}@example.test`, password: `B-probe-${suffix}!` }), 'owner sign up');
  const otherSignup = await checked(other.auth.signUp({ email: `batch-b-other-${suffix}@example.test`, password: `B-probe-${suffix}!` }), 'other sign up');
  assert(signup.user && signup.session && otherSignup.user && otherSignup.session);
  initSupabaseClient(owner);
  const userId = signup.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = nextDate(today, 1);
  const weekStart = weekStartFor(today);
  const weekEnd = nextDate(weekStart, 7);
  const count = 1201;
  const oneTimeCount = Math.floor((count - 1) / 10) + 1;
  const recurringCount = count - oneTimeCount;
  let baselineDigest;
  const digest = rows => JSON.stringify(rows.map(row => [row.historical_date, row.source_habit_id,
    row.completion_kind, row.scheduled]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const assertEvidence = (rows, label) => {
    assert.equal(rows.length, count, `${label} normalized details`);
    assert.equal(new Set(rows.map(row => `${row.historical_date}/${row.source_habit_id}`)).size, count,
      `${label} has exactly one record per source/date`);
    const currentDigest = digest(rows);
    if (!baselineDigest) baselineDigest = currentDigest;
    assert.equal(currentDigest, baselineDigest, `${label} preserves exact completion evidence`);
  };
  const ids = [];
  for (let offset = 0; offset < count; offset += 200) {
    const batch = Array.from({ length: Math.min(200, count - offset) }, (_, index) => {
      const n = offset + index;
      const oneTime = n % 10 === 0;
      return { user_id: userId, name: `B scale ${suffix} ${n}`, stat: 'STR', difficulty: 'Easy',
        quest_type: oneTime ? 'one_time' : 'habit', easy_version: oneTime ? null : 'One minute',
        reminder_time: '23:00', days: oneTime ? [] : [0, 1, 2, 3, 4, 5, 6],
        scheduled_date: oneTime ? today : null };
    });
    const inserted = await checked(owner.from('habits').insert(batch).select('id'), 'bulk insert definitions');
    ids.push(...inserted.map(row => row.id));
  }
  assert.equal(ids.length, count);
  await checked(owner.rpc('ensure_habit_occurrences', { p_through_date: today }), 'materialize occurrences');
  // The app grants completion writes only through its RPC. Populate the
  // disposable scale fixture as local postgres so 1,201 setup writes remain
  // bounded; every asserted consumer read still runs through real REST.
  sqlAdmin(userId, `insert into public.habit_completions (user_id, habit_id, completed_on, kind, xp_awarded)
    select user_id, id, '${today}'::date, 'full', 20 from public.habits where user_id = '${userId}'`);
  await checked(owner.from('weekly_quests').insert({ user_id: userId, week_start: weekStart,
    stat: 'STR', target_count: 5 }), 'weekly quest fixture');

  async function verify(label, expectedLive, expectedRetained) {
    const snapshot = await fetchHistoryEvidence(today, tomorrow);
    assertEvidence(snapshot.rows, label);
    assert.equal(snapshot.habits.length, expectedLive, `${label} live metadata`);
    assert.equal(snapshot.recurring_totals.STR, recurringCount, `${label} recurring server total`);
    const ledgerCount = Number(sql(userId, `select count(*) from public.deleted_habit_history where user_id = '${userId}'`)
      .trim().split(/\s+/).find(value => /^\d+$/.test(value)));
    assert.equal(ledgerCount, expectedRetained, `${label} retained ledger`);
    const history = await fetchHistoryRange(userId, new Date(`${today}T00:00:00Z`), new Date(`${tomorrow}T00:00:00Z`));
    assert.equal(history[today].completions.length, count, `${label} History detail`);
    assert.equal(history[today].scheduledCount, recurringCount, `${label} recurring denominator`);
    assert.equal(history[today].completedCount, recurringCount, `${label} recurring numerator`);
    const review = await fetchWeeklyReview(userId, 'UTC', new Date(`${today}T12:00:00Z`));
    assert.equal(review.reduce((sum, day) => sum + day.STR, 0), count, `${label} review count`);
    const quest = await fetchOrCreateWeeklyQuest(userId, {}, 'UTC', new Date(`${today}T12:00:00Z`));
    assert.equal(quest.currentCount, recurringCount, `${label} weekly quest recurring count`);
    const summary = await gatherWeekData(userId, weekStart, weekEnd);
    assert.equal(summary.statTotals.STR, count, `${label} AI input count`);
  }

  await verify('all live', count, 0);
  const firstHalf = ids.slice(0, 600);
  sql(userId, `select public.delete_habit(id) from public.habits where user_id = '${userId}' and id = any(array[${firstHalf.map(id => `'${id}'::uuid`).join(',')}])`);
  await verify('mixed', count - 600, 600);

  // Pause a real delete after its ledger move but before commit. REST reads
  // during the pause must see either the old live side or the new retained
  // side, never a missing or doubled completion.
  const concurrentId = ids[600];
  const transaction = `begin; set local application_name = 'eiyu_history_delete_probe'; set local role authenticated; set local request.jwt.claim.sub = '${userId}'; select public.delete_habit('${concurrentId}'::uuid); select 'moved'; select pg_sleep(10); commit;`;
  const process = spawn(docker, ['exec', 'supabase_db_eiyu-system', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', transaction]);
  let sleeping = 0;
  for (let attempt = 0; attempt < 20 && !sleeping; attempt++) {
    sleeping = Number(sqlAdmin(userId, "select count(*) from pg_stat_activity where application_name = 'eiyu_history_delete_probe' and wait_event = 'PgSleep'").trim());
    if (!sleeping) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(sleeping, 1, 'delete transaction reached pg_sleep after move and before commit');
  const during = await fetchHistoryEvidence(today, tomorrow);
  assert.equal(process.exitCode, null, 'REST read completed before delete transaction committed');
  assertEvidence(during.rows, 'read during uncommitted delete');
  await new Promise((resolve, reject) => {
    if (process.exitCode !== null) return process.exitCode === 0 ? resolve() : reject(new Error(`delete exited ${process.exitCode}`));
    process.on('exit', code => code === 0 ? resolve() : reject(new Error(`delete exited ${code}`)));
  });
  const after = await fetchHistoryEvidence(today, tomorrow);
  assertEvidence(after.rows, 'read after delete commit');

  const rest = ids.slice(601);
  sql(userId, `select public.delete_habit(id) from public.habits where user_id = '${userId}' and id = any(array[${rest.map(id => `'${id}'::uuid`).join(',')}])`);
  await verify('all retained', 0, count);
  const otherSnapshot = await checked(other.rpc('read_history_range', { p_start_date: today, p_end_date: tomorrow }), 'other owner snapshot');
  assert.equal(otherSnapshot.rows.length, 0, 'owner isolation');
  const anonymous = client();
  const anonRead = await anonymous.rpc('read_history_range', { p_start_date: today, p_end_date: tomorrow });
  assert(anonRead.error, 'anonymous read must be rejected');
  const forged = await owner.from('deleted_habit_history').update({ habit_name: 'forged' }).eq('user_id', userId);
  assert(forged.error, 'ledger update must be rejected');
  console.log(JSON.stringify({ pass: true, rows: count, recurring: recurringCount,
    stages: ['live', 'mixed', 'read during delete', 'retained'],
    consumers: ['History', 'Weekly Review', 'Weekly Quest', 'AI weekly inputs'],
    security: ['anonymous rejected', 'other owner empty', 'ledger immutable'] }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
