/**
 * Native proof that the Board read stays complete on a real PostgREST. Skipped unless R3_NATIVE=1.
 * DISPOSABLE local Supabase only (API port 54321); the secret comes from R3_JWT_SECRET at run time and is never stored.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { initSupabaseClient } from '../../supabase/client';
import { fetchTodayHabits } from '../habits';

const run = process.env.R3_NATIVE === '1' ? describe : describe.skip;
const API = process.env.R3_API_URL ?? 'http://127.0.0.1:54321';
const token = (role: string) => {
  const now = Math.floor(Date.now() / 1000), b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ role, iss: 'supabase', iat: now, exp: now + 3600 })}`;
  return `${head}.${createHmac('sha256', process.env.R3_JWT_SECRET as string).update(head).digest('base64url')}`;
};

run('Board read on a real stack with a large catalog and a long history', () => {
  jest.setTimeout(180_000);
  let admin: SupabaseClient; let userId = '';
  beforeAll(async () => {
    if (!/:54321$/.test(API)) throw new Error('Refusing to run against anything but the isolated stack on 54321.');
    if (!process.env.R3_JWT_SECRET) throw new Error('Missing R3_JWT_SECRET.');
    admin = createClient(API, token('service_role'), { auth: { persistSession: false } });
    const email = `habits-${randomUUID()}@example.invalid`, password = randomBytes(24).toString('base64url');
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); expect(created.error).toBeNull();
    userId = created.data.user!.id;
    // The seeded dates are UTC days, so pin the account to UTC; otherwise "today" depends on the machine's zone.
    expect((await admin.from('profiles').update({ time_zone: 'UTC' }).eq('user_id', userId)).error).toBeNull();
    const client = createClient(API, token('anon'), { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    initSupabaseClient(client as never);
  });
  afterAll(async () => { if (userId) await admin.auth.admin.deleteUser(userId); });

  it('returns all 1,100 habits exactly once with no request-size error', async () => {
    const rows = Array.from({ length: 1100 }, (_, i) => ({ user_id: userId, name: `Bulk habit ${i}`, easy_version: 'One minute', stat: 'STR', difficulty: 'Easy', days: [0, 1, 2, 3, 4, 5, 6], quest_type: 'habit' }));
    for (let i = 0; i < rows.length; i += 250) expect((await admin.from('habits').insert(rows.slice(i, i + 250))).error).toBeNull();
    const quests = await fetchTodayHabits(userId);
    expect(quests).toHaveLength(1100);
    expect(new Set(quests.map(q => q.id)).size).toBe(1100);
    expect(quests.filter(q => q.dailyEligible).length).toBe(1100);
  });

  it('reads a completion history longer than the 1,000-row cap', async () => {
    const habit = (await admin.from('habits').select('id').eq('user_id', userId).eq('name', 'Bulk habit 0').single()).data!.id as string;
    const days = Array.from({ length: 1200 }, (_, i) => new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
    for (let i = 0; i < days.length; i += 300) {
      const occ = await admin.from('habit_occurrences').upsert(days.slice(i, i + 300).map(d => ({ user_id: userId, habit_id: habit, occurrence_date: d, time_zone: 'UTC', day_ends_at: `${d}T23:59:59Z` })), { onConflict: 'habit_id,occurrence_date', ignoreDuplicates: true });
      expect(occ.error).toBeNull();
      const done = await admin.from('habit_completions').insert(days.slice(i, i + 300).map(d => ({ user_id: userId, habit_id: habit, completed_on: d, kind: 'full', xp_awarded: 0 })));
      expect(done.error).toBeNull();
    }
    const stored = await admin.from('habit_completions').select('id', { count: 'exact', head: true }).eq('habit_id', habit);
    expect(stored.count).toBeGreaterThan(1000);
    const quest = (await fetchTodayHabits(userId)).find(q => q.id === habit)!;
    expect(quest.completed).toBe(true);
    expect(quest.streak).toBeGreaterThan(1000);
  });
});
