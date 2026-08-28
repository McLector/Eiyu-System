import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';

let client: SupabaseClient<Database> | undefined;

export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop) {
      if (!client) {
        throw new Error('initSupabaseClient() must be called before use.');
      }
      const value = Reflect.get(client, prop, client);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
);

export function initSupabaseClient(newClient: SupabaseClient<Database>): void {
  client = newClient;
}
