import { renderHook } from '@testing-library/react-native';

let mockLastResponse: unknown = null;
jest.mock('expo-notifications', () => ({
  __esModule: true,
  useLastNotificationResponse: () => mockLastResponse,
}));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));

import { laneFromNotificationData, useNotificationTaps } from '../notification-taps';

const mockRouter = jest.requireMock('expo-router').router as { navigate: jest.Mock };

const tap = (data: unknown, over: { identifier?: string; date?: number } = {}) => ({
  actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  notification: { date: over.date ?? 1, request: { identifier: over.identifier ?? 'n1', content: { data } } },
});

describe('laneFromNotificationData', () => {
  it.each([
    [{ lane: 'daily' }, 'daily'],
    [{ lane: 'one-time' }, 'one-time'],
  ])('reads %j as the %s lane', (data, lane) => {
    expect(laneFromNotificationData(data)).toBe(lane);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'one-time'],
    ['an unknown lane', { lane: 'weekly' }],
    ['Backlog, which has no reminders', { lane: 'backlog' }],
    ['a non-string lane', { lane: 3 }],
    ['an array', ['daily']],
  ])('ignores %s', (_label, data) => {
    expect(laneFromNotificationData(data)).toBeNull();
  });
});

describe('useNotificationTaps', () => {
  beforeEach(() => { mockLastResponse = null; mockRouter.navigate.mockClear(); });

  it('does nothing when no reminder was tapped', async () => {
    await renderHook(() => useNotificationTaps(true));
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('opens the Board on the lane the reminder belongs to', async () => {
    mockLastResponse = tap({ lane: 'one-time' });
    await renderHook(() => useNotificationTaps(true));
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/(tabs)/board', params: { lane: 'one-time' } });
  });

  it('still opens the Board for a reminder scheduled before lanes were recorded', async () => {
    mockLastResponse = tap({});
    await renderHook(() => useNotificationTaps(true));
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/(tabs)/board' });
  });

  it('waits until the user is signed in, then handles the tap once', async () => {
    mockLastResponse = tap({ lane: 'daily' });
    const { rerender } = await renderHook((enabled: boolean) => useNotificationTaps(enabled), { initialProps: false });
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    await rerender(true);
    await rerender(true);
    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  });

  it('handles the same weekly reminder again when it is tapped on another day', async () => {
    mockLastResponse = tap({ lane: 'daily' }, { identifier: 'weekly', date: 1 });
    const { rerender } = await renderHook(() => useNotificationTaps(true));
    mockLastResponse = tap({ lane: 'daily' }, { identifier: 'weekly', date: 2 });
    await rerender({});
    expect(mockRouter.navigate).toHaveBeenCalledTimes(2);
  });
});
