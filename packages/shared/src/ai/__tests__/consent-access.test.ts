const mockRpc = jest.fn(), mockInvoke = jest.fn(), mockFrom = jest.fn();
let mockAccess: Record<string, unknown>, mockAdult = true, mockOwner = 'owner';
let mockSaved: string | null = null, mockReadChange: (() => void) | undefined;
const mockWrites: Record<string, unknown>[] = [];
function mockBuilder() {
  const builder: any = {
    select: () => builder, eq: () => builder, setHeader: () => builder,
    insert: (value: Record<string, unknown>) => {mockWrites.push(value); return builder;},
    update: (value: Record<string, unknown>) => {mockWrites.push(value); return builder;},
    maybeSingle: async () => {const summary = mockSaved; mockReadChange?.(); return {data: summary === null ? null : {summary}, error: null};},
    single: async () => ({data: {summary: mockSaved}, error: null}),
    then: (resolve: (value: unknown) => void) => Promise.resolve({data: null, error: null}).then(resolve),
  };
  return builder;
}
jest.mock('../../supabase/client', () => ({supabase: {
  auth: {getSession: async () => ({data: {session: {user: {id: mockOwner}, access_token: 'synthetic-consent-token'}}, error: null})},
  rpc: (...args: unknown[]) => mockRpc(...args), from: (...args: unknown[]) => mockFrom(...args),
  functions: {invoke: (...args: unknown[]) => mockInvoke(...args)},
}}));
import {generateWeeklySummary} from '../suggestions';
import {fetchOrCreateWeeklySummary, fetchSavedWeeklySummary, regenerateWeeklySummary} from '../../data/weekly-summary';
const now = new Date('2026-10-20T04:00:00Z');
beforeEach(() => {
  mockOwner = 'owner'; mockAdult = true; mockSaved = null; mockReadChange = undefined; mockWrites.length = 0;
  mockAccess = {contractVersion: 1, userId: 'owner', ageVersion: 1, consentVersion: 2,
    authorityVersion: 1, mailboxVersion: 1, ageEligible: true, ageConsent: true, aiConsent: true,
    canReadDebrief: true, canGenerateDebrief: true, authorityState: 'approved'};
  mockRpc.mockReset().mockImplementation((name: string) => {
    if (name === 'get_processing_access') return Promise.resolve({data: {...mockAccess}, error: null});
    if (name === 'get_account_age') return Promise.resolve({data: {userId: mockOwner, birthDate: mockAdult ? '2000-01-01' : '2010-01-01',
      pendingBirthDate: null, correctionPending: false, adultDeclared: mockAdult, version: 1}, error: null});
    if (name === 'get_mailbox_status') return Promise.resolve({data: {userId: mockOwner, version: mockAccess.mailboxVersion, verified: true}, error: null});
    const response = name === 'read_history_range'
      ? {data: {habits: [], rows: [], recurring_totals: {}}, error: null} : {data: 1, error: null};
    return {setHeader: () => Promise.resolve(response), then: (resolve: (value: unknown) => void) => Promise.resolve(response).then(resolve)};
  });
  mockFrom.mockReset().mockImplementation(() => mockBuilder());
  mockInvoke.mockReset().mockResolvedValue({data: {summary: 'Synthetic permitted review'}, error: null});
});
it.each([generateWeeklySummary, fetchOrCreateWeeklySummary, regenerateWeeklySummary])(
  'denies missing optional permission before provider traffic (%p)', async operation => {
    mockAccess.aiConsent = false; mockAccess.canGenerateDebrief = false;
    const pending = operation === generateWeeklySummary ? generateWeeklySummary('2026-10-19')
      : (operation as typeof fetchOrCreateWeeklySummary)('owner', 'Asia/Manila', now);
    await expect(pending).rejects.toThrow();
    expect(mockInvoke).not.toHaveBeenCalled(); expect(mockWrites).toHaveLength(0);
  });
