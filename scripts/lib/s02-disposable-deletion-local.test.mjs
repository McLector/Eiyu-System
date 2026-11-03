import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {inspectLocal,guardLocalFetch,parseMode,runRehearsal,catalogMatches,createLocalPorts,createDisposablePair,runControlledSequence,checkServiceCapabilities} from './s02-disposable-deletion-local.mjs';
const facts=()=>({project:'eiyu-s02-age-demo',container:'/supabase_db_eiyu-s02-age-demo',api:'http://127.0.0.1:57321',mail:'http://127.0.0.1:57324',catalog:true,sessionColumns:true,rpcs:true,bucket:{private:true,size:20971520,mimes:['image/gif','video/mp4']},closed:true,outstanding:0,details:0});
test('read-only inspector validates every local capability before fixture creation',async()=>{
 let calls=0;const valid=await inspectLocal({discover:async()=>{calls++;return facts();}});assert.equal(calls,1);assert.equal(valid.facts.api,facts().api);
 for(const patch of [{project:'other'},{container:'/other'},{api:'https://hosted.invalid'},{mail:'http://127.0.0.1:1'},{catalog:false},{sessionColumns:false},{rpcs:false},{closed:false},{outstanding:1},{details:1},{bucket:{private:false,size:20971520,mimes:['image/gif','video/mp4']}}])await assert.rejects(inspectLocal({discover:async()=>({...facts(),...patch})}));
});
test('preflight diagnostics emit only fixed phases and boolean qualifications',async()=>{
 const rows=[];await inspectLocal({discover:async()=>({...facts(),secret:'inert canary'}),observe:row=>rows.push(row)});
 assert.equal(rows.length,1);assert.equal(rows[0].phase,'qualification');assert.equal(Object.values(rows[0].checks).every(x=>typeof x==='boolean'),true);assert.equal(JSON.stringify(rows).includes('canary'),false);
});
test('network denies nonlocal, credentials, query selector abuse, functions and redirects',async()=>{
 const calls=[];const guarded=guardLocalFetch(async(url,init)=>{calls.push({url:String(url),redirect:init.redirect,signal:init.signal});return new Response('{}');});
 for(const url of ['https://hosted.invalid/auth/v1/user','http://localhost:57321/auth/v1/user','http://x:y@127.0.0.1:57321/auth/v1/user','http://127.0.0.1:57321/functions/v1/ai-proxy','http://127.0.0.1:57321/management/users','http://127.0.0.1:57321/rest/v1/rpc/ai_begin_request'])await assert.rejects(guarded(url));
 assert.equal(calls.length,0);await guarded('http://127.0.0.1:57321/auth/v1/user');assert.equal(calls[0].redirect,'error');assert.equal(calls[0].signal instanceof AbortSignal,true);
});
test('request budget remains active after response headers for a pending body',async()=>{
 let signal;const guarded=guardLocalFetch(async(_url,init)=>{signal=init.signal;return new Response('{}');},10);
 await guarded('http://127.0.0.1:57321/auth/v1/user');await new Promise(resolve=>setTimeout(resolve,30));assert.equal(signal.aborted,true);
});
test('encoded RPC names cannot bypass denied AI routes',async()=>{
 let called=0;const guarded=guardLocalFetch(async()=>{called++;return new Response('{}');});
 await assert.rejects(guarded('http://127.0.0.1:57321/rest/v1/%72pc/ai_begin_request'));assert.equal(called,0);
});
test('mode parser refuses caller selectors and defaults to immutable read-only mode',()=>{
 assert.equal(parseMode([]),'dry-run');assert.equal(parseMode(['--dry-run']),'dry-run');assert.equal(parseMode(['--execute-disposable-target']),'execute');
 for(const args of [['--resume'],['--target','inert'],['--execute-disposable-target','--dry-run'],['--execute-disposable-target','--target=x']])assert.throws(()=>parseMode(args));
});
test('default dry-run makes no fixture/removal call and catches unknown errors safely',async()=>{
 let created=0;const r=await runRehearsal('dry-run',{inspect:async()=>({facts:facts()}),create:async()=>{created++;throw Error('inert canary');}});
 assert.equal(created,0);assert.equal(r.stage,'prepared');assert.equal(r.finished,false);assert.deepEqual(r.checks,['preflight']);
 const bad=await runRehearsal('dry-run',{inspect:async()=>{throw Error('Bearer canary');}});assert.equal(JSON.stringify(bad).includes('canary'),false);assert.equal(bad.stage,'needs-review');
});
test('catalog compares every table column and foreign dependency rather than a stored manifest alone',()=>{
 const manifest={tables:[{table:'public.synthetic',export:['user_id','value'],exclude:['private'],scope:'owner'}],foreignKeys:[{source:'public.synthetic',definition:'fixed'}]};
 const actual={tables:[{table:'public.synthetic',columns:['private','user_id','value']}],foreignKeys:[{source:'public.synthetic',definition:'fixed'}]};
 assert.equal(catalogMatches(manifest,actual),true);
 for(const changed of [{...actual,tables:[]},{...actual,tables:[{table:'public.synthetic',columns:['user_id','value','extra']}]},{...actual,foreignKeys:[]}])assert.equal(catalogMatches(manifest,changed),false);
});
test('catalog diagnosis contains only equality booleans',()=>{
 const rows=[];catalogMatches({tables:[],foreignKeys:[]},{tables:[],foreignKeys:[]},row=>rows.push(row));assert.equal(rows.length,1);assert.deepEqual(rows[0],{tables:true,foreignKeys:true});
});
test('local mutation adapters reject control/foreign keys and soft-delete before SDK calls',async()=>{
 const runId='d5200000-0000-4000-8000-000000000001',targetId='d5200000-0000-4000-8000-000000000002',controlId='d5200000-0000-4000-8000-000000000003';
 const scope=Object.freeze({runId,targetId,controlId,projectId:'eiyu-s02-age-demo',api:'http://127.0.0.1:57321',container:'supabase_db_eiyu-s02-age-demo',bucket:'gym-exercise-media',targetKey:`${targetId}/s02-delete-${runId}/probe.gif`,controlKey:`${controlId}/s02-delete-${runId}/probe.gif`});
 const context={originalTargetUserCreatedInThisProcess:true,createdIds:new Set([targetId,controlId]),originalIds:new Set()};let mutations=0;
 const local={admin:{storage:{from:()=>({remove:async()=>{mutations++;return{data:[],error:null};}})},auth:{admin:{deleteUser:async()=>{mutations++;return {data:{},error:null};}}}}};
 const ports=createLocalPorts(local,{scope,context},{});
 for(const key of [scope.controlKey,`${targetId}/`,scope.targetKey+'/../x'])await assert.rejects(ports.removeExactObject(key));
 await assert.rejects(ports.deleteExactUser(controlId,false));await assert.rejects(ports.deleteExactUser(targetId,true));assert.equal(mutations,0);
 await ports.removeExactObject(scope.targetKey);await ports.deleteExactUser(targetId,false);assert.equal(mutations,2);
});
test('fixture creation refuses an existing returned account and never invokes deletion cleanup',async()=>{
 let deleted=0,queried=0;const original='d5200000-0000-4000-8000-000000000009';
 const local={capture:()=>({auth:{users:[{id:original}]}}),admin:{auth:{admin:{createUser:async()=>({data:{user:{id:original}},error:null}),deleteUser:async()=>{deleted++;}}}},client:()=>{throw Error('must not sign in');},query:()=>{queried++;}};
 await assert.rejects(createDisposablePair(local,'d5200000-0000-4000-8000-000000000001',{recordFixture:()=>{}}));assert.equal(deleted,0);assert.equal(queried,0);
});
test('entry rejects caller-selected targets with bounded JSON and no raw stderr',()=>{
 const result=spawnSync(process.execPath,['scripts/s02-disposable-deletion-local.test.mjs','--target=inert-foreign-id'],{encoding:'utf8'});
 assert.equal(result.status,1);assert.equal(result.stderr,'');let value;try{value=JSON.parse(result.stdout);}catch{value=null;}
 assert.equal(value?.stage,'needs-review');assert.equal(value?.finished,false);assert.ok(result.stdout.length<16384);
});
test('execute mode delegates only after preflight and projects its result',async()=>{
 const calls=[];const result=await runRehearsal('execute',{inspect:async()=>{calls.push('inspect');return {};},execute:async()=>{calls.push('execute');return {finished:false,stage:'storage-removed',checks:['controlled-stop'],raw:'inert canary'};}});
 assert.deepEqual(calls,['inspect','execute']);assert.equal(result.stage,'storage-removed');assert.equal(JSON.stringify(result).includes('canary'),false);
});
test('unexpected failure after a tentative success cannot report finished true',async()=>{
 const result=await runRehearsal('execute',{inspect:async()=>({}),execute:async(_local,report)=>{report.finished=true;throw Error('inert');}});
 assert.equal(result.finished,false);assert.equal(result.stage,'needs-review');
});
test('controlled sequence pauses after storage and reauthenticates before Auth removal',async()=>{
 const calls=[];const transitions=['storage-removed','auth-removed','verified'];
 const result=await runControlledSequence({advance:async state=>{calls.push('advance:'+state);return transitions.shift();},afterStorage:async()=>{calls.push('controlled-stop');},reauthenticate:async()=>{calls.push('fresh-auth');}});
 assert.equal(result,'verified');assert.deepEqual(calls,['advance:prepared','controlled-stop','fresh-auth','advance:storage-removed','advance:auth-removed']);
});
test('lost reauthorization after controlled stop cannot call Auth removal',async()=>{
 let advanced=0;await assert.rejects(runControlledSequence({advance:async()=>{advanced++;return 'storage-removed';},afterStorage:async()=>{},reauthenticate:async()=>{throw Error('inert');}}));assert.equal(advanced,1);
});
test('service capability probe is read-only and refuses missing Auth/Storage/RPC capability',async()=>{
 for(const denied of [null,'auth','storage','rpc']){
  let mutations=0;const result=name=>name===denied?{error:{message:'inert canary'},data:null}:{data:name==='rpc'?false:{},error:null};
  const local={admin:{auth:{admin:{listUsers:async()=>result('auth'),createUser:()=>{mutations++;}}},storage:{from:()=>({list:async()=>result('storage'),remove:()=>{mutations++;}})},rpc:async()=>result('rpc')}};
  if(denied)await assert.rejects(checkServiceCapabilities(local));else await checkServiceCapabilities(local);assert.equal(mutations,0);
 }
});
test('full rehearsal orchestration keeps control, compares originals and signs out only control',async()=>{
 const runId='d5200000-0000-4000-8000-000000000001',targetId='d5200000-0000-4000-8000-000000000002',controlId='d5200000-0000-4000-8000-000000000003';
 const scope=Object.freeze({runId,targetId,controlId,projectId:'eiyu-s02-age-demo',api:'http://127.0.0.1:57321',container:'supabase_db_eiyu-s02-age-demo',bucket:'gym-exercise-media',targetKey:`${targetId}/s02-delete-${runId}/probe.gif`,controlKey:`${controlId}/s02-delete-${runId}/probe.gif`});
 const context={originalTargetUserCreatedInThisProcess:true,createdIds:new Set([targetId,controlId]),originalIds:new Set(),requesterToken:'inert-label',expectedMailboxVersion:1};
 let object=true,user=true,signedOut=0;const calls=[],original={rows:{},auth:{users:[]},storage:[]},local={capture:()=>original};
 const pair={scope,context,original,control:{client:{auth:{signOut:async()=>{signedOut++;}}}}};
 const ports={verifyRequester:async()=>({userId:targetId,sessionId:runId}),checkMailbox:async()=>true,removeExactObject:async()=>{object=false;calls.push('remove');},objectAbsent:async()=>!object,targetExists:async()=>user,deleteExactUser:async()=>{user=false;calls.push('delete');},verifyRemoval:async()=>!object&&!user,assertOriginals:async()=>true,writeStage:async()=>{}};
 const dependencies={inspect:async()=>local,create:async()=>pair,artifact:()=>({recordFixture:()=>{},writeStage:()=>{},writeResult:()=>{}}),ports:()=>ports,prepare:async()=>{calls.push('prepare');},negative:async()=>{},reauthenticate:async()=>{calls.push('reauth');},afterDelete:async()=>{},compareControl:async()=>true};
 const result=await runRehearsal('execute',dependencies);assert.equal(result.finished,true);assert.equal(result.originalsUnchanged,true);assert.equal(result.controlUnchanged,true);assert.equal(signedOut,1);assert.deepEqual(calls,['prepare','remove','reauth','delete']);
});
