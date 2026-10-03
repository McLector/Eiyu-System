// Runs canonical SQL against an in-memory disposable PostgreSQL runtime.
// PGlite cannot certify multi-connection locking or Supabase Storage HTTP.
const { PGlite } = require('../.temp/plan-012/node_modules/@electric-sql/pglite');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  let assertions = 0;
  const check = (value, expected, label) => { assert.deepEqual(value, expected, label); assertions++; };
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const fails = async (sql, args, label) => { await assert.rejects(db.query(sql, args), undefined, label); assertions++; };
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
    const files = readdirSync(dir).filter(f => /^\d+.*\.sql$/.test(f)).sort();
    for (const file of files) {
      try { await db.exec(readFileSync(join(dir,file),'utf8')); }
      catch (error) { throw new Error(`Migration ${file}: ${error.message}`); }
    }
    console.log(`Applied ${files.length} canonical migrations to disposable PGlite.`);
    const readme = readFileSync(join(dir,'README.md'),'utf8');
    const markerQuery = readme.match(/with checks\(marker, ok\) as \([\s\S]*?select marker, ok from checks order by marker;/)[0];
    const markers = (await db.query(markerQuery)).rows;
    check(markers.filter(m=>!m.ok).map(m=>m.marker),[],'all migration capability markers');
    const owner = '12000000-0000-4000-8000-000000000001';
    const other = '12000000-0000-4000-8000-000000000099';
    const routine = '12000000-0000-4000-8000-000000000002';
    const exercise = '12000000-0000-4000-8000-000000000003';
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[owner,'plan12@example.invalid',other,'other12@example.invalid']);
    await db.exec(`set role authenticated; set "request.jwt.claim.sub"='${owner}';`);
    await db.query('insert into public.gym_routines(id,user_id,name) values($1,$2,$3)',[routine,owner,'Chest']);
    const input = { routine_id:routine,name:'Bench',position:0,sets:3,reps:'6-10',rest_seconds:150,rir:1,rir_max:2,notes:'',media_path:`${owner}/demo.gif`,media_mime:'image/gif' };
    await db.query('select public.save_gym_exercise($1,$2)',[exercise,input]);
    check(await scalar('select rir_max from public.gym_exercises where id=$1',[exercise]),2,'RIR range persisted');
    await fails('select public.save_gym_exercise($1,$2)',[exercise,{...input,rir_max:0}],'descending RIR denied');
    let sid = await scalar('select public.start_gym_session($1)',[routine]);
    check(await scalar('select public.start_gym_session($1)',[routine]),sid,'draft resume idempotent');
    check(await scalar("select prescription->>'rir_max' from public.gym_entries where session_id=$1",[sid]),'2','range snapshot');
    await db.query('select public.save_gym_session($1,$2,true)',[sid,[{exercise_id:exercise,weight:20}]]);
    sid = await scalar('select public.start_gym_session($1)',[routine]);
    await db.query('select public.save_gym_session($1,$2,true)',[sid,[{exercise_id:exercise,weight:null}]]);
    check(await scalar('select weight::float from public.previous_gym_weights($1)',[routine]),20,'blank workout preserves previous 20kg');
    sid = await scalar('select public.start_gym_session($1)',[routine]);
    await db.query('select public.save_gym_session($1,$2,true)',[sid,[{exercise_id:exercise,weight:0}]]);
    check(await scalar('select weight::float from public.previous_gym_weights($1)',[routine]),0,'zero retained');
    sid = await scalar('select public.start_gym_session($1)',[routine]);
    await fails('select public.save_gym_session($1,$2,true)',[sid,[{exercise_id:exercise,weight:1.0001}]],'precision rejected');
    await fails('select public.save_gym_session($1,$2,true)',[sid,[]],'all entries required on finish');
    await fails('select public.delete_gym_routine($1,false)',[routine],'draft deletion consent');
    await fails('update public.gym_routines set deleted_at=now() where id=$1',[routine],'tombstone server controlled');
    await fails('update public.gym_exercises set name=$1 where id=$2',['stale',exercise],'stale client denied');
    check(await scalar('select public.gym_media_unreferenced($1)',[input.media_path]),false,'referenced media protected');
    await db.exec('reset role');
    await db.query(`insert into public.gym_sessions(id,routine_id,user_id,routine_name,unit,status,completed_at)
      select gen_random_uuid(),$1,$2,'Chest','lb','completed',now()-interval '2 days' from generate_series(1,1200)`,[routine,owner]);
    await db.query(`insert into public.gym_entries(session_id,user_id,exercise_id,position,prescription,weight)
      select id,$1,$2,0,'{"name":"Bench"}',44.092 from public.gym_sessions where completed_at<now()-interval '1 day'`,[owner,exercise]);
    await db.exec(`set role authenticated; set "request.jwt.claim.sub"='${owner}';`);
    check(await scalar('select weight::float from public.previous_gym_weights($1)',[routine]),0,'previous independent of 1200 older entries');
    await db.query('select public.delete_gym_routine($1,true)',[routine]);
    await db.query('select public.delete_gym_routine($1,true)',[routine]);
    check(await scalar('select count(*)::integer from public.gym_sessions where status=$1',['completed']),1203,'history retained');
    check(await scalar('select count(*)::integer from public.gym_exercises'),0,'definitions removed');
    check(await scalar('select count(*)::integer from public.list_gym_media_cleanup()'),1,'durable cleanup');
    await fails('select public.start_gym_session($1)',[routine],'deleted start denied');
    await fails('select public.save_gym_exercise($1,$2)',[exercise,input],'deleted exercise save denied');
    await db.exec(`set "request.jwt.claim.sub"='${other}';`);
    check(await scalar('select count(*)::integer from public.gym_sessions'),0,'history owner isolation');
    check(await scalar('select count(*)::integer from public.list_gym_media_cleanup()'),0,'cleanup owner isolation');
    await fails('select public.delete_gym_routine($1,true)',[routine],'foreign deletion denied');
    await db.exec(`set "request.jwt.claim.sub"='${owner}';`);
    const qid = '12000000-0000-4000-8000-000000000010';
    const request = '12000000-0000-4000-8000-000000000011';
    const questInput = { name:'Campaign',stat:'INT',description:'Test',stages:[{id:null,name:'First',description:'One'},{id:null,name:'Last',description:null}] };
    await db.query('select public.save_long_quest_definition($1,$2,$3,true)',[qid,request,questInput]);
    await db.query('select public.save_long_quest_definition($1,$2,$3,true)',[qid,request,questInput]);
    check(await scalar('select count(*)::integer from public.long_quests'),1,'creation retry idempotent');
    const stages = (await db.query('select * from public.long_quest_stages where long_quest_id=$1 order by position',[qid])).rows;
    const rewardId = '12000000-0000-4000-8000-000000000012';
    let receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,true,$2)',[stages[0].id,rewardId]);
    check(receipt.totals[0].delta,20,'stage actual receipt');
    receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,true,$2)',[stages[0].id,rewardId]);
    check(receipt.replayed,true,'receipt replay flag');
    receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,true,gen_random_uuid())',[stages[0].id]);
    check(receipt.totals,[],'duplicate no fabricated XP');
    receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,true,gen_random_uuid())',[stages[1].id]);
    check(receipt.totals[0].delta,40,'last phase plus bonus actual receipt');
    check(receipt.components.length,2,'bonus separated');
    await db.query("update public.long_quests set stat='WIS' where id=$1",[qid]);
    receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,false,gen_random_uuid())',[stages[1].id]);
    check(receipt.totals[0].stat,'INT','captured stat undo');
    check(receipt.totals[0].delta,-40,'undo actual receipt');
    const updated = {...questInput,name:'Updated',stages:stages.map(s=>({id:s.id,name:s.name,description:s.description}))};
    await fails('select public.save_long_quest_definition($1,gen_random_uuid(),$2,false)',[qid,{...updated,name:'Failed atomic',stages:[...updated.stages,{id:null,name:'',description:null}]}],'invalid atomic reconciliation rollback');
    check(await scalar('select name from public.long_quests where id=$1',[qid]),'Campaign','metadata rolled back');
    await db.query('select public.save_long_quest_definition($1,gen_random_uuid(),$2,false)',[qid,updated]);
    check(await scalar('select done from public.long_quest_stages where id=$1',[stages[0].id]),true,'stage completion retained');
    await fails('select public.save_long_quest_definition($1,gen_random_uuid(),$2,false)',[qid,{...updated,stages:[updated.stages[1]]}],'completed stage cannot be dropped');
    check(await scalar('select xp from public.stats where stat=$1',['INT']),20,'earned rewards retained');
    receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,true,gen_random_uuid())',[stages[1].id]);
    check(receipt.totals.map(t=>[t.stat,t.delta]),[['INT',40]],'redo retains originally captured stage and bonus stats');
    await fails('select public.set_long_quest_stage_done_receipt($1,false,gen_random_uuid())',[stages[0].id],'undo cannot skip completed successors');
    await fails('select public.set_long_quest_stage_done_receipt($1,false,$2)',[stages[0].id,rewardId],'reward request cannot change intent');
    await fails('select public.save_long_quest_definition($1,$2,$3,false)',[qid,request,{...updated,name:'Different request payload'}],'definition request cannot change payload');
    await db.exec('reset role');
    await db.query("update public.stats set xp=xp+73 where user_id=$1 and stat='INT'",[owner]);
    await db.exec(`set role authenticated; set "request.jwt.claim.sub"='${owner}';`);
    receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,false,gen_random_uuid())',[stages[1].id]);
    check(receipt.totals.map(t=>[t.before,t.after,t.delta]),[[133,93,-40]],'undo preserves a newer unrelated XP gain');
    check((await scalar('select public.get_long_quest_reward_receipt($1)',[rewardId])).totals.map(t=>[t.before,t.after]),[[0,20]],'stored receipt is independent of newer stats');

    const mixedId = '12000000-0000-4000-8000-000000000020';
    await db.query('select public.save_long_quest_definition($1,gen_random_uuid(),$2,true)',[mixedId,{name:'Captured expedition',stat:'INT',stages:[{name:'First'},{name:'Second'}]}]);
    const mixedStages = (await db.query('select * from public.long_quest_stages where long_quest_id=$1 order by position',[mixedId])).rows;
    await db.query('select public.set_long_quest_stage_done_receipt($1,true,gen_random_uuid())',[mixedStages[0].id]);
    await db.query("update public.long_quests set stat='WIS' where id=$1",[mixedId]);
    await db.query('select public.set_long_quest_stage_done_receipt($1,true,gen_random_uuid())',[mixedStages[1].id]);
    await db.query('select public.set_long_quest_stage_done_receipt($1,false,gen_random_uuid())',[mixedStages[1].id]);
    // Extending a completed definition leaves its existing bonus captured in WIS.
    await db.query('select public.save_long_quest_definition($1,gen_random_uuid(),$2,false)',[mixedId,{name:'Captured expedition',stat:'CHA',stages:[...mixedStages.map(s=>({id:s.id,name:s.name})),{name:'Third'}]}]);
    await db.query('select public.set_long_quest_stage_done_receipt($1,true,gen_random_uuid())',[mixedStages[1].id]);
    const last = await scalar('select id from public.long_quest_stages where long_quest_id=$1 order by position desc limit 1',[mixedId]);
    receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,true,gen_random_uuid())',[last]);
    check(receipt.totals.map(t=>[t.stat,t.delta]).sort(),[['CHA',20],['WIS',20]],'final receipt accurately separates differently captured stage and bonus stats');
    receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,false,gen_random_uuid())',[last]);
    check(receipt.totals.map(t=>[t.stat,t.delta]).sort(),[['CHA',-20],['WIS',-20]],'mixed-stat undo reports both actual changes');

    const legacyId = '12000000-0000-4000-8000-000000000030';
    await db.query('select public.save_long_quest_definition($1,gen_random_uuid(),$2,true)',[legacyId,{name:'Legacy exemption',stat:'DEX',stages:[{name:'Only stage'}]}]);
    const legacyStage = await scalar('select id from public.long_quest_stages where long_quest_id=$1',[legacyId]);
    await db.exec('reset role');
    await db.query("insert into public.long_quest_rewards(user_id,quest_id,reward_key,kind,stat,amount,active,legacy_exempt) values($1,$2,$3,'stage','DEX',0,false,true),($1,$2,$2,'bonus','DEX',0,false,true)",[owner,legacyId,legacyStage]);
    await db.exec(`set role authenticated; set "request.jwt.claim.sub"='${owner}';`);
    receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,true,gen_random_uuid())',[legacyStage]);
    check([receipt.changed,receipt.components,receipt.totals],[true,[],[]],'legacy completion changes state without fabricated XP');
    await db.query('select public.set_long_quest_stage_done_receipt($1,false,gen_random_uuid())',[legacyStage]);
    receipt = await scalar('select public.set_long_quest_stage_done_receipt($1,true,gen_random_uuid())',[legacyStage]);
    check(receipt.totals,[],'legacy undo and redo remain exempt');

    const repairId = '12000000-0000-4000-8000-000000000040';
    await db.exec('reset role');
    // Only this disposable fixture recreates a name grandfathered before 031.
    await db.exec('alter table public.long_quests disable trigger long_quests_validate_name_length');
    await db.query("insert into public.long_quests(id,user_id,name,stat) values($1,$2,repeat('L',81),'STR')",[repairId,owner]);
    await db.exec('alter table public.long_quests enable trigger long_quests_validate_name_length');
    await db.exec(`set role authenticated; set "request.jwt.claim.sub"='${owner}';`);
    await db.query('select public.save_long_quest_definition($1,gen_random_uuid(),$2,false)',[repairId,{name:'L'.repeat(81),stat:'STR',stages:[{name:'Repair'}]}]);
    check(await scalar('select count(*)::integer from public.long_quest_stages where long_quest_id=$1',[repairId]),1,'zero-stage legacy quest repaired as one-stage definition');
    await fails('select public.save_long_quest_definition($1,gen_random_uuid(),$2,false)',[repairId,{name:'Changed '+'L'.repeat(81),stat:'STR',stages:[{name:'Repair'}]}],'changed legacy name must satisfy current limit');
    await db.query('select public.save_long_quest_definition($1,gen_random_uuid(),$2,false)',[repairId,{name:'\u{1f3f0}'.repeat(80),stat:'STR',stages:[{name:'Repair'}]}]);
    check(await scalar('select length(name) from public.long_quests where id=$1',[repairId]),80,'Unicode name length counts code points, not UTF-16 units');
    await fails('select public.save_long_quest_definition($1,gen_random_uuid(),$2,false)',[repairId,{name:'\u{1f3f0}'.repeat(81),stat:'STR',stages:[{name:'Repair'}]}],'81 Unicode code points rejected');
    await fails('select public.save_long_quest_definition($1,gen_random_uuid(),$2,false)',[repairId,{name:'Empty repair',stat:'STR',stages:[]}],'zero-stage writes rejected atomically');
    await fails('select * from public.gym_media_cleanup',[],'cleanup manifest is not directly readable');
    await db.query('select public.ack_gym_media_cleanup($1)',[input.media_path]);
    check(await scalar('select count(*)::integer from public.list_gym_media_cleanup()'),0,'cleanup acknowledged only after confirmed deletion');
    await db.exec(`set "request.jwt.claim.sub"='${other}';`);
    check(await scalar('select public.get_long_quest_reward_receipt($1)',[rewardId]),null,'receipt owner isolation');
    await fails('select public.set_long_quest_stage_done_receipt($1,true,gen_random_uuid())',[stages[0].id],'foreign reward denied');
    await fails('update public.stats set xp=999',[],'no stats DML');
    console.log(`${assertions} assertions passed. Multi-connection and Storage HTTP acceptance remain pending.`);
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
