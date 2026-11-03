const mockShared = { createHabit: jest.fn(), completeHabit: jest.fn() };

jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  createHabit: (...args: unknown[]) => mockShared.createHabit(...args),
  completeHabit: (...args: unknown[]) => mockShared.completeHabit(...args),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => ({}) }));
jest.mock('@/contexts/auth-store', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('@/contexts/theme-store', () => ({ useAppTheme: () => ({}), useTokens: () => ({}) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import type { HabitInput } from '@eiyu/shared';
import { trackerAccess } from '@/test-support/tracker-fixtures';

import { seedCompletedQuest } from '../eiyu/dev-ball';

const input: HabitInput = {
  name: 'Seed', easyVersion: null, description: null, questType: 'habit', stat: 'STR', difficulty: 'Easy', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  jest.resetAllMocks();
  mockShared.createHabit.mockImplementation(async (_user: string, _input: unknown, _expected: unknown, creationId: string) => creationId);
  mockShared.completeHabit.mockResolvedValue(undefined);
});

describe('dev ball: seed a quest completed today', () => {
  it('creates a custom habit and completes it with the captured revision and its own target', async () => {
    const access = trackerAccess({}, 'u');
    await seedCompletedQuest({ userId: 'u', tracker: access, input, kind: 'full', todayKey: '2026-10-24', timeZone: 'UTC' });
    const [user, editor, expected, creationId] = mockShared.createHabit.mock.calls[0];
    expect(user).toBe('u');
    expect(editor).toEqual({ mode: 'custom', values: input });
    expect(expected).toEqual(access.revision);
    expect(expected).not.toBe(access.revision);
    expect(creationId).toMatch(UUID);
    const call = mockShared.completeHabit.mock.calls[0];
    expect(call[1]).toBe(creationId);
    expect(call[4]).toEqual(access.revision);
    expect(call[5]).toEqual([{ kind: 'habit', id: creationId, inputKind: 'custom' }]);
    expect(call[6]).toBe('2026-10-24');
  });

  it.each([
    ['no capability yet', null],
    ['custom permission not granted', trackerAccess({ customConsent: false, canWriteCustom: false }, 'u')],
    ['a paused account', trackerAccess({ canWriteBasic: false, canWriteCustom: false }, 'u')],
    ["another account's capability", trackerAccess({}, 'someone-else')],
  ])('sends nothing with %s', async (_label, tracker) => {
    await expect(seedCompletedQuest({ userId: 'u', tracker, input, kind: 'full', todayKey: '2026-10-24', timeZone: 'UTC' })).rejects.toThrow(/permission|unavailable|paused/i);
    expect(mockShared.createHabit).not.toHaveBeenCalled();
    expect(mockShared.completeHabit).not.toHaveBeenCalled();
  });

  it('does not complete a quest that was not created', async () => {
    mockShared.createHabit.mockRejectedValue(new Error('refused'));
    await expect(seedCompletedQuest({ userId: 'u', tracker: trackerAccess({}, 'u'), input, kind: 'full', todayKey: '2026-10-24', timeZone: 'UTC' })).rejects.toThrow('refused');
    expect(mockShared.completeHabit).not.toHaveBeenCalled();
  });
});
