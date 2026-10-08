import AsyncStorage from '@react-native-async-storage/async-storage';
import { PixelRatio } from 'react-native';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { elementWithText, styleOf, textsOf } from '@/test-support/widget-tree';
import { buildSignedOutSnapshot, buildWidgetSnapshot, encodeSnapshot, WIDGET_KEY, type ReadySnapshot } from '@/lib/widget-snapshot';
import { widgetTaskHandler } from '../widget-task-handler';

const NOW = new Date('2026-10-05T06:30:00Z');
const ZONE = 'Asia/Manila';

function snapshot(overrides: Partial<ReadySnapshot> = {}): ReadySnapshot {
  const base = buildWidgetSnapshot({
    cachedQuests: [
      { id: 'a', name: 'Run', stat: 'STR', difficulty: 'Easy', easyVersion: null, description: null, questType: 'habit', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false, dailyEligible: true, completed: false, targetCount: null, progressCount: 0 },
      { id: 'b', name: 'Read', stat: 'INT', difficulty: 'Easy', easyVersion: null, description: null, questType: 'habit', time: '09:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false, dailyEligible: true, completed: true, targetCount: null, progressCount: 0 },
    ],
    entries: [], dataDate: '2026-10-05', timeZone: ZONE, palette: 'cyan', mode: 'dark', now: NOW.getTime(),
  });
  return { ...base, ...overrides };
}

type Action = WidgetTaskHandlerProps['widgetAction'];

function props(action: Action, overrides: Partial<WidgetTaskHandlerProps> = {}): WidgetTaskHandlerProps & { renderWidget: jest.Mock } {
  return {
    widgetInfo: { widgetName: 'EiyuToday', widgetId: 1, height: 300, width: 300, screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 3, densityDpi: 480 } },
    widgetAction: action,
    renderWidget: jest.fn(),
    ...overrides,
  } as WidgetTaskHandlerProps & { renderWidget: jest.Mock };
}

function drawn(call: WidgetTaskHandlerProps & { renderWidget: jest.Mock }): string[] {
  expect(call.renderWidget).toHaveBeenCalledTimes(1);
  return textsOf(call.renderWidget.mock.calls[0][0]);
}