it('uses reviewed server access for a teen without changing the adult fact', async () => {
  mockAdult = false;
  expect(await generateWeeklySummary('2026-10-19')).toBe('Synthetic permitted review');
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});
it.each(['consentVersion', 'authorityVersion'])('rejects old-server capability missing %s before inference', async key => {
  delete mockAccess[key];
  await expect(generateWeeklySummary('2026-10-19')).rejects.toThrow();
  expect(mockInvoke).not.toHaveBeenCalled();
});
it('reads saved content after AI withdrawal without calling generation', async () => {
  mockSaved = 'Retained permitted history'; mockAccess.aiConsent = false; mockAccess.canGenerateDebrief = false;
  expect(await fetchSavedWeeklySummary('owner', 'Asia/Manila', now)).toBe('Retained permitted history');
  expect(mockInvoke).not.toHaveBeenCalled(); expect(mockWrites).toHaveLength(0);
});
it('returns the empty saved state without creating a review', async () => {
  expect(await fetchSavedWeeklySummary('owner', 'Asia/Manila', now)).toBeNull();
  expect(mockInvoke).not.toHaveBeenCalled(); expect(mockWrites).toHaveLength(0);
});
it('does not return a saved read completed under an older consent revision', async () => {
  mockSaved = 'Stale read'; mockReadChange = () => {mockAccess.consentVersion = 3;};
  await expect(fetchSavedWeeklySummary('owner', 'Asia/Manila', now)).rejects.toThrow();
  expect(mockInvoke).not.toHaveBeenCalled();
});
it('does not expose a saved response after authority revocation during the read', async () => {
  mockSaved = 'Revoked read'; mockReadChange = () => {
    mockAccess.authorityState = 'revoked'; mockAccess.authorityVersion = 2;
    mockAccess.canReadDebrief = false; mockAccess.canGenerateDebrief = false;
  };
  await expect(fetchSavedWeeklySummary('owner', 'Asia/Manila', now)).rejects.toThrow();
});
it.each([fetchOrCreateWeeklySummary, regenerateWeeklySummary])('persists only captured provenance (%p)', async operation => {
  expect(await operation('owner', 'Asia/Manila', now)).toBe('Synthetic permitted review');
  expect(mockWrites).toHaveLength(1);
  expect(mockWrites[0]).toMatchObject({summary: 'Synthetic permitted review', age_version: 1,
    consent_version: 2, authority_version: 1, mailbox_version: 1});
});
it.each([fetchOrCreateWeeklySummary, regenerateWeeklySummary])('discards a held result after consent withdrawal (%p)', async operation => {
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => {release = resolve;});
  const generating = new Promise<void>(resolve => {started = resolve;});
  mockInvoke.mockImplementation(async () => {started(); await held; return {data: {summary: 'Withdrawn result'}, error: null};});
  const pending = operation('owner', 'Asia/Manila', now);
  await generating; mockAccess.consentVersion = 3; mockAccess.aiConsent = false; mockAccess.canGenerateDebrief = false; release();
  await expect(pending).rejects.toThrow(); expect(mockWrites).toHaveLength(0);
});
it('does not return another owner from a saved read', async () => {
  mockSaved = 'Owner A history'; mockReadChange = () => {mockOwner = 'other-owner'; mockAccess.userId = 'other-owner';};
  await expect(fetchSavedWeeklySummary('owner', 'Asia/Manila', now)).rejects.toThrow();
});

const metadataOnlyBody = {action: 'weekly-summary', weekStart: '2026-10-19',
  processingAccess: {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 1}};
it('sends a metadata-only command: no habit text, no totals', async () => {
  await generateWeeklySummary('2026-10-19');
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockInvoke.mock.calls[0][1].body).toEqual(metadataOnlyBody);
});
it.each([fetchOrCreateWeeklySummary, regenerateWeeklySummary])('builds its request without reading or sending history (%p)', async operation => {
  await operation('owner', 'Asia/Manila', now);
  expect(mockRpc.mock.calls.map(call => call[0])).not.toContain('read_history_range');
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  const body = mockInvoke.mock.calls[0][1].body;
  expect(Object.keys(body).sort()).toEqual(['action', 'processingAccess', 'weekStart']);
  expect(body).not.toHaveProperty('habits');
  expect(body).not.toHaveProperty('statTotals');
});
