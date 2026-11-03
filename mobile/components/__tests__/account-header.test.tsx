import { act, fireEvent, screen, userEvent, within, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import { TRACKER_PURPOSE_NOTICES, type TrackerAccess } from '@eiyu/shared';
import { noGrant, trackerAccess } from '../../test-support/tracker-fixtures';
import AccountHeader from '../eiyu/account-header';
import { renderWithTheme, TestThemeProvider } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSignOut = jest.fn();
const mockSaveProfile = jest.fn();
const mockFetchAge = jest.fn();
const mockSetBirthday = jest.fn();
const mockProcessing = jest.fn();
const mockConsent = jest.fn();
const mockTrackerConsent = jest.fn();
const mockAcceptTracker = jest.fn();
const mockRefreshTracker = jest.fn();
let mockTracker: TrackerAccess | null = null;
let mockAgeOwner = 'owner-a';
let mockRetention: unknown[] = [];
jest.mock('@eiyu/shared', () => ({ ...jest.requireActual('@eiyu/shared'),
  setTrackerConsent: (...args: unknown[]) => mockTrackerConsent(...args),
  fetchRetentionNotice: () => Promise.resolve(mockRetention),
  fetchAccountAge: (...args: unknown[]) => mockFetchAge(...args),
  setAccountBirthday: (...args: unknown[]) => mockSetBirthday(...args),
  fetchProcessingAccess: (...args: unknown[]) => mockProcessing(...args),
  setProcessingConsent: (...args: unknown[]) => mockConsent(...args),
}));
let mockParams: { account?: string } = {};

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn() }, useLocalSearchParams: () => mockParams }));
const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock; navigate: jest.Mock; setParams: jest.Mock };
jest.mock('@/contexts/auth-store', () => ({ useAuth: () => ({ signOut: mockSignOut, session: { user: { id: mockAgeOwner } } }) }));
jest.mock('@/contexts/eiyu-store', () => ({
  useEiyu: () => ({
    user: { name: 'Yuki Tanaka', userClass: 'Ranger', rank: 'C', quests: [] },
    saveProfile: mockSaveProfile,
    tracker: mockTracker,
    acceptTracker: mockAcceptTracker,
    refreshTracker: mockRefreshTracker,
    restoreQuest: jest.fn(),
    deleteQuest: jest.fn(),
    notificationsEnabled: true,
    setNotificationsEnabled: jest.fn(),
  }),
}));

const TRIGGER = /Yuki Tanaka.*Ranger.*rank C/i;
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => { await user.press(screen.getByRole('button', { name: TRIGGER })); };
const openProfile = async (user: ReturnType<typeof userEvent.setup>) => { await openMenu(user); await user.press(screen.getByRole('menuitem', { name: 'Edit details' })); };

