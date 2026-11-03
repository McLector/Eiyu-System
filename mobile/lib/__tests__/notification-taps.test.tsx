import { act, renderHook } from '@testing-library/react-native';
import type { NotificationResponse } from 'expo-notifications';
import { laneFromNotificationData, useNotificationTaps } from '../notification-taps';

let mockLastResponse: NotificationResponse | null = null;
const mockListeners = new Set<(response: NotificationResponse) => void>();
const mockRemove = jest.fn();
const mockGetLast = jest.fn(() => mockLastResponse);
jest.mock('expo-notifications', () => ({
  __esModule: true,
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  useLastNotificationResponse: () => mockLastResponse,
  getLastNotificationResponse: () => mockGetLast(),
  addNotificationResponseReceivedListener: (listener: (response: NotificationResponse) => void) => {
    mockListeners.add(listener);
    return { remove: () => { mockRemove(); mockListeners.delete(listener); } };
  },
}));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));

const mockRouter = jest.requireMock('expo-router').router as { navigate: jest.Mock };

const tap = (data: unknown, over: { identifier?: string; date?: number; action?: string } = {}) => ({
  actionIdentifier: over.action ?? 'expo.modules.notifications.actions.DEFAULT',
  notification: { date: over.date ?? 1, request: { identifier: over.identifier ?? 'n1', content: { data } } },
}) as NotificationResponse;
async function emit(response: NotificationResponse) {
  await act(async () => { for (const listener of mockListeners) listener(response); });
}

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
  beforeEach(() => {
    mockLastResponse = null; mockRouter.navigate.mockClear(); mockListeners.clear(); mockRemove.mockClear();
    mockGetLast.mockReset().mockImplementation(() => mockLastResponse);
  });

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
    await renderHook(() => useNotificationTaps(true));
    await emit(tap({ lane: 'daily' }, { identifier: 'weekly', date: 2 }));
    expect(mockRouter.navigate).toHaveBeenCalledTimes(2);
  });

  it('deduplicates a cached response and its matching live delivery', async () => {
    mockLastResponse = tap({ lane: 'daily' });
    await renderHook(() => useNotificationTaps(true));
    await emit(mockLastResponse);
    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  });

  it('keeps only the latest tap while sign-in is not ready', async () => {
    const { rerender } = await renderHook((enabled: boolean) => useNotificationTaps(enabled), { initialProps: false });
    await emit(tap({ lane: 'daily' }, { identifier: 'first' }));
    await emit(tap({ lane: 'one-time' }, { identifier: 'second' }));
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    await rerender(true);
    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/(tabs)/board', params: { lane: 'one-time' } });
  });

  it('subscribes before reading the cache and never replaces a newly observed tap with the old snapshot', async () => {
    mockGetLast.mockImplementation(() => {
      expect(mockListeners.size).toBe(1);
      for (const listener of mockListeners) listener(tap({ lane: 'one-time' }, { identifier: 'new' }));
      return tap({ lane: 'daily' }, { identifier: 'old' });
    });
    await renderHook(() => useNotificationTaps(true));
    expect(mockGetLast).toHaveBeenCalledTimes(1);
    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/(tabs)/board', params: { lane: 'one-time' } });
  });

  it('keeps listening if the native cache read fails', async () => {
    mockGetLast.mockImplementation(() => { throw new Error('Synthetic native cache failure'); });
    await renderHook(() => useNotificationTaps(true));
    await emit(tap({ lane: 'daily' }));
    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  });

  it('removes the listener and ignores a callback retained after unmount', async () => {
    const { unmount } = await renderHook(() => useNotificationTaps(true));
    const stale = [...mockListeners][0];
    expect(stale).toBeDefined();
    await unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    await act(async () => stale(tap({ lane: 'daily' })));
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('ignores dismissed/custom actions rather than treating them as default taps', async () => {
    await renderHook(() => useNotificationTaps(true));
    await emit(tap({ lane: 'daily' }, { action: 'dismiss' }));
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    await emit(tap({ lane: 'daily' }));
    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  });
});