describe('widget task handler', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    // Jest's React Native mock reports a font scale of 2; the tests that are not about font size want the normal one.
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each<Action>(['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'])('draws the stored board on %s', async action => {
    await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(snapshot()));
    const call = props(action);
    await widgetTaskHandler(call);
    const texts = drawn(call);
    expect(texts).toContain('1/2');
    expect(texts).toContain('Run');
    expect(texts).toContain('Read');
  });

  it('asks to set up when nothing is stored', async () => {
    const call = props('WIDGET_ADDED');
    await widgetTaskHandler(call);
    expect(drawn(call)).toContain('Open Eiyu to set up the widget');
  });

  it('asks to set up when the stored value is garbled', async () => {
    await AsyncStorage.setItem(WIDGET_KEY, '{not json');
    const call = props('WIDGET_UPDATE');
    await widgetTaskHandler(call);
    expect(drawn(call)).toContain('Open Eiyu to set up the widget');
  });

  it('asks to set up, and does not throw, when reading storage fails', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk gone'));
    const call = props('WIDGET_UPDATE');
    await expect(widgetTaskHandler(call)).resolves.toBeUndefined();
    expect(drawn(call)).toContain('Open Eiyu to set up the widget');
  });

  it('asks to sign in when the app signed out', async () => {
    await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(buildSignedOutSnapshot({ palette: 'cyan', mode: 'dark', now: NOW.getTime() })));
    const call = props('WIDGET_UPDATE');
    await widgetTaskHandler(call);
    expect(drawn(call)).toContain('Sign in to Eiyu');
  });

  it('shows yesterday\'s board as out of date, with no ticks, once the account day has moved on', async () => {
    await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(snapshot({ accountDate: '2026-10-04' })));
    const call = props('WIDGET_UPDATE');
    await widgetTaskHandler(call);
    const texts = drawn(call);
    expect(texts).toContain('Open Eiyu to load today');
    expect(texts).not.toContain('Run');
    expect(texts).not.toContain(String.fromCharCode(0x2713));
  });

  it('judges the day when it draws, not when the snapshot was written', async () => {
    await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(snapshot()));
    jest.setSystemTime(new Date('2026-10-05T15:59:59Z'));
    const before = props('WIDGET_UPDATE');
    await widgetTaskHandler(before);
    expect(drawn(before)).toContain('Run');

    jest.setSystemTime(new Date('2026-10-05T16:00:00Z'));
    const after = props('WIDGET_UPDATE');
    await widgetTaskHandler(after);
    expect(drawn(after)).toContain('Open Eiyu to load today');
  });

  it('fits the rows to the height it is given', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({ name: `Q${index}`, done: false }));
    await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(snapshot({ rows, total: 10, completed: 0 })));
    const short = props('WIDGET_RESIZED', { widgetInfo: { ...props('WIDGET_RESIZED').widgetInfo, height: 110 } });
    await widgetTaskHandler(short);
    expect(drawn(short).filter(text => /^Q\d$/.test(text))).toHaveLength(3);

    const tall = props('WIDGET_RESIZED', { widgetInfo: { ...props('WIDGET_RESIZED').widgetInfo, height: 300 } });
    await widgetTaskHandler(tall);
    expect(drawn(tall).filter(text => /^Q\d$/.test(text))).toHaveLength(10);
  });

  async function drawnAt110(): Promise<string[]> {
    const rows = Array.from({ length: 10 }, (_, index) => ({ name: `Q${index}`, done: false }));
    await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(snapshot({ rows, total: 10, completed: 0 })));
    const call = props('WIDGET_RESIZED', { widgetInfo: { ...props('WIDGET_RESIZED').widgetInfo, height: 110 } });
    await widgetTaskHandler(call);
    return drawn(call).filter(text => /^Q\d$/.test(text));
  }

  it('shows fewer rows when the phone font is larger', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.3);
    expect(await drawnAt110()).toHaveLength(2);
  });

  it.each([Number.NaN, 0, -1])('falls back to normal sizing when the font scale is %s', async scale => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(scale);
    expect(await drawnAt110()).toHaveLength(3);
  });

  it('falls back to normal sizing when reading the font scale throws', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockImplementation(() => {
      throw new Error('no native module');
    });
    expect(await drawnAt110()).toHaveLength(3);
  });

  it('lays the name column out for the width it is given', async () => {
    await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(snapshot()));
    const widths: number[] = [];
    for (const width of [250, 400]) {
      const call = props('WIDGET_RESIZED', { widgetInfo: { ...props('WIDGET_RESIZED').widgetInfo, width } });
      await widgetTaskHandler(call);
      const name = elementWithText(call.renderWidget.mock.calls[0][0], 'Run');
      widths.push(styleOf(name).width as number);
    }
    // inner width minus the 16 dp icon, the 40 dp time column and a 6 dp gap
    expect(widths).toEqual([250 - 22 - 16 - 40 - 6, 400 - 22 - 16 - 40 - 6]);
  });

  it('draws nothing when the widget is removed', async () => {
    await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(snapshot()));
    const call = props('WIDGET_DELETED');
    await widgetTaskHandler(call);
    expect(call.renderWidget).not.toHaveBeenCalled();
  });

  it('draws nothing on a click: the tap is an open-app action handled by Android', async () => {
    await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(snapshot()));
    const call = props('WIDGET_CLICK', { clickAction: 'SOMETHING' });
    await widgetTaskHandler(call);
    expect(call.renderWidget).not.toHaveBeenCalled();
  });

  it('only ever reads: it never writes the stored snapshot', async () => {
    await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(snapshot()));
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const removeItem = jest.spyOn(AsyncStorage, 'removeItem');
    jest.clearAllMocks(); // the shared mock keeps the history of the seeding above and of earlier tests
    await widgetTaskHandler(props('WIDGET_UPDATE'));
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('reads only its own key', async () => {
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    jest.clearAllMocks();
    await widgetTaskHandler(props('WIDGET_UPDATE'));
    expect(getItem.mock.calls.map(call => call[0])).toEqual([WIDGET_KEY]);
  });
});
