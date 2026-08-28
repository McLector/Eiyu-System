import { resolveVerticalPadding } from '../safe-padding';

describe('resolveVerticalPadding', () => {
  it('returns zeros for an empty style', () => {
    expect(resolveVerticalPadding({})).toEqual({ top: 0, bottom: 0 });
  });

  it('uses the shorthand when no specific edges are set', () => {
    // The auth-screen regression: styles.scroll uses paddingVertical: 40.
    // Yoga resolves specific edges over the shorthand, so a naive
    // [safePadding, callerStyle] array-merge silently discards this value.
    expect(resolveVerticalPadding({ paddingVertical: 40 })).toEqual({ top: 40, bottom: 40 });
  });

  it('lets specific edges win over the shorthand (Yoga semantics)', () => {
    expect(resolveVerticalPadding({ paddingTop: 10, paddingVertical: 40 })).toEqual({
      top: 10,
      bottom: 40,
    });
    expect(resolveVerticalPadding({ paddingBottom: 8, paddingVertical: 40 })).toEqual({
      top: 40,
      bottom: 8,
    });
  });

  it('defaults non-numeric values to 0', () => {
    expect(resolveVerticalPadding({ paddingTop: '5%', paddingBottom: 'auto' })).toEqual({
      top: 0,
      bottom: 0,
    });
  });
});