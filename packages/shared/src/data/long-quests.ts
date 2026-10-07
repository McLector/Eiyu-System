import { supabase } from '../supabase/client';
import { LongQuest, QuestStage, Stat } from '../types/eiyu';
import { normalizeStageDescription } from '../logic/stage-description';
import { normalizeEditableQuestName } from '../logic/validation';
import { readBatches } from './pagination';
import { isConfirmedFailure, UncertainSaveError } from './save-outcome';

/** R-32/R-33: real Long Quests, replacing the mock data that shipped with the UI. */
const QUEST_COLUMNS = 'id, name, stat, description, completed_at, created_at';

/** Columns added by later migrations (043, 044). A database that lacks one is read again without it. */
const OPTIONAL_COLUMNS = ['strict_order', 'position'] as const;

/** Which optional column the database says is unknown, if any. Any other error counts as none. */
function missingOptionalColumn(error: unknown, wanted: readonly string[]): string | undefined {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (typeof message !== 'string' || !(!code || code === '42703' || code === 'PGRST204')) return undefined;
  return wanted.find(column => message.includes(column));
}

export async function fetchLongQuests(userId: string): Promise<LongQuest[]> {
  const readQuests = (columns: string) => readBatches((from, to) => supabase.from('long_quests').select(columns).eq('user_id', userId).order('created_at').order('id').range(from, to));
  // Either side may deploy before a migration: read again without the column the database lacks (at most once per
  // column), so every chain reads as in order (043) and in its fetched order (044).
  let wanted: string[] = [...OPTIONAL_COLUMNS];
  let quests: Array<Record<string, any>>;
  for (;;) {
    try {
      quests = await readQuests([QUEST_COLUMNS, ...wanted].join(', '));
      break;
    } catch (error) {
      const column = missingOptionalColumn(error, wanted);
      if (!column) throw error;
      wanted = wanted.filter(name => name !== column);
    }
  }
  if (!quests.length) return [];
  const stages = await readBatches((from, to) => supabase.from('long_quest_stages').select('id, long_quest_id, name, done, position, description').eq('user_id', userId).order('long_quest_id').order('position').order('id').range(from, to));

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
    completedAt: q.completed_at,
    createdAt: q.created_at,
    strictOrder: q.strict_order,
    position: typeof q.position === 'number' ? q.position : undefined,
    stages: stagesByQuest.get(q.id) ?? [],
  }));
}

export interface LongQuestStageInput {
  id?: string | null;
  name: string;
  description?: string | null;
}

export interface LongQuestInput {
  name: string;
  stat: Stat;
  description?: string | null;
  /** Leave undefined to keep the quest's current mode (a new quest starts in order). */
  strictOrder?: boolean;
  stages: LongQuestStageInput[];
}

export async function createLongQuest(userId: string, input: LongQuestInput): Promise<string> {
  const name = normalizeEditableQuestName(input.name);
  const normalizedStages = input.stages.map(stage => ({
    ...stage,
    description: normalizeStageDescription(stage.description),
  }));
  const { data: quest, error } = await supabase
    .from('long_quests')
    .insert({
      user_id: userId,
      name,
      stat: input.stat,
      description: input.description?.trim() ? input.description.trim() : null,
    })
    .select('id')
    .single();
  if (error) throw error;

  const rows = normalizedStages.map((stage, i) => ({
    long_quest_id: quest.id,
    user_id: userId,
    name: stage.name,
    description: stage.description,
    position: i,
  }));
  const { error: stagesError } = await supabase.from('long_quest_stages').insert(rows);
  if (stagesError) throw stagesError;

  return quest.id;
}

