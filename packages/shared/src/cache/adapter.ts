export interface CacheAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let adapter: CacheAdapter | undefined;

export function initCacheAdapter(newAdapter: CacheAdapter): void {
  adapter = newAdapter;
}

export function getCacheAdapter(): CacheAdapter {
  if (!adapter) {
    throw new Error('initCacheAdapter() must be called before use.');
  }
  return adapter;
}
