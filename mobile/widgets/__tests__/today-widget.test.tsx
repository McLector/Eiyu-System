import { FlexWidget } from 'react-native-android-widget';
import { PALETTES, PALETTE_TOKENS } from '@eiyu/shared';

import { Children } from 'react';
import { elementWithText, elementsOf, styleOf, textsOf, type WidgetElement } from '@/test-support/widget-tree';
import { widgetLayoutHeight, widgetRowCapacity, type ViewRow, type WidgetView } from '@/lib/widget-snapshot';
import appJson from '../../app.json';
import { barFillWidth, BOARD_URI, boardUriFor, headerShowsUpdated, renderTodayWidget, WIDGET_TOKEN_KEYS } from '../today-widget';

const TOKENS = PALETTE_TOKENS.cyan.dark;
const LOOK = { palette: 'cyan', mode: 'dark' } as const;

function row(overrides: Partial<ViewRow> = {}): ViewRow {
  return { name: 'Run', done: false, ...overrides };
}

function ready(overrides: Partial<Extract<WidgetView, { kind: 'ready' }>> = {}): WidgetView {
  return {
    kind: 'ready', completed: 3, total: 7, waiting: 0, rows: [row({ name: 'Run' }), row({ name: 'Read', done: true })], more: 0, empty: false,
    updated: '14:05', ...LOOK, ...overrides,
  };
}

function root(view: WidgetView, width = 300): WidgetElement {
  const tree = renderTodayWidget(view, width) as WidgetElement;
  return tree;
}

/** The shell's direct children: the header, the bar line, then the rows. */
function parts(tree: WidgetElement) {
  return Children.toArray(tree.props.children as never);
}
const headerOf = (tree: WidgetElement) => parts(tree)[0] as WidgetElement;
const barLineOf = (tree: WidgetElement) => parts(tree)[1] as WidgetElement;

describe('every state is one tappable widget', () => {
  it('opens the Board on the Daily lane when ready', () => {
    const tree = root(ready());
    expect(tree.type).toBe(FlexWidget);
    expect(tree.props.clickAction).toBe('OPEN_URI');
    expect(tree.props.clickActionData).toEqual({ uri: BOARD_URI });
  });

  it('opens the Board from a stale widget too', () => {
    const tree = root({ kind: 'stale', completed: 1, total: 2, updated: '14:05', ...LOOK });
    expect(tree.props.clickAction).toBe('OPEN_URI');
    expect(tree.props.clickActionData).toEqual({ uri: BOARD_URI });
  });

  it('just opens the app when signed out or not set up', () => {
    for (const view of [{ kind: 'signed-out', ...LOOK }, { kind: 'not-set-up' }] as WidgetView[]) {
      const tree = root(view);
      expect(tree.props.clickAction).toBe('OPEN_APP');
      expect(tree.props.clickActionData).toBeUndefined();
    }
  });

  it('uses a link the app really handles: its scheme, the Board route, a lane the Board knows', () => {
    const url = new URL(BOARD_URI);
    expect(url.protocol).toBe(`${appJson.expo.scheme}:`);
    expect(url.hostname + url.pathname).toBe('board');
    expect(url.searchParams.get('lane')).toBe('daily');
  });
});

