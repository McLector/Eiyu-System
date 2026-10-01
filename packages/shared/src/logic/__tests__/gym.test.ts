import { convertGymWeight, gymWeight, normalizeGymExercise } from '../gym';
const valid = { name: 'Bench press', sets: 3, reps: '8–12', rest_seconds: 90, rir: 2, notes: '' };
test('normalizes ranges and rejects descending or fractional prescriptions', () => {
  expect(normalizeGymExercise(valid).reps).toBe('8-12');
  expect(() => normalizeGymExercise({ ...valid, reps: '12-8' })).toThrow('ascending');
  expect(() => normalizeGymExercise({ ...valid, sets: 1.5 })).toThrow('whole');
  expect(() => normalizeGymExercise({ ...valid, rir: 11 })).toThrow('0 to 10');
});
test('converts units without changing original weights and supports bodyweight', () => {
  expect(convertGymWeight(20, 'kg', 'lb')).toBe(44.092);
  expect(convertGymWeight(44.092, 'lb', 'kg')).toBe(20);
  expect(gymWeight('0')).toBe(0);
  expect(gymWeight('')).toBeNull();
  expect(() => gymWeight('Infinity')).toThrow();
  expect(() => gymWeight('-1')).toThrow();
});
