import { act, renderHook } from '@testing-library/react-native';

import { FONT_SCALE_NUDGE_A, FONT_SCALE_NUDGE_B, nudgedLetterSpacing, useFontScaleNudge } from '../font-scale-nudge';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 3, fontScale: mockScale }),
}));
beforeEach(() => { mockScale = 1; });

describe('nudge values', () => {
  it('are the two tiny spike offsets, distinct and positive', () => {
    expect(FONT_SCALE_NUDGE_A).toBe(0.01);
    expect(FONT_SCALE_NUDGE_B).toBe(0.02);
  });
});

describe('nudgedLetterSpacing', () => {
  it('adds the offset to an existing spacing and treats a missing one as zero', () => {
    expect(nudgedLetterSpacing(1.2, 0.01)).toBeCloseTo(1.21, 10);
    expect(nudgedLetterSpacing(undefined, 0.02)).toBe(0.02);
  });
});

describe('useFontScaleNudge', () => {
  it('returns no patch at mount, so launch typography is unchanged', async () => {
    const { result } = await renderHook(() => useFontScaleNudge(1.2));
    expect(result.current).toBeUndefined();
  });

  it('stays unpatched while the scale does not change, even across rerenders', async () => {
    const { result, rerender } = await renderHook(() => useFontScaleNudge());
    await rerender({});
    await rerender({});
    expect(result.current).toBeUndefined();
  });

  it('alternates between the two offsets on each scale change, on top of the base spacing', async () => {
    const { result, rerender } = await renderHook(() => useFontScaleNudge(1.2));
    const change = async (next: number) => { mockScale = next; await act(async () => { await rerender({}); }); };

    await change(1.6);
    expect(result.current?.letterSpacing).toBeCloseTo(1.2 + FONT_SCALE_NUDGE_A, 10);
    await change(1.0);
    expect(result.current?.letterSpacing).toBeCloseTo(1.2 + FONT_SCALE_NUDGE_B, 10);
    await change(1.6);
    expect(result.current?.letterSpacing).toBeCloseTo(1.2 + FONT_SCALE_NUDGE_A, 10);
  });

  it('keeps the patch stable (no flip) when rerendered at the same changed scale', async () => {
    const { result, rerender } = await renderHook(() => useFontScaleNudge());
    mockScale = 1.6;
    await act(async () => { await rerender({}); });
    await act(async () => { await rerender({}); });
    expect(result.current?.letterSpacing).toBe(FONT_SCALE_NUDGE_A);
  });

  it('patches only letterSpacing and never touches font size or scaling', async () => {
    const { result, rerender } = await renderHook(() => useFontScaleNudge());
    mockScale = 1.3;
    await act(async () => { await rerender({}); });
    expect(Object.keys(result.current ?? {})).toEqual(['letterSpacing']);
  });
});