describe('ready', () => {
  it('shows the TODAY count the way the Board does', () => {
    const texts = textsOf(root(ready()));
    expect(texts).toContain('TODAY');
    expect(texts).toContain('3/7');
  });

  it('lists each quest with a tick for done and a ring for open', () => {
    const tree = root(ready());
    const texts = textsOf(tree);
    expect(texts).toContain('Run');
    expect(texts).toContain('Read');
    const tick = String.fromCharCode(0x2713);
    const ring = String.fromCharCode(0x25cb);
    expect(texts.filter(text => text === tick)).toHaveLength(1);
    expect(texts.filter(text => text === ring)).toHaveLength(1);
  });

  it('puts the quantity progress next to the name', () => {
    const texts = textsOf(root(ready({ rows: [row({ name: 'Water', progressText: '2/5' })] })));
    expect(texts).toContain('Water  2/5');
  });

  it('shows the time on the right when a row has no tag', () => {
    expect(textsOf(root(ready({ rows: [row({ time: '09:30' })] })))).toContain('09:30');
  });

  it('shows the sync tag instead of the time, in words', () => {
    const texts = textsOf(root(ready({ rows: [row({ done: true, time: '09:30', tag: 'pending', tagText: 'Waiting to sync' })] })));
    expect(texts).toContain('Waiting to sync');
    expect(texts).not.toContain('09:30');
  });

  it('shows a done-but-unconfirmed quest as done and waiting, never as plainly done', () => {
    const tree = root(ready({ rows: [row({ name: 'Run', done: true, tag: 'pending', tagText: 'Waiting to sync' })] }));
    const texts = textsOf(tree);
    expect(texts).toContain(String.fromCharCode(0x2713));
    expect(texts).toContain('Waiting to sync');
  });

  it('colours a failed tag as an error, a waiting or checking tag as a warning, and a plain time as muted', () => {
    const tree = root(ready({
      rows: [
        row({ name: 'F', tag: 'failed', tagText: 'Not saved' }),
        row({ name: 'W', tag: 'pending', tagText: 'Waiting to sync' }),
        row({ name: 'C', tag: 'checking', tagText: 'Checking' }),
        row({ name: 'T', time: '09:30' }),
      ],
    }));
    expect(styleOf(elementWithText(tree, 'Not saved')).color).toBe(TOKENS.danger);
    expect(styleOf(elementWithText(tree, 'Waiting to sync')).color).toBe(TOKENS.warning);
    expect(styleOf(elementWithText(tree, 'Checking')).color).toBe(TOKENS.warning);
    expect(styleOf(elementWithText(tree, '09:30')).color).toBe(TOKENS['muted-flat']);
  });

  it('says a failed write was not saved', () => {
    expect(textsOf(root(ready({ rows: [row({ tag: 'failed', tagText: 'Not saved' })] })))).toContain('Not saved');
  });

  it('counts waiting writes in the header only when there are some', () => {
    expect(textsOf(root(ready({ waiting: 0 }))).some(text => /waiting/.test(text))).toBe(false);
    expect(textsOf(root(ready({ waiting: 2 })))).toContain('2 waiting');
  });

  it('shows how fresh it is in the header, muted, and no longer in a footer', () => {
    const tree = root(ready());
    expect(textsOf(tree)).toContain('14:05');
    expect(textsOf(tree).some(text => text.startsWith('Updated'))).toBe(false);
    expect(styleOf(elementWithText(tree, '14:05')).color).toBe(TOKENS['muted-flat']);
    expect(textsOf(headerOf(tree))).toEqual(expect.arrayContaining(['EIYU', '14:05', 'TODAY', '3/7']));
  });

  it('leaves out the update time when it is unknown', () => {
    expect(textsOf(root(ready({ updated: '' }))).some(text => /^\d\d:\d\d$/.test(text))).toBe(false);
  });

  it('says how many quests it left out on the bar line, and only when some are', () => {
    expect(textsOf(root(ready({ more: 0 }))).some(text => /more/.test(text))).toBe(false);
    const tree = root(ready({ more: 3 }));
    expect(textsOf(barLineOf(tree))).toEqual(['+3 more']);
  });

  it('shrinks the progress bar to make room for the left-out label', () => {
    const fill = (more: number) => styleOf(elementsOf(barLineOf(root(ready({ completed: 4, total: 4, more }), 300)))[2]).width as number;
    expect(fill(3)).toBeLessThan(fill(0));
    expect(fill(0)).toBe(barFillWidth(4, 4, 300 - 2 * (10 + 1)));
  });

  it('keeps the bar fill at zero for an empty day', () => {
    const tree = root(ready({ completed: 0, total: 0, rows: [], empty: true }));
    const fillBar = elementsOf(barLineOf(tree))[2];
    expect(styleOf(fillBar).width).toBe(0);
  });

  it('adds the update time to the spoken label only when it is known', () => {
    expect(root(ready()).props.accessibilityLabel as string).toContain('updated 14:05');
    expect(root(ready({ updated: '' })).props.accessibilityLabel as string).not.toMatch(/updated/);
  });

  it('says so on a day with nothing due', () => {
    expect(textsOf(root(ready({ completed: 0, total: 0, rows: [], empty: true })))).toContain('No quests due today');
  });

  it('describes the whole widget in one spoken label', () => {
    const label = root(ready({ waiting: 2 })).props.accessibilityLabel as string;
    expect(label).toContain('3 of 7');
    expect(label).toContain('2 waiting to sync');
    expect(label).toMatch(/opens? the board/i);
  });

  it('keeps the spoken label free of a waiting clause when nothing is waiting', () => {
    expect(root(ready({ waiting: 0 })).props.accessibilityLabel as string).not.toMatch(/waiting/);
  });

  it('draws with the page colour of the saved palette and mode', () => {
    const tree = root(ready({ palette: 'jade', mode: 'light' }));
    expect(styleOf(tree).backgroundColor).toBe(PALETTE_TOKENS.jade.light['page-flat']);
  });

  it('mutes a done quest and colours the tick like a success', () => {
    const tree = root(ready({ rows: [row({ name: 'Read', done: true })] }));
    expect(styleOf(elementWithText(tree, 'Read')).color).toBe(TOKENS['dim-flat']);
    expect(styleOf(elementWithText(tree, String.fromCharCode(0x2713))).color).toBe(TOKENS.success);
  });

  it('never lets a long name run into the right-hand text: the name has a fixed width and one line', () => {
    const tree = root(ready({ rows: [row({ name: 'A very long quest name that goes on', tag: 'pending', tagText: 'Waiting to sync' })] }), 250);
    const name = elementWithText(tree, 'A very long quest name that goes on');
    expect(typeof styleOf(name).width).toBe('number');
    expect(name.props.maxLines).toBe(1);
    expect(name.props.truncate).toBe('END');
    expect(styleOf(name).width as number).toBeGreaterThan(0);
  });

  it('keeps the name column positive even in a very narrow widget', () => {
    const tree = root(ready({ rows: [row({ name: 'Run', tag: 'pending', tagText: 'Waiting to sync' })] }), 40);
    expect(styleOf(elementWithText(tree, 'Run')).width as number).toBeGreaterThanOrEqual(0);
  });
});

