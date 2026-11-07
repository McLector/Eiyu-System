// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProcessingAccess } from '@eiyu/shared';

vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<typeof import('@eiyu/shared')>(),
  requestAuthorityReview: vi.fn(), cancelAuthorityReview: vi.fn(), fetchMyReviewRequests: vi.fn(async () => []),
}));
import { DebriefConsent } from '../DebriefConsent';

afterEach(cleanup);
const processing: ProcessingAccess = {
  contractVersion: 1, userId: 'owner-a', ageVersion: 1, consentVersion: 1, authorityVersion: 0, mailboxVersion: 1,
  ageEligible: true, ageConsent: true, aiConsent: false, canReadDebrief: true, canGenerateDebrief: false, authorityState: 'not-required',
};

describe('Request review placement', () => {
  it('appears on a pending weekly debrief but not on age screening', () => {
    const pending = { ...processing, authorityState: 'pending' as const, canReadDebrief: false };
    const { rerender } = render(<DebriefConsent userId="owner-a" access={pending} />);
    expect(screen.getByRole('button', { name: 'Request review' })).toBeInTheDocument();
    rerender(<DebriefConsent userId="owner-a" access={pending} purpose="age-screening" />);
    expect(screen.queryByRole('button', { name: 'Request review' })).not.toBeInTheDocument();
  });
  it('is absent from the debrief when nothing is pending', () => {
    render(<DebriefConsent userId="owner-a" access={processing} />);
    expect(screen.queryByRole('button', { name: 'Request review' })).not.toBeInTheDocument();
  });
});
