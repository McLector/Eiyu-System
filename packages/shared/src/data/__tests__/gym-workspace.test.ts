import { fetchGym, fetchGymHistory, saveGymRoutine, saveGymSession } from '../gym';
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
it('reads more than 1000 exercises and draft snapshots in bounded batches', async () => {
  const exercises=Array.from({length:1207},(_,i)=>({id:'exercise-'+i}));
  const entries=Array.from({length:1207},(_,i)=>({id:'entry-'+i}));
  (supabase.from as jest.Mock).mockImplementation(table=>builder(table==='gym_exercises'?exercises:table==='gym_entries'?entries:table==='gym_sessions'?[{id:'draft'}]:[]));
  const data=await fetchGym('owner');
  expect(data.exercises).toHaveLength(1207); expect(data.entries).toHaveLength(1207);
  expect(data.sessions).toEqual([{id:'draft'}]);
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