describe('dense layout', () => {
  const rows = [row({ name: 'A' }), row({ name: 'B' }), row({ name: 'C', done: true })];

  it.each([
    [1, 18, 14, 20],
    [1.3, 23, 18, 26],
    [2, 36, 28, 40],
  ])('at font scale %s the header is %s dp, the bar line %s dp and each row %s dp', (scale, header, bar, rowHeight) => {
    const tree = renderTodayWidget(ready({ rows, more: 2 }), 300, scale) as WidgetElement;
    expect(styleOf(headerOf(tree)).height).toBe(header);
    expect(styleOf(barLineOf(tree)).height).toBe(bar);
    for (const item of parts(tree).slice(2)) expect(styleOf(item as WidgetElement).height).toBe(rowHeight);
    expect(parts(tree)).toHaveLength(2 + rows.length);
  });

  it('draws a ready widget with no footer: header, bar line, then only rows', () => {
    const tree = root(ready({ rows, more: 2 }));
    expect(parts(tree).slice(2).every(item => styleOf(item as WidgetElement).height === 20)).toBe(true);
  });

  it.each([0.85, 1, 1.15, 1.3, 1.5, 2])('never draws taller than the height it was granted, at font scale %s', scale => {
    for (const height of [110, 130, 180, 250]) {
      const granted = widgetRowCapacity(height, scale);
      const many = Array.from({ length: granted }, (_, index) => row({ name: `Q${index}` }));
      const tree = renderTodayWidget(ready({ rows: many, more: 1 }), 300, scale) as WidgetElement;
      let total = 2 * (6 + 1) + 2;
      total += styleOf(headerOf(tree)).height as number;
      total += styleOf(barLineOf(tree)).height as number;
      for (const item of parts(tree).slice(2)) total += styleOf(item as WidgetElement).height as number;
      expect(total).toBeLessThanOrEqual(Math.max(height, widgetLayoutHeight(0, scale)));
      expect(total).toBe(widgetLayoutHeight(granted, scale));
    }
  });

  it('widens the tag column with the font scale so a larger tag is not cut', () => {
    const view = ready({ rows: [row({ name: 'Run', tag: 'pending', tagText: 'Waiting to sync' })] });
    const tagWidth = (scale: number) => styleOf(elementWithText(renderTodayWidget(view, 300, scale) as WidgetElement, 'Waiting to sync')).width as number;
    expect(tagWidth(1.3)).toBeGreaterThan(tagWidth(1));
  });

  it('keeps the name column from going negative in a very narrow, large-font widget', () => {
    const view = ready({ rows: [row({ name: 'Run', tag: 'pending', tagText: 'Waiting to sync' })] });
    const tree = renderTodayWidget(view, 40, 2) as WidgetElement;
    expect(styleOf(elementWithText(tree, 'Run')).width as number).toBeGreaterThanOrEqual(0);
  });

  it('drops the header update time first when a large font would squeeze the header', () => {
    const view = ready({ waiting: 2 });
    const headerTexts = (width: number, scale: number) => textsOf(headerOf(renderTodayWidget(view, width, scale) as WidgetElement));
    expect(headerTexts(250, 1)).toContain('14:05');
    expect(headerTexts(250, 1.3)).not.toContain('14:05');
    expect(headerTexts(250, 1.3)).toContain('2 waiting');
    expect(headerTexts(400, 1.3)).toContain('14:05');
    expect(textsOf(headerOf(renderTodayWidget(ready({ waiting: 0 }), 250, 1.3) as WidgetElement))).toContain('14:05');
  });

  it('keeps the header update time decision a pure function of width, scale and waiting', () => {
    expect(headerShowsUpdated(250, 1, 2)).toBe(true);
    expect(headerShowsUpdated(250, 1.3, 2)).toBe(false);
    expect(headerShowsUpdated(250, 1.3, 0)).toBe(true);
    expect(headerShowsUpdated(40, 1, 0)).toBe(false);
    expect(headerShowsUpdated(Number.NaN, 1, 0)).toBe(false);
  });

  it('keeps every header text on one line and widens the tick box with the font scale', () => {
    const tree = renderTodayWidget(ready({ waiting: 2, rows: [row({ name: 'Run' })] }), 250, 1.3) as WidgetElement;
    for (const element of elementsOf(headerOf(tree))) {
      if (typeof element.props.text === 'string') expect(element.props.maxLines).toBe(1);
    }
    const tickWidth = (scale: number) =>
      styleOf(elementWithText(renderTodayWidget(ready({ rows: [row({ name: 'Run' })] }), 300, scale) as WidgetElement, String.fromCharCode(0x25cb))).width as number;
    expect(tickWidth(1.3)).toBeGreaterThan(tickWidth(1));
  });

  it('treats an unusable font scale as 1', () => {
    const tree = renderTodayWidget(ready({ rows, more: 2 }), 300, Number.NaN) as WidgetElement;
    expect(styleOf(headerOf(tree)).height).toBe(18);
  });

  it('puts no update time in the stale header and keeps its footer', () => {
    const tree = root({ kind: 'stale', completed: 1, total: 2, updated: '14:05', ...LOOK });
    expect(textsOf(tree).filter(text => text.includes('14:05'))).toEqual(['Last updated 14:05']);
  });
});

