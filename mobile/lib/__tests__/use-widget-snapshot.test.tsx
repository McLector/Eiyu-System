import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import type { Quest } from '@eiyu/shared';

import * as appVariant from '../app-variant';
import { decodeSnapshot, WIDGET_KEY, type ReadySnapshot } from '../widget-snapshot';
import type { QueueEntry } from '../write-queue';
import { useWidgetSnapshot, type WidgetSnapshotInput } from '../use-widget-snapshot';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ZONE = 'Asia/Manila';
const FETCHED = Date.parse('2026-10-05T06:00:00Z'); // 14:00 on 2026-10-05 in Manila
const update = requestWidgetUpdate as jest.Mock;
let platform: { restore: () => void };

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'h1', name: 'Run', stat: 'STR', difficulty: 'Easy', easyVersion: null, description: null,
    questType: 'habit', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false,
    dailyEligible: true, completed: false, targetCount: null, progressCount: 0, ...overrides,
  } as Quest;
}

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return { id: 'e1', userId: 'user-1', kind: 'complete', habitId: 'h1', accountDate: '2026-10-05', createdAt: 1, attempts: 0, status: 'pending', ...overrides };
}

function input(overrides: Partial<WidgetSnapshotInput> = {}): WidgetSnapshotInput {
  return {
    authLoading: false, userId: 'user-1', accountTimeZone: ZONE, cachedQuests: [quest()], dataUpdatedAt: FETCHED,
    entries: [], palette: 'cyan', mode: 'dark', ...overrides,
  };
}

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

async function stored() {
  return decodeSnapshot(await AsyncStorage.getItem(WIDGET_KEY));
}

async function storedReady(): Promise<ReadySnapshot> {
  const snapshot = await stored();
  if (!snapshot || snapshot.state !== 'ready') throw new Error(`expected a ready snapshot, got ${JSON.stringify(snapshot)}`);
  return snapshot;
}

beforeEach(async () => {
  platform = jest.replaceProperty(Platform, 'OS', 'android');
  await AsyncStorage.clear();
  jest.clearAllMocks();
  update.mockImplementation(async () => undefined);
});

afterEach(() => {
  platform.restore();
  jest.restoreAllMocks();
});

