// Retained local stack only. Auth credentials, exported rows and SQL snapshots stay in RAM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createOwnerExportHandler} from '../backend/supabase/functions/account-export/export-core.ts';
import {authenticateExportBearer} from '../backend/supabase/functions/account-export/export-auth.ts';
import {isOwnerExportDocument} from '../packages/shared/src/data/owner-export-contract.ts';

const artifact='.superpowers/sdd/2026-10-22-s02-export-receiving-implementation';
const tag=process.env.S02_EXPORT_REHEARSAL_TAG??'initial';assert.match(tag,/^[a-z0-9-]+$/);
const resultPath=artifact+`/task5-http-${tag}-result.json`;
const docker='C:/Users/morad/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const container='supabase_db_eiyu-s02-age-demo';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
function query(sql){try{return JSON.parse(execFileSync(docker,['exec','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],
 {input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20000,maxBuffer:32*1024*1024}).trim());}catch{throw Error('Local SQL check failed; details withheld');}}
const manifest=JSON.parse(readFileSync('scripts/fixtures/owner-export-manifest.json','utf8'));
function originalRows(exclude=[]){
 assert.ok(exclude.every(uuid));const ids=exclude.length?exclude.map(id=>`'${id}'::uuid`).join(','):`'00000000-0000-0000-0000-000000000000'::uuid`;
 return query('select jsonb_build_object('+manifest.tables.map(spec=>{
  assert.match(spec.table,/^(public|private)\.[a-z_]+$/);
  const where=spec.scope==='global'?'true':spec.scope==='indirect'?`r.request_id in(select request_id from private.ai_logical_requests where user_id not in(${ids}))`:`r.user_id not in(${ids})`;
  return `'${spec.table}',(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) from ${spec.table} r where ${where})`;
 }).join(',')+');');
}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
const ok=(result,label)=>assert.equal(Boolean(result.error),false,label);

test('guarded owner export HTTP with real local Auth/RPC; no provider or real fulfillment',async()=>{
 let stage='preflight',server,original,successful=false,restored=false,serviceCalls=0,deniedNetwork=0;
 const fixtures=[],users=[],holds=[],pending=new Set(),nativeFetch=globalThis.fetch;
 const report={localOnly:true,actualDenoEdge:false,mailboxProof:'privileged simulated fixture setup',providerCalls:0,checks:[]};
 let hold=null;
 const check=name=>report.checks.push(name);
 assert.ok(!existsSync(resultPath),'preserve prior acceptance artifacts');
 try{
  assert.match(readFileSync('.superpowers/s02-age/supabase/config.toml','utf8'),/project_id = "eiyu-s02-age-demo"/);
  assert.equal(execFileSync(docker,['inspect','--format','{{.Name}}',container],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),'/'+container);
  const status=JSON.parse(execFileSync('node_modules/@supabase/cli-windows-x64/bin/supabase.exe',['--agent','no','--workdir','.superpowers/s02-age','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(status.API_URL,'http://127.0.0.1:57321');assert.equal(new URL(status.MAILPIT_URL).port,'57324');
  const mail=await nativeFetch(status.MAILPIT_URL+'/api/v1/info');assert.equal(mail.ok,true);check('retained API and mailbox reachable');
  original=originalRows();
  const origins=new Set([status.API_URL]);
  globalThis.fetch=(input,init={})=>{
   const origin=new URL(typeof input==='string'||input instanceof URL?String(input):input.url).origin;
   if(!origins.has(origin)){deniedNetwork++;return Promise.reject(Error('Nonlocal network refused'));}
   return nativeFetch(input,{...init,redirect:'error'});
  };
  const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
  const client=(key,signal)=>createClient(status.API_URL,key,{auth,global:{fetch:(input,init)=>globalThis.fetch(input,{...init,...(signal?{signal}:{})})}});
  const admin=client(status.SERVICE_ROLE_KEY);
  stage='retained synthetic fixture creation';
  for(const label of ['A','B']){
   const email=`owner-export-${randomUUID()}@example.invalid`,password=randomBytes(30).toString('base64url');
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'Synthetic export '+label,time_zone:'UTC',birth_date:'2000-01-01',
    processing_consent:{age_screening:{granted:true,notice_version:'2026-10-20-age-v1'}}}});
   ok(created,'create local synthetic owner');const id=created.data.user?.id;assert.ok(uuid(id));fixtures.push(id);
   query(`begin;update private.mailbox_state set verified_version=version,verified_at=statement_timestamp() where user_id='${id}';
    insert into public.habits(id,user_id,name,easy_version,stat,days) values(gen_random_uuid(),'${id}','SYNTHETIC_EXPORT_${label}','One step','INT','{1}');commit;select json_build_object('created',true);`);
   const user=client(status.ANON_KEY),signed=await user.auth.signInWithPassword({email,password});ok(signed,'real local sign-in');users.push(user);
   const token=signed.data.session?.access_token;assert.equal(typeof token,'string');
   // Password/token remain in this closure only, never written to fixtures or logs.
   users[users.length-1].exportTest={id,token};
  }
  writeFileSync(artifact+`/task5-http-${tag}-fixtures.json`,JSON.stringify({ids:fixtures,synthetic:true,retained:true,credentialsStored:false})+'\n');
  const handler=createOwnerExportHandler({
   authenticate:(authorization,signal)=>authenticateExportBearer(authorization,async token=>{
    const result=await client(status.ANON_KEY,signal).auth.getUser(token);return result.error||!result.data.user?null:{id:result.data.user.id};
   },signal),
   createServiceClient:signal=>({rpc:async(name,args)=>{
    serviceCalls++;const result=await client(status.SERVICE_ROLE_KEY,signal).rpc(name,args);
    if(name==='owner_export_snapshot'&&!result.error&&hold){const current=hold;hold=null;current.entered.resolve(true);await current.release.promise;}
    return result;
   }}),
   corsHeaders:origin=>origin==='http://localhost:5173'?{'Access-Control-Allow-Origin':origin}:{},
  });
  server=createServer((req,res)=>{
   const work=(async()=>{
    const controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>1024){res.writeHead(400);res.end();return;}chunks.push(chunk);}
    const response=await handler(new Request('http://127.0.0.1/export',{method:req.method,headers:req.headers,body:Buffer.concat(chunks),signal:controller.signal}));
    if(!res.destroyed){res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}
   })().catch(()=>{if(!res.destroyed){res.writeHead(503);res.end('Unavailable');}});
   pending.add(work);void work.finally(()=>pending.delete(work));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/export`;origins.add(new URL(url).origin);
  const request=(body={action:'snapshot'},token=users[0].exportTest.token,origin='http://localhost:5173')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),Origin:origin},body:JSON.stringify(body)});
  stage='request refusals';
  const before=serviceCalls;assert.equal((await request({action:'snapshot'},null)).status,401);
  assert.equal((await request({action:'snapshot',userId:fixtures[1]})).status,400);
  assert.equal((await request({action:'snapshot'},users[0].exportTest.token,'https://untrusted.invalid')).status,403);
  assert.equal(serviceCalls,before);check('missing auth / body owner selector / untrusted origin denied before service access');
  stage='subject-only nonempty snapshot';
  const response=await request();assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);
  const document=await response.json();assert.ok(isOwnerExportDocument(document,fixtures[0]));
  assert.equal(document.sections['public.habits'].filter(row=>row.name==='SYNTHETIC_EXPORT_A').length,1);
  assert.ok(!JSON.stringify(document).includes('SYNTHETIC_EXPORT_B'));
  assert.equal((await request({action:'check',mailboxVersion:document.mailboxVersion})).status,200);
  const other=await (await request({action:'snapshot'},users[1].exportTest.token)).json();assert.ok(isOwnerExportDocument(other,fixtures[1]));
  assert.ok(!JSON.stringify(other).includes('SYNTHETIC_EXPORT_A'));check('both actual Auth sessions return only their own nonempty data');
  stage='held mailbox response';
  hold={entered:deferred(),release:deferred()};holds.push(hold);const mailboxHold=hold,heldRequest=request();
  await mailboxHold.entered.promise;
  query(`update private.mailbox_state set version=version+1,verified_version=null,verified_at=null where user_id='${fixtures[0]}';select json_build_object('changed',true);`);
  mailboxHold.release.resolve();assert.equal((await heldRequest).status,403);check('fresh final check denies held response after mailbox version loss');
  query(`update private.mailbox_state set verified_version=version,verified_at=statement_timestamp() where user_id='${fixtures[0]}';select json_build_object('restored',true);`);
  assert.equal((await request({action:'check',mailboxVersion:document.mailboxVersion})).status,403);check('old save acknowledgement refused after proof revision');
  stage='held revoked session response';
  hold={entered:deferred(),release:deferred()};holds.push(hold);const sessionHold=hold,revokedRequest=request();await sessionHold.entered.promise;
  ok(await users[0].auth.signOut({scope:'local'}),'local fixture sign-out');sessionHold.release.resolve();assert.equal((await revokedRequest).status,403);
  assert.equal((await request()).status,401);check('actual Auth sign-out denies held final check and later stale bearer snapshot');
  stage='foreign session';
  const trusted=await authenticateExportBearer('Bearer '+users[1].exportTest.token,async token=>{const result=await admin.auth.getUser(token);return result.data.user?{id:result.data.user.id}:null;},new AbortController().signal);
  assert.ok(trusted);const foreign=await admin.rpc('owner_export_snapshot',{p_user_id:fixtures[0],p_session_id:trusted.sessionId});assert.equal(foreign.error?.code,'EX001');check('foreign live session cannot select another subject in SQL');
  assert.equal(deniedNetwork,0);successful=true;
 }catch{report.stoppedAt=stage;}
 finally{
  for(const item of holds)item.release.resolve();await Promise.allSettled([...pending]);
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const user of users)try{await user.auth.signOut({scope:'local'});}catch{}
  if(original)try{restored=JSON.stringify(originalRows(fixtures))===JSON.stringify(original);}catch{}
  globalThis.fetch=nativeFetch;
  Object.assign(report,{successful,originalFortyTablesUnchanged:restored,fixturesRetained:fixtures.length,credentialsStored:false,deniedNetwork});
  writeFileSync(resultPath,JSON.stringify(report,null,2)+'\n');
 }
 assert.equal(successful,true,`local export rehearsal stopped at ${stage}; details withheld`);
 assert.equal(restored,true,'original table contents require review');
});