describe('barFillWidth', () => {
  it.each([
    [1, 4, 200, 50],
    [4, 4, 200, 200],
    [0, 4, 200, 0],
    [0, 0, 200, 0],
    [5, 4, 200, 200],
    [-1, 4, 200, 0],
    [1, 3, 100, 33],
    [1, 4, 0, 0],
    [1, 4, -20, 0],
    [Number.NaN, 4, 200, 0],
  ])('fills %s of %s in a %s dp track with %s dp', (completed, total, track, expected) => {
    expect(barFillWidth(completed, total, track)).toBe(expected);
  });
});

describe('stale', () => {
  const stale: WidgetView = { kind: 'stale', completed: 5, total: 7, updated: '14:05', ...LOOK };

  it('asks to open the app and shows no quest names or ticks', () => {
    const texts = textsOf(root(stale));
    expect(texts).toContain('Open Eiyu to load today');
    expect(texts).not.toContain(String.fromCharCode(0x2713));
    expect(texts).not.toContain(String.fromCharCode(0x25cb));
  });

  it('keeps the last count but greyed, so it is not mistaken for today', () => {
    const tree = root(stale);
    expect(styleOf(elementWithText(tree, '5/7')).color).toBe(TOKENS['dim-flat']);
  });

  it('says when it was last updated', () => {
    expect(textsOf(root(stale))).toContain('Last updated 14:05');
  });

  it('does not claim an update time it does not have', () => {
    expect(textsOf(root({ ...stale, updated: '' } as WidgetView)).some(text => text.startsWith('Last updated'))).toBe(false);
  });
});

