import {createSuggestionRetirement, type SuggestionRetirementStatus} from './suggestion-retirement';

export interface CacheAdapter {
  getAllKeys?(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let adapter: CacheAdapter | undefined;
let retirement: ReturnType<typeof createSuggestionRetirement> | undefined;

export function initCacheAdapter(newAdapter: CacheAdapter): void {
  adapter = newAdapter;
  retirement = createSuggestionRetirement(newAdapter);
  void retirement.run(); // Resolves to explicit status; never an unhandled storage rejection.
}

export function getSuggestionCacheRetirementStatus(): SuggestionRetirementStatus {
  return retirement?.getStatus() ?? 'failed';
}

/** Explicit retry after a failed startup; concurrent callers share one operation. */
export function retrySuggestionCacheRetirement(): Promise<SuggestionRetirementStatus> {
  return retirement?.run() ?? Promise.resolve('failed');
}

export type {SuggestionRetirementStatus} from './suggestion-retirement';

export function getCacheAdapter(): CacheAdapter {
  if (!adapter) {
    throw new Error('initCacheAdapter() must be called before use.');
  }
  return adapter;
}