export async function updateLongQuest(
  id: string,
  input: { name: string; stat: Stat; description?: string | null },
  originalName?: string
): Promise<void> {
  const name = normalizeEditableQuestName(input.name, originalName);
  const { error } = await supabase
    .from('long_quests')
    .update({
      name,
      stat: input.stat,
      description: input.description?.trim() ? input.description.trim() : null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function reconcileLongQuestStages(
  longQuestId: string,
  stages: LongQuestStageInput[]
): Promise<void> {
  const { error } = await supabase.rpc('reconcile_long_quest_stages', {
    p_long_quest_id: longQuestId,
    p_stages: stages.map(s => ({
      id: s.id ?? null,
      name: s.name,
      description: normalizeStageDescription(s.description),
    })),
  });
  if (error) throw error;
}

export async function setStageDone(stageId: string, done: boolean) {
  const { error } = await supabase.rpc('set_long_quest_stage_done', {
    p_stage_id: stageId,
    p_done: done,
  });
  if (error) throw error;
}

/** Saves the Chain list's manual order: the unfinished chains in their new order (finished ones keep their slots). */
export async function reorderLongQuests(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_long_quests', { p_ids: ids });
  if (error) throw error;
}

export async function deleteLongQuest(id: string) {
  const { error } = await supabase.from('long_quests').delete().eq('id', id);
  if (error) throw error;
}

export interface RewardReceipt {
  id: string; stage_id: string; done: boolean; changed: boolean; replayed: boolean;
  components: { kind: 'stage' | 'bonus'; stat: Stat; delta: number }[];
  totals: { stat: Stat; before: number; after: number; delta: number }[];
}
const uncertainDefinitions = new Map<string, string>();
const uncertainRewards = new Set<string>();
export async function setStageDoneWithReceipt(stageId: string, done: boolean, requestId: string): Promise<RewardReceipt> {
  if (uncertainRewards.has(requestId)) {
    const prior = await supabase.rpc('get_long_quest_reward_receipt', { p_request_id: requestId });
    if (prior.error) throw new UncertainSaveError();
    if (prior.data) { uncertainRewards.delete(requestId); return { ...prior.data as unknown as RewardReceipt, replayed: true }; }
  }
  const { data, error } = await supabase.rpc('set_long_quest_stage_done_receipt', { p_stage_id: stageId, p_done: done, p_request_id: requestId });
  if (!error) { uncertainRewards.delete(requestId); return data as unknown as RewardReceipt; }
  if (isConfirmedFailure(error)) throw error;
  const check = await supabase.rpc('get_long_quest_reward_receipt', { p_request_id: requestId });
  if (!check.error && check.data) return { ...check.data as unknown as RewardReceipt, replayed: true };
  uncertainRewards.add(requestId);
  throw new UncertainSaveError();
}
export async function saveAtomicLongQuest(id: string, requestId: string, input: LongQuestInput, create: boolean, originalName?: string): Promise<string> {
  const normalized = { ...input, name: normalizeEditableQuestName(input.name, originalName), description: input.description?.trim() || null,
    stages: input.stages.map(s => ({ id: s.id ?? null, name: normalizeEditableQuestName(s.name, s.id ? s.name : undefined), description: normalizeStageDescription(s.description) })) };
  const signature = JSON.stringify(normalized);
  if (uncertainDefinitions.has(requestId)) {
    if (uncertainDefinitions.get(requestId) !== signature) throw new UncertainSaveError();
    const prior = await supabase.rpc('get_long_quest_definition_receipt', { p_request_id: requestId });
    if (prior.error) throw new UncertainSaveError();
    if (prior.data === id) { uncertainDefinitions.delete(requestId); return id; }
  }
  const { data, error } = await supabase.rpc('save_long_quest_definition', { p_id: id, p_request_id: requestId, p_create: create, p_input: normalized });
  if (!error) { uncertainDefinitions.delete(requestId); return data; }
  const check = await supabase.rpc('get_long_quest_definition_receipt', { p_request_id: requestId });
  if (!check.error && check.data === id) return id;
  if (isConfirmedFailure(error) && !check.error) throw error;
  uncertainDefinitions.set(requestId, signature);
  throw new UncertainSaveError();
}
