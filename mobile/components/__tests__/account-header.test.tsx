import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AccountHeader from '../eiyu/account-header';

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: ({ children, ...props }: { children: unknown; [key: string]: unknown }) => {
    const { ScrollView } = jest.requireActual('react-native');
    return <ScrollView {...props}>{children}</ScrollView>;
  },
}));
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
    user: { name: 'Yuki Tanaka', userClass: 'Ranger', rank: 'C' },
    theme: {
      body: '#000', modal: '#111', overlay: '#000', glassBorder: '#333', text: '#fff',
      muted: '#aaa', dim: '#777', accent: '#0ff', accentBorder: '#355', accentGlass: '#022',
    },
    saveProfile: mockSaveProfile,
    darkMode: true,
    setDarkMode: jest.fn(),
    notificationsEnabled: true,
    setNotificationsEnabled: jest.fn(),
  }),
}));

describe('native account header', () => {
  beforeEach(() => {
    mockSignOut.mockReset().mockResolvedValue({ error: null });
    mockSaveProfile.mockReset().mockResolvedValue(undefined);
    mockRouter.push.mockReset();
    mockRouter.setParams.mockReset();
    mockParams = {};
    jest.restoreAllMocks();
  });

  it('exposes the exact three account actions and opens profile editing', async () => {
    const user = userEvent.setup();
    await render(<AccountHeader />);
    await user.press(screen.getByRole('button', { name: /Yuki Tanaka.*Ranger.*rank C/i }));
    expect(screen.getAllByRole('button')).toEqual(expect.arrayContaining([
      expect.objectContaining({ props: expect.objectContaining({ accessibilityLabel: 'Edit details' }) }),
    ]));
    expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.getByText('EDIT DETAILS')).toBeOnTheScreen();
  });

  it('asks before discarding edits through the native Back or Cancel path', async () => {
    const user = userEvent.setup();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<AccountHeader />);
    await user.press(screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i }));
    await user.press(screen.getByRole('button', { name: 'Edit details' }));
    await user.type(screen.getByLabelText('Display name'), ' X');
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(alert).toHaveBeenCalledWith('Discard changes?', expect.any(String), expect.any(Array));
    expect(screen.getByText('EDIT DETAILS')).toBeOnTheScreen();
    const actions = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    expect(actions.map(action => action.text)).toEqual(['Keep editing', 'Discard']);
    await act(async () => actions[1].onPress?.());
    expect(screen.queryByText('EDIT DETAILS')).toBeNull();
  });

  it('holds a pending profile sheet and shows a late save failure', async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    mockSaveProfile.mockImplementationOnce(() => new Promise<void>((_resolve, r) => { reject = r; }));
    await render(<AccountHeader />);
    await user.press(screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i }));
    await user.press(screen.getByRole('button', { name: 'Edit details' }));
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

  it('opens the shared Settings sheet from the legacy route parameter', async () => {
    mockParams = { account: 'settings' };
    await render(<AccountHeader />);
    expect(screen.getByText('SETTINGS')).toBeOnTheScreen();
    expect(mockRouter.setParams).toHaveBeenCalledWith({ account: undefined });
  });
});
