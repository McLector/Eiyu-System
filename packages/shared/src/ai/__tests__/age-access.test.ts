const rpc = jest.fn();
const invoke = jest.fn();
const from = jest.fn();
let mockAuthOwner = 'owner-a';
jest.mock('../../supabase/client', () => ({ supabase: { auth:{getSession:async()=>({data:{session:{user:{id:mockAuthOwner},access_token:'inert-age-owner'}},error:null})},rpc: (...args: unknown[]) => rpc(...args), from: (...args: unknown[]) => from(...args), functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));
import { suggestStages, AI_SUGGESTIONS_STORAGE_KEY, suggestionCacheKey, STAGE_SUGGESTIONS_PAUSED_MESSAGE } from '../suggestions';
import { initCacheAdapter } from '../../cache/adapter';
import { fetchOrCreateWeeklySummary } from '../../data/weekly-summary';

const adult = { userId: 'owner-a', birthDate: '2000-01-01', pendingBirthDate: null, correctionPending: false, adultDeclared: true, version: 1 };
let cache: Map<string,string>;
beforeEach(() => {
  mockAuthOwner = 'owner-a';
  rpc.mockReset().mockResolvedValue({ data: adult, error: null });
  invoke.mockReset().mockResolvedValue({ data: { stages: ['One'] }, error: null });
  from.mockReset(); cache = new Map();
  initCacheAdapter({ getItem: async key => cache.get(key) ?? null, setItem: async (key,value) => { cache.set(key,value); }, removeItem: async key => { cache.delete(key); } });
});
it('denies before reading legacy shared cache or invoking AI', async () => {
  cache.set(AI_SUGGESTIONS_STORAGE_KEY, JSON.stringify({ [suggestionCacheKey('stage-breakdown','Read','INT')]: { at: Date.now(), value: ['Other account'] } }));
  rpc.mockResolvedValue({ data: { ...adult, adultDeclared: false }, error: null });
  await expect(suggestStages('Read','INT')).rejects.toThrow(STAGE_SUGGESTIONS_PAUSED_MESSAGE);
  expect(invoke).not.toHaveBeenCalled();
});
it('keeps stages paused across accounts without creating replacement provider traffic', async () => {
  await expect(suggestStages('Read','INT')).rejects.toThrow(STAGE_SUGGESTIONS_PAUSED_MESSAGE);
  rpc.mockResolvedValue({ data: { ...adult, userId: 'owner-b' }, error: null });
  mockAuthOwner = 'owner-b';
  invoke.mockResolvedValue({ data: { stages: ['Two'] }, error: null });
  await expect(suggestStages('Read','INT')).rejects.toThrow(STAGE_SUGGESTIONS_PAUSED_MESSAGE);
  expect(invoke).not.toHaveBeenCalled();
});
it('does not start stage generation or populate cache under changing eligibility', async () => {
  rpc.mockResolvedValueOnce({ data: adult, error: null }).mockResolvedValue({ data: { ...adult, version: 2, adultDeclared: false }, error: null });
  await expect(suggestStages('Read','INT')).rejects.toThrow(STAGE_SUGGESTIONS_PAUSED_MESSAGE);
  expect(invoke).not.toHaveBeenCalled();
  expect(cache.size).toBe(0);
});
it('does not read a saved summary until the 18+ box is ticked', async () => {
  rpc.mockImplementation((name: string) => Promise.resolve({data: name === 'get_mailbox_status'
    ? {userId: 'owner-a', version: 1, verified: true}
    : {contractVersion: 1, userId: 'owner-a', ageVersion: 0, consentVersion: 0, authorityVersion: 0,
      mailboxVersion: 1, ageEligible: false, ageConsent: false, aiConsent: false,
      canReadDebrief: false, canGenerateDebrief: false, authorityState: 'pending'}, error: null}));
  await expect(fetchOrCreateWeeklySummary('owner-a','UTC')).rejects.toThrow(/18\+ box/);
  expect(from).not.toHaveBeenCalled();
});
