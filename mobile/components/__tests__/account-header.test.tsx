import { act, fireEvent, screen, userEvent, within, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import { AI_NOTICE_VERSION, type ProcessingAccess, type TrackerAccess } from '@eiyu/shared';
import { noGrant } from '../../test-support/tracker-fixtures';
import AccountHeader from '../eiyu/account-header';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSignOut = jest.fn();
const mockSaveProfile = jest.fn();
const mockProcessing = jest.fn();
const mockConsent = jest.fn();
let mockTracker: TrackerAccess | null = null;
let mockOwner = 'owner-a';
jest.mock('@eiyu/shared', () => ({ ...jest.requireActual('@eiyu/shared'),
  fetchProcessingAccess: (...args: unknown[]) => mockProcessing(...args),
  setProcessingConsent: (...args: unknown[]) => mockConsent(...args),
}));
let mockParams: { account?: string } = {};

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn() }, useLocalSearchParams: () => mockParams }));
const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock; navigate: jest.Mock; setParams: jest.Mock };
jest.mock('@/contexts/auth-store', () => ({ useAuth: () => ({ signOut: mockSignOut, session: { user: { id: mockOwner } } }) }));
jest.mock('@/contexts/eiyu-store', () => ({
  useEiyu: () => ({
    user: { name: 'Yuki Tanaka', userClass: 'Ranger', rank: 'C', quests: [] },
    saveProfile: mockSaveProfile,
    get tracker() { return mockTracker; },
    restoreQuest: jest.fn(),
    deleteQuest: jest.fn(),
    notificationsEnabled: true,
    setNotificationsEnabled: jest.fn(),
  }),
}));

const access = (over: Partial<ProcessingAccess> = {}): ProcessingAccess => ({
  contractVersion: 1, userId: 'owner-a', ageVersion: 1, consentVersion: 3, authorityVersion: 0, mailboxVersion: 2,
  ageEligible: true, ageConsent: true, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true,
  authorityState: 'not-required', ...over,
});
const OFF_BUTTON = { name: 'Turn off AI weekly review' };
const TRIGGER = /Yuki Tanaka.*Ranger.*rank C/i;
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => { await user.press(screen.getByRole('button', { name: TRIGGER })); };
const openProfile = async (user: ReturnType<typeof userEvent.setup>) => { await openMenu(user); await user.press(screen.getByRole('menuitem', { name: 'Edit details' })); };

