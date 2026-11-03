import { act, renderHook, waitFor } from '@testing-library/react-native';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockFetchAge = jest.fn();
jest.mock('@eiyu/shared', () => ({ ...jest.requireActual('@eiyu/shared'),
  fetchAccountAge: (...args: unknown[]) => mockFetchAge(...args),
  subscribeAccountAgeChanges: () => () => undefined,
}));

import { useAccountAudience } from '../tracker-access';

const age = (over: Record<string, unknown> = {}) => ({ userId: 'owner-a', birthDate: '2000-01-01', pendingBirthDate: null, correctionPending: false, adultDeclared: true, ...over });

function mountHook(userId: string | undefined, enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook((props: { userId: string | undefined; enabled: boolean }) => useAccountAudience(props.userId, props.enabled), { wrapper, initialProps: { userId, enabled } });
}

beforeEach(() => { mockFetchAge.mockReset(); onlineManager.setOnline(true); });
afterEach(() => { onlineManager.setOnline(true); });

describe('useAccountAudience', () => {
  it('gives undefined and reads nothing while it is turned off', async () => {
    const { result } = await mountHook('owner-a', false);
    expect(result.current).toBeUndefined();
    expect(mockFetchAge).not.toHaveBeenCalled();
  });

  it('gives undefined and reads nothing with no account', async () => {
    const { result } = await mountHook(undefined);
    expect(result.current).toBeUndefined();
    expect(mockFetchAge).not.toHaveBeenCalled();
  });

  it('says checking while the read is out, then gives the band', async () => {
    let answer: (value: unknown) => void = () => undefined;
    mockFetchAge.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const { result } = await mountHook('owner-a');
    expect(result.current).toBe('checking');
    await act(async () => { answer(age({ birthDate: '2012-01-01', adultDeclared: false })); });
    await waitFor(() => expect(result.current).toBe('teen'));
  });

  it('leaves checking for undefined when there is no birthday', async () => {
    mockFetchAge.mockResolvedValue(age({ birthDate: null }));
    const { result } = await mountHook('owner-a');
    await waitFor(() => expect(result.current).toBeUndefined());
    expect(mockFetchAge).toHaveBeenCalled();
  });

  it('leaves checking for undefined when the read fails', async () => {
    mockFetchAge.mockRejectedValue(new Error('down'));
    const { result } = await mountHook('owner-a');
    await waitFor(() => expect(result.current).toBeUndefined());
    expect(mockFetchAge).toHaveBeenCalled();
  });

  it('leaves checking for undefined when the read belongs to another account', async () => {
    mockFetchAge.mockResolvedValue(age({ userId: 'owner-b' }));
    const { result } = await mountHook('owner-a');
    await waitFor(() => expect(result.current).toBeUndefined());
    expect(mockFetchAge).toHaveBeenCalled();
  });

  it('keeps checking while offline, because no answer has come, and answers when the connection returns', async () => {
    mockFetchAge.mockResolvedValue(age());
    onlineManager.setOnline(false);
    const { result } = await mountHook('owner-a');
    expect(result.current).toBe('checking');
    expect(mockFetchAge).not.toHaveBeenCalled();
    await act(async () => { onlineManager.setOnline(true); });
    await waitFor(() => expect(result.current).toBe('adult'));
  });

  it('goes back to checking for the next account instead of keeping the last band', async () => {
    mockFetchAge.mockResolvedValueOnce(age());
    const { result, rerender } = await mountHook('owner-a');
    await waitFor(() => expect(result.current).toBe('adult'));
    mockFetchAge.mockReturnValue(new Promise(() => undefined));
    await act(async () => { await rerender({ userId: 'owner-b', enabled: true }); });
    expect(result.current).toBe('checking');
  });
});
