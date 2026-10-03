import type { GymPrescription, GymUnit } from '../types/gym';
import { normalizeEditableQuestName } from './validation';
export function convertGymWeight(value: number, from: GymUnit, to: GymUnit): number {
  return from === to ? value : Math.round((from === 'kg' ? value * 2.20462262185 : value / 2.20462262185) * 1000) / 1000;
}
export function normalizeGymExercise(input: GymPrescription): GymPrescription {
  const name = normalizeEditableQuestName(input.name);
  const reps = input.reps.trim().replace(/[–—]/g, '-').replace(/\s/g, '');
  const match = /^([1-9][0-9]{0,3})(?:-([1-9][0-9]{0,3}))?$/.exec(reps);
  if (!match || (match[2] && Number(match[1]) > Number(match[2]))) throw new Error('Enter positive reps or an ascending range, such as 8–12.');
  if (!Number.isInteger(input.sets) || input.sets < 1 || input.sets > 99) throw new Error('Sets must be a whole number from 1 to 99.');
  if (!Number.isInteger(input.rest_seconds) || input.rest_seconds < 0 || input.rest_seconds > 86400) throw new Error('Rest must be whole seconds from 0 to 86400.');
  if (!Number.isInteger(input.rir) || input.rir < 0 || input.rir > 10) throw new Error('RIR must be a whole number from 0 to 10.');
  const rirMax = input.rir_max === input.rir ? null : input.rir_max ?? null;
  if (rirMax !== null && (!Number.isInteger(rirMax) || rirMax < input.rir || rirMax > 10)) throw new Error('RIR must be an ascending whole-number range from 0 to 10.');
  if (Array.from(input.notes).length > 2000) throw new Error('Notes must be 2000 characters or fewer.');
  return { ...input, name, reps, rir_max: rirMax, notes: input.notes.trim() };
}
export function parseGymRir(raw: string): { rir: number; rir_max: number | null } {
  const match = /^(\d{1,2})(?:\s*[-\u2013]\s*(\d{1,2}))?$/.exec(raw.trim());
  if (!match) throw new Error('Enter RIR from 0 to 10 or an ascending range such as 1-2.');
  const rir = Number(match[1]), max = match[2] === undefined ? rir : Number(match[2]);
  if (rir > 10 || max > 10 || max < rir) throw new Error('RIR must be an ascending whole-number range from 0 to 10.');
  return { rir, rir_max: max === rir ? null : max };
}
export function gymWeight(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!/^\d+(?:\.\d{1,3})?$/.test(value.trim()) || !Number.isFinite(number) || number < 0 || number > 1000000) throw new Error('Weight must be a number from 0 to 1000000 with at most three decimals.');
  return number;
}
