import { supabase } from '../supabase/client';
import { deviceTimeZone } from '../logic/date-utils';
import { normalizeProfileEdit, type ProfileEditInput } from '../logic/validation';

export interface ProfileData {
  displayName: string;
  userClass: string;
  timeZone: string;
}

export async function updateProfile(input: ProfileEditInput, original?: ProfileEditInput): Promise<ProfileData> {
  const normalized = normalizeProfileEdit(input, original);
  const { data, error } = await supabase.rpc('update_profile', {
    p_display_name: normalized.displayName,
    p_user_class: normalized.userClass,
  });
  if (error) throw error;
  const result = data as {
    displayName?: string;
    userClass?: string;
    timeZone?: string;
  } | null;
  return {
    displayName: result?.displayName ?? normalized.displayName,
    userClass: result?.userClass ?? normalized.userClass,
    timeZone: result?.timeZone ?? deviceTimeZone(),
  };
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

/**
 * The palette the account chose, or null when it has none or the column is not deployed yet.
 * Never throws: a palette is cosmetic, and the sign-in must not depend on it.
 */
export async function fetchAccountPalette(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('profiles').select('palette').eq('user_id', userId).maybeSingle();
    if (error) return null;
    return (data as { palette: string | null } | null)?.palette ?? null;
  } catch {
    return null;
  }
}

export async function saveAccountPalette(palette: string): Promise<string> {
  const { data, error } = await supabase.rpc('set_profile_palette', { p_palette: palette });
  if (error) throw error;
  return data as string;
}
