import {screen} from '@testing-library/react-native';
import type {ProcessingAccess} from '@eiyu/shared';
import {renderWithTheme, TestThemeProvider} from '../ui/test-theme';
import {TrackerConsent} from '../status/tracker-consent';
import {DebriefConsent} from '../status/debrief-consent';
import {noGrant, trackerAccess} from '../../test-support/tracker-fixtures';

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
  it('appears on a pending custom purpose in profile and prompt modes, with no call on mount', async () => {
    const access = {...noGrant(), customAuthorityState: 'pending' as const};
    const view = await renderWithTheme(<TrackerConsent userId="owner-a" access={access} purpose="custom-tracker"/>);
    expect(screen.getByRole('button', REQUEST)).toBeOnTheScreen();
    await view.rerender(<TestThemeProvider><TrackerConsent userId="owner-a" access={access} purpose="custom-tracker" mode="prompt"/></TestThemeProvider>);
    expect(screen.getByRole('button', REQUEST)).toBeOnTheScreen();
    expect(mockRequest).not.toHaveBeenCalled();
  });
  it('is not offered for the other purpose when only one is pending', async () => {
    const access = {...noGrant(), customAuthorityState: 'pending' as const};
    await renderWithTheme(<TrackerConsent userId="owner-a" access={access} purpose="fitness-tracking"/>);
    expect(screen.queryByRole('button', REQUEST)).toBeNull();
  });
  it.each(['not-required', 'approved', 'revoked'] as const)('is not offered when the state is %s', async state => {
    await renderWithTheme(<TrackerConsent userId="owner-a" access={trackerAccess({customConsent: false, canWriteCustom: false, customAuthorityState: state})} purpose="custom-tracker"/>);
    expect(screen.queryByRole('button', REQUEST)).toBeNull();
  });
  it('is not offered once the purpose is granted', async () => {
    await renderWithTheme(<TrackerConsent userId="owner-a" access={trackerAccess({customAuthorityState: 'pending', canWriteCustom: false})} purpose="custom-tracker"/>);
    expect(screen.queryByRole('button', REQUEST)).toBeNull();
  });
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
