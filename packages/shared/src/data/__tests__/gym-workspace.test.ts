import { archiveGymRoutine, deleteGymRoutine, discardGymSession, fetchGym, fetchGymHistory, fetchRecentGymWeights, logGymWeight, moveGymExercises, removeGymExercise, saveGymExercise, saveGymRoutine, saveGymSession, startGymSession } from '../gym';
import { fetchLongQuests, saveAtomicLongQuest, setStageDoneWithReceipt } from '../long-quests';
import { supabase } from '../../supabase/client';
import { UncertainSaveError } from '../save-outcome';
import { trackerRpcDouble } from '../../test-support/tracker-rpc';
jest.mock('../../supabase/client', () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), auth: { getSession: jest.fn() } } }));
const OWNER='da230000-0000-4000-8000-000000000001';
const REVISION={userId:OWNER,ageVersion:1,consentVersion:2,authorityVersion:3};
const NO: never[]=[];
const STABLE='da230000-0000-4000-8000-0000000000a1', EXERCISE='da230000-0000-4000-8000-0000000000a2', SESSION='da230000-0000-4000-8000-0000000000a3';
const CHAIN='da230000-0000-4000-8000-0000000000d1', STAGE='da230000-0000-4000-8000-0000000000f1';
const CHAIN_TARGET={kind:'chain' as const,id:CHAIN,inputKind:'custom' as const};
/** Every gateway call answers with this result; other RPC names fall through to their own mocks. */
function gateway(result: {data: unknown; error: unknown}) { (supabase.rpc as jest.Mock).mockImplementation(()=>trackerRpcDouble(result)); }
const gatewayCalls=()=>(supabase.rpc as jest.Mock).mock.calls.filter(c=>c[0]==='apply_tracker_write').map(c=>c[1]);
function builder(rows: unknown[], result?: { data: unknown; error: unknown }) {
  let start=0, end=499;
  const query: any = {
    select: jest.fn(() => query), eq: jest.fn(() => query), in: jest.fn(() => query),
    order: jest.fn(() => query), insert: jest.fn(() => query), update: jest.fn(() => query),
    range: jest.fn((from: number,to: number) => { start=from; end=to; return query; }),
    single: jest.fn(async () => result ?? { data: rows[0], error: null }),
    maybeSingle: jest.fn(async () => result ?? { data: rows[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => void) => Promise.resolve(result ?? { data: rows.slice(start,end+1),error:null }).then(resolve),
  };
  return query;
}
beforeEach(() => { jest.resetAllMocks(); (supabase.auth.getSession as jest.Mock).mockResolvedValue({data:{session:{user:{id:OWNER},access_token:'t'}},error:null}); });
it('reads more than 1000 exercises in bounded batches and no longer reads workout drafts', async () => {
  const exercises=Array.from({length:1207},(_,i)=>({id:'exercise-'+i}));
  const tables: string[]=[];
  (supabase.from as jest.Mock).mockImplementation(table=>{tables.push(table);return builder(table==='gym_exercises'?exercises:[{id:'routine'}]);});
  const data=await fetchGym('owner');
  expect(data.exercises).toHaveLength(1207);
  expect(data.routines).toEqual([{id:'routine'}]);
  expect(Object.keys(data).sort()).toEqual(['exercises','routines']);
  expect([...new Set(tables)].sort()).toEqual(['gym_exercises','gym_routines']);
});
it('pages completed history independently of all-workspace reads', async () => {
  const sessions=Array.from({length:11},(_,i)=>({id:'session-'+i}));
  const queries: any[]=[];
  (supabase.from as jest.Mock).mockImplementation(table=>{const q=builder(table==='gym_sessions'?sessions:[]);queries.push(q);return q;});
  const page=await fetchGymHistory('owner');
  expect(page.sessions).toHaveLength(10); expect(page.hasNext).toBe(true);
  expect(queries[0].eq).toHaveBeenCalledWith('status','completed');
  expect(queries[1].in).toHaveBeenCalledWith('session_id',sessions.slice(0,10).map(s=>s.id));
});
it('loads quest definitions and stages beyond the API limit', async () => {
  const quests=Array.from({length:1007},(_,i)=>({id:'quest-'+i,name:'Quest',stat:'INT'}));
  const stages=Array.from({length:1207},(_,i)=>({id:'stage-'+i,long_quest_id:quests[i%quests.length].id,name:'Stage',done:false,description:null}));
  (supabase.from as jest.Mock).mockImplementation(table=>builder(table==='long_quests'?quests:stages));
  const data=await fetchLongQuests('owner');
  expect(data).toHaveLength(1007); expect(data.flatMap(q=>q.stages)).toHaveLength(1207);
});
it('reconciles a committed but unconfirmed creation without sending it again', async () => {
  gateway({data:null,error:{message:'network disconnected'}});
  const found=builder([{id:STABLE,name:'Routine',unit:'kg',deleted_at:null}]);
  (supabase.from as jest.Mock).mockReturnValueOnce(found);
  expect(await saveGymRoutine('owner','Routine','kg',REVISION,NO,undefined,STABLE)).toBe(STABLE);
  expect(gatewayCalls()).toHaveLength(1);
  expect(gatewayCalls()[0]).toEqual({p_operation:'gym-routine-save',p_arguments:{p_id:STABLE,p_create:true,p_name:'Routine',p_unit:'kg',p_expected_targets:[]},p_expected:REVISION});
});
it('does not retry uncertain session writes until the saved snapshots can be read', async () => {
  gateway({data:null,error:{message:'offline'}});
  (supabase.from as jest.Mock).mockImplementation(()=>builder([],{data:null,error:{message:'offline'}}));
  const weights=[{exercise_id:'e',weight:20}];
  await expect(saveGymSession('uncertain-session',weights,REVISION,NO,true)).rejects.toBeInstanceOf(UncertainSaveError);
  await expect(saveGymSession('uncertain-session',weights,REVISION,NO,true)).rejects.toBeInstanceOf(UncertainSaveError);
  expect(gatewayCalls()).toHaveLength(1);
});
it('allows a changed draft save after a committed but unconfirmed save is reconciled', async () => {
  (supabase.rpc as jest.Mock).mockImplementationOnce(()=>trackerRpcDouble({data:null,error:{message:'response lost'}})).mockImplementationOnce(()=>trackerRpcDouble({data:null,error:null}));
  (supabase.from as jest.Mock).mockImplementation(table=>builder(table==='gym_sessions'?[{id:'reconciled-draft',user_id:'owner',status:'draft'}]:[{exercise_id:'e',weight:20}]));
  await expect(saveGymSession('reconciled-draft',[{exercise_id:'e',weight:20}],REVISION,NO)).resolves.toBeUndefined();
  await expect(saveGymSession('reconciled-draft',[{exercise_id:'e',weight:25}],REVISION,NO)).resolves.toBeUndefined();
  expect(supabase.rpc).toHaveBeenCalledTimes(2);
  expect(supabase.rpc).toHaveBeenLastCalledWith('apply_tracker_write',{p_operation:'save_gym_session',p_arguments:{p_session_id:'reconciled-draft',p_weights:[{exercise_id:'e',weight:25}],p_finish:false,p_expected_targets:[]},p_expected:REVISION});
});
it('reconciles uncertain atomic definitions and rewards before another write', async () => {
  (supabase.rpc as jest.Mock).mockImplementation(()=>trackerRpcDouble({data:null,error:{message:'offline'}}));
  const input={mode:'custom' as const,values:{name:'Campaign',stat:'INT' as const,stages:[{name:'Start'}]}};
  await expect(saveAtomicLongQuest(CHAIN,'definition-request',input,true,REVISION,NO)).rejects.toBeInstanceOf(UncertainSaveError);
  await expect(saveAtomicLongQuest(CHAIN,'definition-request',input,true,REVISION,NO)).rejects.toBeInstanceOf(UncertainSaveError);
  expect(gatewayCalls().filter(c=>c.p_operation==='chain-save')).toHaveLength(1);
  await expect(setStageDoneWithReceipt(STAGE,true,'reward-request',REVISION,[CHAIN_TARGET])).rejects.toBeInstanceOf(UncertainSaveError);
  const receipt={id:'reward-request',stage_id:STAGE,done:true,changed:true,components:[],totals:[]};
  (supabase.rpc as jest.Mock).mockReset().mockResolvedValueOnce({data:receipt,error:null});
  expect(await setStageDoneWithReceipt(STAGE,true,'reward-request',REVISION,[CHAIN_TARGET])).toMatchObject({replayed:true,done:true});
  expect(gatewayCalls().filter(c=>c.p_operation==='set_long_quest_stage_done_receipt')).toHaveLength(0);
});
describe('gym writes through the gateway', () => {
  it('sends a routine edit with p_create false and no snapshots, and updates nothing directly', async () => {
    gateway({data:STABLE,error:null});
    expect(await saveGymRoutine('owner','  Push day ','lb',REVISION,NO,STABLE)).toBe(STABLE);
    expect(gatewayCalls()[0]).toEqual({p_operation:'gym-routine-save',p_arguments:{p_id:STABLE,p_create:false,p_name:'Push day',p_unit:'lb',p_expected_targets:[]},p_expected:REVISION});
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('keeps one creation id across uncertain retries', async () => {
    gateway({data:null,error:{message:'offline'}});
    (supabase.from as jest.Mock).mockImplementation(()=>builder([],{data:null,error:{message:'offline'}}));
    await expect(saveGymRoutine('owner','Routine','kg',REVISION,NO,undefined,STABLE)).rejects.toBeInstanceOf(UncertainSaveError);
    await expect(saveGymRoutine('owner','Routine','kg',REVISION,NO,undefined,STABLE)).rejects.toBeInstanceOf(UncertainSaveError);
    expect(gatewayCalls().filter(c=>c.p_operation==='gym-routine-save')).toHaveLength(1);
  });
  it('rejects an invalid routine name before any request', async () => {
    gateway({data:STABLE,error:null});
    await expect(saveGymRoutine('owner','😀'.repeat(81),'kg',REVISION,NO,undefined,STABLE)).rejects.toThrow(/80 characters/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('throws a confirmed tracker refusal untouched and does not look for a landed write', async () => {
    const refusal={code:'ET002',message:'Tracker processing permission required.'};
    gateway({data:null,error:refusal});
    await expect(saveGymRoutine('owner','Routine','kg',REVISION,NO,undefined,'da230000-0000-4000-8000-0000000000b9')).rejects.toBe(refusal);
    await expect(archiveGymRoutine(STABLE,true,REVISION,NO)).rejects.toBe(refusal);
    await expect(removeGymExercise(STABLE,REVISION,NO)).rejects.toBe(refusal);
    await expect(deleteGymRoutine(STABLE,REVISION,NO)).rejects.toBe(refusal);
    await expect(moveGymExercises({id:STABLE} as never,['a'],REVISION,NO)).rejects.toBe(refusal);
    await expect(startGymSession(STABLE,REVISION,NO)).rejects.toBe(refusal);
    await expect(discardGymSession(STABLE,REVISION,NO)).rejects.toBe(refusal);
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('maps each simple operation to its gateway arguments', async () => {
    gateway({data:null,error:null});
    await archiveGymRoutine(STABLE,true,REVISION,NO);
    await removeGymExercise(EXERCISE,REVISION,NO);
    await deleteGymRoutine(STABLE,REVISION,NO);
    await deleteGymRoutine(STABLE,REVISION,NO,true);
    await moveGymExercises({id:STABLE} as never,[EXERCISE,'second'],REVISION,NO);
    await discardGymSession(SESSION,REVISION,NO);
    expect(gatewayCalls().map(c=>[c.p_operation,c.p_arguments])).toEqual([
      ['gym-routine-archive',{p_id:STABLE,p_archived:true,p_expected_targets:[]}],
      ['remove_gym_exercise',{p_id:EXERCISE,p_expected_targets:[]}],
      ['delete_gym_routine',{p_routine_id:STABLE,p_discard_draft:false,p_expected_targets:[]}],
      ['delete_gym_routine',{p_routine_id:STABLE,p_discard_draft:true,p_expected_targets:[]}],
      ['reorder_gym_exercises',{p_routine_id:STABLE,p_ids:[EXERCISE,'second'],p_expected_targets:[]}],
      ['discard_gym_session',{p_session_id:SESSION,p_expected_targets:[]}],
    ]);
  });
  it('starts a session and returns only a string id', async () => {
    gateway({data:SESSION,error:null});
    expect(await startGymSession(STABLE,REVISION,NO)).toBe(SESSION);
    expect(gatewayCalls()[0]).toEqual({p_operation:'start_gym_session',p_arguments:{p_routine_id:STABLE,p_expected_targets:[]},p_expected:REVISION});
    for (const odd of [null,7,{id:SESSION}]) { gateway({data:odd,error:null}); await expect(startGymSession(STABLE,REVISION,NO)).rejects.toThrow(); }
  });
  it('reuses a draft that landed when the start response was lost', async () => {
    gateway({data:null,error:{message:'offline'}});
    (supabase.from as jest.Mock).mockReturnValue(builder([{id:SESSION}]));
    expect(await startGymSession(STABLE,REVISION,NO)).toBe(SESSION);
  });
  it('saves an exercise with only the gateway keys and returns its id', async () => {
    gateway({data:EXERCISE,error:null});
    const input={id:EXERCISE,user_id:'owner',routine_id:STABLE,name:'Bench',position:0,sets:3,reps:'8',rest_seconds:90,rir:2,rir_max:null,notes:'',media_path:null,media_mime:null,created_at:'2026-10-01',extra:'x'} as never;
    expect(await saveGymExercise(input,REVISION,NO)).toBe(EXERCISE);
    const sent=gatewayCalls()[0].p_arguments;
    expect(sent.p_id).toBe(EXERCISE);
    expect(Object.keys(sent.p_input).sort()).toEqual(['id','media_mime','media_path','name','notes','position','reps','rest_seconds','rir','rir_max','routine_id','sets','user_id']);
    expect(sent.p_expected_targets).toEqual([]);
  });
  it('rejects an invalid exercise before any request', async () => {
    gateway({data:EXERCISE,error:null});
    await expect(saveGymExercise({routine_id:STABLE,name:'Bench',position:0,sets:0,reps:'8',rest_seconds:90,rir:2,notes:''} as never,REVISION,NO)).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('refuses to send when the revision is invalid or belongs to another session', async () => {
    gateway({data:null,error:null});
    await expect(archiveGymRoutine(STABLE,true,undefined as never,NO)).rejects.not.toBeInstanceOf(UncertainSaveError);
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({data:{session:{user:{id:'other'},access_token:'t'}},error:null});
    await expect(logGymWeight('log-x',EXERCISE,10,REVISION,NO)).rejects.not.toBeInstanceOf(UncertainSaveError);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
describe('quick-logging a weight', () => {
  const ids = { log: 'log-1', exercise: 'exercise-1' };
  it('logs through the gateway with the client-chosen log id', async () => {
    gateway({data:null,error:null});
    await expect(logGymWeight(ids.log, ids.exercise, 102.5, REVISION, NO)).resolves.toBeUndefined();
    expect(gatewayCalls()[0]).toEqual({p_operation:'log_gym_weight',p_arguments:{p_log_id:'log-1',p_exercise_id:'exercise-1',p_weight:102.5,p_expected_targets:[]},p_expected:REVISION});
  });
  it('lets a confirmed database rejection through untouched, without looking for a landed log', async () => {
    const rejection={code:'P0001',message:'Weight must be from 0 to 1000000 with at most three decimals.'};
    gateway({data:null,error:rejection});
    await expect(logGymWeight(ids.log, ids.exercise, -1, REVISION, NO)).rejects.toBe(rejection);
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('treats an unconfirmed failure as a success when the log did land', async () => {
    gateway({data:null,error:{message:'response lost'}});
    const lookup=builder([{id:'log-1'}]);
    (supabase.from as jest.Mock).mockReturnValue(lookup);
    await expect(logGymWeight(ids.log, ids.exercise, 80, REVISION, NO)).resolves.toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith('gym_sessions');
    expect(lookup.eq).toHaveBeenCalledWith('id','log-1');
  });
  it('reports an uncertain result when the log cannot be found, and a retry reuses the same log id', async () => {
    gateway({data:null,error:{message:'offline'}});
    (supabase.from as jest.Mock).mockImplementation(()=>builder([]));
    await expect(logGymWeight(ids.log, ids.exercise, 80, REVISION, NO)).rejects.toBeInstanceOf(UncertainSaveError);
    await expect(logGymWeight(ids.log, ids.exercise, 80, REVISION, NO)).rejects.toBeInstanceOf(UncertainSaveError);
    expect(gatewayCalls().map(c=>c.p_arguments.p_log_id)).toEqual(['log-1','log-1']);
  });
  it('reports an uncertain result when the lookup itself fails', async () => {
    gateway({data:null,error:{message:'offline'}});
    (supabase.from as jest.Mock).mockImplementation(()=>builder([],{data:null,error:{message:'offline'}}));
    await expect(logGymWeight(ids.log, ids.exercise, 80, REVISION, NO)).rejects.toBeInstanceOf(UncertainSaveError);
  });
});
describe('recent gym weights', () => {
  it('reads the newest two weights of a routine through the RPC in bounded batches', async () => {
    const rows=Array.from({length:1207},(_,i)=>({exercise_id:'e'+i,weight:i,unit:'kg',logged_at:'2026-10-01T00:00:00Z',recency:1}));
    const calls: unknown[][]=[];
    (supabase.rpc as jest.Mock).mockImplementation((name,args)=>{calls.push([name,args]);return builder(rows);});
    const result=await fetchRecentGymWeights('routine-1');
    expect(result).toHaveLength(1207);
    expect(calls.every(call=>call[0]==='recent_gym_weights'&&JSON.stringify(call[1])===JSON.stringify({p_routine_id:'routine-1'}))).toBe(true);
  });
  it('throws when the RPC fails instead of showing an empty Current', async () => {
    (supabase.rpc as jest.Mock).mockImplementation(()=>builder([],{data:null,error:{message:'boom'}}));
    await expect(fetchRecentGymWeights('routine-1')).rejects.toBeTruthy();
  });
});
