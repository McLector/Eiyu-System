import {suggestStages} from '../suggestions';
import {initCacheAdapter, type CacheAdapter} from '../../cache/adapter';

const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockSession = jest.fn();
jest.mock('../../supabase/client', () => ({supabase: {
  auth: {getSession: (...args: unknown[]) => mockSession(...args)},
  rpc: (...args: unknown[]) => mockRpc(...args),
  functions: {invoke: (...args: unknown[]) => mockInvoke(...args)},
}}));

let owner = 'owner-a';
let accessOverride: Record<string, unknown> = {};
let mailboxOverride: Record<string, unknown> = {};
const access = () => ({contractVersion: 1, userId: owner, ageVersion: 1, consentVersion: 2, authorityVersion: 0, mailboxVersion: 1,
  ageEligible: true, ageConsent: true, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true, authorityState: 'not-required',
  ...accessOverride});
const mailbox = () => ({userId: owner, version: 1, verified: true, challenge: null, ...mailboxOverride});
let cacheReads: jest.Mock; let cacheWrites: jest.Mock;

beforeEach(() => {
  owner = 'owner-a'; accessOverride = {}; mailboxOverride = {};
  mockSession.mockReset().mockImplementation(async () => ({data: {session: {user: {id: owner}, access_token: `inert-${owner}`}}, error: null}));
  mockRpc.mockReset().mockImplementation(async (name: string) =>
    name === 'get_processing_access' ? {data: access(), error: null}
    : name === 'get_mailbox_status' ? {data: mailbox(), error: null} : {data: null, error: new Error(`unexpected rpc ${name}`)});
  mockInvoke.mockReset().mockResolvedValue({data: {stages: ['Pick a route', 'Walk it once', 'Finish it']}, error: null});
  cacheReads = jest.fn(async () => JSON.stringify({'stage-breakdown:STR:finish a long hike': {at: Date.now(), value: ['Stale cached stage']}}));
  cacheWrites = jest.fn(async () => {});
  const adapter: CacheAdapter = {getItem: cacheReads, setItem: cacheWrites, removeItem: async () => {}, getAllKeys: async () => []};
  initCacheAdapter(adapter);
});

describe('suggestStages', () => {
  it('sends only the quest name, the stat and the captured access revisions, authorized as the current owner', async () => {
    await expect(suggestStages('  Finish a long hike ', 'STR')).resolves.toEqual(['Pick a route', 'Walk it once', 'Finish it']);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [name, options] = mockInvoke.mock.calls[0];
    expect(name).toBe('ai-proxy');
    expect(options.body).toEqual({action: 'stage-breakdown', questName: 'Finish a long hike', stat: 'STR',
      processingAccess: {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0}});
    expect(options.headers.Authorization).toBe('Bearer inert-owner-a');
  });

  it('refuses a blank name without touching the server', async () => {
    await expect(suggestStages('   ', 'STR')).rejects.toThrow(/name/i);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it.each([
    ['the 18+ box, the AI agreement or admission is missing', {canGenerateDebrief: false, aiConsent: false}, /18\+ box|Weekly review needs/],
    ['AI is switched off', {aiConsent: false, canGenerateDebrief: false}, /Weekly review needs/],
  ])('refuses before any AI request when %s', async (_label, override, message) => {
    accessOverride = override;
    await expect(suggestStages('Finish a long hike', 'STR')).rejects.toThrow(message);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('refuses before any AI request while the email is not verified', async () => {
    mailboxOverride = {verified: false};
    await expect(suggestStages('Finish a long hike', 'STR')).rejects.toThrow(/Verify your email/);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows the server message when the request is refused', async () => {
    mockInvoke.mockResolvedValue({data: {error: 'Your daily AI limit has been reached. Please try again later.'}, error: null});
    await expect(suggestStages('Finish a long hike', 'STR')).rejects.toThrow('Your daily AI limit has been reached. Please try again later.');
  });

  it.each([[undefined], [null], [{}], [[]], [[' ', 3, null]], ['not a list']])('treats an unusable answer (%p) as no stages', async answer => {
    mockInvoke.mockResolvedValue({data: {stages: answer}, error: null});
    await expect(suggestStages('Finish a long hike', 'STR')).rejects.toThrow(/No stages/);
  });

  it('keeps only non-blank text and at most six stages, trimmed', async () => {
    mockInvoke.mockResolvedValue({data: {stages: [' One ', 2, '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']}, error: null});
    await expect(suggestStages('Finish a long hike', 'STR')).resolves.toEqual(['One', 'Two', 'Three', 'Four', 'Five', 'Six']);
  });

  it('discards the answer when access was withdrawn while it was being made', async () => {
    mockInvoke.mockImplementation(async () => {accessOverride = {canGenerateDebrief: false, aiConsent: false, consentVersion: 3}; return {data: {stages: ['Private']}, error: null};});
    await expect(suggestStages('Finish a long hike', 'STR')).rejects.toThrow(/Weekly review needs/);
  });

  it('discards the answer when the signed-in account changed while it was being made', async () => {
    mockInvoke.mockImplementation(async (_name: string, options: {headers: {Authorization: string}}) => {
      owner = 'owner-b';
      expect(options.headers.Authorization).toBe('Bearer inert-owner-a');
      return {data: {stages: ['A private stage']}, error: null};
    });
    await expect(suggestStages('A private quest', 'INT')).rejects.toThrow();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('never reads or writes the retired suggestion cache, even when a fresh entry matches', async () => {
    await expect(suggestStages('Finish a long hike', 'STR')).resolves.not.toContain('Stale cached stage');
    expect(cacheReads).not.toHaveBeenCalled();
    expect(cacheWrites).not.toHaveBeenCalled();
  });
});
