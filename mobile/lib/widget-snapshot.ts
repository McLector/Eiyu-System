import {
  accountDateKey,
  boardTodayProgress,
  parsePalette,
  parseThemeMode,
  partitionBoardQuests,
  type Palette,
  type Quest,
  type ThemeMode,
} from '@eiyu/shared';

import { applyOverlay, SYNC_TAG_TEXT, type QueueEntry, type SyncState } from './write-queue';

/**
 * The home-screen widget's model: plain data and pure functions, no React, no storage and no network. The app writes a
 * snapshot (see use-widget-snapshot.ts); the widget's task handler reads it and asks `widgetView` what to draw. The
 * handler runs headless on a schedule, so everything it imports must stay free of the Supabase client and the stores.
 *
 * A snapshot is stamped with the day its board belongs to, in the account's time zone. The widget compares that to the
 * account's current day every time it draws, so a board that is not from today is never shown as today's.
 */

export const WIDGET_KEY = 'eiyu.widget.v1';
export const MAX_ROWS = 30;
export const MAX_NAME_LENGTH = 80;

const SNAPSHOT_VERSION = 1;
const ELLIPSIS = String.fromCharCode(0x2026);
const TAGS: readonly SyncState[] = ['pending', 'checking', 'failed'];
const TAG_RANK: Record<SyncState, number> = { pending: 0, checking: 1, failed: 2 };

/** Dp the widget spends on padding, the header and the footer; the rest holds rows. */
const CHROME_DP = 68;
const ROW_DP = 22;

export interface WidgetRow {
  name: string;
  done: boolean;
  progress?: { count: number; target: number };
  time?: string;
  tag?: SyncState;
}

interface SnapshotBase {
  v: 1;
  writtenAt: number;
  palette: Palette;
  mode: ThemeMode;
}

export interface ReadySnapshot extends SnapshotBase {
  state: 'ready';
  /** The account-zone day the cached board belongs to, which is not necessarily today. */
  accountDate: string;
  timeZone: string;
  completed: number;
  total: number;
  /** Writes made on this board that the server has not confirmed. */
  waiting: number;
  rows: WidgetRow[];
}

export interface SignedOutSnapshot extends SnapshotBase {
  state: 'signed-out';
}

export type WidgetSnapshot = ReadySnapshot | SignedOutSnapshot;

export interface BuildInput {
  /** The server's board as cached, without the user's unsent writes laid on it. */
  cachedQuests: Quest[];
  entries: readonly QueueEntry[];
  /** The account-zone day the cached board belongs to (see `dataDateOf`). */
  dataDate: string;
  timeZone: string;
  palette: Palette;
  mode: ThemeMode;
  now: number;
}

/** The account-zone day of the moment a board was fetched, never the phone's own zone. */
export function dataDateOf(fetchedAt: number, timeZone: string): string {
  return accountDateKey(new Date(fetchedAt), timeZone);
}

function shorten(name: string): string {
  const chars = Array.from(name);
  return chars.length <= MAX_NAME_LENGTH ? name : chars.slice(0, MAX_NAME_LENGTH - 1).join('') + ELLIPSIS;
}

/**
 * Tags per quest, and how many writes are unconfirmed. Stricter than the Board's `syncStateByHabit`, which keeps a quiet
 * tap quiet while the app is open: a snapshot outlives the app, so any write that has not been confirmed says so.
 */
function readSync(entries: readonly QueueEntry[], dataDate: string): { tags: Map<string, SyncState>; waiting: number } {
  const tags = new Map<string, SyncState>();
  let waiting = 0;
  for (const entry of entries) {
    let tag: SyncState;
    if (entry.status === 'failed') {
      tag = 'failed';
    } else if (entry.accountDate === dataDate || entry.kind === 'recovery') {
      tag = entry.status === 'uncertain' ? 'checking' : 'pending';
      waiting += 1;
    } else {
      continue;
    }
    const current = tags.get(entry.habitId);
    if (current === undefined || TAG_RANK[tag] > TAG_RANK[current]) tags.set(entry.habitId, tag);
  }
  return { tags, waiting };
}

export function buildWidgetSnapshot(input: BuildInput): ReadySnapshot {
  const board = applyOverlay(input.cachedQuests, input.entries, input.dataDate);
  const sections = partitionBoardQuests(board);
  const { completed, total } = boardTodayProgress(sections);
  const unique = [...new Map([...sections.dailyQuests, ...sections.oneTimeQuests].map(quest => [quest.id, quest])).values()];
  const ordered = [...unique.filter(quest => !quest.completed), ...unique.filter(quest => quest.completed)];
  const { tags, waiting } = readSync(input.entries, input.dataDate);

  const rows = ordered.slice(0, MAX_ROWS).map((quest): WidgetRow => {
    const row: WidgetRow = { name: shorten(quest.name), done: quest.completed };
    if (quest.targetCount != null) row.progress = { count: quest.progressCount, target: quest.targetCount };
    if (quest.timeSet !== false && quest.time) row.time = quest.time;
    const tag = tags.get(quest.id);
    if (tag) row.tag = tag;
    return row;
  });

  return {
    v: SNAPSHOT_VERSION,
    state: 'ready',
    accountDate: input.dataDate,
    timeZone: input.timeZone,
    writtenAt: input.now,
    completed,
    total,
    waiting,
    rows,
    palette: input.palette,
    mode: input.mode,
  };
}

