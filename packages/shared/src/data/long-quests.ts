import { supabase } from '../supabase/client';
import { LongQuest, QuestStage, Stat } from '../types/eiyu';

/** R-32/R-33: real Long Quests, replacing the mock data that shipped with the UI. */
export async function fetchLongQuests(userId: string): Promise<LongQuest[]> {
  const { data: quests, error } = await supabase
    .from('long_quests')
    .select('id, name, stat, description')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!quests || quests.length === 0) return [];

  const { data: stages, error: stagesError } = await supabase
    .from('long_quest_stages')
    .select('id, long_quest_id, name, done, position, description')
    .in(
      'long_quest_id',
      quests.map(q => q.id)
    )
    .order('position', { ascending: true });
  if (stagesError) throw stagesError;

  const stagesByQuest = new Map<string, QuestStage[]>();
  for (const s of stages ?? []) {
    if (!stagesByQuest.has(s.long_quest_id)) stagesByQuest.set(s.long_quest_id, []);
    stagesByQuest.get(s.long_quest_id)!.push({ id: s.id, name: s.name, done: s.done, description: s.description });
  }

  return quests.map(q => ({
    id: q.id,
    name: q.name,
    stat: q.stat,
    description: q.description,
    stages: stagesByQuest.get(q.id) ?? [],
  }));
}

export interface LongQuestStageInput {
  name: string;
  description?: string | null;
}

export interface LongQuestInput {
  name: string;
  stat: Stat;
  description?: string | null;
  stages: LongQuestStageInput[];
}

export async function createLongQuest(userId: string, input: LongQuestInput): Promise<string> {
  const { data: quest, error } = await supabase
    .from('long_quests')
    .insert({
      user_id: userId,
      name: input.name,
      stat: input.stat,
      description: input.description?.trim() ? input.description.trim() : null,
    })
    .select('id')
    .single();
  if (error) throw error;

  const rows = input.stages.map((stage, i) => ({
    long_quest_id: quest.id,
    user_id: userId,
    name: stage.name,
    description: stage.description?.trim() ? stage.description.trim() : null,
    position: i,
  }));
  const { error: stagesError } = await supabase.from('long_quest_stages').insert(rows);
  if (stagesError) throw stagesError;

  return quest.id;
}

export async function setStageDone(stageId: string, done: boolean) {
  const { error } = await supabase.from('long_quest_stages').update({ done }).eq('id', stageId);
  if (error) throw error;
}

export async function deleteLongQuest(id: string) {
  const { error } = await supabase.from('long_quests').delete().eq('id', id);
  if (error) throw error;
}
