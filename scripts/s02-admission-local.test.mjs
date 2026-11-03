// Local HTTP + real Auth/RPC + intercepted provider rehearsal. No production use.
// Credentials, tokens, protected history snapshots and provider bodies remain RAM-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createGroqOnlyHandler} from '../backend/supabase/functions/ai-proxy/ai-proxy-route.ts';

const artifact='.superpowers/sdd/2026-10-22-s02-request-drain-implementation';
const docker='C:/Users/morad/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const container='supabase_db_eiyu-s02-age-demo';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'";
function query(sql){
 try{return JSON.parse(execFileSync(docker,['exec','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],
  {input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20000,maxBuffer:12*1024*1024}).trim());}
 catch{throw Error('Guarded local SQL operation failed; details withheld');}
}
const history=()=>query(`select json_build_object('habits',coalesce((select jsonb_agg(to_jsonb(h) order by id) from public.habits h),'[]'::jsonb),
 'completions',coalesce((select jsonb_agg(to_jsonb(c) order by id) from public.habit_completions c),'[]'::jsonb),
 'summaries',coalesce((select jsonb_agg(to_jsonb(s) order by id) from public.weekly_summaries s),'[]'::jsonb));`);
const quota=exclude=>{
 const owner=exclude??'00000000-0000-0000-0000-000000000000';assert.ok(uuid(owner));
 return query(`select json_build_object(
 'requests',coalesce((select jsonb_agg(to_jsonb(r) order by request_id) from private.ai_logical_requests r where user_id<>'${owner}'),'[]'::jsonb),
 'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by request_id,attempt_number) from private.ai_provider_attempts a join private.ai_logical_requests r using(request_id) where r.user_id<>'${owner}'),'[]'::jsonb),
 'users',coalesce((select jsonb_agg(to_jsonb(u) order by user_id,usage_date,action) from private.ai_user_daily_usage u where user_id<>'${owner}'),'[]'::jsonb),
 'project',coalesce((select jsonb_agg(to_jsonb(d) order by usage_date) from private.ai_provider_daily_usage d),'[]'::jsonb),
 'pending',coalesce((select jsonb_agg(to_jsonb(p) order by reservation_id) from private.ai_pending_weekly_regenerations p where user_id<>'${owner}'),'[]'::jsonb),
 'exhaustion',coalesce((select jsonb_agg(to_jsonb(e) order by provider) from private.ai_provider_exhaustion e),'[]'::jsonb));`);
};
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ok=(result,label)=>assert.equal(Boolean(result.error),false,label);

test('guarded local admission HTTP rehearsal; remote provider never contacted',async()=>{
 let stage='preflight',fixtureId=null,user=null,server=null,baseline=null,beforeHistory=null,beforeQuota=null;
 let fixturesReady=false,successful=false,cleanupVerified=false,providerCalls=0;
 const tickets=new Map(),pending=new Set(),holds=[];
 let mode='immediate',held=null,entered=null;
 assert.ok(!existsSync(artifact+'/http-result.json'),'do not overwrite an existing acceptance result');
 const record={localOnly:true,actualHostedEdge:false,realProviderRequests:0,checks:[]};
 try{
  assert.match(readFileSync('.superpowers/s02-age/supabase/config.toml','utf8'),/project_id = "eiyu-s02-age-demo"/);
  assert.equal(execFileSync(docker,['inspect','--format','{{.Name}}',container],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),'/'+container);
  const status=JSON.parse(execFileSync('node_modules/@supabase/cli-windows-x64/bin/supabase.exe',
   ['--agent','no','--workdir','.superpowers/s02-age','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(status.API_URL,'http://127.0.0.1:57321');
  baseline=query(`select json_build_object('control',(select to_jsonb(c) from private.ai_admission_control c),
   'epochs',(select jsonb_agg(to_jsonb(e) order by epoch) from private.ai_execution_epochs e),
   'details',(select count(*) from private.ai_execution_details),
   'expiredCleanup',(select count(*) from private.ai_logical_requests where created_at<statement_timestamp()-interval '8 days')
    +(select count(*) from private.ai_pending_weekly_regenerations where expires_at<=statement_timestamp())
    +(select count(*) from private.ai_user_daily_usage where usage_date<(statement_timestamp() at time zone 'UTC')::date-35)
    +(select count(*) from private.ai_provider_daily_usage where usage_date<(statement_timestamp() at time zone 'UTC')::date-35),
   'headroom',(select max_provider_attempts-coalesce((select attempt_count from private.ai_provider_daily_usage where usage_date=(statement_timestamp() at time zone 'UTC')::date),0) from private.ai_quota_config));`);
  assert.equal(baseline.control.is_open,false);assert.equal(baseline.details,0);
  assert.equal(Number(baseline.expiredCleanup),0,'refuse existing global quota cleanup side effects on retained fixtures');
  assert.ok(baseline.epochs.every(row=>Number(row.outstanding_count)===0));assert.ok(baseline.headroom>=3,'need existing local quota headroom; never raise a cap');
  beforeHistory=history();beforeQuota=quota();
  const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
  const localFetch=signal=>(input,init={})=>{
   assert.equal(new URL(typeof input==='string'||input instanceof URL?String(input):input.url).origin,status.API_URL,'Auth/RPC must stay on retained local API');
   return fetch(input,{...init,redirect:'error',...(signal?{signal}:{})});
  };
  const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth,global:{fetch:localFetch()}});
  user=createClient(status.API_URL,status.ANON_KEY,{auth,global:{fetch:localFetch()}});
  stage='owned synthetic Auth fixture';
  const email=`admission-${randomUUID()}@example.invalid`,password=randomBytes(30).toString('base64url');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'S02 Admission Fixture',time_zone:'UTC',birth_date:'2000-01-01',
   processing_consent:{age_screening:{granted:true,notice_version:'2026-10-20-age-v1'}}}});
  ok(created,'synthetic local account creation');fixtureId=created.data.user?.id;assert.ok(uuid(fixtureId));
  writeFileSync(artifact+'/http-fixture.json',JSON.stringify({fixtureId,synthetic:true,retained:true,credentialsStored:false})+'\n');
  // Test proof is privileged and synthetic; auto-confirm alone is not mailbox proof.
  query(`begin;update public.profiles set time_zone='UTC' where user_id='${fixtureId}';
   update private.mailbox_state set verified_version=version,verified_at=statement_timestamp() where user_id='${fixtureId}';commit;select json_build_object('scoped',true);`);
  const signed=await user.auth.signInWithPassword({email,password});ok(signed,'local sign-in');
  const token=signed.data.session?.access_token;assert.equal(typeof token,'string');
  const access=await user.rpc('get_processing_access');ok(access,'processing capabilities');
  const initial=access.data;
  const consent=await user.rpc('set_processing_consent',{p_purpose:'weekly-debrief',p_granted:true,p_notice_version:'2026-10-20-weekly-debrief-v1',
   p_expected_user_id:fixtureId,p_expected_age_version:initial.ageVersion,p_expected_consent_version:initial.consentVersion,
   p_expected_authority_version:initial.authorityVersion,p_expected_mailbox_version:initial.mailboxVersion});
  ok(consent,'specific synthetic purpose grant');assert.equal(consent.data.canGenerateDebrief,true);
  const processing=consent.data;
  const week=query(`select json_build_object('week',date_trunc('week',(statement_timestamp() at time zone 'UTC'))::date);`).week;
  const body={action:'weekly-summary',weekStart:week,habits:[],statTotals:{},processingAccess:{contractVersion:1,ageVersion:processing.ageVersion,
   mailboxVersion:processing.mailboxVersion,consentVersion:processing.consentVersion,authorityVersion:processing.authorityVersion}};
  fixturesReady=true;
  const handler=createGroqOnlyHandler({
   createUserClient:(authorization,signal)=>createClient(status.API_URL,status.ANON_KEY,{auth,global:{headers:{Authorization:authorization},fetch:localFetch(signal)}}),
   createServiceClient:signal=>{
    const client=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth,global:{fetch:localFetch(signal)}});
    return{rpc:async(name,args)=>{
     const result=await client.rpc(name,args);
     if(!result.error&&name==='ai_admit_execution'&&result.data?.allowed===true){
      assert.ok(uuid(args.p_execution_id)&&uuid(args.p_request_id));
      tickets.set(args.p_execution_id,{executionId:args.p_execution_id,requestId:args.p_request_id,epoch:Number(result.data.epoch),state:'admitted'});
     }
     if(!result.error&&result.data===true&&name==='ai_settle_execution'){
      const ticket=tickets.get(args.p_execution_id);assert.ok(ticket);ticket.state=args.p_outcome;
     }
     return result;
    }};
   },
  },name=>name==='AI_PROVIDERS'?JSON.stringify([{name:'groq',kind:'openai',baseUrl:'https://api.groq.com/openai/v1',model:'openai/gpt-oss-20b',keyEnv:'GROQ_API_KEY'}]):name==='GROQ_API_KEY'?'synthetic-intercepted-placeholder':undefined,
  {fetch:async(input)=>{
   assert.equal(String(input),'https://api.groq.com/openai/v1/chat/completions','only expected fake transport');providerCalls++;
   if(mode==='hold'){const localHold=held;entered.resolve(true);await localHold.promise;}
   return new Response(JSON.stringify({choices:[{message:{content:'Synthetic local weekly reflection.'},finish_reason:'stop'}]}),{status:200});
  },sleep:async()=>{},log:()=>{},random:()=>0});
  server=createServer((req,res)=>{
   const work=(async()=>{
    const controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;assert.ok(length<=32000);chunks.push(chunk);}
    const response=await handler(new Request('http://127.0.0.1/ai',{method:'POST',headers:req.headers,body:Buffer.concat(chunks),signal:controller.signal}));
    if(!res.destroyed){res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}
   })().catch(()=>{if(!res.destroyed){res.writeHead(503);res.end('Unavailable');}});
   pending.add(work);work.finally(()=>pending.delete(work));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/ai`;
  const call=signal=>fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  const open=()=>query(`do $$begin perform private.prune_ai_execution_details();perform private.open_ai_admission();end;$$;select json_build_object('open',true);`);
  const close=()=>query(`do $$begin perform private.close_ai_admission();end;$$;select json_build_object('closed',true);`);
  const counts=()=>query(`select json_build_object('outstanding',(select sum(outstanding_count) from private.ai_execution_epochs),'uncertain',(select sum(uncertain_count) from private.ai_execution_epochs),'details',(select count(*) from private.ai_execution_details));`);
  stage='default-closed actual HTTP';assert.equal((await call()).status,503);assert.equal(providerCalls,0);record.checks.push('default-closed-no-provider');
  stage='held actual HTTP close';open();mode='hold';held=deferred();entered=deferred();holds.push(held);
  const first=call();assert.equal(await Promise.race([entered.promise,first.then(()=>false)]),true,'provider actually entered before close');
  close();assert.equal((await call()).status,503);assert.equal(providerCalls,1,'closed gate prevents another dispatch');
  held.resolve();const refused=await first;assert.equal(refused.status,503);assert.ok(!(await refused.text()).includes('Synthetic local weekly reflection'));
  assert.equal(Number(counts().outstanding),0,'returned fake provider is locally settled');record.checks.push('held-response-close-and-new-admission-refusal');
  stage='normal actual HTTP';open();mode='immediate';const success=await call();assert.equal(success.status,200);assert.equal((await success.json()).summary,'Synthetic local weekly reflection.');record.checks.push('admitted-success');
  stage='actual client abort with pending fake provider';mode='hold';held=deferred();entered=deferred();holds.push(held);
  const controller=new AbortController(),canceled=call(controller.signal);const caught=canceled.then(()=>false,()=>true);
  assert.equal(await Promise.race([entered.promise,caught.then(()=>false)]),true);controller.abort();assert.equal(await caught,true);
  for(let i=0;i<100&&pending.size;i++)await wait(30);
  assert.equal(pending.size,0,'handler ends while fake transport still pending');
  assert.equal(Number(counts().outstanding),1);assert.equal(Number(counts().uncertain),1);
  held.resolve();await wait(30);assert.equal(Number(counts().outstanding),1,'late fake completion cannot rewrite uncertainty');record.checks.push('client-abort-retains-uncertainty');
  stage='detail expiry';const uncertain=[...tickets.values()].find(ticket=>ticket.state==='unresolved');assert.ok(uncertain&&uuid(uncertain.executionId));
  query(`begin;update private.ai_execution_details set created_at=statement_timestamp()-interval '7 days' where execution_id='${uncertain.executionId}';
   do $$begin perform private.prune_ai_execution_details();end;$$;commit;select json_build_object('expired',true);`);
  assert.equal(Number(counts().outstanding),1);assert.equal(Number(counts().uncertain),1);record.checks.push('detail-expiry-preserves-aggregate');
  const quests=await user.from('habits').select('id');ok(quests,'ordinary quest read remains available');
  const saved=await user.from('weekly_summaries').select('id');ok(saved,'saved-content read remains available');
  assert.deepEqual(history(),beforeHistory,'all retained quest/completion/summary rows remain exact');
  record.checks.push('ordinary-reads-and-retained-history');successful=true;
 }catch{record.failed=true;record.stage=stage;}
 finally{
  for(const hold of holds)hold.resolve();
  if(server){server.closeAllConnections();await Promise.all([...pending]);await new Promise(resolve=>server.close(resolve));}
  if(baseline&&fixturesReady&&fixtureId){
   try{
    const observed=query(`select json_build_object('epochs',(select jsonb_agg(to_jsonb(e) order by epoch) from private.ai_execution_epochs e),'foreignDetails',
     (select count(*) from private.ai_execution_details d where not exists(select 1 from private.ai_logical_requests r where r.request_id=d.request_id and r.user_id='${fixtureId}')));`);
    assert.equal(Number(observed.foreignDetails),0);
    for(const epoch of observed.epochs){
     const old=baseline.epochs.find(row=>row.epoch===epoch.epoch);
     const own=[...tickets.values()].filter(ticket=>ticket.epoch===Number(epoch.epoch));
     const outstanding=own.filter(ticket=>!['completed','stopped-before-dispatch'].includes(ticket.state)).length;
     const uncertain=own.filter(ticket=>ticket.state==='unresolved').length;
     assert.equal(Number(epoch.outstanding_count),Number(old?.outstanding_count??0)+outstanding,'only owned synthetic work may be reconciled');
     assert.equal(Number(epoch.uncertain_count),Number(old?.uncertain_count??0)+uncertain,'unknown foreign work must not be reset');
    }
    // Rehearsal restoration only after every intercepted promise/handler ended.
    // This is not a production uncertainty-resolution procedure or a drain certificate.
    query(`begin;do $$begin perform private.close_ai_admission();end;$$;
     with own as(select a.usage_date,count(*)::integer n from private.ai_provider_attempts a join private.ai_logical_requests r using(request_id) where r.user_id='${fixtureId}' group by a.usage_date)
     update private.ai_provider_daily_usage d set attempt_count=d.attempt_count-own.n from own where d.usage_date=own.usage_date;
     delete from private.ai_provider_daily_usage d where attempt_count=0 and not exists(
      select 1 from jsonb_populate_recordset(null::private.ai_provider_daily_usage,${literal(beforeQuota.project)}::jsonb) b where b.usage_date=d.usage_date);
     delete from private.ai_execution_details d using private.ai_logical_requests r where d.request_id=r.request_id and r.user_id='${fixtureId}';
     delete from private.ai_logical_requests where user_id='${fixtureId}';
     delete from private.ai_execution_epochs where epoch not in(select epoch from jsonb_populate_recordset(null::private.ai_execution_epochs,${literal(baseline.epochs)}::jsonb));
     update private.ai_execution_epochs e set opened_at=b.opened_at,closed_at=b.closed_at,outstanding_count=b.outstanding_count,uncertain_count=b.uncertain_count
      from jsonb_populate_recordset(null::private.ai_execution_epochs,${literal(baseline.epochs)}::jsonb) b where e.epoch=b.epoch;
     update private.ai_admission_control c set is_open=b.is_open,epoch=b.epoch,updated_at=b.updated_at,last_pruned_at=b.last_pruned_at
      from jsonb_populate_record(null::private.ai_admission_control,${literal(baseline.control)}::jsonb) b where c.singleton=b.singleton;
     commit;select json_build_object('restored',true);`);
    const after=query(`select json_build_object('control',(select to_jsonb(c) from private.ai_admission_control c),'epochs',(select jsonb_agg(to_jsonb(e) order by epoch) from private.ai_execution_epochs e));`);
    assert.deepEqual(after.control,baseline.control);assert.deepEqual(after.epochs,baseline.epochs);assert.deepEqual(history(),beforeHistory);assert.deepEqual(quota(fixtureId),beforeQuota);
    cleanupVerified=true;
   }catch{record.cleanupNeedsReview=true;try{query(`do $$begin perform private.close_ai_admission();end;$$;select json_build_object('closed',true);`);}catch{}}
  }
  if(user)try{await user.auth.signOut();}catch{}
  record.successful=successful;record.cleanupVerified=cleanupVerified;record.fakeProviderCalls=providerCalls;
  record.fixtureRetained=Boolean(fixtureId);record.credentialsStored=false;
  writeFileSync(artifact+'/http-result.json',JSON.stringify(record,null,2)+'\n');
 }
 assert.equal(successful,true,`guarded local rehearsal stopped at ${stage}; raw output withheld`);
 assert.equal(cleanupVerified,true,'owned test metadata needs guarded cleanup review');
});
