// Test tooling only. Receipts never recreate the live authorization context.
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const refused=()=>new Error('Deletion rehearsal refused');
const stages=['prepared','storage-removed','auth-removed','verified','needs-review'];
const scopeKeys=['runId','projectId','api','container','bucket','targetId','controlId','targetKey','controlKey'];
const portNames=['verifyRequester','checkMailbox','removeExactObject','objectAbsent','targetExists','deleteExactUser','verifyRemoval','assertOriginals','writeStage'];
const liveProgress=new WeakMap();
export function assertScope(scope,context) {
 if(!scope||!Object.isFrozen(scope)||Object.keys(scope).length!==scopeKeys.length||!scopeKeys.every(k=>Object.hasOwn(scope,k))
  ||scope.projectId!=='eiyu-s02-age-demo'||scope.api!=='http://127.0.0.1:57321'||scope.container!=='supabase_db_eiyu-s02-age-demo'||scope.bucket!=='gym-exercise-media'
  ||![scope.runId,scope.targetId,scope.controlId].every(uuid)||scope.targetId===scope.controlId
  ||scope.targetKey!==`${scope.targetId}/s02-delete-${scope.runId}/probe.gif`||scope.controlKey!==`${scope.controlId}/s02-delete-${scope.runId}/probe.gif`
  ||!context||context.originalTargetUserCreatedInThisProcess!==true||!(context.createdIds instanceof Set)||!(context.originalIds instanceof Set)
  ||![scope.targetId,scope.controlId].every(id=>context.createdIds.has(id)&&!context.originalIds.has(id)))throw refused();
}
export async function authorizeTarget(scope,context,ports) {
 assertScope(scope,context);
 if(typeof context.requesterToken!=='string'||!context.requesterToken||!Number.isSafeInteger(context.expectedMailboxVersion)||context.expectedMailboxVersion<1)throw refused();
 const token=context.requesterToken,version=context.expectedMailboxVersion;
 const identity=await ports.verifyRequester(token);
 if(!identity||identity.userId!==scope.targetId||!uuid(identity.sessionId)
  ||await ports.checkMailbox(identity,version)!==true||context.requesterToken!==token||context.expectedMailboxVersion!==version)throw refused();
 assertScope(scope,context);return identity;
}
export async function advanceRemoval(scope,context,ports,state) {
 assertScope(scope,context);
 if(!stages.includes(state)||state==='needs-review'||!portNames.every(name=>typeof ports?.[name]==='function'))throw refused();
 const current=liveProgress.get(context)??'prepared';
 if(current==='needs-review')throw refused();
 if(state!==current){if(stages.indexOf(state)<stages.indexOf(current))return current;throw refused();}
 if(state==='verified')return state;
 try{
  if(state==='prepared'){
   await authorizeTarget(scope,context,ports);
   if(await ports.targetExists()!==true)throw refused();
   try{await ports.removeExactObject(scope.targetKey);}catch{if(await ports.objectAbsent()!==true)throw refused();}
   if(await ports.objectAbsent()!==true)throw refused();
   await ports.writeStage('storage-removed');liveProgress.set(context,'storage-removed');return 'storage-removed';
  }
  if(state==='storage-removed'){
   await authorizeTarget(scope,context,ports);
   if(await ports.objectAbsent()!==true||await ports.targetExists()!==true)throw refused();
   try{await ports.deleteExactUser(scope.targetId,false);}catch{if(await ports.targetExists()!==false)throw refused();}
   if(await ports.targetExists()!==false)throw refused();
   await ports.writeStage('auth-removed');liveProgress.set(context,'auth-removed');return 'auth-removed';
  }
  if(await ports.verifyRemoval()!==true||await ports.assertOriginals()!==true)throw refused();
  await ports.writeStage('verified');liveProgress.set(context,'verified');return 'verified';
 }catch{liveProgress.set(context,'needs-review');throw refused();}
}
export function reportResult(value) {
 const checks=['preflight','wrong-requester-refused','stale-proof-refused','expired-session-refused','owner-media-bytes','foreign-media-refused','object-removed','controlled-stop','fresh-reauthorization','auth-removed','refresh-refused','signin-refused','export-refused','tracker-write-refused','storage-write-refused','originals-preserved','control-preserved'];
 return {localOnly:true,actualDenoEdge:false,proofAndConsent:'privileged synthetic setup',finished:value?.finished===true,
  stage:stages.includes(value?.stage)?value.stage:'needs-review',originalsUnchanged:value?.originalsUnchanged===true,controlUnchanged:value?.controlUnchanged===true,
  ...(uuid(value?.targetId)?{targetId:value.targetId}:{}),...(uuid(value?.controlId)?{controlId:value.controlId}:{}),
  checks:checks.filter(c=>Array.isArray(value?.checks)&&value.checks.includes(c)),providerCalls:0,
  retention:'Active local services only; backups/logs and offline or delivered copies remain unproved',credentialsStored:false};
}
