import { createClient } from '@supabase/supabase-js';

import { initSupabaseClient, initOwnerExportTransport, type Database } from '@eiyu/shared';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

initSupabaseClient(supabase);
initOwnerExportTransport({url:supabaseUrl,publishableKey:supabaseAnonKey,
  fetcher:(url,init)=>fetch(url,{...init,cache:'no-store'}),
});

let recoveryClientId = 0;
/** Recovery credentials stay in memory and never replace the normal app session. */
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