describe('signed out and not set up', () => {
  it('asks to sign in', () => {
    expect(textsOf(root({ kind: 'signed-out', ...LOOK }))).toContain('Sign in to Eiyu');
  });

  it('asks to open the app to set up', () => {
    expect(textsOf(root({ kind: 'not-set-up' }))).toContain('Open Eiyu to set up the widget');
  });

  it('shows no quest content in either', () => {
    for (const view of [{ kind: 'signed-out', ...LOOK }, { kind: 'not-set-up' }] as WidgetView[]) {
      const texts = textsOf(root(view));
      expect(texts.some(text => /TODAY|\d\/\d/.test(text))).toBe(false);
    }
  });

  it('draws not set up in System blue, the default look', () => {
    expect(styleOf(root({ kind: 'not-set-up' })).backgroundColor).toBe(PALETTE_TOKENS.blue.dark['page-flat']);
  });
});

describe('colours the widget library accepts', () => {
  const accepted = /^(#[0-9a-fA-F]{6}|rgba\(\d+, \d+, \d+, [\d.]+\))$/;

  it.each(PALETTES.flatMap(palette => (['dark', 'light'] as const).map(mode => [palette.id, mode] as const)))(
    '%s %s tokens used by the widget are hex or rgba',
    (palette, mode) => {
      for (const key of WIDGET_TOKEN_KEYS) {
        expect(PALETTE_TOKENS[palette][mode][key]).toMatch(accepted);
      }
    },
  );

  it('every colour the drawn widget uses is one of those tokens', () => {
    const values = new Set(WIDGET_TOKEN_KEYS.map(key => TOKENS[key]));
    const tree = root(ready({ waiting: 1, rows: [row({ tag: 'pending', tagText: 'Waiting to sync', time: '09:00' }), row({ done: true })] }));
    for (const element of elementsOf(tree)) {
      const style = styleOf(element);
      for (const key of ['color', 'backgroundColor', 'borderColor'] as const) {
        if (style[key] !== undefined) expect(values.has(style[key] as string)).toBe(true);
      }
    }
  });
});

describe('the Board link follows the app that drew it', () => {
  it('builds the link from a scheme', () => {
    expect(boardUriFor('eiyusystem-preview')).toBe('eiyusystem-preview://board?lane=daily');
    expect(boardUriFor('eiyusystem')).toBe(BOARD_URI);
  });

  it.each([undefined, '', 'has space', 'UPPER', '://x', '1abc'])('falls back to the production link for %p', scheme => {
    expect(boardUriFor(scheme)).toBe(BOARD_URI);
  });

  it('opens the preview app from a ready preview widget', () => {
    const tree = root(ready({ scheme: 'eiyusystem-preview' }));
    expect(tree.props.clickActionData).toEqual({ uri: 'eiyusystem-preview://board?lane=daily' });
  });

  it('opens the preview app from a stale preview widget', () => {
    const tree = root({ kind: 'stale', completed: 1, total: 2, updated: '14:05', scheme: 'eiyusystem-dev', ...LOOK });
    expect(tree.props.clickActionData).toEqual({ uri: 'eiyusystem-dev://board?lane=daily' });
  });

  it('keeps the production link when the view has no scheme', () => {
    expect(root(ready()).props.clickActionData).toEqual({ uri: BOARD_URI });
  });
});
