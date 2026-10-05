// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({ fetchAccountPalette: vi.fn(), saveAccountPalette: vi.fn() }));
vi.mock('@eiyu/shared', () => shared);

import { PALETTE_STORAGE_KEY } from '../palette';
import { useAccountPalette } from '../useAccountPalette';

beforeEach(() => {
  window.localStorage.clear();
  shared.fetchAccountPalette.mockReset().mockResolvedValue(null);
  shared.saveAccountPalette.mockReset().mockResolvedValue('ok');
});
afterEach(cleanup);

describe('useAccountPalette', () => {
  it('starts from the browser copy, with no wait for the account', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'jade');
    shared.fetchAccountPalette.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAccountPalette('user-1'));
    expect(result.current[0]).toBe('jade');
  });

  it('takes the account palette over the browser copy and remembers it', async () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'jade');
    shared.fetchAccountPalette.mockResolvedValue('violet');
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await waitFor(() => expect(result.current[0]).toBe('violet'));
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('violet');
    expect(shared.fetchAccountPalette).toHaveBeenCalledWith('user-1');
    expect(shared.saveAccountPalette).not.toHaveBeenCalled();
  });

  it('ignores an account palette this client does not know, and leaves it alone', async () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'jade');
    shared.fetchAccountPalette.mockResolvedValue('crimson');
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await waitFor(() => expect(shared.fetchAccountPalette).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current[0]).toBe('jade');
    expect(shared.saveAccountPalette).not.toHaveBeenCalled();
  });

  it('gives an account with no palette the one this browser already uses', async () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'lime');
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await waitFor(() => expect(shared.saveAccountPalette).toHaveBeenCalledWith('lime'));
    expect(result.current[0]).toBe('lime');
  });

  it('does not write anything for an account with no palette on a browser that is on cyan', async () => {
    renderHook(() => useAccountPalette('user-1'));
    await waitFor(() => expect(shared.fetchAccountPalette).toHaveBeenCalled());
    await act(async () => {});
    expect(shared.saveAccountPalette).not.toHaveBeenCalled();
  });

  it('applies and saves a pick, locally first', async () => {
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await act(async () => { result.current[1]('magenta'); });
    expect(result.current[0]).toBe('magenta');
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('magenta');
    expect(shared.saveAccountPalette).toHaveBeenCalledWith('magenta');
  });

  it('keeps a pick when the account save fails', async () => {
    shared.saveAccountPalette.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await act(async () => { result.current[1]('steel'); });
    expect(result.current[0]).toBe('steel');
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('steel');
  });

  it('does not let a slow account answer undo a pick made meanwhile', async () => {
    let answer: (value: string) => void = () => {};
    shared.fetchAccountPalette.mockReturnValue(new Promise<string>(resolve => { answer = resolve; }));
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await act(async () => { result.current[1]('indigo'); });
    await act(async () => { answer('violet'); });
    expect(result.current[0]).toBe('indigo');
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('indigo');
  });

  it('stays on this browser, without calling the account, when nobody is signed in', async () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'jade');
    const { result } = renderHook(() => useAccountPalette(undefined));
    await act(async () => { result.current[1]('lime'); });
    expect(result.current[0]).toBe('lime');
    expect(shared.fetchAccountPalette).not.toHaveBeenCalled();
    expect(shared.saveAccountPalette).not.toHaveBeenCalled();
  });

  it('does not apply an answer for an account that has since been replaced', async () => {
    let answerFirst: (value: string) => void = () => {};
    shared.fetchAccountPalette.mockReturnValueOnce(new Promise<string>(resolve => { answerFirst = resolve; })).mockResolvedValue('steel');
    const { result, rerender } = renderHook(({ id }) => useAccountPalette(id), { initialProps: { id: 'user-1' } });
    rerender({ id: 'user-2' });
    await waitFor(() => expect(result.current[0]).toBe('steel'));
    await act(async () => { answerFirst('violet'); });
    expect(result.current[0]).toBe('steel');
  });
});
