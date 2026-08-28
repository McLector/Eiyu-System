import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';

export let supabase: SupabaseClient<Database>;

export function initSupabaseClient(client: SupabaseClient<Database>): void {
  supabase = client;
}
