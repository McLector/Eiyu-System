import { initCacheAdapter, type CacheAdapter } from '@eiyu/shared';

const localStorageAdapter: CacheAdapter = {
  getAllKeys: async () => {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key !== null) keys.push(key);
    }
    return keys;
  },
  getItem: async key => window.localStorage.getItem(key),
  setItem: async (key, value) => {
    window.localStorage.setItem(key, value);
  },
  removeItem: async key => {
    window.localStorage.removeItem(key);
  },
};

initCacheAdapter(localStorageAdapter);
