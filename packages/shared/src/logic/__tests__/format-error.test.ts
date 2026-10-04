import { formatError } from '../format-error';

describe('formatError', () => {
  it('reads the message of an Error', () => {
    expect(formatError(new Error('Offline'))).toBe('Offline');
  });
  it('reads the message of a Postgrest-style object that is not an Error', () => {
    expect(formatError({ message: 'duplicate key', code: '23505' })).toBe('duplicate key');
  });
  it('passes a string through unchanged', () => {
    expect(formatError('Plain text')).toBe('Plain text');
  });
  it('never prints [object Object] for an object with no message', () => {
    expect(formatError({ weird: true })).toBe('Unknown error');
    expect(formatError({ message: 42 })).toBe('Unknown error');
  });
  it('handles null and undefined', () => {
    expect(formatError(null)).toBe('Unknown error');
    expect(formatError(undefined)).toBe('Unknown error');
  });
  it('keeps an empty Error message as is rather than inventing one', () => {
    expect(formatError(new Error(''))).toBe('');
  });
});
