import {act, screen, userEvent, waitFor} from '@testing-library/react-native';
import {AppState, type AppStateStatus} from 'react-native';
import {renderWithTheme} from '../ui/test-theme';
import {WeeklyDebrief} from '../status/weekly-debrief';

const mockSummary = jest.fn();
const mockStatus = jest.fn();
const mockSend = jest.fn();
const mockVerify = jest.fn();
const mockAccess = jest.fn();
const mockSaved = jest.fn();
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  fetchOrCreateWeeklySummary: (...args: unknown[]) => mockSummary(...args),
  fetchMailboxStatus: () => mockStatus(),
  sendMailboxCode: () => mockSend(),
  verifyMailboxCode: (...args: unknown[]) => mockVerify(...args),
  fetchProcessingAccess: () => mockAccess(),
  fetchSavedWeeklySummary: (...args: unknown[]) => mockSaved(...args),
  subscribeProcessingAccessChanges: () => () => {},
  subscribeMailboxChanges: () => () => {},
}));
let resume: (state: AppStateStatus) => void;
beforeEach(() => {
  jest.clearAllMocks();
  mockAccess.mockReset().mockResolvedValue({contractVersion: 1, userId: 'owner', ageVersion: 1, consentVersion: 1, authorityVersion: 0, mailboxVersion: 1,
    ageEligible: true, ageConsent: true, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true, authorityState: 'not-required'});
  mockSaved.mockReset().mockResolvedValue(null);
  mockSummary.mockRejectedValue(new Error('Verify your email to access your weekly debrief.'));
  mockStatus.mockResolvedValue({userId: 'owner', version: 1, verified: false});
  mockSend.mockResolvedValue({challengeId: 'challenge', retryAfter: 60});
  mockVerify.mockResolvedValue({userId: 'owner', version: 1, verified: true});
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    resume = listener;
    return {remove: jest.fn()};
  });
});
afterEach(() => jest.restoreAllMocks());
it('never invokes the generation helper on mount or foreground without AI permission, but can read saved content', async () => {
  const access = {...await mockAccess(), aiConsent: false, canGenerateDebrief: false};
  mockAccess.mockResolvedValue(access); mockSaved.mockResolvedValue('Saved history after withdrawal.');
  await renderWithTheme(<WeeklyDebrief userId="owner" timeZone="Asia/Manila"/>);
  expect(await screen.findByTestId('weekly-summary-content')).toHaveTextContent('Saved history after withdrawal.');
  await act(async () => {resume('background'); resume('active');});
  await waitFor(() => expect(mockSaved).toHaveBeenCalledTimes(2));
  expect(mockSummary).not.toHaveBeenCalled();
  expect(screen.getByRole('button', {name: 'Regenerate weekly summary'})).toBeDisabled();
});
it('does not read or generate for a mismatched owner or unavailable capability', async () => {
  mockAccess.mockResolvedValue({...await mockAccess(), userId: 'other'});
  await renderWithTheme(<WeeklyDebrief userId="owner" timeZone="Asia/Manila"/>);
  await screen.findByRole('alert'); expect(mockSaved).not.toHaveBeenCalled(); expect(mockSummary).not.toHaveBeenCalled();
});
async function draft() {
  const user = userEvent.setup();
  await renderWithTheme(<WeeklyDebrief userId="owner" timeZone="Asia/Manila" />);
  await user.press(await screen.findByRole('button', {name: 'Send verification email'}));
  // From here the server holds the code that was just sent, so later status reads report it (as the real one does).
  mockStatus.mockResolvedValue({userId: 'owner', version: 1, verified: false, challenge: {id: 'challenge', expiresAt: '2026-11-08T12:10:00+00:00', resendAfter: 50}});
  await user.type(await screen.findByLabelText('Verification code'), '12345678');
}
it('keeps the current mailbox challenge and draft when returning from reading email', async () => {
  await draft();
  await act(async () => { resume('background'); resume('active'); });
  await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(2));
  expect(await screen.findByLabelText('Verification code')).toHaveProp('value', '12345678');
  expect(screen.getByRole('button', {name: 'Verify code'})).toBeEnabled();
  expect(screen.queryByTestId('weekly-summary-content')).toBeNull();
  expect(mockSend).toHaveBeenCalledTimes(1);
});
it('clears the old challenge on return when the mailbox version changed', async () => {
  await draft();
  mockStatus.mockResolvedValue({userId: 'owner', version: 2, verified: false});
  await act(async () => { resume('background'); resume('active'); });
  await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(screen.queryByLabelText('Verification code')).toBeNull());
  expect(screen.getByRole('button', {name: /Send verification email|Resend in/})).toBeTruthy();
});
it('shows the debrief after verification instead of retaining its earlier mailbox error', async () => {
  await draft();
  mockSummary.mockResolvedValue('Your verified weekly summary.');
  await userEvent.setup().press(screen.getByRole('button', {name: 'Verify code'}));
  expect(await screen.findByTestId('weekly-summary-content')).toHaveTextContent('Your verified weekly summary.');
  expect(screen.queryByLabelText('Verification code')).toBeNull();
});
it('does not repeatedly restart debrief loading after the mailbox becomes verified', async () => {
  await draft();
  mockSummary.mockReturnValue(new Promise(() => {}));
  // A second refreshed status is unproved to bound the regression's callback loop.
  mockStatus.mockResolvedValueOnce({userId: 'owner', version: 1, verified: true});
  await userEvent.setup().press(screen.getByRole('button', {name: 'Verify code'}));
  await waitFor(() => expect(mockStatus.mock.calls.length).toBeGreaterThanOrEqual(3));
  expect(mockSummary).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId('weekly-summary-content')).toBeNull();
});
