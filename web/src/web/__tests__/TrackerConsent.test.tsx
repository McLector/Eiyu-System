// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackerAccess } from '@eiyu/shared';

const mocks = vi.hoisted(() => ({ save: vi.fn(), kind: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => {
  return {
    ...await importOriginal<typeof import('@eiyu/shared')>(),
    setTrackerConsent: (...args: unknown[]) => mocks.save(...args),
    trackerErrorKind: (error: unknown) => mocks.kind(error),
  };
});

import { TrackerConsent } from '../TrackerConsent';
import { TRACKER_PURPOSE_NOTICES as NOTICES } from '@eiyu/shared';
import { noGrant, trackerAccess } from '../../test/tracker-fixtures';

afterEach(cleanup);
beforeEach(() => { mocks.save.mockReset(); mocks.kind.mockReset().mockReturnValue(null); });

const granted = (access: TrackerAccess, purpose: 'custom-tracker' | 'fitness-tracking'): TrackerAccess => ({
  ...access, revision: { ...access.revision, consentVersion: access.revision.consentVersion + 1 },
  ...(purpose === 'custom-tracker' ? { customConsent: true, canWriteCustom: true } : { fitnessConsent: true, canWriteFitness: true }),
});

describe('TrackerConsent in Profile', () => {
  it('shows an unchecked, purpose-specific choice and makes no call on mount', () => {
    render(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" />);
    const box = screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label });
    expect(box).not.toBeChecked();
    expect(screen.getByText(NOTICES['custom-tracker'].body)).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('grants one purpose with its notice version and a copy of the captured revision', async () => {
    const access = noGrant(); const next = granted(access, 'fitness-tracking'); mocks.save.mockResolvedValue(next);
    const changed = vi.fn(); const user = userEvent.setup();
    render(<TrackerConsent userId="owner-a" access={access} purpose="fitness-tracking" onChanged={changed} />);
    await user.click(screen.getByRole('checkbox', { name: NOTICES['fitness-tracking'].label }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(next));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith('fitness-tracking', true, NOTICES['fitness-tracking'].version, access.revision);
    expect(mocks.save.mock.calls[0][3]).not.toBe(access.revision);
  });

  it('keeps the two purposes independent', async () => {
    const access = trackerAccess({ fitnessConsent: false, canWriteFitness: false });
    mocks.save.mockResolvedValue(granted(access, 'fitness-tracking')); const user = userEvent.setup();
    render(<><TrackerConsent userId="owner-a" access={access} purpose="custom-tracker" />
      <TrackerConsent userId="owner-a" access={access} purpose="fitness-tracking" /></>);
    expect(screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: NOTICES['fitness-tracking'].label })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: NOTICES['fitness-tracking'].label }));
    expect(mocks.save).toHaveBeenCalledWith('fitness-tracking', true, NOTICES['fitness-tracking'].version, access.revision);
    expect(mocks.save).not.toHaveBeenCalledWith('custom-tracker', expect.anything(), expect.anything(), expect.anything());
  });

  it('withdraws one purpose, even after authority was revoked', async () => {
    const access = trackerAccess({ customAuthorityState: 'revoked', canWriteCustom: false });
    mocks.save.mockResolvedValue({ ...access, customConsent: false }); const user = userEvent.setup();
    render(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker" />);
    const box = screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label });
    expect(box).toBeEnabled();
    await user.click(box);
    expect(mocks.save).toHaveBeenCalledWith('custom-tracker', false, NOTICES['custom-tracker'].version, access.revision);
  });

  it('does not grant while authority is pending or revoked, or tracker writes are paused', () => {
    for (const over of [{ customAuthorityState: 'pending' as const }, { customAuthorityState: 'revoked' as const }, { canWriteBasic: false }]) {
      const { unmount } = render(<TrackerConsent userId="owner-a" access={{ ...noGrant(), ...over }} purpose="custom-tracker" />);
      expect(screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label })).toBeDisabled();
      expect(screen.getByText(/needs review|paused/i)).toBeInTheDocument();
      unmount();
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('toggles from the keyboard', async () => {
    const access = noGrant(); mocks.save.mockResolvedValue(granted(access, 'custom-tracker')); const user = userEvent.setup();
    render(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker" />);
    await user.tab();
    expect(screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label })).toHaveFocus();
    await user.keyboard(' ');
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  });

  it('does not show a failed save as accepted and moves focus to the error', async () => {
    mocks.save.mockRejectedValue(new Error('Synthetic offline')); const changed = vi.fn(); const user = userEvent.setup();
    render(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" onChanged={changed} />);
    await user.click(screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Synthetic offline');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label })).not.toBeChecked();
    expect(changed).not.toHaveBeenCalled();
  });

  it('on a stale revision keeps the old choice, asks for a refresh and does not retry', async () => {
    mocks.save.mockRejectedValue(Object.assign(new Error('stale'), { code: 'ET003' })); mocks.kind.mockReturnValue('access-changed');
    const stale = vi.fn(); const changed = vi.fn(); const user = userEvent.setup();
    render(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" onChanged={changed} onStale={stale} />);
    await user.click(screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/changed/i);
    expect(stale).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not forward an A result after switching to B', async () => {
    let release!: (value: TrackerAccess) => void;
    mocks.save.mockReturnValue(new Promise(resolve => { release = resolve; })); const changed = vi.fn(); const user = userEvent.setup();
    const view = render(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" onChanged={changed} />);
    await user.click(screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label }));
    view.rerender(<TrackerConsent userId="owner-b" access={noGrant('owner-b')} purpose="custom-tracker" onChanged={changed} />);
    release(granted(noGrant(), 'custom-tracker'));
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    expect(changed).not.toHaveBeenCalled();
  });

  it('rejects a capability that belongs to another account', () => {
    render(<TrackerConsent userId="owner-b" access={noGrant()} purpose="custom-tracker" />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/unavailable for this account/i);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('keeps the choice at least 44px tall so large text does not clip it', () => {
    render(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" />);
    expect(screen.getByRole('checkbox').closest('label')).toHaveStyle({ minHeight: '44px' });
  });
});

describe('TrackerConsent in an editor', () => {
  it('asks before saving, and declining sends nothing', async () => {
    const decline = vi.fn(); const user = userEvent.setup();
    render(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" mode="prompt" onDecline={decline} declineLabel="Use basic tracking" />);
    expect(screen.getByText(NOTICES['custom-tracker'].body)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use basic tracking' }));
    expect(decline).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('records a grant only after the explicit agree button', async () => {
    const access = noGrant(); const next = granted(access, 'custom-tracker'); mocks.save.mockResolvedValue(next);
    const changed = vi.fn(); const user = userEvent.setup();
    render(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker" mode="prompt" onChanged={changed} onDecline={vi.fn()} declineLabel="Use basic tracking" />);
    expect(mocks.save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: NOTICES['custom-tracker'].label }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(next));
    expect(mocks.save).toHaveBeenCalledWith('custom-tracker', true, NOTICES['custom-tracker'].version, access.revision);
  });
});

describe('TrackerConsent age-appropriate text', () => {
  const purposes = ['custom-tracker', 'fitness-tracking'] as const;
  for (const purpose of purposes) {
    it(`shows the shared 12-17 explanation for a teen (${purpose}) and not the adult text`, () => {
      render(<TrackerConsent userId="owner-a" access={noGrant()} purpose={purpose} audience="teen" />);
      expect(screen.getByText(NOTICES[purpose].childBody)).toBeInTheDocument();
      expect(screen.queryByText(NOTICES[purpose].body)).not.toBeInTheDocument();
    });
    it(`shows the adult text for an adult (${purpose})`, () => {
      render(<TrackerConsent userId="owner-a" access={noGrant()} purpose={purpose} audience="adult" />);
      expect(screen.getByText(NOTICES[purpose].body)).toBeInTheDocument();
      expect(screen.queryByText(NOTICES[purpose].childBody)).not.toBeInTheDocument();
    });
    it(`shows the adult text when the age is unknown (${purpose})`, () => {
      render(<TrackerConsent userId="owner-a" access={noGrant()} purpose={purpose} />);
      expect(screen.getByText(NOTICES[purpose].body)).toBeInTheDocument();
      expect(screen.queryByText(NOTICES[purpose].childBody)).not.toBeInTheDocument();
    });
  }
  for (const purpose of purposes) {
    it(`shows neither notice and holds the grant while the age is being read (${purpose})`, async () => {
      const user = userEvent.setup();
      render(<TrackerConsent userId="owner-a" access={noGrant()} purpose={purpose} audience="checking" />);
      expect(screen.queryByText(NOTICES[purpose].body)).not.toBeInTheDocument();
      expect(screen.queryByText(NOTICES[purpose].childBody)).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Checking your account…');
      const box = screen.getByRole('checkbox', { name: NOTICES[purpose].label });
      expect(box).toBeDisabled();
      await user.click(box);
      expect(mocks.save).not.toHaveBeenCalled();
    });
  }
  it('keeps withdrawal open while the age is being read', async () => {
    const access = trackerAccess(); mocks.save.mockResolvedValue(noGrant()); const user = userEvent.setup();
    render(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker" audience="checking" />);
    const box = screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label });
    expect(box).toBeEnabled();
    await user.click(box);
    expect(mocks.save).toHaveBeenCalledWith('custom-tracker', false, NOTICES['custom-tracker'].version, access.revision);
  });
  it('in the editor prompt, holds the grant but lets the person decline while the age is being read', async () => {
    const decline = vi.fn(); const user = userEvent.setup();
    render(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" mode="prompt" audience="checking" onDecline={decline} />);
    expect(screen.queryByText(NOTICES['custom-tracker'].body)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: NOTICES['custom-tracker'].label })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(decline).toHaveBeenCalledTimes(1);
  });
  it('says nothing about checking once the age is known', () => {
    render(<TrackerConsent userId="owner-a" access={noGrant()} purpose="custom-tracker" audience="adult" />);
    expect(screen.queryByText('Checking your account…')).not.toBeInTheDocument();
  });
  it('uses the teen text in the editor prompt too, and keeps the same notice version', async () => {
    const access = noGrant(); mocks.save.mockResolvedValue(granted(access, 'custom-tracker')); const user = userEvent.setup();
    render(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker" mode="prompt" audience="teen" />);
    expect(screen.getByText(NOTICES['custom-tracker'].childBody)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: NOTICES['custom-tracker'].label }));
    expect(mocks.save).toHaveBeenCalledWith('custom-tracker', true, NOTICES['custom-tracker'].version, access.revision);
  });
});
