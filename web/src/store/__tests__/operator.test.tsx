// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<typeof import('@eiyu/shared')>(),
  fetchOperatorStatus: (...args: unknown[]) => mocks.status(...args),
}));
import { useOperatorStatus } from '../operator';

afterEach(cleanup);
beforeEach(() => { mocks.status.mockReset(); });

const operator = { isOperator: true, mfaRequired: true, aal: 'aal2' };
const regular = { isOperator: false, mfaRequired: false, aal: 'aal1' };
function start(id: string | undefined) {
  return renderHook(({ userId }: { userId: string | undefined }) => useOperatorStatus(userId), { initialProps: { userId: id } });
}

describe('useOperatorStatus', () => {
  it('never reports the status of one account for another', async () => {
    mocks.status.mockResolvedValueOnce(operator);
    const hook = start('owner-a');
    await waitFor(() => expect(hook.result.current.phase).toBe('ready'));
    mocks.status.mockReturnValueOnce(new Promise(() => undefined));
    hook.rerender({ userId: 'owner-b' });
    expect(hook.result.current.phase).toBe('loading');
  });
  it('ignores a late answer for the previous account', async () => {
    let answerA: (value: unknown) => void = () => undefined;
    mocks.status.mockReturnValueOnce(new Promise(resolve => { answerA = resolve; }));
    const hook = start('owner-a');
    mocks.status.mockResolvedValueOnce(regular);
    hook.rerender({ userId: 'owner-b' });
    await waitFor(() => expect(hook.result.current).toMatchObject({ phase: 'ready', status: regular }));
    await act(async () => { answerA(operator); });
    expect(hook.result.current).toMatchObject({ phase: 'ready', status: regular });
  });
  it('does not carry a failed read over to the next account', async () => {
    mocks.status.mockRejectedValueOnce(new Error('x'));
    const hook = start('owner-a');
    await waitFor(() => expect(hook.result.current.phase).toBe('error'));
    mocks.status.mockReturnValueOnce(new Promise(() => undefined));
    hook.rerender({ userId: 'owner-b' });
    expect(hook.result.current.phase).toBe('loading');
  });
  it('keeps the current status on screen during a refresh of the same account', async () => {
    mocks.status.mockResolvedValueOnce({ ...operator, aal: 'aal1' });
    const hook = start('owner-a');
    await waitFor(() => expect(hook.result.current.phase).toBe('ready'));
    let answer: (value: unknown) => void = () => undefined;
    mocks.status.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
    act(() => { hook.result.current.refresh(); });
    expect(hook.result.current.phase).toBe('ready');
    await act(async () => { answer(operator); });
    expect(hook.result.current).toMatchObject({ phase: 'ready', status: operator });
  });
  it('reports an error when nobody is signed in, and never asks the server', async () => {
    const hook = start(undefined);
    await waitFor(() => expect(hook.result.current.phase).toBe('error'));
    expect(mocks.status).not.toHaveBeenCalled();
  });
});
