import {fetchOrCreateWeeklySummary, regenerateWeeklySummary} from '../../data/weekly-summary';
import {suggestStages} from '../suggestions';
import {initCacheAdapter} from '../../cache/adapter';

const mockInvoke = jest.fn();
let mockOwner = 'owner-a';
let mockHistoryFinish: (value: unknown) => void;
let mockHistoryStarted: () => void;
const mockHeaders: Record<string, string> = {};
const mockRpc = jest.fn();
const mockSession = jest.fn();
function mockBuilder(result: unknown, headers?: Record<string,string>) {
 const builder: any = {
  select: () => builder, eq: () => builder, insert: () => builder, update: () => builder,
  maybeSingle: () => builder, single: () => builder,
  setHeader: (name: string,value: string) => {if(headers)headers[name]=value;return builder;},
  then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve),
 };
 return builder;
}
jest.mock('../../supabase/client', () => ({supabase: {
 auth: {getSession: (...args: unknown[]) => mockSession(...args)},
 rpc: (...args: unknown[]) => mockRpc(...args),
 from: () => mockBuilder({data:null,error:null}),
 functions: {invoke: (...args: unknown[]) => mockInvoke(...args)},
}}));

beforeEach(() => {
 mockOwner='owner-a'; Object.keys(mockHeaders).forEach(key=>delete mockHeaders[key]);
 mockSession.mockReset().mockImplementation(async()=>({data:{session:{user:{id:mockOwner},access_token:`inert-${mockOwner}`}},error:null}));
 mockInvoke.mockReset().mockResolvedValue({data:{summary:'private summary'},error:null});
 mockRpc.mockReset().mockImplementation((name: string)=>{
  if(name==='get_processing_access')return Promise.resolve({data:{contractVersion:1,userId:mockOwner,
   ageVersion:1,consentVersion:2,authorityVersion:0,mailboxVersion:1,ageEligible:true,ageConsent:true,
   aiConsent:true,canReadDebrief:true,canGenerateDebrief:true,authorityState:'not-required'},error:null});
  if(name==='get_account_age')return Promise.resolve({data:{userId:mockOwner,birthDate:'2000-01-01',pendingBirthDate:null,correctionPending:false,adultDeclared:true,version:1},error:null});
  if(name==='get_mailbox_status')return Promise.resolve({data:{userId:mockOwner,version:1,verified:true},error:null});
  if(name==='read_history_range') {
   const deferred=new Promise(resolve=>{mockHistoryFinish=resolve;});
   mockHistoryStarted();
   return mockBuilder(deferred,mockHeaders);
  }
  return mockBuilder({data:1,error:null});
 });
});

it.each([fetchOrCreateWeeklySummary,regenerateWeeklySummary])('discards A result after switching to verified adult B during dispatch (%p)', async operation=>{
 const started=new Promise<void>(resolve=>{mockHistoryStarted=resolve;});
 let release!:()=>void; const held=new Promise<void>(resolve=>{release=resolve;});
 mockInvoke.mockImplementation(async()=>{mockHistoryStarted(); await held; return {data:{summary:'A private summary'},error:null};});
 const pending=operation('owner-a','UTC',new Date('2026-10-18T00:00:00Z'));
 await started; mockOwner='owner-b'; release();
 await expect(pending).rejects.toThrow(/adult birthday|email/);
 expect(mockInvoke).toHaveBeenCalledTimes(1);
});

it('never reads history, and pins the provider dispatch to A even if transport consults a mutable session', async()=>{
 mockInvoke.mockImplementation(async(_name,options)=>{
  mockOwner='owner-b';
  expect(options.headers.Authorization).toBe('Bearer inert-owner-a');
  return {data:{summary:'discarded'},error:null};
 });
 const pending=fetchOrCreateWeeklySummary('owner-a','UTC',new Date('2026-10-18T00:00:00Z'));
 await expect(pending).rejects.toThrow(/adult birthday|email/);
 expect(mockRpc.mock.calls.map(call=>call[0])).not.toContain('read_history_range');
 expect(mockInvoke).toHaveBeenCalledTimes(1);
});

it('discards a stage answer made for A after switching to verified adult B, and never touches the cache', async()=>{
 const read=jest.fn(async()=>null);
 initCacheAdapter({getItem:read,setItem:async()=>{},removeItem:async()=>{}});
 mockInvoke.mockImplementation(async(_name,options)=>{
  mockOwner='owner-b'; expect(options.headers?.Authorization).toBe('Bearer inert-owner-a');
  return {data:{stages:['A private stage']},error:null};
 });
 await expect(suggestStages('A private quest','INT')).rejects.toThrow(/18\+ box|AI agreement|email/);
 expect(mockInvoke).toHaveBeenCalledTimes(1);
 expect(read).not.toHaveBeenCalled();
});

it('pins stage dispatch to A even if transport consults a mutable session', async()=>{
 initCacheAdapter({getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}});
 mockInvoke.mockImplementation(async(_name,options)=>{
  mockOwner='owner-b'; expect(options.headers?.Authorization).toBe('Bearer inert-owner-a');
  return {data:{stages:['discarded']},error:null};
 });
 await expect(suggestStages('A private quest','INT')).rejects.toThrow();
 expect(mockInvoke).toHaveBeenCalledTimes(1);
});