describe('useWidgetSnapshot writes', () => {
  it('stores the board and asks the widget to redraw', async () => {
    await renderHook(() => useWidgetSnapshot(input()));
    await settle();
    const snapshot = await storedReady();
    expect(snapshot).toMatchObject({ accountDate: '2026-10-05', timeZone: ZONE, completed: 0, total: 1, waiting: 0, palette: 'cyan', mode: 'dark' });
    expect(snapshot.rows[0]).toMatchObject({ name: 'Run', done: false });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({ widgetName: 'EiyuToday' });
  });

  it('stamps the snapshot with when the board was fetched', async () => {
    await renderHook(() => useWidgetSnapshot(input()));
    await settle();
    expect((await storedReady()).writtenAt).toBe(FETCHED);
  });

  it('does not write again when nothing the widget shows has changed', async () => {
    const { rerender } = await renderHook((props: WidgetSnapshotInput) => useWidgetSnapshot(props), { initialProps: input() });
    await settle();
    await rerender(input({ cachedQuests: [quest()], entries: [] })); // new arrays, same content
    await rerender(input());
    await settle();
    expect(update).toHaveBeenCalledTimes(1);
    expect(jest.mocked(AsyncStorage.setItem).mock.calls.filter(call => call[0] === WIDGET_KEY)).toHaveLength(1);
  });

  it('writes again when a queued write changes what the widget shows', async () => {
    const { rerender } = await renderHook((props: WidgetSnapshotInput) => useWidgetSnapshot(props), { initialProps: input() });
    await settle();
    await rerender(input({ entries: [entry({ kind: 'complete', status: 'pending', attempts: 1 })] }));
    await settle();
    const snapshot = await storedReady();
    expect(snapshot.rows[0]).toMatchObject({ done: true, tag: 'pending' });
    expect(snapshot.completed).toBe(1);
    expect(snapshot.waiting).toBe(1);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('tags a write that is quietly in flight, which the Board would not', async () => {
    await renderHook(() => useWidgetSnapshot(input({ entries: [entry({ status: 'sending', attempts: 0 })] })));
    await settle();
    expect((await storedReady()).rows[0]).toMatchObject({ done: true, tag: 'pending' });
  });

  it('writes again when the palette or mode changes', async () => {
    const { rerender } = await renderHook((props: WidgetSnapshotInput) => useWidgetSnapshot(props), { initialProps: input() });
    await settle();
    await rerender(input({ palette: 'jade', mode: 'light' }));
    await settle();
    expect(await storedReady()).toMatchObject({ palette: 'jade', mode: 'light' });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('writes again when a refetch brings the board of a new day', async () => {
    const { rerender } = await renderHook((props: WidgetSnapshotInput) => useWidgetSnapshot(props), { initialProps: input() });
    await settle();
    await rerender(input({ dataUpdatedAt: Date.parse('2026-10-05T17:00:00Z'), cachedQuests: [quest({ completed: false })] }));
    await settle();
    expect((await storedReady()).accountDate).toBe('2026-10-06');
  });

  it('dates the board by when it was fetched, so a refetch that failed at midnight leaves yesterday\'s date', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-05T17:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    try {
      // 01:00 on 2026-10-06 in Manila, but the cached board was fetched at 14:00 the day before
      await renderHook(() => useWidgetSnapshot(input({ dataUpdatedAt: FETCHED })));
      await settle();
      expect((await storedReady()).accountDate).toBe('2026-10-05');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps an unsent write of the fetched day on the board even when the clock has moved on', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-05T17:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    try {
      await renderHook(() => useWidgetSnapshot(input({ entries: [entry({ accountDate: '2026-10-05' })] })));
      await settle();
      expect((await storedReady()).rows[0]).toMatchObject({ done: true, tag: 'pending' });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useWidgetSnapshot write gates', () => {
  async function seed(): Promise<string> {
    await renderHook(() => useWidgetSnapshot(input({ cachedQuests: [quest({ name: 'Seeded' })] })));
    await settle();
    const raw = (await AsyncStorage.getItem(WIDGET_KEY)) as string;
    expect(raw).toContain('Seeded');
    jest.clearAllMocks();
    return raw;
  }

  it.each([
    ['auth is still loading', { authLoading: true }],
    ['the account zone is not known yet', { accountTimeZone: null }],
    ['the board has not loaded', { cachedQuests: undefined }],
    ['the board has never been fetched', { dataUpdatedAt: 0 }],
    ['the account zone is not a real zone', { accountTimeZone: 'Not/AZone' }],
  ] as [string, Partial<WidgetSnapshotInput>][])('leaves the last good snapshot alone while %s', async (_name, overrides) => {
    const before = await seed();
    await renderHook(() => useWidgetSnapshot(input({ cachedQuests: [], ...overrides })));
    await settle();
    expect(await AsyncStorage.getItem(WIDGET_KEY)).toBe(before);
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing for a signed-out user while auth is still loading', async () => {
    const before = await seed();
    await renderHook(() => useWidgetSnapshot(input({ authLoading: true, userId: undefined })));
    await settle();
    expect(await AsyncStorage.getItem(WIDGET_KEY)).toBe(before);
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing off Android', async () => {
    platform.restore();
    platform = jest.replaceProperty(Platform, 'OS', 'ios');
    await renderHook(() => useWidgetSnapshot(input()));
    await settle();
    expect(await AsyncStorage.getItem(WIDGET_KEY)).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('useWidgetSnapshot signed out and account switches', () => {
  it('replaces the board with a signed-out snapshot once auth has settled with no user', async () => {
    const { rerender } = await renderHook((props: WidgetSnapshotInput) => useWidgetSnapshot(props), { initialProps: input({ cachedQuests: [quest({ name: 'Private quest' })] }) });
    await settle();
    expect(await AsyncStorage.getItem(WIDGET_KEY)).toContain('Private quest');
    await rerender(input({ userId: undefined, cachedQuests: undefined, dataUpdatedAt: 0 }));
    await settle();
    const raw = (await AsyncStorage.getItem(WIDGET_KEY)) as string;
    expect(raw).not.toContain('Private quest');
    expect(decodeSnapshot(raw)).toMatchObject({ state: 'signed-out', palette: 'cyan', mode: 'dark' });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('stores the scheme of the running app, so the widget opens that app', async () => {
    await renderHook(() => useWidgetSnapshot(input()));
    await settle();
    expect(await stored()).toMatchObject({ state: 'ready', scheme: 'eiyusystem' });
  });

  it('stores the preview scheme when it runs as the preview app', async () => {
    jest.spyOn(appVariant, 'currentAppScheme').mockReturnValue('eiyusystem-preview');
    await renderHook(() => useWidgetSnapshot(input()));
    await settle();
    expect(await stored()).toMatchObject({ scheme: 'eiyusystem-preview' });
  });

  it('stamps the signed-out snapshot with the time it was written', async () => {
    const before = Date.now();
    await renderHook(() => useWidgetSnapshot(input({ userId: undefined, cachedQuests: undefined, dataUpdatedAt: 0 })));
    await settle();
    expect((await stored())!.writtenAt).toBeGreaterThanOrEqual(before);
  });

  it('writes the signed-out snapshot once, not on every render', async () => {
    const { rerender } = await renderHook((props: WidgetSnapshotInput) => useWidgetSnapshot(props), { initialProps: input({ userId: undefined, cachedQuests: undefined, dataUpdatedAt: 0 }) });
    await settle();
    await rerender(input({ userId: undefined, cachedQuests: undefined, dataUpdatedAt: 0, entries: [] }));
    await settle();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('never shows the old user\'s quests under a new account: it clears the board when the user changes', async () => {
    const { rerender } = await renderHook((props: WidgetSnapshotInput) => useWidgetSnapshot(props), { initialProps: input({ cachedQuests: [quest({ name: 'First users quest' })] }) });
    await settle();
    // user-2 signs in directly: their board has not loaded yet
    await rerender(input({ userId: 'user-2', cachedQuests: undefined, dataUpdatedAt: 0 }));
    await settle();
    expect(await AsyncStorage.getItem(WIDGET_KEY)).toBeNull();
    expect(update).toHaveBeenCalledTimes(2);
    // then their board arrives
    await rerender(input({ userId: 'user-2', cachedQuests: [quest({ name: 'Second users quest' })] }));
    await settle();
    const raw = (await AsyncStorage.getItem(WIDGET_KEY)) as string;
    expect(raw).toContain('Second users quest');
    expect(raw).not.toContain('First users quest');
  });

  it('does not clear anything on the first user after launch', async () => {
    await AsyncStorage.setItem(WIDGET_KEY, 'previous-run');
    await renderHook(() => useWidgetSnapshot(input({ cachedQuests: undefined, dataUpdatedAt: 0 })));
    await settle();
    expect(await AsyncStorage.getItem(WIDGET_KEY)).toBe('previous-run');
  });
});

describe('useWidgetSnapshot failures', () => {
  it('survives a widget redraw that throws, and still stores the board', async () => {
    update.mockRejectedValue(new Error('no native module'));
    await expect(renderHook(() => useWidgetSnapshot(input()))).resolves.toBeDefined();
    await settle();
    expect(await stored()).not.toBeNull();
  });

  it('survives a widget redraw that throws synchronously', async () => {
    update.mockImplementation(() => {
      throw new Error('boom');
    });
    await renderHook(() => useWidgetSnapshot(input()));
    await settle();
    expect(await stored()).not.toBeNull();
  });

  it('survives storage that cannot be written, and does not redraw a board it could not store', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full')); // once: the AsyncStorage mock is shared
    await expect(renderHook(() => useWidgetSnapshot(input()))).resolves.toBeDefined();
    await settle();
    expect(update).not.toHaveBeenCalled();
  });

  it('retries a failed write the next time the board changes', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    const { rerender } = await renderHook((props: WidgetSnapshotInput) => useWidgetSnapshot(props), { initialProps: input() });
    await settle();
    expect(await stored()).toBeNull();
    await rerender(input({ entries: [entry()] }));
    await settle();
    expect((await storedReady()).waiting).toBe(1);
    expect(setItem).toHaveBeenCalledTimes(2);
  });

  it('retries a failed write with the same content the next time the board is recomputed', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    const { rerender } = await renderHook((props: WidgetSnapshotInput) => useWidgetSnapshot(props), { initialProps: input() });
    await settle();
    expect(await stored()).toBeNull();
    await rerender(input({ cachedQuests: [quest()] })); // a refetch that returned the same board
    await settle();
    expect((await storedReady()).rows[0].name).toBe('Run');
  });

  it('keeps writes in order when a slow earlier write is still running', async () => {
    const real = AsyncStorage.setItem as jest.Mock;
    const realImpl = real.getMockImplementation()!;
    let release: () => void = () => {};
    real.mockImplementationOnce(async (key: string, value: string) => {
      await new Promise<void>(resolve => {
        release = resolve;
      });
      await realImpl(key, value);
    });
    const { rerender } = await renderHook((props: WidgetSnapshotInput) => useWidgetSnapshot(props), { initialProps: input() });
    await rerender(input({ entries: [entry({ status: 'uncertain', attempts: 1 })] }));
    await act(async () => {
      release();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    await settle();
    expect((await storedReady()).rows[0].tag).toBe('checking');
    real.mockImplementation(realImpl);
  });
});
