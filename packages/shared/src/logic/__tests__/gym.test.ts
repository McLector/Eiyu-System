import { convertGymWeight, gymWeight, normalizeGymExercise, parseGymRir } from '../gym';
const valid = { name: 'Bench press', sets: 3, reps: '8–12', rest_seconds: 90, rir: 2, notes: '' };
test('normalizes ranges and rejects descending or fractional prescriptions', () => {
  expect(normalizeGymExercise(valid).reps).toBe('8-12');
  expect(() => normalizeGymExercise({ ...valid, reps: '12-8' })).toThrow('ascending');
  expect(() => normalizeGymExercise({ ...valid, sets: 1.5 })).toThrow('whole');
  expect(() => normalizeGymExercise({ ...valid, rir: 11 })).toThrow('0 to 10');
});

test('accepts RIR scalars and ascending ranges including Unicode and equal endpoints', () => {
  expect(parseGymRir('1–2')).toEqual({ rir: 1, rir_max: 2 });
  expect(parseGymRir('10')).toEqual({ rir: 10, rir_max: null });
  expect(parseGymRir('0-0')).toEqual({ rir: 0, rir_max: null });
  for (const raw of ['', '2-1', '-1', '1.5', '9-11']) expect(() => parseGymRir(raw)).toThrow();
  expect(() => gymWeight('1.0001')).toThrow('three decimals');
  expect(normalizeGymExercise({ ...valid, notes: '😀'.repeat(2000) }).notes).toHaveLength(4000);
});
test('converts units without changing original weights and supports bodyweight', () => {
  expect(convertGymWeight(20, 'kg', 'lb')).toBe(44.092);
  expect(convertGymWeight(44.092, 'lb', 'kg')).toBe(20);
  expect(gymWeight('0')).toBe(0);
  expect(gymWeight('')).toBeNull();
  expect(() => gymWeight('Infinity')).toThrow();
  expect(() => gymWeight('-1')).toThrow();
});
