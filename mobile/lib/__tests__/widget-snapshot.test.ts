import { boardTodayProgress, partitionBoardQuests, type Quest } from '@eiyu/shared';

import { syncStateByHabit, SYNC_TAG_TEXT, type QueueEntry } from '../write-queue';
import {
  buildSignedOutSnapshot,
  buildWidgetSnapshot,
  dataDateOf,
  decodeSnapshot,
  encodeSnapshot,
  MAX_NAME_LENGTH,
  MAX_ROWS,
  widgetRowCapacity,
  widgetView,
  WIDGET_KEY,
  type ReadySnapshot,
  type WidgetSnapshot,
} from '../widget-snapshot';

const ZONE = 'Asia/Manila';
const TODAY = '2026-10-05';
const ELLIPSIS = String.fromCharCode(0x2026);

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'h1', name: 'Run', stat: 'STR', difficulty: 'Easy', easyVersion: null, description: null,
    questType: 'habit', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false,
    dailyEligible: true, completed: false, targetCount: null, progressCount: 0, ...overrides,
  } as Quest;
}

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'e1', userId: 'user-1', kind: 'complete', habitId: 'h1', accountDate: TODAY,
    createdAt: 1000, attempts: 0, status: 'pending', ...overrides,
  };
}

function build(quests: Quest[], entries: QueueEntry[] = [], overrides: Partial<Parameters<typeof buildWidgetSnapshot>[0]> = {}): ReadySnapshot {
  return buildWidgetSnapshot({
    cachedQuests: quests, entries, dataDate: TODAY, timeZone: ZONE, palette: 'cyan', mode: 'dark', now: 1_000_000, ...overrides,
  });
}

describe('widget key', () => {
  it('is versioned so a future shape can change without reading old data', () => {
    expect(WIDGET_KEY).toBe('eiyu.widget.v1');
  });
});

describe('SYNC_TAG_TEXT', () => {
  it('uses the words the Board shows', () => {
    expect(SYNC_TAG_TEXT).toEqual({ pending: 'Waiting to sync', checking: 'Checking', failed: 'Not saved' });
  });
});

describe('dataDateOf', () => {
  it('is the account-zone day of the moment the board was fetched', () => {
    expect(dataDateOf(Date.parse('2026-10-05T15:59:59Z'), ZONE)).toBe('2026-10-05');
    expect(dataDateOf(Date.parse('2026-10-05T16:00:00Z'), ZONE)).toBe('2026-10-06');
  });

  it('ignores the device zone: the same instant is a different day in another account zone', () => {
    const instant = Date.parse('2026-10-05T20:00:00Z');
    expect(dataDateOf(instant, 'Asia/Manila')).toBe('2026-10-06');
    expect(dataDateOf(instant, 'America/New_York')).toBe('2026-10-05');
  });
});

