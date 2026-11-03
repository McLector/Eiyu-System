// @vitest-environment jsdom
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {ProcessingAccess} from '@eiyu/shared';
const save = vi.hoisted(() => vi.fn());
vi.mock('@eiyu/shared', async importOriginal => ({...await importOriginal<typeof import('@eiyu/shared')>(),
  setProcessingConsent: (...args: unknown[]) => save(...args)}));
import {DebriefConsent} from '../DebriefConsent';
afterEach(cleanup);
const access: ProcessingAccess = {contractVersion: 1, userId: 'owner-a', ageVersion: 1,
  consentVersion: 1, authorityVersion: 0, mailboxVersion: 1, ageEligible: true,
  ageConsent: true, aiConsent: false, canReadDebrief: true, canGenerateDebrief: false,
  authorityState: 'not-required'};
const granted = {...access, aiConsent: true, canGenerateDebrief: true, consentVersion: 2};
beforeEach(() => {save.mockReset().mockResolvedValue(granted);});
it('shows an unchecked specific AI choice, recipient and automatic trigger', () => {
  render(<DebriefConsent userId="owner-a" access={access}/>);
  expect(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i})).not.toBeChecked();
  expect(screen.getByText(/Opening Status or Weekly/)).toBeInTheDocument();
  expect(screen.getAllByText(/Groq/).length).toBeGreaterThan(0);
  expect(save).not.toHaveBeenCalled();
});
it('saves explicit purpose and captured account revisions', async () => {
  const changed = vi.fn(), user = userEvent.setup();
  render(<DebriefConsent userId="owner-a" access={access} onChanged={changed}/>);
  await user.click(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i}));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(granted));
  expect(save).toHaveBeenCalledWith('weekly-debrief', true, '2026-10-20-weekly-debrief-v1', access);
});
it('does not grant pending authority or collect new verification fields', () => {
  render(<DebriefConsent userId="owner-a" access={{...access, authorityState: 'pending', canReadDebrief: false}}/>);
  expect(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i})).toBeDisabled();
  expect(screen.getByText(/permission needs review/i)).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); expect(save).not.toHaveBeenCalled();
});
it('permits withdrawal even after authority revocation', async () => {
  const revoked = {...granted, authorityState: 'revoked' as const, canReadDebrief: false, canGenerateDebrief: false};
  const withdrawn = {...revoked, aiConsent: false, consentVersion: 3}; save.mockResolvedValue(withdrawn);
  const changed = vi.fn(), user = userEvent.setup();
  render(<DebriefConsent userId="owner-a" access={revoked} onChanged={changed}/>);
  await user.click(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i}));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(withdrawn));
  expect(save).toHaveBeenCalledWith('weekly-debrief', false, '2026-10-20-weekly-debrief-v1', revoked);
});
it('does not display a failed save as accepted consent', async () => {
  save.mockRejectedValue(new Error('Synthetic offline')); const changed = vi.fn(), user = userEvent.setup();
  render(<DebriefConsent userId="owner-a" access={access} onChanged={changed}/>);
  await user.click(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic offline');
  expect(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i})).not.toBeChecked();
  expect(changed).not.toHaveBeenCalled();
});
it('does not forward A consent after switching to B', async () => {
  let release!: (value: ProcessingAccess) => void;
  save.mockReturnValue(new Promise(resolve => {release = resolve;})); const changed = vi.fn(), user = userEvent.setup();
  const view = render(<DebriefConsent userId="owner-a" access={access} onChanged={changed}/>);
  await user.click(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i}));
  view.rerender(<DebriefConsent userId="owner-b" access={{...access, userId: 'owner-b'}} onChanged={changed}/>);
  release(granted);
  await waitFor(() => expect(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i})).toBeEnabled());
  expect(changed).not.toHaveBeenCalled();
});
it('rejects a mismatched account control', () => {
  render(<DebriefConsent userId="owner-b" access={access}/>);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(save).not.toHaveBeenCalled();
});
it('records the birthday purpose independently', async () => {
  const initial = {...access, ageConsent: false, canReadDebrief: false, consentVersion: 0}; save.mockResolvedValue(access);
  const changed = vi.fn(), user = userEvent.setup();
  render(<DebriefConsent userId="owner-a" access={initial} purpose="age-screening" onChanged={changed}/>);
  await user.click(screen.getByRole('checkbox', {name: /I agree.*birthday/i}));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(access));
  expect(save).toHaveBeenCalledWith('age-screening', true, '2026-10-20-age-v1', initial);
});
