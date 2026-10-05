import { fetchGym, fetchGymHistory, fetchRecentGymWeights, logGymWeight, saveGymRoutine, saveGymSession } from '../gym';
import { fetchLongQuests, saveAtomicLongQuest, setStageDoneWithReceipt } from '../long-quests';
import { supabase } from '../../supabase/client';
import { UncertainSaveError } from '../save-outcome';
jest.mock('../../supabase/client', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
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
beforeEach(() => { jest.resetAllMocks(); });
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
it('reconciles a committed but unconfirmed creation without inserting again', async () => {
  const inserted=builder([], {data:null,error:{message:'network disconnected'}});
  const found=builder([{id:'stable-creation',name:'Routine',unit:'kg',deleted_at:null}]);
  (supabase.from as jest.Mock).mockReturnValueOnce(inserted).mockReturnValueOnce(found);
  expect(await saveGymRoutine('owner','Routine','kg',undefined,'stable-creation')).toBe('stable-creation');
  expect(inserted.insert).toHaveBeenCalledTimes(1);
});
it('does not retry uncertain session writes until the saved snapshots can be read', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({data:null,error:{message:'offline'}});
  (supabase.from as jest.Mock).mockImplementation(()=>builder([],{data:null,error:{message:'offline'}}));
  const weights=[{exercise_id:'e',weight:20}];
  await expect(saveGymSession('uncertain-session',weights,true)).rejects.toBeInstanceOf(UncertainSaveError);
  await expect(saveGymSession('uncertain-session',weights,true)).rejects.toBeInstanceOf(UncertainSaveError);
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
it('allows a changed draft save after a committed but unconfirmed save is reconciled', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValueOnce({data:null,error:{message:'response lost'}}).mockResolvedValueOnce({data:null,error:null});
  (supabase.from as jest.Mock).mockImplementation(table=>builder(table==='gym_sessions'?[{id:'reconciled-draft',user_id:'owner',status:'draft'}]:[{exercise_id:'e',weight:20}]));
  await expect(saveGymSession('reconciled-draft',[{exercise_id:'e',weight:20}])).resolves.toBeUndefined();
  await expect(saveGymSession('reconciled-draft',[{exercise_id:'e',weight:25}])).resolves.toBeUndefined();
  expect(supabase.rpc).toHaveBeenCalledTimes(2);
  expect(supabase.rpc).toHaveBeenLastCalledWith('save_gym_session',{p_session_id:'reconciled-draft',p_weights:[{exercise_id:'e',weight:25}],p_finish:false});
});
it('reconciles uncertain atomic definitions and rewards before another write', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({data:null,error:{message:'offline'}});
  const input={name:'Campaign',stat:'INT' as const,stages:[{name:'Start'}]};
  await expect(saveAtomicLongQuest('q','definition-request',input,true)).rejects.toBeInstanceOf(UncertainSaveError);
  await expect(saveAtomicLongQuest('q','definition-request',input,true)).rejects.toBeInstanceOf(UncertainSaveError);
  expect((supabase.rpc as jest.Mock).mock.calls.filter(c=>c[0]==='save_long_quest_definition')).toHaveLength(1);
  await expect(setStageDoneWithReceipt('s',true,'reward-request')).rejects.toBeInstanceOf(UncertainSaveError);
  const receipt={id:'reward-request',stage_id:'s',done:true,changed:true,components:[],totals:[]};
  (supabase.rpc as jest.Mock).mockResolvedValueOnce({data:receipt,error:null});
  expect(await setStageDoneWithReceipt('s',true,'reward-request')).toMatchObject({replayed:true,done:true});
  expect((supabase.rpc as jest.Mock).mock.calls.filter(c=>c[0]==='set_long_quest_stage_done_receipt')).toHaveLength(1);
});
describe('quick-logging a weight', () => {
  const ids = { log: 'log-1', exercise: 'exercise-1' };
  it('logs through the RPC with the client-chosen log id', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({data:null,error:null});
    await expect(logGymWeight(ids.log, ids.exercise, 102.5)).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith('log_gym_weight',{p_log_id:'log-1',p_exercise_id:'exercise-1',p_weight:102.5});
  });
  it('lets a confirmed database rejection through untouched, without looking for a landed log', async () => {
    const rejection={code:'P0001',message:'Weight must be from 0 to 1000000 with at most three decimals.'};
    (supabase.rpc as jest.Mock).mockResolvedValue({data:null,error:rejection});
    await expect(logGymWeight(ids.log, ids.exercise, -1)).rejects.toBe(rejection);
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('treats an unconfirmed failure as a success when the log did land', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({data:null,error:{message:'response lost'}});
    const lookup=builder([{id:'log-1'}]);
    (supabase.from as jest.Mock).mockReturnValue(lookup);
    await expect(logGymWeight(ids.log, ids.exercise, 80)).resolves.toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith('gym_sessions');
    expect(lookup.eq).toHaveBeenCalledWith('id','log-1');
  });
  it('reports an uncertain result when the log cannot be found, and a retry reuses the same log id', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({data:null,error:{message:'offline'}});
    (supabase.from as jest.Mock).mockImplementation(()=>builder([]));
    await expect(logGymWeight(ids.log, ids.exercise, 80)).rejects.toBeInstanceOf(UncertainSaveError);
    await expect(logGymWeight(ids.log, ids.exercise, 80)).rejects.toBeInstanceOf(UncertainSaveError);
    const sent=(supabase.rpc as jest.Mock).mock.calls.map(call=>call[1].p_log_id);
    expect(sent).toEqual(['log-1','log-1']);
  });
  it('reports an uncertain result when the lookup itself fails', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({data:null,error:{message:'offline'}});
    (supabase.from as jest.Mock).mockImplementation(()=>builder([],{data:null,error:{message:'offline'}}));
    await expect(logGymWeight(ids.log, ids.exercise, 80)).rejects.toBeInstanceOf(UncertainSaveError);
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