describe('buildWidgetSnapshot counts and rows', () => {
  it('counts exactly what the Board TODAY strip counts', () => {
    const quests = [
      quest({ id: 'd1', name: 'Daily done', completed: true }),
      quest({ id: 'd2', name: 'Daily open' }),
      quest({ id: 'o1', name: 'One-time done', questType: 'one_time', completed: true }),
      quest({ id: 'b1', name: 'Backlog idea', questType: 'backlog' }),
      quest({ id: 'a1', name: 'Archived', archived: true }),
      quest({ id: 'f1', name: 'Recovery only', frozen: true, dailyEligible: false }),
    ];
    const expected = boardTodayProgress(partitionBoardQuests(quests));
    const snapshot = build(quests);
    expect(snapshot.completed).toBe(expected.completed);
    expect(snapshot.total).toBe(expected.total);
    expect(snapshot.total).toBe(3);
    expect(snapshot.rows.map(row => row.name)).toEqual(['Daily open', 'Daily done', 'One-time done']);
  });

  it('lists open quests before done ones, daily before one-time within each', () => {
    const snapshot = build([
      quest({ id: 'd1', name: 'D done', completed: true }),
      quest({ id: 'o1', name: 'O open', questType: 'one_time' }),
      quest({ id: 'd2', name: 'D open' }),
    ]);
    expect(snapshot.rows.map(row => row.name)).toEqual(['D open', 'O open', 'D done']);
    expect(snapshot.rows.map(row => row.done)).toEqual([false, false, true]);
  });

  it('carries the progress of a quantity quest and nothing for a plain one', () => {
    const snapshot = build([quest({ id: 'q', name: 'Water', targetCount: 5, progressCount: 2 }), quest({ id: 'p', name: 'Plain' })]);
    expect(snapshot.rows.find(row => row.name === 'Water')?.progress).toEqual({ count: 2, target: 5 });
    expect(snapshot.rows.find(row => row.name === 'Plain')?.progress).toBeUndefined();
  });

  it('shows the time unless the quest has none set', () => {
    const snapshot = build([
      quest({ id: 'a', name: 'Timed', time: '09:30' }),
      quest({ id: 'b', name: 'Untimed', questType: 'one_time', timeSet: false, time: '00:00' }),
    ]);
    expect(snapshot.rows.find(row => row.name === 'Timed')?.time).toBe('09:30');
    expect(snapshot.rows.find(row => row.name === 'Untimed')?.time).toBeUndefined();
  });

  it('is empty and 0/0 on a day with nothing due', () => {
    const snapshot = build([]);
    expect(snapshot).toMatchObject({ state: 'ready', completed: 0, total: 0, waiting: 0, rows: [] });
  });

  it('keeps the true total but caps the stored rows', () => {
    const many = Array.from({ length: MAX_ROWS + 10 }, (_, index) => quest({ id: `h${index}`, name: `Quest ${index}` }));
    const snapshot = build(many);
    expect(snapshot.total).toBe(MAX_ROWS + 10);
    expect(snapshot.rows).toHaveLength(MAX_ROWS);
  });

  it('shortens a very long name to the limit with an ellipsis', () => {
    const snapshot = build([quest({ name: 'x'.repeat(500) })]);
    const name = snapshot.rows[0].name;
    expect(name).toHaveLength(MAX_NAME_LENGTH);
    expect(name.endsWith(ELLIPSIS)).toBe(true);
    expect(name.slice(0, MAX_NAME_LENGTH - 1)).toBe('x'.repeat(MAX_NAME_LENGTH - 1));
  });

  it('never cuts a name in the middle of a character', () => {
    const name = build([quest({ name: String.fromCodePoint(0x1f600).repeat(200) })]).rows[0].name;
    expect(() => encodeURIComponent(name)).not.toThrow();
    expect(Array.from(name)).toHaveLength(MAX_NAME_LENGTH);
  });

  it('leaves a name at the limit untouched', () => {
    const exact = 'y'.repeat(MAX_NAME_LENGTH);
    expect(build([quest({ name: exact })]).rows[0].name).toBe(exact);
  });

  it('records the day the board belongs to, the account zone, the look and the write time', () => {
    const snapshot = build([], [], { dataDate: '2026-10-04', timeZone: 'America/New_York', palette: 'jade', mode: 'light', now: 42 });
    expect(snapshot).toMatchObject({ v: 1, state: 'ready', accountDate: '2026-10-04', timeZone: 'America/New_York', palette: 'jade', mode: 'light', writtenAt: 42 });
  });

  it('does not change the quests or entries it is given', () => {
    const quests = [quest()];
    const entries = [entry()];
    const before = JSON.stringify([quests, entries]);
    build(quests, entries);
    expect(JSON.stringify([quests, entries])).toBe(before);
  });
});

