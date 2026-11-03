// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackerAccess } from '@eiyu/shared';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<typeof import('@eiyu/shared')>(),
  fetchTrackerAccess: (...args: unknown[]) => mocks.read(...args),
  subscribeTrackerAccessChanges: () => () => undefined,
}));
vi.mock('../RetentionNotice', () => ({ default: () => null }));
vi.mock('../TrackerConsent', () => ({
  TrackerConsent: ({ purpose, access, onChanged, onStale }: { purpose: string; access: TrackerAccess; onChanged: (next: TrackerAccess) => void; onStale: () => void }) => <>
    <button type="button" onClick={() => onChanged({ ...access, canWriteCustom: true, customConsent: true })}>grant {purpose}</button>
    <button type="button" onClick={onStale}>stale {purpose}</button>
  </>,
}));
import TrackerPermissions from '../TrackerPermissions';
import { trackerKey } from '../../store/tracker';

afterEach(cleanup);
const OWNER = 'owner-a';
const access = {
  contractVersion: 1, revision: { userId: OWNER, ageVersion: 1, consentVersion: 1, authorityVersion: 0 },
  canWriteBasic: true, customConsent: false, fitnessConsent: false, customAuthorityState: 'not-required', fitnessAuthorityState: 'not-required',
  canWriteCustom: false, canWriteFitness: false,
};
beforeEach(() => { mocks.read.mockReset().mockResolvedValue(access); });

async function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><TrackerPermissions userId={OWNER} /></QueryClientProvider>);
  await screen.findByRole('button', { name: 'grant custom-tracker' });
  invalidate.mockClear();
  return { client, invalidate };
}
const invalidated = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.map(call => (call[0] as { queryKey: unknown }).queryKey);

describe('after a permission changes in Profile', () => {
  it('keeps the confirmed access and refreshes every quest list, because each row carries its own write permission', async () => {
    const user = userEvent.setup();
    const { client, invalidate } = await open();
    await user.click(screen.getByRole('button', { name: 'grant custom-tracker' }));
    await waitFor(() => expect(client.getQueryData<TrackerAccess>(trackerKey(OWNER))?.canWriteCustom).toBe(true));
    expect(invalidated(invalidate as never)).toEqual(expect.arrayContaining([['habits'], ['backlog'], ['longQuests', OWNER]]));
  });
  it('does the same for the other purpose', async () => {
    const user = userEvent.setup();
    const { invalidate } = await open();
    await user.click(screen.getByRole('button', { name: 'grant fitness-tracking' }));
    await waitFor(() => expect(invalidated(invalidate as never)).toEqual(expect.arrayContaining([['habits'], ['backlog'], ['longQuests', OWNER]])));
  });
  it('re-reads only access when a change was refused as stale, because nothing changed', async () => {
    const user = userEvent.setup();
    const { invalidate } = await open();
    await user.click(screen.getByRole('button', { name: 'stale custom-tracker' }));
    await waitFor(() => expect(invalidated(invalidate as never)).toEqual([trackerKey(OWNER)]));
  });
});
