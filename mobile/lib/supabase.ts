import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

import { initSupabaseClient, initCacheAdapter, initOwnerExportTransport, type CacheAdapter, type Database } from '@eiyu/shared';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

// AsyncStorage touches `window` internally, which doesn't exist during
// expo-router's Node-side static render pass for web. Fall back to a noop
// storage in that environment; the browser picks up AsyncStorage normally
// once it hydrates client-side.
const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window === 'undefined' ? noopStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

initSupabaseClient(supabase);
initOwnerExportTransport({url:supabaseUrl,publishableKey:supabaseAnonKey,
  // Load the public SDK54 transport only on an explicit export request.
  fetcher:async(url,init)=>(require('expo/fetch') as typeof import('expo/fetch')).fetch(url,init),
});

const asyncStorageAdapter: CacheAdapter = {
  getAllKeys: async () => {
    // A static renderer has no device storage to retire. Do not report success.
    if (typeof window === 'undefined') throw new Error('Device storage unavailable');
    return AsyncStorage.getAllKeys();
  },
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: key => AsyncStorage.removeItem(key),
};

initCacheAdapter(asyncStorageAdapter);

let recoveryClientId = 0;
/** Recovery credentials stay in memory and never replace the normal quest session. */
export function createRecoveryAuth() {
  return createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      storageKey: `eiyu-password-recovery-${++recoveryClientId}`,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }).auth;
}
