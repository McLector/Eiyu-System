import { supabase } from '@/lib/supabase';
import { Stat } from '@/types/eiyu';

interface AiProxyError {
  error: string;
}

/** R-61: 3 AI-suggested easy versions, always optional (R-64). Runs through the ai-proxy Edge Function so no API key ships in the app (R-63). */
export async function suggestEasyVersions(habitName: string, stat: Stat): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke<{ suggestions: string[] } | AiProxyError>(
    'ai-proxy',
    { body: { action: 'easy-versions', habitName, stat } }
  );
  if (error) throw error;
  if (data && 'error' in data) throw new Error(data.error);
  if (!data?.suggestions) throw new Error('No suggestions returned');
  return data.suggestions;
}

/** R-62: break a Long Quest name into 3-6 editable stages, always optional (R-64). */
export async function suggestStages(questName: string, stat: Stat): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke<{ stages: string[] } | AiProxyError>('ai-proxy', {
    body: { action: 'stage-breakdown', questName, stat },
  });
  if (error) throw error;
  if (data && 'error' in data) throw new Error(data.error);
  if (!data?.stages) throw new Error('No stages returned');
  return data.stages;
}
