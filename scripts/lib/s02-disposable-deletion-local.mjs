import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync,lstatSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {assertScope,authorizeTarget,advanceRemoval,reportResult} from './s02-disposable-deletion.mjs';
const API='http://127.0.0.1:57321',CONTAINER='supabase_db_eiyu-s02-age-demo',BUCKET='gym-exercise-media';
const ROOT='.superpowers/sdd/2026-10-22-s02-disposable-deletion-rehearsal-implementation';
const docker='C:/Users/morad/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const refuse=()=>new Error('Scoped local deletion check refused');
const requireTrue=value=>{if(value!==true)throw refuse();};
const ok=result=>{if(!result||result.error)throw refuse();return result.data;};
export function parseMode(args){
 if(args.length===0||args.length===1&&args[0]==='--dry-run')return 'dry-run';
 if(args.length===1&&args[0]==='--execute-disposable-target')return 'execute';throw refuse();
}
export function guardLocalFetch(nativeFetch,timeoutMs=15000){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw refuse();
 return async(input,init={})=>{
  let url;try{url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);}catch{throw refuse();}
  if(url.origin!==API||url.username||url.password||url.hash||!['/auth/v1/','/rest/v1/','/storage/v1/'].some(p=>url.pathname.startsWith(p)))throw refuse();
  if(!url.pathname.startsWith('/storage/v1/')&&url.pathname.includes('%'))throw refuse();
  if(url.pathname.startsWith('/rest/v1/rpc/')&&!['/rest/v1/rpc/owner_export_check','/rest/v1/rpc/owner_export_snapshot'].includes(url.pathname))throw refuse();
  const deadline=AbortSignal.timeout(timeoutMs);
  return await nativeFetch(input,{...init,redirect:'error',signal:init.signal?AbortSignal.any([init.signal,deadline]):deadline});
 };
}
export async function inspectLocal(dependencies={}){
 const local=dependencies.discover?{facts:await dependencies.discover()}:await discoverRuntime(dependencies.observe);const f=local.facts;
 dependencies.observe?.({phase:'qualification',checks:{project:f?.project==='eiyu-s02-age-demo',container:f?.container==='/'+CONTAINER,api:f?.api===API,mail:f?.mail==='http://127.0.0.1:57324',catalog:f?.catalog===true,sessionColumns:f?.sessionColumns===true,rpcs:f?.rpcs===true,closed:f?.closed===true,outstanding:f?.outstanding===0,details:f?.details===0,bucket:f?.bucket?.private===true&&f.bucket.size===20971520&&isDeepStrictEqual([...(f.bucket.mimes??[])].sort(),['image/gif','video/mp4'])}});
 if(!f||f.project!=='eiyu-s02-age-demo'||f.container!=='/'+CONTAINER||f.api!==API||f.mail!=='http://127.0.0.1:57324'
  ||f.catalog!==true||f.sessionColumns!==true||f.rpcs!==true||f.closed!==true||f.outstanding!==0||f.details!==0
  ||f.bucket?.private!==true||f.bucket.size!==20971520||!isDeepStrictEqual([...f.bucket.mimes].sort(),['image/gif','video/mp4']))throw refuse();
 if(!dependencies.discover)await checkServiceCapabilities(local);
 return local;
}
export async function checkServiceCapabilities(local){
 ok(await local.admin.auth.admin.listUsers({page:1,perPage:1}));
 ok(await local.admin.storage.from(BUCKET).list('',{limit:1}));
 requireTrue(ok(await local.admin.rpc('owner_export_check',{p_user_id:'00000000-0000-0000-0000-000000000000',p_session_id:'00000000-0000-0000-0000-000000000000',p_mailbox_version:1}))===false);
}
export async function runControlledSequence(ports){
 let state=await ports.advance('prepared');if(state!=='storage-removed')throw refuse();
 await ports.afterStorage();await ports.reauthenticate();state=await ports.advance(state);if(state!=='auth-removed')throw refuse();
 state=await ports.advance(state);if(state!=='verified')throw refuse();return state;
}
export function catalogMatches(manifest,actual,observe){
 try{
  const tables=manifest.tables.map(t=>({table:t.table,columns:[...t.export,...t.exclude].sort()})).sort((a,b)=>a.table.localeCompare(b.table));
  const sameTables=isDeepStrictEqual(tables,actual.tables.map(t=>({table:t.table,columns:[...t.columns].sort()})).sort((a,b)=>a.table.localeCompare(b.table))),sameKeys=isDeepStrictEqual(manifest.foreignKeys,actual.foreignKeys);
  observe?.({tables:sameTables,foreignKeys:sameKeys});return sameTables&&sameKeys;
 }catch{return false;}
}
function sqlQuery(sql){
 try{
  const text=execFileSync(docker,['exec','-i',CONTAINER,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],
   {input:`begin;set local search_path='';set local statement_timeout='15s';set local lock_timeout='3s';${sql};commit;`,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20000,maxBuffer:32*1024*1024});
  return JSON.parse(text.trim());
 }catch{throw refuse();}
}
async function discoverRuntime(observe){
 observe?.({phase:'local-status'});
 let status,container;try{
  status=JSON.parse(execFileSync('node_modules/@supabase/cli-windows-x64/bin/supabase.exe',['--agent','no','--workdir','.superpowers/s02-age','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000,maxBuffer:128*1024}));
  container=execFileSync(docker,['inspect','--format','{{.Name}}',CONTAINER],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
 }catch{throw refuse();}
 const config=readFileSync('.superpowers/s02-age/supabase/config.toml','utf8');
 observe?.({phase:'local-origins'});
 if(!/project_id = "eiyu-s02-age-demo"/.test(config)||status.API_URL!==API||status.MAILPIT_URL!=='http://127.0.0.1:57324')throw refuse();
 const fetcher=guardLocalFetch(globalThis.fetch);const client=(key,token)=>createClient(API,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetcher,...(token?{headers:{Authorization:'Bearer '+token}}:{})}});
 const admin=client(status.SERVICE_ROLE_KEY);
 observe?.({phase:'metadata'});
 const metadata=sqlQuery(`select json_build_object('closed',(select not is_open from private.ai_admission_control where singleton),
  'outstanding',(select coalesce(sum(outstanding_count),0) from private.ai_execution_epochs),'details',(select count(*) from private.ai_execution_details),
  'bucket',(select json_build_object('private',not public,'size',file_size_limit,'mimes',allowed_mime_types) from storage.buckets where id='${BUCKET}'),
  'sessionColumns',(select count(*)=3 from information_schema.columns where table_schema='auth' and table_name='sessions' and column_name in('id','user_id','not_after')),
  'rpcs',to_regprocedure('public.owner_export_check(uuid,uuid,integer)') is not null and to_regprocedure('public.owner_export_snapshot(uuid,uuid)') is not null)`);
 const manifest=JSON.parse(readFileSync('scripts/fixtures/owner-export-manifest.json','utf8'));
 observe?.({phase:'catalog'});
 const catalog=sqlQuery(`select jsonb_build_object('tables',(select jsonb_agg(jsonb_build_object('table',n.nspname||'.'||c.relname,'columns',
  (select jsonb_agg(a.attname::text order by a.attname::text) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private') and c.relkind in('r','p')),
  'foreignKeys',(select coalesce(jsonb_agg(jsonb_build_object('source',n.nspname||'.'||c.relname,'definition',pg_get_constraintdef(k.oid)) order by n.nspname||'.'||c.relname,pg_get_constraintdef(k.oid)),'[]'::jsonb)
  from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where k.contype='f' and n.nspname in('public','private')))`);
 const facts={project:'eiyu-s02-age-demo',container,api:status.API_URL,mail:status.MAILPIT_URL,...metadata,catalog:catalogMatches(manifest,catalog,checks=>observe?.({phase:'catalog-comparison',checks}))};
 const local={facts,query:sqlQuery,admin,client:token=>client(status.ANON_KEY,token),fetcher,manifest};local.capture=exclude=>capture(local,exclude);return local;
}
function idsSql(ids){if(!Array.isArray(ids)||!ids.every(uuid))throw refuse();return ids.length?ids.map(id=>`'${id}'::uuid`).join(','):`'00000000-0000-0000-0000-000000000000'::uuid`;}
function tableRows(local,ids,include=false){
 const list=idsSql(ids),operator=include?'in':'not in';
 return 'jsonb_build_object('+local.manifest.tables.filter(t=>!include||t.scope!=='global').map(t=>{
  if(!/^(public|private)\.[a-z_]+$/.test(t.table))throw refuse();
  const where=t.scope==='global'?'true':t.scope==='indirect'?`r.request_id in(select request_id from private.ai_logical_requests where user_id ${operator}(${list}))`:`r.user_id ${operator}(${list})`;
  return `'${t.table}',(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) from ${t.table} r where ${where})`;
 }).join(',')+')';
}
function capture(local,exclude=[]){
 const list=idsSql(exclude);
 return local.query(`select jsonb_build_object('rows',${tableRows(local,exclude)},'auth',jsonb_build_object(
  'users',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'created_at',created_at) order by id),'[]'::jsonb) from auth.users where id not in(${list})),
  'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'not_after',not_after) order by id),'[]'::jsonb) from auth.sessions where user_id not in(${list})),
  'identities',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'provider',provider) order by id),'[]'::jsonb) from auth.identities where user_id not in(${list}))),
  'storage',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket_id',bucket_id,'name',name,'owner_id',owner_id) order by id),'[]'::jsonb) from storage.objects where coalesce(owner_id,'') not in(select x::text from unnest(array[${list}]) x)
   and split_part(name,'/',1) not in(select x::text from unnest(array[${list}]) x)))`);
}
export async function createDisposablePair(local,runId,options={}){
 if(!uuid(runId))throw refuse();const original=options.original??local.capture([]),originalIds=new Set(original.auth.users.map(u=>u.id));const created=[];
 for(const role of ['target','control']){
  const email=`s02-delete-${role}-${runId}@example.invalid`,password=randomBytes(30).toString('base64url');
  const data=ok(await local.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Synthetic deletion ${role}`,time_zone:'UTC',birth_date:'2000-01-01',processing_consent:{age_screening:{granted:true,notice_version:'2026-10-20-age-v1'}}}}));
  const id=data?.user?.id;if(!uuid(id)||originalIds.has(id)||created.some(u=>u.id===id)||data.user.email!==email)throw refuse();
  const account={id,email,password,role};created.push(account);options.recordFixture?.(created.map(u=>({id:u.id,role:u.role})));
  const client=local.client();const signed=ok(await client.auth.signInWithPassword({email,password}));
  if(signed.user?.id!==id||!signed.session?.access_token||!signed.session.refresh_token)throw refuse();Object.assign(account,{client,session:signed.session});
  local.query(`update private.mailbox_state set verified_version=version,verified_at=statement_timestamp() where user_id='${id}'::uuid;
   insert into public.habits(id,user_id,name,easy_version,stat,days) values(gen_random_uuid(),'${id}'::uuid,'SYNTHETIC_DISPOSABLE_${role.toUpperCase()}','One step','INT','{1}');select json_build_object('setup',true)`);
 }
 const [target,control]=created;
 const scope=Object.freeze({runId,projectId:'eiyu-s02-age-demo',api:API,container:CONTAINER,bucket:BUCKET,targetId:target.id,controlId:control.id,targetKey:`${target.id}/s02-delete-${runId}/probe.gif`,controlKey:`${control.id}/s02-delete-${runId}/probe.gif`});
 const context={originalTargetUserCreatedInThisProcess:true,createdIds:new Set(created.map(u=>u.id)),originalIds,requesterToken:target.session.access_token,expectedMailboxVersion:1};assertScope(scope,context);
 const requestId=randomUUID();local.query(`insert into private.ai_logical_requests(request_id,user_id,action,request_class,account_date,week_start) values('${requestId}','${target.id}','weekly-summary','initial',current_date,date_trunc('week',current_date)::date);
  insert into private.ai_provider_attempts(request_id,attempt_number,usage_date) values('${requestId}',1,current_date);select json_build_object('linkedFixture',true)`);
 return {scope,context,target,control,original,requestId};
}
async function verifiedIdentity(local,token){
 try{
  const data=ok(await local.client().auth.getUser(token));if(!uuid(data?.user?.id))return null;
  const parts=token.split('.');if(parts.length!==3)return null;const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  return claims.sub===data.user.id&&uuid(claims.session_id)?{userId:data.user.id,sessionId:claims.session_id}:null;
 }catch{return null;}
}
const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
async function downloaded(client,key){const data=ok(await client.storage.from(BUCKET).download(key));return Buffer.from(await data.arrayBuffer());}
function safeKey(key){if(!/^[a-f0-9-]{36}\/s02-delete-[a-f0-9-]{36}\/probe\.gif$/.test(key))throw refuse();return key;}
export function createLocalPorts(local,pair,options={}){
 const {scope,context}=pair;
 const verifyScope=()=>assertScope(scope,context);
 const mutationCounts={objects:0,users:0};const ports={mutationCounts,
  verifyRequester:token=>verifiedIdentity(local,token),
  checkMailbox:async(identity,version)=>{
   verifyScope();if(identity.userId!==scope.targetId||!uuid(identity.sessionId)||!Number.isSafeInteger(version))return false;
   const data=ok(await local.admin.rpc('owner_export_check',{p_user_id:identity.userId,p_session_id:identity.sessionId,p_mailbox_version:version}));return data===true;
  },
  removeExactObject:async key=>{verifyScope();if(key!==scope.targetKey)throw refuse();mutationCounts.objects++;ok(await local.admin.storage.from(BUCKET).remove([safeKey(key)]));},
  objectAbsent:async()=>{
   verifyScope();const metadata=local.query(`select json_build_object('absent',not exists(select 1 from storage.objects where bucket_id='${BUCKET}' and name='${safeKey(scope.targetKey)}'))`);
   if(metadata.absent!==true)return false;
   const probe=await local.admin.storage.from(BUCKET).download(scope.targetKey);if(!probe.error||!['400','404'].includes(String(probe.error.statusCode)))return false;
   if(!isDeepStrictEqual(await downloaded(local.admin,scope.controlKey),gif))return false;
   if(pair.signedUrl){if(Date.now()>=pair.signedDeadline)throw refuse();const response=await local.fetcher(pair.signedUrl);const bad=response.ok;await response.body?.cancel();if(bad)return false;}
   return true;
  },
  targetExists:async()=>{verifyScope();return local.query(`select json_build_object('present',exists(select 1 from auth.users where id='${scope.targetId}'))`).present;},
  deleteExactUser:async(id,soft)=>{verifyScope();if(id!==scope.targetId||soft!==false)throw refuse();mutationCounts.users++;ok(await local.admin.auth.admin.deleteUser(id,false));},
  verifyRemoval:async()=>{
   verifyScope();const rows=local.query(`select jsonb_build_object('auth',(select count(*) from auth.users where id='${scope.targetId}'),
    'sessions',(select count(*) from auth.sessions where user_id='${scope.targetId}'),'identities',(select count(*) from auth.identities where user_id='${scope.targetId}'),'rows',${tableRows(local,[scope.targetId],true)})`);
   return rows.auth===0&&rows.sessions===0&&rows.identities===0&&Object.values(rows.rows).every(v=>Array.isArray(v)&&v.length===0)&&await ports.objectAbsent();
  },
  assertOriginals:async()=>isDeepStrictEqual(local.capture([scope.targetId,scope.controlId]),pair.original),
  writeStage:async stage=>{options.writeStage?.(stage);},
 };
 return ports;
}
function createArtifact(runId){
 if(!uuid(runId)||lstatSync(ROOT).isSymbolicLink())throw refuse();const dir=`${ROOT}/${runId}`;mkdirSync(dir);let serial=0;
 return {
  recordFixture:fixtures=>{if(!fixtures.every(f=>uuid(f.id)&&['target','control'].includes(f.role)))throw refuse();writeFileSync(`${dir}/fixtures-${serial++}.json`,JSON.stringify({fixtures,synthetic:true,onlyFreshTargetDisposable:true,credentialsStored:false})+'\n',{flag:'wx'});},
  writeStage:stage=>{if(!['prepared','storage-removed','auth-removed','verified','needs-review'].includes(stage))throw refuse();appendFileSync(`${dir}/stages.jsonl`,JSON.stringify({stage,credentialsStored:false})+'\n');},
  writeResult:value=>writeFileSync(`${dir}/result.json`,JSON.stringify(reportResult(value),null,2)+'\n',{flag:'wx'}),
 };
}
async function prepareMedia(local,pair,report){
 const {scope}=pair;pair.heldAccessToken=pair.target.session.access_token;pair.heldRefreshToken=pair.target.session.refresh_token;
 pair.initialIdentity=await verifiedIdentity(local,pair.heldAccessToken);requireTrue(pair.initialIdentity?.userId===scope.targetId);
 for(const [owner,key]of [[pair.target,scope.targetKey],[pair.control,scope.controlKey]]){
  ok(await owner.client.storage.from(BUCKET).upload(key,gif,{contentType:'image/gif',upsert:false}));
  requireTrue(isDeepStrictEqual(await downloaded(owner.client,key),gif));requireTrue(isDeepStrictEqual(await downloaded(local.admin,key),gif));
 }
 report.checks.push('owner-media-bytes');
 const foreign=await pair.control.client.storage.from(BUCKET).download(scope.targetKey);requireTrue(Boolean(foreign.error)&&!foreign.data);report.checks.push('foreign-media-refused');
 const signed=ok(await pair.target.client.storage.from(BUCKET).createSignedUrl(scope.targetKey,600));const url=new URL(signed.signedUrl);
 if(url.origin!==API||url.username||url.password||decodeURIComponent(url.pathname)!==`/storage/v1/object/sign/${BUCKET}/${scope.targetKey}`||!url.searchParams.get('token'))throw refuse();
 pair.signedUrl=url.href;pair.signedDeadline=Date.now()+598000;const response=await local.fetcher(pair.signedUrl);requireTrue(response.ok&&isDeepStrictEqual(Buffer.from(await response.arrayBuffer()),gif));
 pair.controlBaseline=local.query(`select ${tableRows(local,[scope.controlId],true)}`);
}
async function negativeRequesters(local,pair,ports,report){
 const {scope,context}=pair;
 const expectDenied=async candidate=>{let denied=false;try{await authorizeTarget(scope,candidate,ports);}catch{denied=true;}requireTrue(denied);requireTrue(ports.mutationCounts.objects===0&&ports.mutationCounts.users===0);};
 await expectDenied({...context,requesterToken:''});await expectDenied({...context,requesterToken:pair.control.session.access_token});report.checks.push('wrong-requester-refused');
 await expectDenied({...context,expectedMailboxVersion:context.expectedMailboxVersion+1});report.checks.push('stale-proof-refused');
 const identity=pair.initialIdentity;requireTrue(uuid(identity.sessionId));
 const prior=local.query(`select json_build_object('unbounded',not_after is null) from auth.sessions where user_id='${scope.targetId}' and id='${identity.sessionId}'`);requireTrue(prior?.unbounded===true);
 try{
  local.query(`update auth.sessions set not_after=statement_timestamp()-interval '1 minute' where user_id='${scope.targetId}' and id='${identity.sessionId}';select json_build_object('expired',true)`);
  await expectDenied(context);report.checks.push('expired-session-refused');
 }finally{local.query(`update auth.sessions set not_after=null where user_id='${scope.targetId}' and id='${identity.sessionId}';select json_build_object('restored',true)`);}
 await authorizeTarget(scope,context,ports);
}
async function freshRequester(local,pair){
 const next=ok(await pair.target.client.auth.signInWithPassword({email:pair.target.email,password:pair.target.password}));
 requireTrue(next.user?.id===pair.scope.targetId&&typeof next.session?.access_token==='string');pair.target.session=next.session;pair.context.requesterToken=next.session.access_token;
}
async function compareControl(local,pair){
 const current=ok(await local.admin.auth.admin.getUserById(pair.scope.controlId));requireTrue(current.user?.id===pair.scope.controlId);
 const identity=ok(await pair.control.client.auth.getUser(pair.control.session.access_token));requireTrue(identity.user?.id===pair.scope.controlId);
 return isDeepStrictEqual(local.query(`select ${tableRows(local,[pair.scope.controlId],true)}`),pair.controlBaseline)&&isDeepStrictEqual(await downloaded(local.admin,pair.scope.controlKey),gif);
}
async function verifyDeletedAccess(local,pair,report){
 const {scope}=pair;
 const get=await local.admin.auth.admin.getUserById(scope.targetId);requireTrue(Boolean(get.error)&&!get.data?.user);
 const user=await local.client().auth.getUser(pair.heldAccessToken);requireTrue(Boolean(user.error)&&!user.data?.user);
 const signIn=await local.client().auth.signInWithPassword({email:pair.target.email,password:pair.target.password});requireTrue(Boolean(signIn.error)&&!signIn.data?.session);report.checks.push('signin-refused');
 const refresh=await local.client().auth.refreshSession({refresh_token:pair.heldRefreshToken});requireTrue(Boolean(refresh.error)&&!refresh.data?.session);report.checks.push('refresh-refused');
 const snapshot=await local.admin.rpc('owner_export_snapshot',{p_user_id:scope.targetId,p_session_id:pair.initialIdentity.sessionId});requireTrue(snapshot.error?.code==='EX001');
 requireTrue(ok(await local.admin.rpc('owner_export_check',{p_user_id:scope.targetId,p_session_id:pair.initialIdentity.sessionId,p_mailbox_version:pair.context.expectedMailboxVersion}))===false);report.checks.push('export-refused');
 const stale=local.client(pair.heldAccessToken);const id=randomUUID();const write=await stale.from('habits').insert({id,user_id:scope.targetId,name:'SYNTHETIC_DELETED_OWNER_DENIAL',easy_version:'One step',stat:'INT',days:[1]});
 const stored=local.query(`select json_build_object('rows',(select count(*) from public.habits where id='${id}'))`);requireTrue(Boolean(write.error)&&stored.rows===0);report.checks.push('tracker-write-refused');
 const upload=await stale.storage.from(BUCKET).upload(scope.targetKey,gif,{contentType:'image/gif',upsert:false});
 const object=local.query(`select json_build_object('rows',(select count(*) from storage.objects where bucket_id='${BUCKET}' and name='${safeKey(scope.targetKey)}'))`);requireTrue(Boolean(upload.error)&&object.rows===0);report.checks.push('storage-write-refused');
}
async function executeLocal(local,report,dependencies){
 const runId=dependencies.runId?.()??randomUUID(),artifact=(dependencies.artifact??createArtifact)(runId);let pair,original,created=[];
 try{
  original=local.capture([]);artifact.writeStage('prepared');
  pair=await(dependencies.create??createDisposablePair)(local,runId,{original,recordFixture:fixtures=>{created=fixtures;artifact.recordFixture(fixtures);}});
  Object.assign(report,{targetId:pair.scope.targetId,controlId:pair.scope.controlId});
  const ports=(dependencies.ports??createLocalPorts)(local,pair,{writeStage:stage=>{report.stage=stage;artifact.writeStage(stage);}});
  await(dependencies.prepare??prepareMedia)(local,pair,report);await(dependencies.negative??negativeRequesters)(local,pair,ports,report);
  await runControlledSequence({
   advance:state=>advanceRemoval(pair.scope,pair.context,ports,state),
   afterStorage:async()=>{requireTrue(await ports.targetExists());requireTrue(await ports.objectAbsent());report.checks.push('object-removed','controlled-stop');},
   reauthenticate:async()=>{await(dependencies.reauthenticate??freshRequester)(local,pair);await authorizeTarget(pair.scope,pair.context,ports);report.checks.push('fresh-reauthorization');},
  });
  report.stage='verified';report.checks.push('auth-removed');await(dependencies.afterDelete??verifyDeletedAccess)(local,pair,report);
  report.controlUnchanged=await(dependencies.compareControl??compareControl)(local,pair);requireTrue(report.controlUnchanged);report.checks.push('control-preserved');report.finished=true;
 }catch{report.finished=false;report.stage='needs-review';}
 finally{
  try{
   const ids=pair?[pair.scope.targetId,pair.scope.controlId]:created.map(f=>f.id);
   report.originalsUnchanged=Boolean(original)&&isDeepStrictEqual(local.capture(ids),original);if(report.originalsUnchanged)report.checks.push('originals-preserved');else{report.finished=false;report.stage='needs-review';}
  }catch{report.finished=false;report.stage='needs-review';}
  if(pair){try{await pair.control.client.auth.signOut();}catch{/* Preserve the new control for review; never delete it. */}}
  artifact.writeResult(report);
 }
 return report;
}
export async function runRehearsal(mode,dependencies={}){
 const report={stage:'needs-review',checks:[],finished:false};
 try{
  if(!['dry-run','execute'].includes(mode))throw refuse();
  const local=await(dependencies.inspect??inspectLocal)();report.checks.push('preflight');report.stage='prepared';
  if(mode==='dry-run')return reportResult(report);
  return reportResult(await(dependencies.execute??executeLocal)(local,report,dependencies));
 }catch{return reportResult({...report,finished:false,stage:'needs-review'});}
}
