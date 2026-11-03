import type {CacheAdapter} from './adapter';

export type SuggestionRetirementStatus = 'running' | 'complete' | 'failed';

/** Only schemas actually written by older clients; similar/future keys stay untouched. */
export function isRetiredSuggestionKey(key: string): boolean {
  if (key === 'eiyu:ai-suggestions') return true;
  const match = /^eiyu:ai-suggestions:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}):(0|[1-9][0-9]*)$/.exec(key);
  return !!match && match[0] === key && Number.isSafeInteger(Number(match[2]));
}

/** Bound to one adapter instance, so replaced adapters cannot publish stale status. */
export function createSuggestionRetirement(adapter: CacheAdapter) {
  let status: SuggestionRetirementStatus = 'failed';
  let pending: Promise<SuggestionRetirementStatus> | undefined;
  const run = (): Promise<SuggestionRetirementStatus> => {
    if (pending) return pending;
    if (status === 'complete') return Promise.resolve(status);
    status = 'running';
    pending = (async (): Promise<SuggestionRetirementStatus> => {
      try {
        if (!adapter.getAllKeys) throw new Error();
        const keys = await adapter.getAllKeys();
        if (!Array.isArray(keys)) throw new Error();
        for (const key of keys) if (typeof key !== 'string') throw new Error();
        for (const key of new Set(keys)) {
          if (isRetiredSuggestionKey(key)) await adapter.removeItem(key);
        }
        status = 'complete';
      } catch {
        // Errors can contain storage keys. Retain only the failure category.
        status = 'failed';
      }
      return status;
    })().finally(() => { pending = undefined; });
    return pending;
  };
  return {run, getStatus: () => status};
}
