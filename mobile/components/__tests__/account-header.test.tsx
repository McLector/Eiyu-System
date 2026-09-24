import { render, screen, userEvent } from '@testing-library/react-native';
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
const mockRouter = { push: jest.fn() };

jest.mock('expo-router', () => ({ router: mockRouter }));
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
});