describe('native account header', () => {
  beforeEach(() => {
    mockSignOut.mockReset().mockResolvedValue({ error: null });
    mockSaveProfile.mockReset().mockResolvedValue(undefined);
    mockOwner = 'owner-a';
    mockProcessing.mockReset().mockImplementation(async () => access());
    mockConsent.mockReset();
    mockTracker = noGrant('owner-a');
    mockRouter.push.mockReset();
    mockRouter.navigate.mockReset();
    mockRouter.setParams.mockReset();
    mockParams = {};
    jest.restoreAllMocks();
  });

  it('shows the brand and the account trigger', async () => {
    await renderWithTheme(<AccountHeader />);
    expect(screen.getByTestId('account-brand-mark')).toBeOnTheScreen();
    expect(screen.getByTestId('account-trigger')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: TRIGGER })).toBeOnTheScreen();
  });
  describe('Profile has no tracker permission layer', () => {
    it('shows no tracker permissions, no retention notice and no unavailable notice, whatever the store says', async () => {
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await screen.findByLabelText('Display name');
      await waitFor(() => expect(mockProcessing).toHaveBeenCalled());
      expect(screen.queryByLabelText('Tracker permissions')).toBeNull();
      expect(screen.queryByText(/tracker permissions/i)).toBeNull();
      expect(screen.queryByText(/custom quest records|will be removed on|Gym tracking|custom tracker/i)).toBeNull();
    });

    it('stays the same when tracker access is unavailable', async () => {
      mockTracker = null;
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await screen.findByLabelText('Display name');
      await waitFor(() => expect(mockProcessing).toHaveBeenCalled());
      expect(screen.queryByText(/tracker permissions are unavailable/i)).toBeNull();
      expect(screen.queryByLabelText('Tracker permissions')).toBeNull();
    });

    it('does not read the tracker store at all', async () => {
      mockTracker = new Proxy({}, { get: () => { throw new Error('Profile read the tracker capability.'); } }) as unknown as TrackerAccess;
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      expect(await screen.findByLabelText('Display name')).toBeOnTheScreen();
    });
  });

  it('offers explicit export in Profile without saving an unsaved display name',async()=>{
    const user=userEvent.setup();await renderWithTheme(<AccountHeader/>);await openProfile(user);
    await fireEvent.changeText(screen.getByLabelText('Display name'),'Synthetic draft');
    expect(screen.getByRole('button',{name:'Prepare data download'})).toBeEnabled();
    expect(screen.getByLabelText('Display name').props.value).toBe('Synthetic draft');expect(mockSaveProfile).not.toHaveBeenCalled();
  });
  describe('Profile after the simplification', () => {
    it('has no birthday, permission, review or retention wording or fields', async () => {
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await screen.findByText(/AI weekly review is on/i);
      expect(screen.queryByLabelText('Birthday')).toBeNull();
      expect(screen.queryByText(/birthday|birth date|child|teen|under 1[38]|guardian/i)).toBeNull();
      expect(screen.queryByText(/request (a )?review|review request|retention|read-only for 30 days|paused for this account/i)).toBeNull();
      expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('keeps Download your data and the name and class fields', async () => {
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      expect(await screen.findByRole('button', { name: 'Prepare data download' })).toBeEnabled();
      expect(screen.getByLabelText('Display name').props.value).toBe('Yuki Tanaka');
      expect(screen.getByLabelText('Class').props.value).toBe('Ranger');
    });

    it('stays usable when the AI access read fails, and says the AI choice is unavailable', async () => {
      mockProcessing.mockRejectedValue(new Error('network'));
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      expect(await screen.findByText(/AI weekly review settings are unavailable/i)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
      expect(screen.queryByRole('button', OFF_BUTTON)).toBeNull();
    });
  });

  describe('AI off switch', () => {
    it('shows that AI weekly review is on and offers to turn it off', async () => {
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      expect(await screen.findByText(/AI weekly review is on/i)).toBeOnTheScreen();
      expect(screen.getByRole('button', OFF_BUTTON)).toBeEnabled();
    });

    it('turns it off with the current notice and the access that was read, and says so', async () => {
      const before = access();
      mockProcessing.mockResolvedValue(before);
      mockConsent.mockResolvedValue(access({ aiConsent: false, canGenerateDebrief: false, consentVersion: 4 }));
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await user.press(await screen.findByRole('button', OFF_BUTTON));
      expect(mockConsent).toHaveBeenCalledTimes(1);
      expect(mockConsent).toHaveBeenCalledWith('weekly-debrief', false, AI_NOTICE_VERSION, before);
      expect(await screen.findByText(/AI weekly review is off/i)).toBeOnTheScreen();
      expect(screen.queryByRole('button', OFF_BUTTON)).toBeNull();
    });

    it('never offers a way to turn it on: when it is off there is no button, no box and no call', async () => {
      mockProcessing.mockResolvedValue(access({ aiConsent: false, canGenerateDebrief: false }));
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      expect(await screen.findByText(/AI weekly review is off/i)).toBeOnTheScreen();
      expect(screen.getByText(/Status page/i)).toBeOnTheScreen();
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(screen.queryByRole('switch')).toBeNull();
      expect(screen.queryByRole('button', { name: /turn on|enable/i })).toBeNull();
      expect(mockConsent).not.toHaveBeenCalled();
    });

    it('does not send a second request while the first is running', async () => {
      let finish!: (value: ProcessingAccess) => void;
      mockConsent.mockReturnValue(new Promise<ProcessingAccess>(resolve => { finish = resolve; }));
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await user.press(await screen.findByRole('button', OFF_BUTTON));
      await user.press(screen.getByRole('button', OFF_BUTTON));
      expect(mockConsent).toHaveBeenCalledTimes(1);
      await act(async () => finish(access({ aiConsent: false, canGenerateDebrief: false })));
      expect(await screen.findByText(/AI weekly review is off/i)).toBeOnTheScreen();
    });

    it('keeps it on and shows the reason when the save fails', async () => {
      mockConsent.mockRejectedValue(new Error('server unavailable'));
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await user.press(await screen.findByRole('button', OFF_BUTTON));
      expect(await screen.findByText('server unavailable')).toBeOnTheScreen();
      expect(screen.getByText(/AI weekly review is on/i)).toBeOnTheScreen();
      expect(screen.getByRole('button', OFF_BUTTON)).toBeEnabled();
    });

    it('re-reads access after a stale save and offers the fresh state', async () => {
      mockProcessing.mockResolvedValueOnce(access()).mockResolvedValueOnce(access({ aiConsent: false, canGenerateDebrief: false, consentVersion: 5 }));
      mockConsent.mockRejectedValue({ code: 'EP002', message: 'Processing access changed. Refresh your choices.' });
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await user.press(await screen.findByRole('button', OFF_BUTTON));
      expect(await screen.findByText(/Processing access changed/)).toBeOnTheScreen();
      await waitFor(() => expect(mockProcessing).toHaveBeenCalledTimes(2));
      expect(await screen.findByText(/AI weekly review is off/i)).toBeOnTheScreen();
    });

    it('refuses to act on access that belongs to another account', async () => {
      mockProcessing.mockResolvedValue(access({ userId: 'someone-else' }));
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      expect(await screen.findByText(/AI weekly review settings are unavailable/i)).toBeOnTheScreen();
      expect(screen.queryByRole('button', OFF_BUTTON)).toBeNull();
      expect(mockConsent).not.toHaveBeenCalled();
    });

    it('ignores a result for another account and does not claim it is off', async () => {
      mockConsent.mockResolvedValue(access({ userId: 'someone-else', aiConsent: false, canGenerateDebrief: false }));
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await user.press(await screen.findByRole('button', OFF_BUTTON));
      expect(await screen.findByRole('alert')).toBeOnTheScreen();
      expect(screen.getByText(/AI weekly review is on/i)).toBeOnTheScreen();
    });

    it('does not make the sheet dirty, so closing needs no discard prompt', async () => {
      mockConsent.mockResolvedValue(access({ aiConsent: false, canGenerateDebrief: false }));
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await user.press(await screen.findByRole('button', OFF_BUTTON));
      await screen.findByText(/AI weekly review is off/i);
      await user.press(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByLabelText('Discard changes?')).toBeNull();
      expect(screen.queryByText('EDIT DETAILS')).toBeNull();
    });
  });

  it('lays a pulsing glow under the brand mark, invisible to screen readers', async () => {
    await renderWithTheme(<AccountHeader />);
    expect(screen.getByTestId('account-brand-mark')).toHaveTextContent('英');
    expect(screen.getByTestId('brand-mark-glow', { includeHiddenElements: true })).toHaveProp('accessibilityElementsHidden', true);
    expect(screen.getAllByText('英')).toHaveLength(1);
  });

  describe('brand logo', () => {
    it('is a button labelled "Go to Board" that wraps the brand mark', async () => {
      await renderWithTheme(<AccountHeader />);
      const logo = screen.getByRole('button', { name: 'Go to Board' });
      expect(logo).toBeOnTheScreen();
      expect(within(logo).getByTestId('account-brand-mark')).toBeOnTheScreen();
      expect(within(logo).getByText('EIYU')).toBeOnTheScreen();
    });

    it('opens the Board when pressed, once per press, without opening the account menu', async () => {
      const user = userEvent.setup();
      await renderWithTheme(<AccountHeader />);
      await user.press(screen.getByRole('button', { name: 'Go to Board' }));
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
      expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/(tabs)/board' });
      expect(screen.queryByText('ACCOUNT')).toBeNull();
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('does not navigate on render, and the account trigger does not navigate either', async () => {
      const user = userEvent.setup();
      await renderWithTheme(<AccountHeader />);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
      await openMenu(user);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('is at least 48 dp tall to tap', async () => {
      await renderWithTheme(<AccountHeader />);
      const logo = screen.getByRole('button', { name: 'Go to Board' });
      const style = StyleSheet.flatten(logo.props.style);
      const slop = typeof logo.props.hitSlop === 'number'
        ? logo.props.hitSlop * 2
        : (logo.props.hitSlop?.top ?? 0) + (logo.props.hitSlop?.bottom ?? 0);
      expect((style.minHeight ?? 0) + slop).toBeGreaterThanOrEqual(48);
    });

    it('leaves the account trigger as it was', async () => {
      await renderWithTheme(<AccountHeader />);
      expect(screen.getByRole('button', { name: TRIGGER })).toBeOnTheScreen();
    });
  });

  it('offers exactly four account actions, in order, and opens profile editing', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<AccountHeader />);
    await openMenu(user);
    expect(screen.getAllByRole('menuitem').map(item => item.props.accessibilityLabel)).toEqual([
      'Edit details', 'Settings', 'Archived habits', 'Logout',
    ]);
    await user.press(screen.getByRole('menuitem', { name: 'Edit details' }));
    expect(screen.getByText('EDIT DETAILS')).toBeOnTheScreen();
  });

  it('opens the archived habits sheet from the menu', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<AccountHeader />);
    await openMenu(user);
    await user.press(screen.getByRole('menuitem', { name: 'Archived habits' }));
    expect(screen.getByText('ARCHIVED HABITS')).toBeOnTheScreen();
  });

  it('uses an in-app discard confirmation and preserves or discards the draft intentionally', async () => {
    const user = userEvent.setup();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderWithTheme(<AccountHeader />);
    await openProfile(user);
    await user.type(screen.getByLabelText('Display name'), ' X');
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Discard changes?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Display name').props.value).toBe('Yuki Tanaka X');
    await user.press(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(screen.queryByLabelText('Discard changes?')).toBeNull();
    expect(screen.getByText('EDIT DETAILS')).toBeOnTheScreen();
    expect(screen.getByLabelText('Display name').props.value).toBe('Yuki Tanaka X');
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    await user.press(screen.getByRole('button', { name: 'Discard Changes' }));
    expect(screen.queryByText('EDIT DETAILS')).toBeNull();
  });

  it('closes straight away when nothing was changed', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<AccountHeader />);
    await openProfile(user);
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Discard changes?')).toBeNull();
    expect(screen.queryByText('EDIT DETAILS')).toBeNull();
  });

  it('makes system Back dismiss the discard prompt without discarding the profile sheet', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<AccountHeader />);
    await openProfile(user);
    await user.type(screen.getByLabelText('Display name'), ' X');
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    const prompt = screen.getByTestId('profile-discard-modal');
    await act(async () => prompt.props.onRequestClose());
    expect(screen.queryByLabelText('Discard changes?')).toBeNull();
    expect(screen.getByText('EDIT DETAILS')).toBeOnTheScreen();
    expect(screen.getByLabelText('Display name').props.value).toBe('Yuki Tanaka X');
  });

  it('holds a pending profile sheet and shows a late save failure', async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    mockSaveProfile.mockImplementationOnce(() => new Promise<void>((_resolve, r) => { reject = r; }));
    await renderWithTheme(<AccountHeader />);
    await openProfile(user);
    await user.type(screen.getByLabelText('Display name'), ' X');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Saving' })).toBeDisabled();
    expect(screen.getByLabelText('Display name').props.editable).toBe(false);
    expect(screen.getByLabelText('Class').props.editable).toBe(false);
    expect(mockSaveProfile).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('server unavailable')));
    expect(screen.getByText('server unavailable')).toBeOnTheScreen();
    expect(screen.getByText('EDIT DETAILS')).toBeOnTheScreen();
  });

  it('cannot be closed while a save is running: no Close button, and back does nothing', async () => {
    const user = userEvent.setup();
    mockSaveProfile.mockImplementationOnce(() => new Promise<void>(() => {}));
    await renderWithTheme(<AccountHeader />);
    await openProfile(user);
    await user.type(screen.getByLabelText('Display name'), ' X');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('button', { name: 'Close Edit details' })).toBeNull();
    await act(async () => screen.getByTestId('profile-sheet').props.onRequestClose());
    expect(screen.getByText('EDIT DETAILS')).toBeOnTheScreen();
  });

  it('closes the profile sheet after a successful save', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<AccountHeader />);
    await openProfile(user);
    await user.type(screen.getByLabelText('Display name'), ' X');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(mockSaveProfile).toHaveBeenCalledWith({ displayName: 'Yuki Tanaka X', userClass: 'Ranger' });
    expect(screen.queryByText('EDIT DETAILS')).toBeNull();
  });

  it('opens the shared Settings sheet from the legacy route parameter', async () => {
    mockParams = { account: 'settings' };
    await renderWithTheme(<AccountHeader />);
    expect(screen.getByText('SETTINGS')).toBeOnTheScreen();
    expect(screen.getAllByText('SETTINGS')).toHaveLength(1);
    expect(screen.getByText('SETTINGS').props.accessibilityRole).toBe('header');
    expect(mockRouter.setParams).toHaveBeenCalledWith({ account: undefined });
  });

  it('opens the archived sheet or Edit details from their route parameters, and clears the parameter', async () => {
    mockParams = { account: 'archived' };
    await renderWithTheme(<AccountHeader />);
    expect(screen.getByText('ARCHIVED HABITS')).toBeOnTheScreen();
    expect(mockRouter.setParams).toHaveBeenCalledWith({ account: undefined });
  });

  it('ignores a route parameter it does not know, and leaves it alone', async () => {
    mockParams = { account: 'something-else' };
    await renderWithTheme(<AccountHeader />);
    expect(screen.queryByText('SETTINGS')).toBeNull();
    expect(screen.queryByText('ARCHIVED HABITS')).toBeNull();
    expect(screen.queryByText('EDIT DETAILS')).toBeNull();
    expect(mockRouter.setParams).not.toHaveBeenCalled();
  });

  it('logs out: shows progress, ignores a second press, and closes the menu when done', async () => {
    const user = userEvent.setup();
    let finish!: (value: { error: null }) => void;
    mockSignOut.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await renderWithTheme(<AccountHeader />);
    await openMenu(user);
    await user.press(screen.getByRole('menuitem', { name: 'Logout' }));
    expect(screen.getByText('Logging out…')).toBeOnTheScreen();
    await user.press(screen.getByRole('menuitem', { name: 'Logout' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    await act(async () => finish({ error: null }));
    expect(screen.queryByRole('menuitem', { name: 'Logout' })).toBeNull();
  });

  it('shows a failed logout inline and keeps the menu open so it can be tried again', async () => {
    const user = userEvent.setup();
    mockSignOut.mockResolvedValueOnce({ error: { message: 'Network request failed' } });
    await renderWithTheme(<AccountHeader />);
    await openMenu(user);
    await user.press(screen.getByRole('menuitem', { name: 'Logout' }));
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeEnabled();
  });
});
