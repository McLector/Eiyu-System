import {
  isFreshSuggestions,
  SUGGESTION_TTL_MS,
  suggestionCacheKey,
  type CachedSuggestions,
} from '../suggestions';

describe('suggestionCacheKey', () => {
  it('normalizes case and surrounding whitespace so repeat taps hit the cache', () => {
    expect(suggestionCacheKey('easy-versions', '  Code Daily ', 'STR')).toBe(
      suggestionCacheKey('easy-versions', 'code daily', 'STR')
    );
  });

  it('separates actions, stats, and names', () => {
    const a = suggestionCacheKey('easy-versions', 'Read', 'INT');
    const b = suggestionCacheKey('stage-breakdown', 'Read', 'INT');
    const c = suggestionCacheKey('easy-versions', 'Read', 'WIS');
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe('isFreshSuggestions', () => {
  const entry: CachedSuggestions = { at: Date.now(), value: ['a', 'b'] };

  it('accepts a fresh entry', () => {
    expect(isFreshSuggestions(entry)).toBe(true);
  });

  it('rejects undefined and malformed entries', () => {
    expect(isFreshSuggestions(undefined)).toBe(false);
    expect(isFreshSuggestions({ at: Date.now(), value: 'nope' as unknown as string[] })).toBe(false);
    expect(isFreshSuggestions({ value: ['a'] } as unknown as CachedSuggestions)).toBe(false);
  });

  it('expires entries past the TTL', () => {
    const stale = { at: Date.now() - SUGGESTION_TTL_MS - 1, value: ['a'] };
    expect(isFreshSuggestions(stale)).toBe(false);
  });

  it('treats exactly-TTL-old as expired and just-inside as fresh (strict less-than)', () => {
    const exact = { at: Date.now() - SUGGESTION_TTL_MS, value: ['a'] };
    expect(isFreshSuggestions(exact)).toBe(false);

    const justInside = { at: Date.now() - SUGGESTION_TTL_MS + 1, value: ['a'] };
    expect(isFreshSuggestions(justInside)).toBe(true);
  });
});
