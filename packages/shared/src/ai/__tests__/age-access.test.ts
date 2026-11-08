const rpc = jest.fn();
const invoke = jest.fn();
const from = jest.fn();
let mockAuthOwner = 'owner-a';
jest.mock('../../supabase/client', () => ({ supabase: { auth:{getSession:async()=>({data:{session:{user:{id:mockAuthOwner},access_token:'inert-age-owner'}},error:null})},rpc: (...args: unknown[]) => rpc(...args), from: (...args: unknown[]) => from(...args), functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));
import { suggestStages, AI_SUGGESTIONS_STORAGE_KEY, suggestionCacheKey } from '../suggestions';
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
function allow(overrides: Record<string, unknown> = {}, owner = 'owner-a') {
  rpc.mockImplementation((name: string) => Promise.resolve({data: name === 'get_mailbox_status'
    ? {userId: owner, version: 1, verified: true}
    : {contractVersion: 1, userId: owner, ageVersion: 1, consentVersion: 2, authorityVersion: 0, mailboxVersion: 1,
      ageEligible: true, ageConsent: true, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true, authorityState: 'not-required', ...overrides}, error: null}));
}
it('denies before reading legacy shared cache or invoking AI while the 18+ box is not ticked', async () => {
  cache.set(AI_SUGGESTIONS_STORAGE_KEY, JSON.stringify({ [suggestionCacheKey('stage-breakdown','Read','INT')]: { at: Date.now(), value: ['Other account'] } }));
  allow({ ageEligible: false, ageConsent: false, canReadDebrief: false, canGenerateDebrief: false });
  await expect(suggestStages('Read','INT')).rejects.toThrow(/18\+ box/);
  expect(invoke).not.toHaveBeenCalled();
});
it("never serves one account another account's saved suggestions", async () => {
  cache.set(AI_SUGGESTIONS_STORAGE_KEY, JSON.stringify({ [suggestionCacheKey('stage-breakdown','Read','INT')]: { at: Date.now(), value: ['Account A cached'] } }));
  allow();
  invoke.mockResolvedValue({ data: { stages: ['One'] }, error: null });
  await expect(suggestStages('Read','INT')).resolves.toEqual(['One']);
  mockAuthOwner = 'owner-b';
  allow({}, 'owner-b');
  invoke.mockResolvedValue({ data: { stages: ['Two'] }, error: null });
  await expect(suggestStages('Read','INT')).resolves.toEqual(['Two']);
  expect(invoke).toHaveBeenCalledTimes(2);
});
it('does not use or populate the cache when eligibility changes during the request', async () => {
  allow();
  invoke.mockImplementation(async () => { allow({ ageEligible: false, ageConsent: false, canReadDebrief: false, canGenerateDebrief: false, ageVersion: 2 }); return { data: { stages: ['Discard me'] }, error: null }; });
  await expect(suggestStages('Read','INT')).rejects.toThrow(/18\+ box/);
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
