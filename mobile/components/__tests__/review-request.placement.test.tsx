import {screen} from '@testing-library/react-native';
import type {ProcessingAccess} from '@eiyu/shared';
import {renderWithTheme, TestThemeProvider} from '../ui/test-theme';
import {DebriefConsent} from '../status/debrief-consent';

const mockRequest = jest.fn();
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  requestAuthorityReview: (...args: unknown[]) => mockRequest(...args),
  cancelAuthorityReview: jest.fn(),
  fetchMyReviewRequests: jest.fn(async () => []),
}));
beforeEach(() => mockRequest.mockReset());

const processing: ProcessingAccess = {
  contractVersion: 1, userId: 'owner-a', ageVersion: 1, consentVersion: 1, authorityVersion: 0, mailboxVersion: 1,
  ageEligible: true, ageConsent: true, aiConsent: false, canReadDebrief: true, canGenerateDebrief: false, authorityState: 'not-required',
};
const REQUEST = {name: 'Request review'};

describe('Request review placement (native)', () => {
  it('appears on a pending weekly debrief but not on age screening', async () => {
    const pending = {...processing, authorityState: 'pending' as const, canReadDebrief: false};
    const view = await renderWithTheme(<DebriefConsent userId="owner-a" access={pending}/>);
    expect(screen.getByRole('button', REQUEST)).toBeOnTheScreen();
    await view.rerender(<TestThemeProvider><DebriefConsent userId="owner-a" access={pending} purpose="age-screening"/></TestThemeProvider>);
    expect(screen.queryByRole('button', REQUEST)).toBeNull();
  });
  it('is absent from the debrief when nothing is pending or it is granted', async () => {
    const view = await renderWithTheme(<DebriefConsent userId="owner-a" access={processing}/>);
    expect(screen.queryByRole('button', REQUEST)).toBeNull();
    await view.rerender(<TestThemeProvider><DebriefConsent userId="owner-a" access={{...processing, authorityState: 'pending', aiConsent: true}}/></TestThemeProvider>);
    expect(screen.queryByRole('button', REQUEST)).toBeNull();
  });
});
