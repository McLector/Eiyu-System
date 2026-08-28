import { supabase } from '@/lib/supabase';

export interface ProfileData {
  displayName: string;
  userClass: string;
}

export async function fetchProfile(userId: string): Promise<ProfileData> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, user_class')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return { displayName: data.display_name, userClass: data.user_class };
}
