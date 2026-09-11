import { supabase } from '../supabase/client';
import { deviceTimeZone } from '../logic/date-utils';

export interface ProfileData {
  displayName: string;
  userClass: string;
  timeZone: string;
}

export async function initializeAccountTimeZone(candidate: string = deviceTimeZone()): Promise<string> {
  const { data, error } = await supabase.rpc('initialize_account_time_zone', {
    p_time_zone: candidate,
  });
  if (error) throw error;
  return data as string;
}

/** Explicit user-directed change; historical occurrence/completion keys stay unchanged server-side. */
export async function setAccountTimeZone(timeZone: string): Promise<string> {
  const { data, error } = await supabase.rpc('set_account_time_zone', {
    p_time_zone: timeZone,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchProfile(userId: string): Promise<ProfileData> {
  const timeZone = await initializeAccountTimeZone();
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, user_class, time_zone')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return {
    displayName: data.display_name,
    userClass: data.user_class,
    timeZone: data.time_zone ?? timeZone,
  };
}
