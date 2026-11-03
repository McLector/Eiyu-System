import type { HabitInput } from '../data/habits';
import type { LongQuestInput } from '../data/long-quests';
import type { Stat } from '../types/eiyu';

export type BasicHabitInput = Pick<HabitInput,
  'questType' | 'stat' | 'difficulty' | 'time' | 'days' | 'scheduledDate' | 'targetCount' | 'timeSet'>;
export interface BasicChainInput {
  stat: Stat;
  strictOrder?: boolean;
  stages: { id?: string | null }[];
}
export type HabitEditorInput =
  | { mode: 'basic'; values: BasicHabitInput }
  | { mode: 'custom'; values: HabitInput };
export type ChainEditorInput =
  | { mode: 'basic'; values: BasicChainInput }
  | { mode: 'custom'; values: LongQuestInput };

const BASIC_HABIT_OPTIONAL = ['questType', 'scheduledDate', 'targetCount'] as const;
const CUSTOM_HABIT_TEXT = ['description', 'easyVersion', 'genre'] as const;
const INVALID = 'This quest could not be prepared to save.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function requireHabitCore(values: unknown): Record<string, unknown> {
  if (!isRecord(values) || typeof values.stat !== 'string' || typeof values.difficulty !== 'string'
    || typeof values.time !== 'string' || !Array.isArray(values.days)) throw new Error(INVALID);
  return values;
}
/** Allow-list copy of the structural habit fields; text never passes through here. */
function structuralHabit(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {stat: values.stat, difficulty: values.difficulty, time: values.time, days: [...(values.days as unknown[])]};
  for (const key of BASIC_HABIT_OPTIONAL) if (values[key] !== undefined) out[key] = values[key];
  // The server refuses a null timeSet; absent means "default".
  if (typeof values.timeSet === 'boolean') out.timeSet = values.timeSet;
  return out;
}

export function toBasicHabitInput(input: HabitInput): BasicHabitInput {
  return structuralHabit(requireHabitCore(input)) as unknown as BasicHabitInput;
}
export function toBasicChainInput(input: LongQuestInput): BasicChainInput {
  if (!isRecord(input) || typeof input.stat !== 'string' || !Array.isArray(input.stages)) throw new Error(INVALID);
  const out: BasicChainInput = {stat: input.stat as Stat, stages: input.stages.map(stage => (typeof stage?.id === 'string' ? {id: stage.id} : {}))};
  if (typeof input.strictOrder === 'boolean') out.strictOrder = input.strictOrder;
  return out;
}

export function habitGatewayInput(editor: HabitEditorInput): { mode: 'basic' | 'custom'; input: Record<string, unknown> } {
  if (!isRecord(editor) || (editor.mode !== 'basic' && editor.mode !== 'custom')) throw new Error(INVALID);
  const values = requireHabitCore(editor.values);
  const input = structuralHabit(values);
  if (editor.mode === 'basic') return {mode: 'basic', input};
  if (typeof values.name !== 'string' || !values.name.trim()) throw new Error(INVALID);
  input.name = values.name;
  for (const key of CUSTOM_HABIT_TEXT) if (values[key] !== undefined) input[key] = values[key];
  return {mode: 'custom', input};
}

export function chainGatewayInput(editor: ChainEditorInput): { mode: 'basic' | 'custom'; input: Record<string, unknown> } {
  if (!isRecord(editor) || (editor.mode !== 'basic' && editor.mode !== 'custom') || !isRecord(editor.values)) throw new Error(INVALID);
  const values = editor.values as unknown as Record<string, unknown>;
  if (typeof values.stat !== 'string' || !Array.isArray(values.stages)) throw new Error(INVALID);
  const stages = values.stages as unknown[];
  const input: Record<string, unknown> = {stat: values.stat};
  if (typeof values.strictOrder === 'boolean') input.strictOrder = values.strictOrder;
  if (editor.mode === 'basic') {
    input.stages = stages.map(stage => (isRecord(stage) && typeof stage.id === 'string' ? {id: stage.id} : {}));
    return {mode: 'basic', input};
  }
  if (typeof values.name !== 'string' || !values.name.trim()) throw new Error(INVALID);
  input.name = values.name;
  if (values.description !== undefined) input.description = values.description;
  input.stages = stages.map(stage => {
    if (!isRecord(stage) || typeof stage.name !== 'string' || !stage.name.trim()) throw new Error(INVALID);
    const out: Record<string, unknown> = {name: stage.name};
    if (typeof stage.id === 'string') out.id = stage.id;
    if (stage.description !== undefined) out.description = stage.description;
    return out;
  });
  return {mode: 'custom', input};
}
