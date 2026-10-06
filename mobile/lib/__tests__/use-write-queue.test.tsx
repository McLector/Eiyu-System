import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import type { Quest } from '@eiyu/shared';

import { encodeQueue, type QueueEntry } from '../write-queue';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockNetwork = { getNetworkStateAsync: jest.fn(), addNetworkStateListener: jest.fn() };
jest.doMock('expo-network', () => mockNetwork);

const { useWriteQueue } = require('../use-write-queue') as typeof import('../use-write-queue');

let networkHandlers: ((state: { isConnected?: boolean }) => void)[] = [];
let appStateHandlers: ((state: string) => void)[] = [];
const removeNetwork = jest.fn();
const removeAppState = jest.fn();
let appStateSpy: jest.SpyInstance;

const quest = { id: 'h1', completed: false, targetCount: null, progressCount: 0 } as Quest;

function stored(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'stored-1', userId: 'user-1', kind: 'complete', habitId: 'h1', accountDate: new Date().toISOString().slice(0, 10),
    createdAt: 1, attempts: 0, status: 'pending', ...overrides,
  };
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1' as string | undefined,
    timeZone: () => 'UTC',
    send: jest.fn(async () => {}),
    readQuest: jest.fn(async () => quest),
    onApplied: jest.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(async () => {
  networkHandlers = [];
  appStateHandlers = [];
  removeNetwork.mockClear();
  removeAppState.mockClear();
  mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true });
  mockNetwork.addNetworkStateListener.mockImplementation((handler: (state: { isConnected?: boolean }) => void) => {
    networkHandlers.push(handler);
    return { remove: removeNetwork };
  });
  appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, handler: (state: string) => void) => {
    appStateHandlers.push(handler);
    return { remove: removeAppState };
  }) as never);
  await AsyncStorage.clear();
});
afterEach(() => { appStateSpy.mockRestore(); });

describe('useWriteQueue', () => {
  it('exposes no entries and no engine when signed out', async () => {
    const opts = options({ userId: undefined });
    const { result } = await renderHook(() => useWriteQueue(opts));
    expect(result.current.entries).toEqual([]);
    expect(() => result.current.enqueue({ kind: 'complete', habitId: 'h1' })).not.toThrow();
    expect(opts.send).not.toHaveBeenCalled();
  });

  it('loads the persisted queue for the signed-in user on mount', async () => {
    await AsyncStorage.setItem('eiyu.writeQueue.v1.user-1', encodeQueue([stored({ status: 'failed', failure: { reason: 'server', message: 'x' } })]));
    const { result } = await renderHook(() => useWriteQueue(options()));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });

  it('flushes a persisted pending entry on mount once the device is online', async () => {
    await AsyncStorage.setItem('eiyu.writeQueue.v1.user-1', encodeQueue([stored()]));
    const opts = options();
    await renderHook(() => useWriteQueue(opts));
    await waitFor(() => expect(opts.send).toHaveBeenCalledTimes(1));
  });

  it('sends an enqueued write and shows it until the server confirms', async () => {
    const opts = options();
    const { result } = await renderHook(() => useWriteQueue(opts));
    await act(async () => { result.current.enqueue({ kind: 'complete', habitId: 'h1' }); await result.current.flush(); });
    expect(opts.send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'complete', habitId: 'h1' }));
    expect(opts.onApplied).toHaveBeenCalledTimes(1);
    expect(result.current.entries).toEqual([]);
  });

  it('holds writes made offline and sends them when the connection returns', async () => {
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
    const opts = options();
    const { result } = await renderHook(() => useWriteQueue(opts));
    await act(async () => { result.current.enqueue({ kind: 'complete', habitId: 'h1' }); await result.current.flush(); });
    expect(opts.send).not.toHaveBeenCalled();
    expect(result.current.entries).toHaveLength(1);
    await act(async () => { networkHandlers.forEach(handler => handler({ isConnected: true })); });
    await waitFor(() => expect(opts.send).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.entries).toEqual([]));
  });

  it('flushes when the app returns to the foreground, not when it goes to the background', async () => {
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true });
    const opts = options({ send: jest.fn().mockRejectedValueOnce({ message: 'JWT expired', code: 'PGRST301' }).mockResolvedValue(undefined) });
    const { result } = await renderHook(() => useWriteQueue(opts));
    await act(async () => { result.current.enqueue({ kind: 'complete', habitId: 'h1' }); await result.current.flush(); });
    expect(opts.send).toHaveBeenCalledTimes(1);
    await act(async () => { appStateHandlers.forEach(handler => handler('background')); });
    expect(opts.send).toHaveBeenCalledTimes(1);
    await act(async () => { appStateHandlers.forEach(handler => handler('active')); });
    await waitFor(() => expect(opts.send).toHaveBeenCalledTimes(2));
  });

  it('uses the newest callbacks without rebuilding the queue', async () => {
    const first = options();
    const second = options();
    const { result, rerender } = await renderHook((props: { opts: ReturnType<typeof options> }) => useWriteQueue(props.opts), { initialProps: { opts: first } });
    await rerender({ opts: second });
    await act(async () => { result.current.enqueue({ kind: 'complete', habitId: 'h1' }); await result.current.flush(); });
    expect(first.send).not.toHaveBeenCalled();
    expect(second.send).toHaveBeenCalledTimes(1);
  });

  it('starts over for a different user and never shows or sends the previous user\'s entries', async () => {
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
    const opts = options();
    const { result, rerender } = await renderHook((props: { userId: string }) => useWriteQueue({ ...opts, userId: props.userId }), { initialProps: { userId: 'user-1' } });
    await act(async () => { result.current.enqueue({ kind: 'complete', habitId: 'h1' }); });
    expect(result.current.entries).toHaveLength(1);
    const realGet = AsyncStorage.getItem as jest.Mock;
    const original = realGet.getMockImplementation();
    realGet.mockImplementation(((key: string) => (key.endsWith('user-2') ? new Promise(() => {}) : original?.(key))) as never);
    await rerender({ userId: 'user-2' });
    // user-2's queue is still loading: user-1's entries must already be gone.
    expect(result.current.entries).toEqual([]);
    realGet.mockImplementation(original as never);
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true });
    await act(async () => { networkHandlers.forEach(handler => handler({ isConnected: true })); });
    expect(opts.send).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', async () => {
    const { unmount } = await renderHook(() => useWriteQueue(options()));
    await unmount();
    expect(removeNetwork).toHaveBeenCalled();
    expect(removeAppState).toHaveBeenCalled();
  });
});
