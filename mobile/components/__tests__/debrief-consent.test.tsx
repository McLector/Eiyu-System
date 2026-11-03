import {act, screen, userEvent, waitFor} from '@testing-library/react-native';
import type {ProcessingAccess} from '@eiyu/shared';
import {renderWithTheme, TestThemeProvider} from '../ui/test-theme';
import {DebriefConsent} from '../status/debrief-consent';
const mockSave = jest.fn();
jest.mock('@eiyu/shared', () => ({...jest.requireActual('@eiyu/shared'),
  setProcessingConsent: (...args: unknown[]) => mockSave(...args)}));
const access: ProcessingAccess = {contractVersion: 1, userId: 'owner-a', ageVersion: 1,
  consentVersion: 1, authorityVersion: 0, mailboxVersion: 1, ageEligible: true,
  ageConsent: true, aiConsent: false, canReadDebrief: true, canGenerateDebrief: false,
  authorityState: 'not-required'};
const granted = {...access, aiConsent: true, canGenerateDebrief: true, consentVersion: 2};
beforeEach(() => mockSave.mockReset().mockResolvedValue(granted));

it('shows separate unchecked AI permission and the current automatic trigger before any save', async () => {
  await renderWithTheme(<DebriefConsent userId="owner-a" access={access}/>);
  expect(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i})).not.toBeChecked();
  expect(screen.getByText(/Opening Status or Weekly/)).toBeOnTheScreen();
  expect(screen.getAllByText(/Groq/).length).toBeGreaterThan(0);
  expect(screen.queryByLabelText(/guardian birthday|upload document|selfie/i)).toBeNull();
  expect(mockSave).not.toHaveBeenCalled();
});
it('saves only the specific purpose and current account revision after an explicit choice', async () => {
  const changed = jest.fn(); const user = userEvent.setup();
  await renderWithTheme(<DebriefConsent userId="owner-a" access={access} onChanged={changed}/>);
  await user.press(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i}));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(granted));
  expect(mockSave).toHaveBeenCalledWith('weekly-debrief', true, '2026-10-20-weekly-debrief-v1', access);
});
it('does not promote pending authority into a guardian checkbox or ask for sensitive evidence', async () => {
  const pending = {...access, authorityState: 'pending' as const, canReadDebrief: false};
  await renderWithTheme(<DebriefConsent userId="owner-a" access={pending}/>);
  expect(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i})).toBeDisabled();
  expect(screen.getByText(/permission needs review/i)).toBeOnTheScreen();
  expect(screen.queryByLabelText(/guardian email|guardian birthday|upload document|selfie/i)).toBeNull();
  expect(mockSave).not.toHaveBeenCalled();
});
it('keeps withdrawal available when a previously granted authority is revoked', async () => {
  const revoked = {...granted, authorityState: 'revoked' as const, canReadDebrief: false, canGenerateDebrief: false};
  const withdrawn = {...revoked, aiConsent: false, consentVersion: 3}; mockSave.mockResolvedValue(withdrawn);
  const changed = jest.fn(); const user = userEvent.setup();
  await renderWithTheme(<DebriefConsent userId="owner-a" access={revoked} onChanged={changed}/>);
  const checkbox = screen.getByRole('checkbox', {name: /I agree.*AI reviews/i});
  expect(checkbox).toBeChecked(); expect(checkbox).toBeEnabled();
  await user.press(checkbox);
  await waitFor(() => expect(changed).toHaveBeenCalledWith(withdrawn));
  expect(mockSave).toHaveBeenCalledWith('weekly-debrief', false, '2026-10-20-weekly-debrief-v1', revoked);
});
it('does not turn a failed save into a local permission grant', async () => {
  mockSave.mockRejectedValue(new Error('Synthetic offline')); const changed = jest.fn();
  const user = userEvent.setup();
  await renderWithTheme(<DebriefConsent userId="owner-a" access={access} onChanged={changed}/>);
  await user.press(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i}));
  expect(await screen.findByText('Synthetic offline')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i})).not.toBeChecked();
  expect(changed).not.toHaveBeenCalled();
});
it('does not apply A permission after the component changes to B', async () => {
  let release!: (value: ProcessingAccess) => void;
  mockSave.mockReturnValue(new Promise(resolve => {release = resolve;}));
  const changed = jest.fn(), user = userEvent.setup();
  await renderWithTheme(<DebriefConsent userId="owner-a" access={access} onChanged={changed}/>);
  await user.press(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i}));
  const other = {...access, userId: 'owner-b'};
  await screen.rerender(<TestThemeProvider><DebriefConsent userId="owner-b" access={other} onChanged={changed}/></TestThemeProvider>);
  await act(async () => {release(granted);});
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox', {name: /I agree.*AI reviews/i})).not.toBeChecked();
});
it('does not expose an active consent control for a mismatched account', async () => {
  await renderWithTheme(<DebriefConsent userId="owner-b" access={access}/>);
  expect(screen.queryByRole('checkbox')).toBeNull(); expect(mockSave).not.toHaveBeenCalled();
});
it('keeps birthday purpose separate and does not grant AI as a side effect', async () => {
  const initial = {...access, ageConsent: false, canReadDebrief: false, consentVersion: 0};
  const accepted = {...access}; mockSave.mockResolvedValue(accepted);
  const changed = jest.fn(), user = userEvent.setup();
  await renderWithTheme(<DebriefConsent userId="owner-a" access={initial} purpose="age-screening" onChanged={changed}/>);
  await user.press(screen.getByRole('checkbox', {name: /I agree.*birthday/i}));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(accepted));
  expect(mockSave).toHaveBeenCalledWith('age-screening', true, '2026-10-20-age-v1', initial);
});
