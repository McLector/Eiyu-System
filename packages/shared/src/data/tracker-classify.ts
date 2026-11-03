import { fetchTrackerTargets } from './tracker-access';

/**
 * Attaches the server's input kind and write permission to view models. Reading is never gated on this: when the
 * classification cannot be read or is incomplete, items stay unclassified (callers treat that as custom and read-only),
 * and nothing is ever defaulted to basic.
 */
export async function withTrackerClassification<T extends { id: string }>(
  kind: 'habit' | 'chain',
  items: T[],
  ownerId: string
): Promise<(T & { inputKind?: 'basic' | 'custom'; canWrite?: boolean })[]> {
  if (items.length === 0) return items;
  try {
    const targets = await fetchTrackerTargets(kind, items.map(item => item.id), ownerId);
    const byId = new Map(targets.map(target => [target.id, target]));
    return items.map(item => {
      const target = byId.get(item.id);
      return target ? { ...item, inputKind: target.inputKind, canWrite: target.canWrite } : item;
    });
  } catch {
    return items;
  }
}