describe('buildWidgetSnapshot sync honesty', () => {
  it('shows a queued completion as done, tagged waiting, and counts it in the header', () => {
    const snapshot = build([quest()], [entry({ kind: 'complete', status: 'pending', attempts: 1 })]);
    expect(snapshot.rows[0]).toMatchObject({ name: 'Run', done: true, tag: 'pending' });
    expect(snapshot.completed).toBe(1);
    expect(snapshot.waiting).toBe(1);
  });

  it('tags a write that is quietly in flight online, which the Board deliberately does not', () => {
    const inFlight = entry({ kind: 'complete', status: 'sending', attempts: 0 });
    expect(syncStateByHabit([inFlight], false).get('h1')).toBeUndefined();
    const snapshot = build([quest()], [inFlight]);
    expect(snapshot.rows[0]).toMatchObject({ done: true, tag: 'pending' });
    expect(snapshot.waiting).toBe(1);
  });

  it('tags a brand new pending write too', () => {
    const snapshot = build([quest()], [entry({ status: 'pending', attempts: 0 })]);
    expect(snapshot.rows[0].tag).toBe('pending');
  });

  it('tags an uncertain write as checking and counts it as waiting', () => {
    const snapshot = build([quest()], [entry({ status: 'uncertain', attempts: 1 })]);
    expect(snapshot.rows[0]).toMatchObject({ done: true, tag: 'checking' });
    expect(snapshot.waiting).toBe(1);
  });

  it('shows a failed write as not saved with the server state, and does not count it as waiting', () => {
    const failed = entry({ status: 'failed', failure: { reason: 'server', message: 'Not saved: the server refused this update.' } });
    const snapshot = build([quest({ completed: false })], [failed]);
    expect(snapshot.rows[0]).toMatchObject({ done: false, tag: 'failed' });
    expect(snapshot.completed).toBe(0);
    expect(snapshot.waiting).toBe(0);
  });

  it('applies a queued progress change and tags the row', () => {
    const snapshot = build([quest({ targetCount: 5, progressCount: 1 })], [entry({ kind: 'progress', delta: 2, base: 1 })]);
    expect(snapshot.rows[0]).toMatchObject({ progress: { count: 3, target: 5 }, done: false, tag: 'pending' });
  });

  it('ignores an unsent write from another day: it is not part of this board', () => {
    const snapshot = build([quest()], [entry({ accountDate: '2026-10-04', status: 'pending' })]);
    expect(snapshot.rows[0]).toMatchObject({ done: false });
    expect(snapshot.rows[0].tag).toBeUndefined();
    expect(snapshot.waiting).toBe(0);
  });

  it('still flags a failed write from another day on its row, like the Board', () => {
    const snapshot = build([quest()], [entry({ accountDate: '2026-10-04', status: 'failed', failure: { reason: 'day-passed', message: 'x' } })]);
    expect(snapshot.rows[0].tag).toBe('failed');
  });

  it('counts an unsent recovery as waiting even though it has no row of its own', () => {
    const snapshot = build([quest({ id: 'f', frozen: true, dailyEligible: false })], [entry({ kind: 'recovery', habitId: 'f', accountDate: '2026-10-01' })]);
    expect(snapshot.waiting).toBe(1);
    expect(snapshot.rows).toEqual([]);
  });

  it('shows the most serious tag when one quest has several writes: failed, then checking, then waiting', () => {
    const both = build([quest()], [
      entry({ id: 'a', status: 'pending', createdAt: 1 }),
      entry({ id: 'b', status: 'uncertain', createdAt: 2 }),
    ]);
    expect(both.rows[0].tag).toBe('checking');
    const withFailure = build([quest()], [
      entry({ id: 'a', status: 'uncertain', createdAt: 1 }),
      entry({ id: 'b', status: 'failed', createdAt: 2, failure: { reason: 'server', message: 'x' } }),
    ]);
    expect(withFailure.rows[0].tag).toBe('failed');
  });

  it('counts every unconfirmed write, not every row', () => {
    const snapshot = build([quest({ id: 'a' }), quest({ id: 'b', name: 'Two' })], [
      entry({ id: '1', habitId: 'a' }),
      entry({ id: '2', habitId: 'b', status: 'uncertain' }),
      entry({ id: '3', habitId: 'b', kind: 'undo', createdAt: 2000 }),
    ]);
    expect(snapshot.waiting).toBe(3);
  });
});

describe('what is stored', () => {
  it('holds no user id, quest id or other identifier', () => {
    const encoded = encodeSnapshot(build([quest({ id: 'secret-habit-id' })], [entry({ userId: 'secret-user-id', habitId: 'secret-habit-id' })]));
    expect(encoded).not.toContain('secret-user-id');
    expect(encoded).not.toContain('secret-habit-id');
  });

  it('a signed-out snapshot holds no quests at all', () => {
    const snapshot = buildSignedOutSnapshot({ palette: 'violet', mode: 'light', now: 7 });
    expect(snapshot).toEqual({ v: 1, state: 'signed-out', palette: 'violet', mode: 'light', writtenAt: 7 });
  });
});

