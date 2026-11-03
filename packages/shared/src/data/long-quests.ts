import { supabase } from '../supabase/client';
import { LongQuest, QuestStage, Stat } from '../types/eiyu';
import { normalizeStageDescription } from '../logic/stage-description';
import { normalizeEditableQuestName } from '../logic/validation';
import { readBatches } from './pagination';
import { isConfirmedFailure, UncertainSaveError } from './save-outcome';
import type { TrackerRevision, TrackerTargetSnapshot } from './tracker-access';
import { invokeTrackerWrite, isRefusedBeforeSend } from './tracker-writes';
import { withTrackerClassification } from './tracker-classify';
import { chainGatewayInput, type ChainEditorInput } from '../logic/tracker-input';

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

  return withTrackerClassification('chain', quests.map(q => ({
    id: q.id,
    name: q.name,
    stat: q.stat,
    description: q.description,
    completedAt: q.completed_at,
    createdAt: q.created_at,
    strictOrder: q.strict_order,
    position: typeof q.position === 'number' ? q.position : undefined,
    stages: stagesByQuest.get(q.id) ?? [],
  })), userId);
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

/** Saves the Chain list's manual order: the unfinished chains in their new order (finished ones keep their slots). */
export async function reorderLongQuests(ids: string[], expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[]): Promise<void> {
  await invokeTrackerWrite<unknown>('reorder_long_quests', { p_ids: [...ids] }, expected, targets);
}

export async function deleteLongQuest(id: string, expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[]): Promise<void> {
  await invokeTrackerWrite<unknown>('chain-delete', { p_id: id }, expected, targets);
}

export interface RewardReceipt {
  id: string; stage_id: string; done: boolean; changed: boolean; replayed: boolean;
  components: { kind: 'stage' | 'bonus'; stat: Stat; delta: number }[];
  totals: { stat: Stat; before: number; after: number; delta: number }[];
}
const uncertainDefinitions = new Map<string, string>();
const uncertainRewards = new Set<string>();
export async function setStageDoneWithReceipt(
  stageId: string, done: boolean, requestId: string, expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[]
): Promise<RewardReceipt> {
  if (uncertainRewards.has(requestId)) {
    const prior = await supabase.rpc('get_long_quest_reward_receipt', { p_request_id: requestId });
    if (prior.error) throw new UncertainSaveError();
    if (prior.data) { uncertainRewards.delete(requestId); return { ...prior.data as unknown as RewardReceipt, replayed: true }; }
  }
  let data: unknown;
  try {
    data = await invokeTrackerWrite<unknown>('set_long_quest_stage_done_receipt', { p_stage_id: stageId, p_done: done, p_request_id: requestId }, expected, targets);
  } catch (error) {
    if (isRefusedBeforeSend(error) || isConfirmedFailure(error)) throw error;
    const check = await supabase.rpc('get_long_quest_reward_receipt', { p_request_id: requestId });
    if (!check.error && check.data) return { ...check.data as unknown as RewardReceipt, replayed: true };
    uncertainRewards.add(requestId);
    throw new UncertainSaveError();
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Unexpected stage result');
  uncertainRewards.delete(requestId);
  return data as RewardReceipt;
}

/** Normalizes what the client still validates (names, stage text); the server owns the rest. */
function normalizedChainEditor(input: ChainEditorInput, originalName?: string): ChainEditorInput {
  if (input?.mode !== 'custom') return input;
  const values = input.values;
  return {
    mode: 'custom',
    values: {
      ...values,
      name: normalizeEditableQuestName(values.name, originalName),
      description: values.description?.trim() || null,
      stages: values.stages.map(s => ({
        id: s.id ?? null,
        name: normalizeEditableQuestName(s.name, s.id ? s.name : undefined),
        description: normalizeStageDescription(s.description),
      })),
    },
  };
}

/**
 * Saves a chain through the revision-bound gateway. The id and request id are chosen by the editor and kept across
 * uncertain retries; a response that never arrived is reconciled against the definition receipt before any resend.
 * Creation passes no target snapshots; an edit passes the chain's captured snapshot.
 */
export async function saveAtomicLongQuest(
  id: string, requestId: string, input: ChainEditorInput, create: boolean,
  expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[], originalName?: string
): Promise<string> {
  const { mode, input: payload } = chainGatewayInput(normalizedChainEditor(input, originalName));
  const signature = JSON.stringify({ mode, payload });
  if (uncertainDefinitions.has(requestId)) {
    if (uncertainDefinitions.get(requestId) !== signature) throw new UncertainSaveError();
    const prior = await supabase.rpc('get_long_quest_definition_receipt', { p_request_id: requestId });
    if (prior.error) throw new UncertainSaveError();
    if (prior.data === id) { uncertainDefinitions.delete(requestId); return id; }
  }
  let data: unknown;
  try {
    data = await invokeTrackerWrite<unknown>('chain-save', { p_id: id, p_request_id: requestId, p_create: create, p_mode: mode, p_input: payload }, expected, targets);
  } catch (error) {
    if (isRefusedBeforeSend(error)) throw error;
    const check = await supabase.rpc('get_long_quest_definition_receipt', { p_request_id: requestId });
    if (!check.error && check.data === id) return id;
    if (isConfirmedFailure(error) && !check.error) throw error;
    uncertainDefinitions.set(requestId, signature);
    throw new UncertainSaveError();
  }
  if (typeof data !== 'string' || data.toLowerCase() !== id.toLowerCase()) throw new Error('The save result could not be confirmed. Check the chain before retrying.');
  uncertainDefinitions.delete(requestId);
  return id;
}
