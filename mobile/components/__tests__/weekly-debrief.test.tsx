import {act, screen, userEvent, waitFor} from '@testing-library/react-native';
import {AppState} from 'react-native';
import {renderWithTheme} from '../ui/test-theme';
import {WeeklyDebrief} from '../status/weekly-debrief';

const mockSummary = jest.fn();
const mockStatus = jest.fn();
const mockAccess = jest.fn();
const mockSaved = jest.fn();
const mockSetConsent = jest.fn();
const mockListeners = new Set<() => void>();
const fireAccessChanged = () => mockListeners.forEach(listener => listener());
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  fetchOrCreateWeeklySummary: (...args: unknown[]) => mockSummary(...args),
  fetchMailboxStatus: () => mockStatus(),
  fetchProcessingAccess: () => mockAccess(),
  fetchSavedWeeklySummary: (...args: unknown[]) => mockSaved(...args),
  setProcessingConsent: (...args: unknown[]) => mockSetConsent(...args),
  subscribeProcessingAccessChanges: (listener: () => void) => { mockListeners.add(listener); return () => { mockListeners.delete(listener); }; },
  subscribeMailboxChanges: () => () => {},
}));

const off = {contractVersion: 1, userId: 'owner', ageVersion: 1, consentVersion: 1, authorityVersion: 0, mailboxVersion: 1,
  ageEligible: false, ageConsent: false, aiConsent: false, canReadDebrief: false, canGenerateDebrief: false, authorityState: 'not-required'};
const afterAge = {...off, ageEligible: true, ageConsent: true, ageVersion: 2};
const afterAi = {...afterAge, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true, consentVersion: 2};
const ADULT = {name: /I'm 18 or older/i};
const AI = {name: /Groq/};

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.clear();
  mockAccess.mockReset().mockResolvedValue(afterAi);
  mockSaved.mockReset().mockResolvedValue(null);
  mockSummary.mockReset().mockResolvedValue('A cached weekly reading.');
  mockSetConsent.mockReset();
  mockStatus.mockReset().mockResolvedValue({userId: 'owner', version: 1, verified: true, challenge: null});
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({remove: jest.fn()}));
});
afterEach(() => jest.restoreAllMocks());

describe('the Turn on AI weekly review card on Status', () => {
  it('is not shown when both boxes are already on', async () => {
    await renderWithTheme(<WeeklyDebrief userId="owner" timeZone="Asia/Manila"/>);
    expect(await screen.findByTestId('weekly-summary-content')).toHaveTextContent('A cached weekly reading.');
    expect(screen.queryByText('Turn on AI weekly review')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('is shown with both boxes when AI is off, without the archive error or the old off line', async () => {
    mockAccess.mockResolvedValue(off);
    await renderWithTheme(<WeeklyDebrief userId="owner" timeZone="Asia/Manila"/>);
    expect(await screen.findByText('Turn on AI weekly review')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', ADULT)).not.toBeChecked();
    expect(screen.getByRole('checkbox', AI)).not.toBeChecked();
    expect(screen.queryByText(/couldn.t reach the archive/)).toBeNull();
    expect(screen.queryByText(/AI permission is off/)).toBeNull();
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('shows exactly one email verification box when AI is off and the email is unverified', async () => {
    mockAccess.mockResolvedValue(off);
    mockStatus.mockResolvedValue({userId: 'owner', version: 1, verified: false, challenge: null});
    await renderWithTheme(<WeeklyDebrief userId="owner" timeZone="Asia/Manila"/>);
    await screen.findByText('Turn on AI weekly review');
    expect(await screen.findAllByRole('button', {name: 'Send verification email'})).toHaveLength(1);
    expect(screen.getAllByRole('button', {name: 'Check verification status'})).toHaveLength(1);
  });

  it('shows the card above saved history when AI was turned off but reading is still allowed', async () => {
    mockAccess.mockResolvedValue({...afterAge, canReadDebrief: true});
    mockSaved.mockResolvedValue('Saved history after withdrawal.');
    await renderWithTheme(<WeeklyDebrief userId="owner" timeZone="Asia/Manila"/>);
    expect(await screen.findByTestId('weekly-summary-content')).toHaveTextContent('Saved history after withdrawal.');
    expect(screen.getByText('Turn on AI weekly review')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', ADULT)).toBeNull();
    expect(screen.getByRole('checkbox', AI)).not.toBeChecked();
    expect(screen.getByRole('button', {name: 'Regenerate weekly summary'})).toBeDisabled();
  });

  it('keeps the card and the ticked AI box on screen between the two saves', async () => {
    let server: typeof off = off, release!: (value: typeof afterAi) => void;
    mockAccess.mockImplementation(async () => server);
    // The real setProcessingConsent tells every listener before it returns; so does this stand-in.
    mockSetConsent
      .mockImplementationOnce(async () => { server = afterAge; fireAccessChanged(); return afterAge; })
      .mockImplementationOnce(() => new Promise(resolve => { release = value => { server = value; fireAccessChanged(); resolve(value); }; }));
    const user = userEvent.setup();
    await renderWithTheme(<WeeklyDebrief userId="owner" timeZone="Asia/Manila"/>);
    await user.press(await screen.findByRole('checkbox', ADULT));
    await user.press(screen.getByRole('checkbox', AI));
    await user.press(await screen.findByRole('button', {name: 'Turn on'}));
    await waitFor(() => expect(mockSetConsent).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('checkbox', ADULT)).toBeNull());
    expect(screen.getByRole('checkbox', AI)).toBeChecked();
    expect(screen.getByText('Turn on AI weekly review')).toBeOnTheScreen();
    await act(async () => { release(afterAi); });
  });

  it('finishes both saves and then writes the review even though each save tells the screen to re-read access', async () => {
    let server: typeof off = off;
    mockAccess.mockImplementation(async () => server);
    mockSetConsent.mockImplementation(async (purpose: string) => {
      server = purpose === 'age-screening' ? afterAge : afterAi; fireAccessChanged();
      return server;
    });
    mockSummary.mockResolvedValue('A fresh review after turning on.');
    const user = userEvent.setup();
    await renderWithTheme(<WeeklyDebrief userId="owner" timeZone="Asia/Manila"/>);
    await user.press(await screen.findByRole('checkbox', ADULT));
    await user.press(screen.getByRole('checkbox', AI));
    await user.press(await screen.findByRole('button', {name: 'Turn on'}));
    expect(await screen.findByTestId('weekly-summary-content')).toHaveTextContent('A fresh review after turning on.');
    expect(mockSetConsent).toHaveBeenCalledTimes(2);
    expect(mockSetConsent).toHaveBeenNthCalledWith(2, 'weekly-debrief', true, '2026-11-08-weekly-debrief-v2', afterAge);
    expect(screen.queryByText('Turn on AI weekly review')).toBeNull();
  });
});