describe('encode and decode', () => {
  it('round-trips a ready snapshot', () => {
    const snapshot = build([quest({ targetCount: 3, progressCount: 1 })], [entry({ status: 'uncertain' })]);
    expect(decodeSnapshot(encodeSnapshot(snapshot))).toEqual(snapshot);
  });

  it('round-trips a signed-out snapshot', () => {
    const snapshot = buildSignedOutSnapshot({ palette: 'cyan', mode: 'dark', now: 1 });
    expect(decodeSnapshot(encodeSnapshot(snapshot))).toEqual(snapshot);
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['not json', 'not json {'],
    ['json null', 'null'],
    ['a number', '5'],
    ['an array', '[]'],
    ['empty object', '{}'],
    ['a future version', JSON.stringify({ ...build([]), v: 2 })],
    ['an unknown state', JSON.stringify({ ...build([]), state: 'sleeping' })],
    ['rows missing', JSON.stringify({ ...build([]), rows: undefined })],
    ['rows not an array', JSON.stringify({ ...build([]), rows: 'x' })],
    ['a row without a name', JSON.stringify({ ...build([]), rows: [{ done: true }] })],
    ['a row with a non-boolean done', JSON.stringify({ ...build([]), rows: [{ name: 'a', done: 'yes' }] })],
    ['a bad count', JSON.stringify({ ...build([]), completed: 'three' })],
    ['a negative total', JSON.stringify({ ...build([]), total: -1 })],
    ['a missing date', JSON.stringify({ ...build([]), accountDate: undefined })],
    ['a malformed date', JSON.stringify({ ...build([]), accountDate: 'yesterday' })],
    ['a missing zone', JSON.stringify({ ...build([]), timeZone: undefined })],
    ['a non-numeric write time', JSON.stringify({ ...build([]), writtenAt: 'now' })],
  ])('treats %s as not set up', (_name, raw) => {
    expect(decodeSnapshot(raw)).toBeNull();
  });

  it('falls back to the default look for an unknown palette or mode instead of failing', () => {
    const decoded = decodeSnapshot(JSON.stringify({ ...build([]), palette: 'neon', mode: 'sepia' })) as ReadySnapshot;
    expect(decoded.palette).toBe('cyan');
    expect(decoded.mode).toBe('dark');
  });

  it('drops a row tag it does not know rather than showing it', () => {
    const raw = JSON.stringify({ ...build([]), rows: [{ name: 'a', done: false, tag: 'exploded' }] });
    expect((decodeSnapshot(raw) as ReadySnapshot).rows[0].tag).toBeUndefined();
  });
});

describe('widgetRowCapacity', () => {
  it.each([
    [110, 1],
    [90, 1],
    [89, 0],
    [68, 0],
    [67, 0],
    [200, 6],
    [0, 0],
    [-10, 0],
    [Number.NaN, 0],
  ])('fits %s dp of widget height to %s rows', (height, rows) => {
    expect(widgetRowCapacity(height)).toBe(rows);
  });
});

