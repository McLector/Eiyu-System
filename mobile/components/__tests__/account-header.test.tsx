import { act, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

import AccountHeader from '../eiyu/account-header';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSignOut = jest.fn();
const mockSaveProfile = jest.fn();
let mockParams: { account?: string } = {};

jest.mock('expo-router', () => ({ router: { push: jest.fn(), setParams: jest.fn() }, useLocalSearchParams: () => mockParams }));
const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock; setParams: jest.Mock };
jest.mock('@/contexts/auth-store', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
jest.mock('@/contexts/eiyu-store', () => ({
  useEiyu: () => ({
    user: { name: 'Yuki Tanaka', userClass: 'Ranger', rank: 'C', quests: [] },
    saveProfile: mockSaveProfile,
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
    mockRouter.push.mockReset();
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
