import { initCacheAdapter, type CacheAdapter } from '@eiyu/shared';

const localStorageAdapter: CacheAdapter = {
  getItem: async key => window.localStorage.getItem(key),
  setItem: async (key, value) => {
    window.localStorage.setItem(key, value);
  },
  removeItem: async key => {
    window.localStorage.removeItem(key);
  },
};

initCacheAdapter(localStorageAdapter);
