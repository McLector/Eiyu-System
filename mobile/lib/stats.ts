import { STATS } from '@/constants/eiyu-data';
import { levelProgress } from '@/lib/eiyu-logic';
import { supabase } from '@/lib/supabase';
import { Stat, StatData } from '@/types/eiyu';

export async function fetchStats(userId: string): Promise<Record<Stat, StatData>> {
  const { data, error } = await supabase.from('stats').select('stat, xp').eq('user_id', userId);
  if (error) throw error;

  const xpByStat = new Map((data ?? []).map(row => [row.stat, row.xp]));
  const result = {} as Record<Stat, StatData>;
  for (const stat of STATS) {
    const { level, xpIntoLevel, xpForNextLevel } = levelProgress(xpByStat.get(stat) ?? 0);
    result[stat] = { level, xp: xpIntoLevel, xpMax: xpForNextLevel };
  }
  return result;
}
