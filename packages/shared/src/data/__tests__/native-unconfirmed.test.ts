/**
 * Native acceptance for committed-but-unconfirmed writes. Skipped unless R3_NATIVE=1.
 * Runs the real shared data layer against a DISPOSABLE local Supabase stack (API port 54321 only) with a fetch wrapper that
 * performs the request, then loses the response, and separately fails the reconciliation reads. Secrets come from the
 * environment at run time (R3_JWT_SECRET) and are never written anywhere.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { initSupabaseClient } from '../../supabase/client';
import { UncertainSaveError } from '../save-outcome';
import { deleteGymRoutine, saveGymExercise, saveGymRoutine, saveGymSession, startGymSession } from '../gym';
import { saveAtomicLongQuest, setStageDoneWithReceipt } from '../long-quests';

const enabled = process.env.R3_NATIVE === '1';
const run = enabled ? describe : describe.skip;
const API = process.env.R3_API_URL ?? 'http://127.0.0.1:54321';

type Rule = { match: (url: string, method: string) => boolean; mode: 'commit-then-drop' | 'fail-before' };
let rules: Rule[] = [];
const drop = (part: string, method = 'POST'): Rule => ({ match: (u, m) => u.includes(part) && m === method, mode: 'commit-then-drop' });
const outageOn = (part: string, method = 'GET'): Rule => ({ match: (u, m) => u.includes(part) && m === method, mode: 'fail-before' });
const wrappedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const rule = rules.find(r => r.match(url, (init?.method ?? 'GET').toUpperCase()));
  if (rule?.mode === 'fail-before') throw new TypeError('fetch failed (simulated outage)');
  const response = await fetch(input, init);
  if (rule?.mode === 'commit-then-drop') { await response.arrayBuffer().catch(() => undefined); throw new TypeError('fetch failed (response lost)'); }
  return response;
};
const token = (role: string) => {
  const secret = process.env.R3_JWT_SECRET as string, now = Math.floor(Date.now() / 1000);
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ role, iss: 'supabase', iat: now, exp: now + 3600 })}`;
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
};

run('committed-but-unconfirmed writes on a real stack', () => {
  // The real client retries failed reads with backoff, so simulated outages take several seconds.
  jest.setTimeout(90_000);
  let admin: SupabaseClient; let userId = ''; let routineId = '';
  const count = async (table: string, column: string, value: string) => { const r = await admin.from(table).select('id', { count: 'exact', head: true }).eq(column, value); expect(r.error).toBeNull(); return r.count; };
  beforeAll(async () => {
    if (!/:54321$/.test(API)) throw new Error('Refusing to run against anything but the isolated stack on 54321.');
    if (!process.env.R3_JWT_SECRET) throw new Error('Missing R3_JWT_SECRET.');
    admin = createClient(API, token('service_role'), { auth: { persistSession: false } });
    const email = `r3-${randomUUID()}@example.invalid`, password = randomBytes(24).toString('base64url');
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); expect(created.error).toBeNull();
    userId = created.data.user!.id;
    const client = createClient(API, token('anon'), { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: wrappedFetch } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    initSupabaseClient(client as never);
  });
  afterEach(() => { rules = []; });
  afterAll(async () => { if (userId) await admin.auth.admin.deleteUser(userId); });

  it('routine creation: no duplicate, protected input, reconciled retry, then later changed saves work', async () => {
    const creationId = randomUUID(); routineId = creationId;
    rules = [drop('/rest/v1/gym_routines'), outageOn('/rest/v1/gym_routines')];
    await expect(saveGymRoutine(userId, 'R3 routine', 'kg', undefined, creationId)).rejects.toBeInstanceOf(UncertainSaveError);
    expect(await count('gym_routines', 'id', creationId)).toBe(1);
    rules = [];
    await expect(saveGymRoutine(userId, 'R3 changed', 'kg', undefined, creationId)).rejects.toBeInstanceOf(UncertainSaveError);
    await expect(saveGymRoutine(userId, 'R3 routine', 'kg', undefined, creationId)).resolves.toBe(creationId);
    expect(await count('gym_routines', 'id', creationId)).toBe(1);
    await expect(saveGymRoutine(userId, 'R3 changed', 'kg', creationId)).resolves.toBe(creationId);
    const row = await admin.from('gym_routines').select('name').eq('id', creationId).single(); expect(row.data?.name).toBe('R3 changed');
  });

  it('exercise creation: lost response and failed reads leave one row with a stable id', async () => {
    const id = randomUUID();
    const input = { id, routine_id: routineId, user_id: userId, name: 'R3 lift', position: 0, sets: 3, reps: '6-10', rest_seconds: 150, rir: 2, rir_max: null, notes: '', media_path: null, media_mime: null } as const;
    rules = [drop('/rpc/save_gym_exercise'), outageOn('/rest/v1/gym_exercises')];
    await expect(saveGymExercise(input)).rejects.toBeInstanceOf(UncertainSaveError);
    expect(await count('gym_exercises', 'id', id)).toBe(1);
    rules = [];
    await expect(saveGymExercise(input)).resolves.toBe(id);
    expect(await count('gym_exercises', 'id', id)).toBe(1);
  });

  it('draft start and Finish: idempotent after a lost response, with saved weights intact', async () => {
    const exercise = (await admin.from('gym_exercises').select('id').eq('routine_id', routineId).limit(1).single()).data!.id as string;
    rules = [drop('/rpc/start_gym_session'), outageOn('/rest/v1/gym_sessions')];
    await expect(startGymSession(routineId)).rejects.toBeInstanceOf(UncertainSaveError);
    rules = [];
    const draft = await startGymSession(routineId);
    const drafts = await admin.from('gym_sessions').select('id').eq('routine_id', routineId).eq('status', 'draft'); expect(drafts.data).toHaveLength(1); expect(drafts.data![0].id).toBe(draft);
    const weights = [{ exercise_id: exercise, weight: 42.5 }];
    rules = [drop('/rpc/save_gym_session'), outageOn('/rest/v1/gym_sessions'), outageOn('/rest/v1/gym_entries')];
    await expect(saveGymSession(draft, weights, true)).rejects.toBeInstanceOf(UncertainSaveError);
    rules = [];
    await expect(saveGymSession(draft, weights, true)).resolves.toBeUndefined();
    const done = await admin.from('gym_sessions').select('status').eq('id', draft).single(); expect(done.data?.status).toBe('completed');
    const entry = await admin.from('gym_entries').select('weight').eq('session_id', draft); expect(entry.data).toHaveLength(1); expect(Number(entry.data![0].weight)).toBe(42.5);
  });

  it('reward receipt: lost response and failed receipt read, then one reward and no second award on retry', async () => {
    const quest = randomUUID(); const stage = randomUUID();
    expect((await admin.from('long_quests').insert({ id: quest, user_id: userId, name: 'R3 quest', stat: 'INT' })).error).toBeNull();
    // Two stages: completing the first is a plain phase (+20); a lone stage would also earn the +20 completion bonus.
    expect((await admin.from('long_quest_stages').insert([{ id: stage, user_id: userId, long_quest_id: quest, name: 'R3 stage', position: 0 }, { id: randomUUID(), user_id: userId, long_quest_id: quest, name: 'R3 final', position: 1 }])).error).toBeNull();
    const xp = async () => Number((await admin.from('stats').select('xp').eq('user_id', userId).eq('stat', 'INT').single()).data!.xp);
    const before = await xp(); const requestId = randomUUID();
    rules = [drop('/rpc/set_long_quest_stage_done_receipt'), outageOn('/rpc/get_long_quest_reward_receipt', 'POST')];
    await expect(setStageDoneWithReceipt(stage, true, requestId)).rejects.toBeInstanceOf(UncertainSaveError);
    expect(await xp()).toBe(before + 20);
    rules = [];
    const receipt = await setStageDoneWithReceipt(stage, true, requestId);
    expect(receipt.replayed).toBe(true); expect(receipt.totals[0].delta).toBe(20);
    expect(await xp()).toBe(before + 20);
  });

  it('atomic definition create: lost response and failed receipt read, then one quest with its stages', async () => {
    const quest = randomUUID(), requestId = randomUUID();
    const input = { name: 'R3 atomic', stat: 'WIS' as const, description: null, stages: [{ id: null, name: 'R3 one', description: null }, { id: null, name: 'R3 two', description: null }] };
    rules = [drop('/rpc/save_long_quest_definition'), outageOn('/rpc/get_long_quest_definition_receipt', 'POST')];
    await expect(saveAtomicLongQuest(quest, requestId, input as never, true)).rejects.toBeInstanceOf(UncertainSaveError);
    expect(await count('long_quests', 'id', quest)).toBe(1);
    rules = [];
    await expect(saveAtomicLongQuest(quest, requestId, input as never, true)).resolves.toBe(quest);
    expect(await count('long_quests', 'id', quest)).toBe(1); expect(await count('long_quest_stages', 'long_quest_id', quest)).toBe(2);
  });

  it('routine deletion: lost response is reconciled by an idempotent retry', async () => {
    rules = [drop('/rpc/delete_gym_routine'), outageOn('/rest/v1/gym_routines')];
    await expect(deleteGymRoutine(routineId, true)).rejects.toBeInstanceOf(UncertainSaveError);
    rules = [];
    await expect(deleteGymRoutine(routineId, true)).resolves.toBeUndefined();
    const row = await admin.from('gym_routines').select('deleted_at').eq('id', routineId).single(); expect(row.data?.deleted_at).not.toBeNull();
  });
});