export function buildSignedOutSnapshot(input: { palette: Palette; mode: ThemeMode; now: number }): SignedOutSnapshot {
  return { v: SNAPSHOT_VERSION, state: 'signed-out', palette: input.palette, mode: input.mode, writtenAt: input.now };
}

export function encodeSnapshot(snapshot: WidgetSnapshot): string {
  return JSON.stringify(snapshot);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function decodeRow(value: unknown): WidgetRow | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== 'string' || typeof raw.done !== 'boolean') return null;
  const row: WidgetRow = { name: raw.name, done: raw.done };
  const progress = raw.progress as Record<string, unknown> | undefined;
  if (progress && isCount(progress.count) && isCount(progress.target)) row.progress = { count: progress.count, target: progress.target };
  if (typeof raw.time === 'string') row.time = raw.time;
  if (typeof raw.tag === 'string' && (TAGS as readonly string[]).includes(raw.tag)) row.tag = raw.tag as SyncState;
  return row;
}

/** The stored snapshot, or null when it is missing, unreadable, from another version or malformed. */
export function decodeSnapshot(raw: string | null): WidgetSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (value.v !== SNAPSHOT_VERSION) return null;
  if (typeof value.writtenAt !== 'number' || !Number.isFinite(value.writtenAt)) return null;
  const base = { v: SNAPSHOT_VERSION as 1, writtenAt: value.writtenAt, palette: parsePalette(value.palette), mode: parseThemeMode(value.mode) };

  if (value.state === 'signed-out') return { ...base, state: 'signed-out' };
  if (value.state !== 'ready') return null;
  if (typeof value.accountDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.accountDate)) return null;
  if (typeof value.timeZone !== 'string' || value.timeZone === '') return null;
  if (!isCount(value.completed) || !isCount(value.total) || !isCount(value.waiting)) return null;
  if (!Array.isArray(value.rows)) return null;
  const rows: WidgetRow[] = [];
  for (const item of value.rows) {
    const row = decodeRow(item);
    if (!row) return null;
    rows.push(row);
  }
  return { ...base, state: 'ready', accountDate: value.accountDate, timeZone: value.timeZone, completed: value.completed, total: value.total, waiting: value.waiting, rows };
}

/** How many rows fit a widget this tall. The widget is resizable, so the handler passes its current height. */
export function widgetRowCapacity(heightDp: number): number {
  if (!Number.isFinite(heightDp)) return 0;
  return Math.max(0, Math.floor((heightDp - CHROME_DP) / ROW_DP));
}

export interface ViewRow {
  name: string;
  done: boolean;
  time?: string;
  progressText?: string;
  tag?: SyncState;
  tagText?: string;
}

export type WidgetView =
  | { kind: 'not-set-up' }
  | { kind: 'signed-out'; palette: Palette; mode: ThemeMode }
  | { kind: 'stale'; completed: number; total: number; updated: string; palette: Palette; mode: ThemeMode }
  | {
      kind: 'ready';
      completed: number;
      total: number;
      waiting: number;
      rows: ViewRow[];
      /** Quests due today that do not fit and are left out. */
      more: number;
      empty: boolean;
      updated: string;
      palette: Palette;
      mode: ThemeMode;
    };

/** HH:MM in the account zone, or an empty string when the moment or zone cannot be formatted. */
function clockTime(at: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    return part('hour') && part('minute') ? `${part('hour')}:${part('minute')}` : '';
  } catch {
    return '';
  }
}

/** What the widget draws for a stored snapshot at this moment and height. */
export function widgetView(snapshot: WidgetSnapshot | null, now: Date, heightDp: number): WidgetView {
  if (!snapshot) return { kind: 'not-set-up' };
  if (snapshot.state === 'signed-out') return { kind: 'signed-out', palette: snapshot.palette, mode: snapshot.mode };

  let today: string;
  try {
    today = accountDateKey(now, snapshot.timeZone);
  } catch {
    return { kind: 'not-set-up' };
  }
  const updated = clockTime(snapshot.writtenAt, snapshot.timeZone);
  const look = { palette: snapshot.palette, mode: snapshot.mode };
  if (snapshot.accountDate !== today) {
    return { kind: 'stale', completed: snapshot.completed, total: snapshot.total, updated, ...look };
  }

  const shown = snapshot.rows.slice(0, widgetRowCapacity(heightDp)).map((row): ViewRow => {
    const view: ViewRow = { name: row.name, done: row.done };
    if (row.time) view.time = row.time;
    if (row.progress) view.progressText = `${row.progress.count}/${row.progress.target}`;
    if (row.tag) {
      view.tag = row.tag;
      view.tagText = SYNC_TAG_TEXT[row.tag];
    }
    return view;
  });
  return {
    kind: 'ready',
    completed: snapshot.completed,
    total: snapshot.total,
    waiting: snapshot.waiting,
    rows: shown,
    more: Math.max(0, snapshot.total - shown.length),
    empty: snapshot.total === 0,
    updated,
    ...look,
  };
}