describe('widgetView', () => {
  const now = new Date('2026-10-05T06:30:00Z');

  function ready(overrides: Partial<ReadySnapshot> = {}): ReadySnapshot {
    return { ...build([quest({ id: 'a', name: 'One' }), quest({ id: 'b', name: 'Two', completed: true })]), writtenAt: Date.parse('2026-10-05T06:05:00Z'), ...overrides };
  }

  it('is not set up when there is no snapshot', () => {
    expect(widgetView(null, now, 200)).toEqual({ kind: 'not-set-up' });
  });

  it('asks to sign in when the app signed out', () => {
    const snapshot: WidgetSnapshot = buildSignedOutSnapshot({ palette: 'cyan', mode: 'dark', now: 1 });
    expect(widgetView(snapshot, now, 200)).toMatchObject({ kind: 'signed-out', palette: 'cyan', mode: 'dark' });
  });

  it('shows the board when the snapshot is for today in its own zone', () => {
    const view = widgetView(ready(), now, 200);
    expect(view).toMatchObject({ kind: 'ready', completed: 1, total: 2, waiting: 0, more: 0, empty: false });
    if (view.kind !== 'ready') throw new Error('expected ready');
    expect(view.rows.map(row => row.name)).toEqual(['One', 'Two']);
  });

  it('shows the update time in the account zone', () => {
    const view = widgetView(ready(), now, 200);
    expect(view).toMatchObject({ updated: '14:05' });
  });

  it('maps a row tag to the Board wording', () => {
    const snapshot = ready({ rows: [{ name: 'A', done: true, tag: 'pending' }, { name: 'B', done: true, tag: 'checking' }, { name: 'C', done: false, tag: 'failed' }] });
    const view = widgetView(snapshot, now, 300);
    if (view.kind !== 'ready') throw new Error('expected ready');
    expect(view.rows.map(row => row.tagText)).toEqual(['Waiting to sync', 'Checking', 'Not saved']);
  });

  it('formats progress as count/target', () => {
    const snapshot = ready({ rows: [{ name: 'Water', done: false, progress: { count: 2, target: 5 } }] });
    const view = widgetView(snapshot, now, 300);
    if (view.kind !== 'ready') throw new Error('expected ready');
    expect(view.rows[0].progressText).toBe('2/5');
  });

  it('flags an empty day', () => {
    const view = widgetView(ready({ rows: [], completed: 0, total: 0 }), now, 200);
    expect(view).toMatchObject({ kind: 'ready', empty: true });
  });

  it('shows only the rows that fit and reports how many are left out', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({ name: `Q${index}`, done: false }));
    const view = widgetView(ready({ rows, total: 10, completed: 0 }), now, 110);
    if (view.kind !== 'ready') throw new Error('expected ready');
    expect(view.rows).toHaveLength(1);
    expect(view.more).toBe(9);
  });

  it('shows just the header when there is no room for rows', () => {
    const rows = [{ name: 'Q', done: false }];
    const view = widgetView(ready({ rows, total: 1, completed: 0 }), now, 60);
    if (view.kind !== 'ready') throw new Error('expected ready');
    expect(view.rows).toEqual([]);
    expect(view.more).toBe(1);
  });

  it('counts rows that were cut at storage time as left out as well', () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({ name: `Q${index}`, done: false }));
    const view = widgetView(ready({ rows, total: 50, completed: 0 }), now, 300);
    if (view.kind !== 'ready') throw new Error('expected ready');
    expect(view.rows).toHaveLength(3);
    expect(view.more).toBe(47);
  });

  describe('a snapshot from another day', () => {
    it('is stale from the first moment of the next account day', () => {
      const snapshot = ready({ accountDate: '2026-10-05', timeZone: ZONE });
      expect(widgetView(snapshot, new Date('2026-10-05T15:59:59Z'), 200).kind).toBe('ready');
      expect(widgetView(snapshot, new Date('2026-10-05T16:00:00Z'), 200).kind).toBe('stale');
    });

    it('judges the day in the snapshot zone, not the phone zone', () => {
      const instant = new Date('2026-10-05T20:00:00Z');
      expect(widgetView(ready({ accountDate: '2026-10-05', timeZone: 'America/New_York' }), instant, 200).kind).toBe('ready');
      expect(widgetView(ready({ accountDate: '2026-10-05', timeZone: 'Asia/Manila' }), instant, 200).kind).toBe('stale');
    });

    it('keeps the last count but shows no rows and no ticks', () => {
      const view = widgetView(ready({ accountDate: '2026-10-04' }), now, 200);
      expect(view).toMatchObject({ kind: 'stale', completed: 1, total: 2 });
      expect(view).not.toHaveProperty('rows');
    });

    it('is stale when the snapshot claims a day that has not arrived yet', () => {
      expect(widgetView(ready({ accountDate: '2026-10-07' }), now, 200).kind).toBe('stale');
    });
  });

  it('is not set up when the stored zone is not a real zone', () => {
    expect(widgetView(ready({ timeZone: 'Not/AZone' }), now, 200)).toEqual({ kind: 'not-set-up' });
  });
});
