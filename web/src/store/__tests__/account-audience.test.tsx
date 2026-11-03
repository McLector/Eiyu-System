// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchAge: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<object>(),
  fetchAccountAge: (...args: unknown[]) => mocks.fetchAge(...args),
  subscribeAccountAgeChanges: () => () => undefined,
}));

import { useAccountAudience } from '../tracker';

const age = (over: Record<string, unknown> = {}) => ({ userId: 'owner-a', birthDate: '2000-01-01', pendingBirthDate: null, correctionPending: false, adultDeclared: true, ...over });

async function mountHook(userId: string | undefined, enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook((props: { userId: string | undefined; enabled: boolean }) => useAccountAudience(props.userId, props.enabled), { wrapper, initialProps: { userId, enabled } });
}

beforeEach(() => { mocks.fetchAge.mockReset(); onlineManager.setOnline(true); });
afterEach(() => { cleanup(); onlineManager.setOnline(true); });

describe('useAccountAudience', () => {
  it('gives undefined and reads nothing while it is turned off', async () => {
    const { result } = await mountHook('owner-a', false);
    expect(result.current).toBeUndefined();
    expect(mocks.fetchAge).not.toHaveBeenCalled();
  });

  it('gives undefined and reads nothing with no account', async () => {
    const { result } = await mountHook(undefined);
    expect(result.current).toBeUndefined();
    expect(mocks.fetchAge).not.toHaveBeenCalled();
  });

  it('says checking while the read is out, then gives the band', async () => {
    let answer: (value: unknown) => void = () => undefined;
    mocks.fetchAge.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const { result } = await mountHook('owner-a');
    expect(result.current).toBe('checking');
    await act(async () => { answer(age({ birthDate: '2012-01-01', adultDeclared: false })); });
    await waitFor(() => expect(result.current).toBe('teen'));
  });

  it('leaves checking for undefined when there is no birthday', async () => {
    mocks.fetchAge.mockResolvedValue(age({ birthDate: null }));
    const { result } = await mountHook('owner-a');
    await waitFor(() => expect(result.current).toBeUndefined());
    expect(mocks.fetchAge).toHaveBeenCalled();
  });

  it('leaves checking for undefined when the read fails', async () => {
    mocks.fetchAge.mockRejectedValue(new Error('down'));
    const { result } = await mountHook('owner-a');
    await waitFor(() => expect(result.current).toBeUndefined());
    expect(mocks.fetchAge).toHaveBeenCalled();
  });

  it('leaves checking for undefined when the read belongs to another account', async () => {
    mocks.fetchAge.mockResolvedValue(age({ userId: 'owner-b' }));
    const { result } = await mountHook('owner-a');
    await waitFor(() => expect(result.current).toBeUndefined());
    expect(mocks.fetchAge).toHaveBeenCalled();
  });

  it('keeps checking while offline, because no answer has come, and answers when the connection returns', async () => {
    mocks.fetchAge.mockResolvedValue(age());
    onlineManager.setOnline(false);
    const { result } = await mountHook('owner-a');
    expect(result.current).toBe('checking');
    expect(mocks.fetchAge).not.toHaveBeenCalled();
    await act(async () => { onlineManager.setOnline(true); });
    await waitFor(() => expect(result.current).toBe('adult'));
  });

  it('goes back to checking for the next account instead of keeping the last band', async () => {
    mocks.fetchAge.mockResolvedValueOnce(age());
    const { result, rerender } = await mountHook('owner-a');
    await waitFor(() => expect(result.current).toBe('adult'));
    mocks.fetchAge.mockReturnValue(new Promise(() => undefined));
    await act(async () => { await rerender({ userId: 'owner-b', enabled: true }); });
    expect(result.current).toBe('checking');
  });
});
