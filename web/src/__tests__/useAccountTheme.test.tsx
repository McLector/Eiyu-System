// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({ fetchAccountTheme: vi.fn(), saveAccountTheme: vi.fn() }));
vi.mock('@eiyu/shared', async importActual => ({ ...(await importActual<typeof import('@eiyu/shared')>()), ...shared }));

import { THEME_STORAGE_KEY, THEME_UNSYNCED_KEY } from '../theme-storage';
import { useAccountTheme } from '../useAccountTheme';

beforeEach(() => {
  window.localStorage.clear();
  shared.fetchAccountTheme.mockReset().mockResolvedValue('dark');
  shared.saveAccountTheme.mockReset().mockImplementation(async (t: string) => t);
});
afterEach(cleanup);

describe('useAccountTheme', () => {
  it('starts from the browser copy, or dark, with no wait for the account', () => {
    shared.fetchAccountTheme.mockReturnValue(new Promise(() => {}));
    expect(renderHook(() => useAccountTheme('u1')).result.current[0]).toBe('dark');
    cleanup();
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(renderHook(() => useAccountTheme('u1')).result.current[0]).toBe('light');
  });

  it('takes the account theme over the browser copy and remembers it', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    shared.fetchAccountTheme.mockResolvedValue('light');
    const { result } = renderHook(() => useAccountTheme('u1'));
    await waitFor(() => expect(result.current[0]).toBe('light'));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(shared.saveAccountTheme).not.toHaveBeenCalled();
  });

  it('saves a pick to the account and keeps it locally', async () => {
    const { result } = renderHook(() => useAccountTheme('u1'));
    await waitFor(() => expect(shared.fetchAccountTheme).toHaveBeenCalled());
    act(() => result.current[1]('light'));
    expect(result.current[0]).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(shared.saveAccountTheme).toHaveBeenCalledWith('light');
    await waitFor(() => expect(window.localStorage.getItem(THEME_UNSYNCED_KEY)).toBeNull());
  });

  it('keeps a pick the account rejected (migration not applied) and marks it unsynced, without surfacing the error', async () => {
    shared.saveAccountTheme.mockRejectedValue(new Error('function not found'));
    const { result } = renderHook(() => useAccountTheme('u1'));
    await waitFor(() => expect(shared.fetchAccountTheme).toHaveBeenCalled());
    act(() => result.current[1]('light'));
    await waitFor(() => expect(shared.saveAccountTheme).toHaveBeenCalled());
    expect(result.current[0]).toBe('light');
    expect(window.localStorage.getItem(THEME_UNSYNCED_KEY)).toBe('u1');
  });

  it('on the next launch the unsynced local theme beats the stale account theme and is pushed again', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    window.localStorage.setItem(THEME_UNSYNCED_KEY, 'u1');
    shared.fetchAccountTheme.mockResolvedValue('dark');
    const { result } = renderHook(() => useAccountTheme('u1'));
    await waitFor(() => expect(shared.saveAccountTheme).toHaveBeenCalledWith('light'));
    expect(result.current[0]).toBe('light');
    await waitFor(() => expect(window.localStorage.getItem(THEME_UNSYNCED_KEY)).toBeNull());
  });

  it('keeps the unsynced theme and the flag when the push is rejected again', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    window.localStorage.setItem(THEME_UNSYNCED_KEY, 'u1');
    shared.fetchAccountTheme.mockResolvedValue('dark');
    shared.saveAccountTheme.mockRejectedValue(new Error('function not found'));
    const { result } = renderHook(() => useAccountTheme('u1'));
    await waitFor(() => expect(shared.saveAccountTheme).toHaveBeenCalled());
    expect(result.current[0]).toBe('light');
    expect(window.localStorage.getItem(THEME_UNSYNCED_KEY)).toBe('u1');
  });

  it('keeps the browser copy when the account cannot be read', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    shared.fetchAccountTheme.mockResolvedValue(null);
    const { result } = renderHook(() => useAccountTheme('u1'));
    await waitFor(() => expect(shared.fetchAccountTheme).toHaveBeenCalled());
    expect(result.current[0]).toBe('light');
    expect(shared.saveAccountTheme).not.toHaveBeenCalled();
  });

  it('lets a pick made before the account answered win', async () => {
    let resolve!: (t: string) => void;
    shared.fetchAccountTheme.mockReturnValue(new Promise<string>(r => { resolve = r; }));
    const { result } = renderHook(() => useAccountTheme('u1'));
    act(() => result.current[1]('light'));
    await act(async () => { resolve('dark'); });
    expect(result.current[0]).toBe('light');
  });

  it('does nothing against the account while signed out', () => {
    const { result } = renderHook(() => useAccountTheme(undefined));
    act(() => result.current[1]('light'));
    expect(result.current[0]).toBe('light');
    expect(shared.fetchAccountTheme).not.toHaveBeenCalled();
    expect(shared.saveAccountTheme).not.toHaveBeenCalled();
  });

  it("a different account does not inherit the previous account's unsynced flag", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    window.localStorage.setItem(THEME_UNSYNCED_KEY, 'u1');
    shared.fetchAccountTheme.mockResolvedValue('dark');
    const { result } = renderHook(() => useAccountTheme('u2'));
    await waitFor(() => expect(result.current[0]).toBe('dark'));
    expect(shared.saveAccountTheme).not.toHaveBeenCalled();
  });
});
