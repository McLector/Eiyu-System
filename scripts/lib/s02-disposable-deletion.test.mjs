import test from 'node:test';
import assert from 'node:assert/strict';
import {assertScope,authorizeTarget,advanceRemoval,reportResult} from './s02-disposable-deletion.mjs';

const id=n=>`d5200000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(){
 const scope=Object.freeze({runId:id(1),projectId:'eiyu-s02-age-demo',api:'http://127.0.0.1:57321',container:'supabase_db_eiyu-s02-age-demo',bucket:'gym-exercise-media',targetId:id(2),controlId:id(3),targetKey:`${id(2)}/s02-delete-${id(1)}/probe.gif`,controlKey:`${id(3)}/s02-delete-${id(1)}/probe.gif`});
 const context={originalTargetUserCreatedInThisProcess:true,createdIds:new Set([id(2),id(3)]),originalIds:new Set([id(9)]),requesterToken:'inert-unit-label',expectedMailboxVersion:1};
 const calls=[];let object=true,user=true;
 const ports={verifyRequester:async()=>({userId:id(2),sessionId:id(4)}),checkMailbox:async()=>true,
  removeExactObject:async(key)=>{assert.equal(key,scope.targetKey);calls.push('remove');object=false;},objectAbsent:async()=>!object,
  targetExists:async()=>user,deleteExactUser:async(target,soft)=>{assert.equal(target,id(2));assert.equal(soft,false);calls.push('delete');user=false;},
  verifyRemoval:async()=>!user&&!object,assertOriginals:async()=>true,writeStage:async stage=>{calls.push(stage);}};
 return {scope,context,ports,calls};
}
test('valid frozen fresh scope accepted; receipt-only and original IDs refused',()=>{
 const f=fixture();assert.doesNotThrow(()=>assertScope(f.scope,f.context));
 for(const context of [null,{}, {...f.context,originalTargetUserCreatedInThisProcess:false},{...f.context,createdIds:new Set()}, {...f.context,originalIds:new Set([id(2)])}])assert.throws(()=>assertScope(f.scope,context),/Deletion rehearsal refused/);
});
test('all altered scope selectors refuse before ports',async()=>{
 for(const change of [{api:'https://hosted.invalid'},{api:'http://127.0.0.1:57321/?x=1'},{projectId:'other'},{container:'other'},{bucket:'other'},{targetId:id(3)},{runId:'../x'},{targetKey:'../probe.gif'},{targetKey:`${id(2)}/`},{controlKey:`${id(2)}/probe.gif`},{extra:'selector'}]){
  const f=fixture();await assert.rejects(advanceRemoval(Object.freeze({...f.scope,...change}),f.context,f.ports,'prepared'));assert.equal(f.calls.length,0);
 }
 const f=fixture();assert.throws(()=>assertScope({...f.scope},f.context));
});
test('missing/foreign/malformed requester and stale proof cannot mutate',async()=>{
 for(const requester of [null,{userId:id(3),sessionId:id(4)},{userId:id(2),sessionId:'invalid'}]){const f=fixture();f.ports.verifyRequester=async()=>requester;await assert.rejects(advanceRemoval(f.scope,f.context,f.ports,'prepared'));assert.equal(f.calls.length,0);}
 for(const override of [{requesterToken:''},{expectedMailboxVersion:0}]){const f=fixture();Object.assign(f.context,override);await assert.rejects(authorizeTarget(f.scope,f.context,f.ports));}
 const f=fixture();f.ports.checkMailbox=async()=>false;await assert.rejects(advanceRemoval(f.scope,f.context,f.ports,'prepared'));assert.equal(f.calls.length,0);
});
test('explicit stages remove object before auth; verified repeat performs no mutation',async()=>{
 const f=fixture();let state=await advanceRemoval(f.scope,f.context,f.ports,'prepared');assert.equal(state,'storage-removed');assert.equal(f.calls.includes('delete'),false);
 state=await advanceRemoval(f.scope,f.context,f.ports,state);assert.equal(state,'auth-removed');state=await advanceRemoval(f.scope,f.context,f.ports,state);assert.equal(state,'verified');
 const before=f.calls.length;assert.equal(await advanceRemoval(f.scope,f.context,f.ports,state),'verified');assert.equal(f.calls.length,before);assert.deepEqual(f.calls,['remove','storage-removed','delete','auth-removed','verified']);
});
test('reauthorization lost after object removal prevents auth removal',async()=>{
 const f=fixture();await advanceRemoval(f.scope,f.context,f.ports,'prepared');f.ports.checkMailbox=async()=>false;
 await assert.rejects(advanceRemoval(f.scope,f.context,f.ports,'storage-removed'));assert.equal(f.calls.includes('delete'),false);
});
test('requester context changed during awaited authorization refuses mutation',async()=>{
 const f=fixture();f.ports.verifyRequester=async()=>{f.context.requesterToken='changed-inert-label';return{userId:id(2),sessionId:id(4)};};
 await assert.rejects(advanceRemoval(f.scope,f.context,f.ports,'prepared'));assert.equal(f.calls.includes('remove'),false);
});
test('unknown states, missing ports, ambiguous services and failed original check stop',async()=>{
 const f=fixture();await assert.rejects(advanceRemoval(f.scope,f.context,f.ports,'receipt-from-disk'));assert.equal(f.calls.length,0);
 for(const name of ['verifyRequester','removeExactObject','objectAbsent','writeStage']){const f=fixture();delete f.ports[name];await assert.rejects(advanceRemoval(f.scope,f.context,f.ports,'prepared'));assert.equal(f.calls.length,0);}
 const a=fixture();a.ports.objectAbsent=async()=>false;await assert.rejects(advanceRemoval(a.scope,a.context,a.ports,'prepared'));assert.equal(a.calls.includes('delete'),false);
 const b=fixture();b.ports.assertOriginals=async()=>false;await assert.rejects(advanceRemoval(b.scope,b.context,b.ports,'auth-removed'));
});
test('report projects only fixed categories and bounded primitive metadata',()=>{
 const serialized=JSON.stringify(reportResult({finished:true,stage:'verified',originalsUnchanged:true,controlUnchanged:true,error:new Error('Bearer canary'),credentials:'canary',checks:['object-removed','Bearer canary'],targetId:id(2),controlId:id(3)}));
 assert.equal(serialized.includes('canary'),false);const value=JSON.parse(serialized);assert.equal(value.localOnly,true);assert.equal(value.actualDenoEdge,false);assert.equal(value.finished,true);assert.ok(serialized.length<16384);
});
test('controlled stop resumes only with same live context; stale receipt cannot skip steps',async()=>{
 const f=fixture();const state=await advanceRemoval(f.scope,f.context,f.ports,'prepared');assert.equal(state,'storage-removed');assert.equal(await f.ports.targetExists(),true);
 await assert.rejects(advanceRemoval(f.scope,null,f.ports,state));
 const fresh=fixture();await assert.rejects(advanceRemoval(fresh.scope,fresh.context,fresh.ports,'auth-removed'));assert.equal(fresh.calls.length,0);
 const before=f.calls.length;assert.equal(await advanceRemoval(f.scope,f.context,f.ports,'prepared'),'storage-removed');assert.equal(f.calls.length,before);
 f.context.requesterToken='fresh-inert-label';assert.equal(await advanceRemoval(f.scope,f.context,f.ports,state),'auth-removed');
});
test('committed timeout reconciles read-only without repeating destructive calls',async()=>{
 const f=fixture();const remove=f.ports.removeExactObject;f.ports.removeExactObject=async key=>{await remove(key);throw Error('synthetic timeout');};
 assert.equal(await advanceRemoval(f.scope,f.context,f.ports,'prepared'),'storage-removed');assert.equal(f.calls.filter(c=>c==='remove').length,1);
 const del=f.ports.deleteExactUser;f.ports.deleteExactUser=async(...args)=>{await del(...args);throw Error('synthetic timeout');};
 assert.equal(await advanceRemoval(f.scope,f.context,f.ports,'storage-removed'),'auth-removed');assert.equal(f.calls.filter(c=>c==='delete').length,1);
});
test('uncommitted or unobservable timeout never retries or claims progress',async()=>{
 const f=fixture();f.ports.removeExactObject=async()=>{f.calls.push('remove');throw Error('synthetic timeout');};
 await assert.rejects(advanceRemoval(f.scope,f.context,f.ports,'prepared'));await assert.rejects(advanceRemoval(f.scope,f.context,f.ports,'prepared'));
 assert.equal(f.calls.filter(c=>c==='remove').length,1);assert.equal(f.calls.includes('delete'),false);
});
