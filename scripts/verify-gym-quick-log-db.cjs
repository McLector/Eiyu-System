// Runs canonical SQL 001-038, seeds the old draft-based workflow, applies 039 and checks the quick-log model.
// PGlite cannot certify multi-connection locking; this proves shape, ownership, validation and the draft conversion.
const { PGlite } = require('../.temp/plan-012/node_modules/@electric-sql/pglite');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');

const owner = '39000000-0000-4000-8000-000000000001';
const other = '39000000-0000-4000-8000-000000000099';
const R1 = '39000000-0000-4000-8000-0000000000a1'; // kg routine: two exercises, a mixed draft
const R2 = '39000000-0000-4000-8000-0000000000a2'; // lb routine: one exercise, a blank draft
const R3 = '39000000-0000-4000-8000-0000000000a3'; // archived routine
const E1 = '39000000-0000-4000-8000-0000000000b1';
const E2 = '39000000-0000-4000-8000-0000000000b2';
const E3 = '39000000-0000-4000-8000-0000000000b3';
const E4 = '39000000-0000-4000-8000-0000000000b4';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const newId = () => require('node:crypto').randomUUID();

async function main() {
  const db = new PGlite();
  let assertions = 0;
  const check = (value, expected, label) => { assert.deepEqual(value, expected, label); assertions++; };
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0] ?? { v: null })[0];
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const fails = async (sql, args, label, message) => {
    await assert.rejects(db.query(sql, args), message ? { message: new RegExp(message) } : undefined, label); assertions++;
  };
  const as = async user => { await db.exec(`reset role; set role authenticated; set "request.jwt.claim.sub"='${user}';`); };
  const asOwner = () => as(owner);
  const recent = async routine => rows('select exercise_id, weight::float as weight, unit, recency from public.recent_gym_weights($1) order by exercise_id, recency', [routine]);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage; create schema extensions;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_user::text$$;
      grant usage on schema auth,storage,public to authenticated,anon,service_role;
      grant execute on function auth.uid(),auth.role() to authenticated,anon,service_role;
      alter default privileges in schema public grant all on tables to authenticated,service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,delete on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
    const dir = join(__dirname, '../backend/supabase');
    const all = readdirSync(dir).filter(f => /^\d+.*\.sql$/.test(f)).sort();
    const before = all.filter(f => Number(f.slice(0, 3)) < 39);
    const quickLog = all.filter(f => /^039_/.test(f));
    check(quickLog.length, 1, 'exactly one 039 migration file');
    for (const file of before) {
      try { await db.exec(readFileSync(join(dir, file), 'utf8')); }
      catch (error) { throw new Error(`Migration ${file}: ${error.message}`); }
    }

    // ---- Seed the old, draft-based workflow (as the database owner, before 039) ----
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [owner, 'q39@example.invalid', other, 'other39@example.invalid']);
    await db.query(`insert into public.gym_routines(id,user_id,name,unit,archived) values
      ($1,$3,'Leg day','kg',false),($2,$3,'Upper','lb',false),($4,$3,'Old plan','kg',true)`, [R1, R2, owner, R3]);
    const exercise = (id, routine, name, position) => db.query(
      `insert into public.gym_exercises(id,routine_id,user_id,name,position,sets,reps,rest_seconds,rir,notes) values($1,$2,$3,$4,$5,4,'6-8',120,2,'brace')`,
      [id, routine, owner, name, position]);
    await exercise(E1, R1, 'Barbell squat', 0); await exercise(E2, R1, 'Romanian deadlift', 1);
    await exercise(E3, R2, 'Bench press', 0); await exercise(E4, R3, 'Curl', 0);
    // One finished workout from the old flow: squat 40 kg.
    await db.query(`insert into public.gym_sessions(id,routine_id,user_id,routine_name,unit,status,created_at,completed_at)
      values('39000000-0000-4000-8000-0000000000c1',$1,$2,'Leg day','kg','completed','2026-09-01T10:00:00Z','2026-09-01T11:00:00Z')`, [R1, owner]);
    await db.query(`insert into public.gym_entries(session_id,user_id,exercise_id,position,prescription,weight)
      values('39000000-0000-4000-8000-0000000000c1',$1,$2,0,'{"name":"Barbell squat"}',40)`, [owner, E1]);
    // Two unfinished drafts: R1 has one typed weight and one blank, R2 is blank.
    await asOwner();
    const draft1 = await scalar('select public.start_gym_session($1)', [R1]);
    await db.query('select public.save_gym_session($1,$2,false)', [draft1, [{ exercise_id: E1, weight: 50 }]]);
    const draft2 = await scalar('select public.start_gym_session($1)', [R2]);
    await db.exec('reset role');
    const draft1Created = await scalar('select created_at::text from public.gym_sessions where id=$1', [draft1]);
    check(await scalar("select count(*)::integer from public.gym_sessions where status='draft'"), 2, 'two drafts exist before 039');

    // ---- Apply 039 ----
    try { await db.exec(readFileSync(join(dir, quickLog[0]), 'utf8')); }
    catch (error) { throw new Error(`Migration ${quickLog[0]}: ${error.message}`); }

    // ---- Existing drafts are converted, not lost ----
    check(await scalar("select count(*)::integer from public.gym_sessions where status='draft'"), 0, 'no drafts remain');
    check(await scalar('select status from public.gym_sessions where id=$1', [draft1]), 'completed', 'a draft with a typed weight becomes history');
    check(await scalar('select (completed_at = created_at)::boolean from public.gym_sessions where id=$1', [draft1]), true, 'converted draft keeps its own date');
    check(await scalar('select created_at::text from public.gym_sessions where id=$1', [draft1]), draft1Created, 'conversion does not rewrite created_at');
    check(await scalar('select count(*)::integer from public.gym_entries where session_id=$1', [draft1]), 1, 'blank entries of a converted draft are dropped');
    check(await scalar('select weight::float from public.gym_entries where session_id=$1', [draft1]), 50, 'the typed weight survives');
    check(await scalar('select count(*)::integer from public.gym_sessions where id=$1', [draft2]), 0, 'a blank draft is removed');
    check(await scalar('select count(*)::integer from public.gym_entries where session_id=$1', [draft2]), 0, 'its entries go with it');

    // ---- Ownership and privileges ----
    check(await scalar("select has_function_privilege('authenticated','public.log_gym_weight(uuid,uuid,numeric)','EXECUTE')"), true, 'authenticated may log');
    check(await scalar("select has_function_privilege('anon','public.log_gym_weight(uuid,uuid,numeric)','EXECUTE')"), false, 'anon may not log');
    check(await scalar("select has_function_privilege('anon','public.recent_gym_weights(uuid)','EXECUTE')"), false, 'anon may not read recent weights');
    check(await scalar("select has_function_privilege('authenticated','public.recent_gym_weights(uuid)','EXECUTE')"), true, 'authenticated may read recent weights');

    // ---- Current and Previous after the conversion: squat 50 now, 40 before ----
    await asOwner();
    check(await recent(R1), [
      { exercise_id: E1, weight: 50, unit: 'kg', recency: 1 },
      { exercise_id: E1, weight: 40, unit: 'kg', recency: 2 },
    ], 'latest two squat weights, newest first');

    // ---- Logging ----
    await pause(15);
    await db.query('select public.log_gym_weight($1,$2,$3)', [newId(), E1, 52.5]);
    check(await recent(R1), [
      { exercise_id: E1, weight: 52.5, unit: 'kg', recency: 1 },
      { exercise_id: E1, weight: 50, unit: 'kg', recency: 2 },
    ], 'a new log becomes Current and the old Current becomes Previous');
    check(await scalar("select count(*)::integer from public.gym_sessions where status='draft'"), 0, 'logging never leaves a draft');
    check(await scalar('select count(*)::integer from public.gym_entries where exercise_id=$1 and weight is not null', [E1]), 3, 'every log is kept as history');
    const logged = await rows(`select s.status, s.unit, s.routine_name, (s.completed_at is not null) as done, e.prescription->>'name' as name, e.position
      from public.gym_entries e join public.gym_sessions s on s.id=e.session_id where e.weight=52.5`);
    check(logged, [{ status: 'completed', unit: 'kg', routine_name: 'Leg day', done: true, name: 'Barbell squat', position: 0 }], 'a log is one completed single-exercise workout with a snapshot');

    await db.query('select public.log_gym_weight($1,$2,$3)', [newId(), E2, 80]);
    check((await recent(R1)).filter(r => r.exercise_id === E2), [{ exercise_id: E2, weight: 80, unit: 'kg', recency: 1 }], 'a first log has a Current and no Previous');
    await db.query('select public.log_gym_weight($1,$2,$3)', [newId(), E3, 102.25]);
    check(await recent(R2), [{ exercise_id: E3, weight: 102.25, unit: 'lb', recency: 1 }], 'the unit follows the routine');
    await pause(15);
    await db.query('select public.log_gym_weight($1,$2,$3)', [newId(), E1, 0]);
    check((await recent(R1)).filter(r => r.exercise_id === E1).map(r => r.weight), [0, 52.5], 'zero is a real weight, not blank');
    await pause(15);
    await db.query('select public.log_gym_weight($1,$2,$3)', [newId(), E1, 1000000]);
    check((await recent(R1)).filter(r => r.exercise_id === E1)[0].weight, 1000000, 'the upper bound is accepted');

    // ---- Retrying a log that already landed changes nothing (an uncertain network failure is retried with the same id) ----
    const retryId = newId();
    await pause(15);
    await db.query('select public.log_gym_weight($1,$2,$3)', [retryId, E2, 81]);
    const afterFirst = await scalar('select count(*)::integer from public.gym_sessions');
    await db.query('select public.log_gym_weight($1,$2,$3)', [retryId, E2, 81]);
    await db.query('select public.log_gym_weight($1,$2,$3)', [retryId, E2, 99]);
    check(await scalar('select count(*)::integer from public.gym_sessions'), afterFirst, 'a retried log id adds no workout');
    check(await scalar('select weight::float from public.gym_entries where session_id=$1', [retryId]), 81, 'the first write wins on a retry');
    check((await recent(R1)).filter(r => r.exercise_id === E2)[0].weight, 81, 'Current reflects the landed log once');
    await fails('select public.log_gym_weight($1,$2,$3)', [null, E2, 5], 'a log without an id is rejected', 'Log id is required');

    // ---- Validation ----
    const before2 = await scalar('select count(*)::integer from public.gym_sessions');
    await fails('select public.log_gym_weight($1,$2,$3)', [newId(), E1, -1], 'negative weight rejected', 'Weight must be from 0 to 1000000');
    await fails('select public.log_gym_weight($1,$2,$3)', [newId(), E1, 1000000.001], 'over the limit rejected', 'Weight must be from 0 to 1000000');
    await fails('select public.log_gym_weight($1,$2,$3)', [newId(), E1, 1.0001], 'four decimals rejected', 'Weight must be from 0 to 1000000');
    await fails('select public.log_gym_weight($1,$2,$3)', [newId(), E1, null], 'null rejected', 'Weight must be from 0 to 1000000');
    await fails('select public.log_gym_weight($1,$2,$3)', [newId(), '39000000-0000-4000-8000-0000000000ff', 5], 'unknown exercise rejected', 'Exercise not found');
    await fails('select public.log_gym_weight($1,$2,$3)', [newId(), E4, 5], 'archived routine rejected', 'Routine not available');
    await db.exec('reset role');
    await db.query('update public.gym_routines set deleted_at=now() where id=$1', [R2]);
    await asOwner();
    await fails('select public.log_gym_weight($1,$2,$3)', [newId(), E3, 5], 'deleted routine rejected', 'Routine not available');
    check(await scalar('select count(*)::integer from public.gym_sessions'), before2, 'rejected logs write nothing');

    // ---- Another account sees and writes nothing ----
    await as(other);
    await fails('select public.log_gym_weight($1,$2,$3)', [newId(), E1, 9], 'cannot log against someone else\'s exercise', 'Exercise not found');
    check(await recent(R1), [], 'cannot read someone else\'s weights');
    await fails('insert into public.gym_entries(session_id,user_id,exercise_id,position,prescription,weight) select id,user_id,$1,0,\'{}\',1 from public.gym_sessions limit 1', [E1], 'clients still cannot write entries directly');

    await fails('select public.log_gym_weight($1,$2,$3)', [retryId, E1, 9], 'cannot reuse another account log id');
    // ---- Anonymous callers are refused outright ----
    await db.exec('reset role; set role anon;');
    await fails('select public.log_gym_weight($1,$2,$3)', [newId(), E1, 9], 'anon cannot log', 'permission denied');
    await db.exec('reset role');

    // ---- Old open tabs keep working: the previous RPCs are untouched ----
    await asOwner();
    check(typeof await scalar('select public.start_gym_session($1)', [R1]), 'string', 'start_gym_session still exists for tabs running the old client');
    await db.exec('reset role');

    console.log(`Gym quick-log database verification passed: ${assertions} assertions.`);
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exit(1); });