describe('native account header', () => {
  beforeEach(() => {
    mockSignOut.mockReset().mockResolvedValue({ error: null });
    mockSaveProfile.mockReset().mockResolvedValue(undefined);
    mockFetchAge.mockReset().mockResolvedValue({ userId: 'owner-a', birthDate: null, pendingBirthDate: null, correctionPending: false });
    mockSetBirthday.mockReset().mockResolvedValue({ birthDate: '2000-01-01', correctionPending: false });
    mockAgeOwner = 'owner-a';
    mockProcessing.mockReset().mockImplementation(async () => ({contractVersion: 1, userId: mockAgeOwner, ageVersion: 1, consentVersion: 1, authorityVersion: 0, mailboxVersion: 1,
      ageEligible: true, ageConsent: true, aiConsent: false, canReadDebrief: true, canGenerateDebrief: false, authorityState: 'not-required'}));
    mockConsent.mockReset();
    mockTrackerConsent.mockReset();
    mockAcceptTracker.mockReset();
    mockRefreshTracker.mockReset().mockResolvedValue(undefined);
    mockTracker = noGrant('owner-a');
    mockRetention = [];
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
  describe('tracker permissions in Profile', () => {
    const custom = TRACKER_PURPOSE_NOTICES['custom-tracker'];
    const fitness = TRACKER_PURPOSE_NOTICES['fitness-tracking'];

    it('shows both purposes, unchecked and separate from AI, and sends nothing on open', async () => {
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      expect(await screen.findByRole('checkbox', { name: custom.label })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: fitness.label })).not.toBeChecked();
      expect(mockTrackerConsent).not.toHaveBeenCalled();
    });

    it('shows the retention notice in Profile only when a reminder is due', async () => {
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await screen.findByRole('checkbox', { name: custom.label });
      expect(screen.queryByText(/will be removed on/)).toBeNull();
    });

    it('names the removal date when a reminder is due', async () => {
      mockRetention = [{ purpose: 'custom-tracker', removalDueOn: '2026-10-31', reminded: true }];
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      expect(await screen.findByText(/custom quest records will be removed on October 31, 2026/)).toBeOnTheScreen();
    });

    it('grants one purpose with the owner revision and hands the server answer to the store', async () => {
      const next = trackerAccess({ fitnessConsent: true, canWriteFitness: true }, 'owner-a');
      mockTrackerConsent.mockResolvedValue(next);
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await user.press(await screen.findByRole('checkbox', { name: fitness.label }));
      await waitFor(() => expect(mockAcceptTracker).toHaveBeenCalledWith(next));
      expect(mockTrackerConsent).toHaveBeenCalledWith('fitness-tracking', true, fitness.version, noGrant('owner-a').revision);
      expect(mockTrackerConsent).not.toHaveBeenCalledWith('custom-tracker', expect.anything(), expect.anything(), expect.anything());
    });

    it('withdraws a granted purpose', async () => {
      mockTracker = trackerAccess({}, 'owner-a');
      mockTrackerConsent.mockResolvedValue({ ...mockTracker, customConsent: false, canWriteCustom: false });
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      const box = await screen.findByRole('checkbox', { name: custom.label });
      expect(box).toBeChecked();
      await user.press(box);
      await waitFor(() => expect(mockTrackerConsent).toHaveBeenCalledWith('custom-tracker', false, custom.version, mockTracker!.revision));
    });

    it('asks the store to re-read access when a change was refused as stale', async () => {
      mockTrackerConsent.mockRejectedValue(Object.assign(new Error('stale'), { code: 'ET003' }));
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      await user.press(await screen.findByRole('checkbox', { name: custom.label }));
      await waitFor(() => expect(mockRefreshTracker).toHaveBeenCalledTimes(1));
      expect(mockAcceptTracker).not.toHaveBeenCalled();
    });

    it('shows no usable controls while access is unavailable or belongs to another account', async () => {
      mockTracker = null;
      const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
      expect(await screen.findByText(/tracker permissions are unavailable/i)).toBeOnTheScreen();
      expect(screen.queryByRole('checkbox', { name: custom.label })).toBeNull();
      expect(mockTrackerConsent).not.toHaveBeenCalled();
    });
  });

  it('offers explicit export in Profile without saving an unsaved display name',async()=>{
    const user=userEvent.setup();await renderWithTheme(<AccountHeader/>);await openProfile(user);
    await fireEvent.changeText(screen.getByLabelText('Display name'),'Synthetic draft');
    expect(screen.getByRole('button',{name:'Prepare data download'})).toBeEnabled();
    expect(screen.getByLabelText('Display name').props.value).toBe('Synthetic draft');expect(mockSaveProfile).not.toHaveBeenCalled();
  });
  it('requires separate birthday permission before a legacy birthday write, without requiring guardian evidence', async () => {
    const access = {...await mockProcessing(), ageConsent: false, canReadDebrief: false};
    mockProcessing.mockResolvedValue(access);
    mockConsent.mockResolvedValue({...access, ageConsent: true, consentVersion: 2});
    const user = userEvent.setup(); await renderWithTheme(<AccountHeader/>); await openProfile(user);
    await waitFor(() => expect(screen.getByLabelText('Birthday')).toBeEnabled());
    await fireEvent.changeText(screen.getByLabelText('Birthday'), '2020-01-01');
    await user.press(screen.getByRole('button', {name: 'Save'}));
    expect(mockSetBirthday).not.toHaveBeenCalled();
    await user.press(screen.getByRole('checkbox', {name: /I agree.*birthday/i}));
    await user.press(screen.getByRole('button', {name: 'Save'}));
    expect(mockSetBirthday).toHaveBeenCalledWith('2020-01-01', 'owner-a');
  });
  it('lets a legacy user declare a birthday in Profile while a failed save stays editable', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<AccountHeader />);
    await openProfile(user);
    await waitFor(() => expect(screen.getByLabelText('Birthday')).toBeEnabled());
    await fireEvent.changeText(screen.getByLabelText('Birthday'), '2000-01-01');
    mockSetBirthday.mockRejectedValueOnce(new Error('Birthday save unavailable'));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Birthday save unavailable')).toBeOnTheScreen();
    expect(screen.getByLabelText('Birthday')).toHaveDisplayValue('2000-01-01');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(mockSetBirthday).toHaveBeenCalledWith('2000-01-01', 'owner-a');
  });
  it('clears the previous account birthday when authentication switches owners', async () => {
    mockFetchAge.mockResolvedValueOnce({ birthDate: '2000-01-01', pendingBirthDate: null, correctionPending: false });
    const user = userEvent.setup(); const tree = await renderWithTheme(<AccountHeader />);
    await openProfile(user);
    await waitFor(() => expect(screen.getByLabelText('Birthday')).toHaveDisplayValue('2000-01-01'));
    mockAgeOwner = 'owner-b';
    await tree.rerender(<TestThemeProvider><AccountHeader /></TestThemeProvider>);
    await waitFor(() => expect(screen.getByLabelText('Birthday')).toHaveDisplayValue(''));
  });

  it('explicitly accepts an unchanged pending birthday, but never accepts it merely by opening Profile', async () => {
    mockFetchAge.mockResolvedValueOnce({userId:'owner-a',birthDate:'2014-01-01',pendingBirthDate:'2000-01-01',correctionPending:true});
    const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
    await waitFor(() => expect(screen.getByLabelText('Birthday')).toHaveDisplayValue('2000-01-01'));
    expect(mockSetBirthday).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', {name:'Save'}));
    expect(mockSetBirthday).toHaveBeenCalledWith('2000-01-01','owner-a');
  });

  it('does not resubmit an unchanged birthday when there is no pending correction', async () => {
    mockFetchAge.mockResolvedValueOnce({userId:'owner-a',birthDate:'2000-01-01',pendingBirthDate:null,correctionPending:false});
    const user = userEvent.setup(); await renderWithTheme(<AccountHeader />); await openProfile(user);
    await waitFor(() => expect(screen.getByLabelText('Birthday')).toHaveDisplayValue('2000-01-01'));
    await user.press(screen.getByRole('button', {name:'Save'}));
    expect(mockSetBirthday).not.toHaveBeenCalled();
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
