import { FlexWidget } from 'react-native-android-widget';
import { PALETTES, PALETTE_TOKENS } from '@eiyu/shared';

import { elementWithText, elementsOf, styleOf, textsOf, type WidgetElement } from '@/test-support/widget-tree';
import type { ViewRow, WidgetView } from '@/lib/widget-snapshot';
import appJson from '../../app.json';
import { barFillWidth, BOARD_URI, renderTodayWidget, WIDGET_TOKEN_KEYS } from '../today-widget';

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

  it('says how fresh it is and how many quests it left out', () => {
    expect(textsOf(root(ready({ more: 0 })))).toContain('Updated 14:05');
    expect(textsOf(root(ready({ more: 3 })))).toContain('Updated 14:05  +3 more');
  });

  it('leaves out the update time when it is unknown', () => {
    const texts = textsOf(root(ready({ updated: '' })));
    expect(texts.some(text => text.startsWith('Updated'))).toBe(false);
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

  it('draws not set up in the default look', () => {
    expect(styleOf(root({ kind: 'not-set-up' })).backgroundColor).toBe(PALETTE_TOKENS.cyan.dark['page-flat']);
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
