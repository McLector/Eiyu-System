// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({ fetchAccountPalette: vi.fn(), saveAccountPalette: vi.fn() }));
vi.mock('@eiyu/shared', async importActual => ({ ...(await importActual<typeof import('@eiyu/shared')>()), ...shared }));

import { DEFAULT_PALETTE, PALETTE_STORAGE_KEY } from '../palette';
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

  it.each(['cyan', 'jade'])('gives an account with no palette a stored %s choice, cyan included', async id => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, id);
    renderHook(() => useAccountPalette('user-1'));
    await waitFor(() => expect(shared.saveAccountPalette).toHaveBeenCalledWith(id));
    expect(shared.saveAccountPalette).toHaveBeenCalledTimes(1);
  });

  it('writes nothing for an account with no palette when this browser has no choice stored', async () => {
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await waitFor(() => expect(shared.fetchAccountPalette).toHaveBeenCalled());
    await act(async () => {});
    expect(shared.saveAccountPalette).not.toHaveBeenCalled();
    expect(result.current[0]).toBe(DEFAULT_PALETTE);
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBeNull();
  });

  it('ignores a stored value that is not a palette, and saves nothing for it', async () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'crimson');
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await waitFor(() => expect(shared.fetchAccountPalette).toHaveBeenCalled());
    await act(async () => {});
    expect(shared.saveAccountPalette).not.toHaveBeenCalled();
    expect(result.current[0]).toBe(DEFAULT_PALETTE);
  });

  it.each(['cyan', 'jade'])('keeps the stored %s and saves nothing when the account read fails', async id => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, id);
    shared.fetchAccountPalette.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await waitFor(() => expect(shared.fetchAccountPalette).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current[0]).toBe(id);
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe(id);
    expect(shared.saveAccountPalette).not.toHaveBeenCalled();
  });

  it('keeps the default and saves nothing when the account read fails and nothing is stored', async () => {
    shared.fetchAccountPalette.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await waitFor(() => expect(shared.fetchAccountPalette).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current[0]).toBe(DEFAULT_PALETTE);
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBeNull();
    expect(shared.saveAccountPalette).not.toHaveBeenCalled();
  });

  it('lets a pick made while a palette-less account is being read win over the stored choice', async () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'jade');
    let answer: (value: null) => void = () => {};
    shared.fetchAccountPalette.mockReturnValue(new Promise<null>(resolve => { answer = resolve; }));
    const { result } = renderHook(() => useAccountPalette('user-1'));
    await act(async () => { result.current[1]('indigo'); });
    await act(async () => { answer(null); });
    expect(result.current[0]).toBe('indigo');
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('indigo');
    expect(shared.saveAccountPalette).toHaveBeenCalledTimes(1);
    expect(shared.saveAccountPalette).toHaveBeenCalledWith('indigo');
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
