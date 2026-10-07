import { LongQuest } from '../types/eiyu';

/**
 * Manual order (migration 044). Every reorderable row carries a stored `position`; the clients sort by it and keep
 * finished rows at the bottom. Until a database has the column (or while any row lacks a value) they fall back to
 * the automatic order, so these helpers only act on a list where every row has one.
 */
export interface Positioned {
  id: string;
  position?: number;
}

export type MoveTarget = 'top' | 'up' | 'down' | { before: string } | { after: string };

export interface ReorderState {
  index: number;
  count: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

/** True when the list is non-empty and every row has a real position. */
export function hasManualOrder(rows: readonly Positioned[]): boolean {
  return rows.length > 0 && rows.every(row => typeof row.position === 'number' && Number.isFinite(row.position));
}

function comparePosition(a: Positioned, b: Positioned): number {
  return (a.position ?? 0) - (b.position ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** A copy sorted by position, ties broken by id (the same rule the server uses). */
export function byPosition<T extends Positioned>(rows: readonly T[]): T[] {
  return [...rows].sort(comparePosition);
}

/** The ids in their new order after one move. An unknown id or target leaves the order as it was. */
export function moveId(ids: readonly string[], id: string, to: MoveTarget): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const rest = ids.filter(other => other !== id);
  let at: number;
  if (to === 'top') at = 0;
  else if (to === 'up') at = Math.max(0, from - 1);
  else if (to === 'down') at = Math.min(rest.length, from + 1);
  else {
    const anchor = 'before' in to ? to.before : to.after;
    const target = rest.indexOf(anchor);
    if (target < 0 || anchor === id) return [...ids];
    at = 'before' in to ? target : target + 1;
  }
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Where a row sits among the ids that can be moved (unfinished rows), and which moves make sense. */
export function reorderState(movableIds: readonly string[], id: string): ReorderState | null {
  const index = movableIds.indexOf(id);
  if (index < 0) return null;
  return { index, count: movableIds.length, canMoveUp: index > 0, canMoveDown: index < movableIds.length - 1 };
}

/**
 * The optimistic mirror of the server's reorder: the given ids fill, in order, the slots those ids already hold, so a
 * row that is not given keeps its place. Positions are renumbered 0..n-1. Rows are returned in the new order.
 */
export function applyManualOrder<T extends Positioned>(rows: readonly T[], orderedIds: readonly string[]): T[] {
  if (!hasManualOrder(rows)) return [...rows];
  const sorted = byPosition(rows);
  const known = new Set(sorted.map(row => row.id));
  const given = orderedIds.filter(id => known.has(id));
  const byId = new Map(sorted.map(row => [row.id, row] as const));
  const givenSet = new Set(given);
  let next = 0;
  return sorted.map((row, index) => {
    const placed = givenSet.has(row.id) ? byId.get(given[next++])! : row;
    return { ...placed, position: index };
  });
}

/** A chain with stages, all done. Reads the stages, not `completedAt`, which stays set after an undo. */
export function isChainFinished(chain: Pick<LongQuest, 'stages'>): boolean {
  return chain.stages.length > 0 && chain.stages.every(stage => stage.done);
}

/**
 * The Chain list order: manual order with finished chains at the bottom. Without positions the fetched order is
 * kept as it was (nothing sinks), so a database from before 044 looks exactly as before.
 */
export function sortChains(chains: readonly LongQuest[]): LongQuest[] {
  if (!hasManualOrder(chains)) return [...chains];
  const sorted = byPosition(chains);
  return [...sorted.filter(chain => !isChainFinished(chain)), ...sorted.filter(isChainFinished)];
}

export const REORDER_COPY = {
  moveTop: 'Move to top',
  moveUp: 'Move up',
  moveDown: 'Move down',
  grip: (name: string) => `Reorder ${name}`,
  moveTopFor: (name: string) => `Move ${name} to top`,
  moveUpFor: (name: string) => `Move ${name} up`,
  moveDownFor: (name: string) => `Move ${name} down`,
  failed: 'Could not save the new order. It has been put back.',
} as const;
