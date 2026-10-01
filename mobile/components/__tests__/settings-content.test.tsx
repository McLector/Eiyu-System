import { render, screen, userEvent } from '@testing-library/react-native';
import SettingsContent from '../eiyu/settings-content';

let mockDarkMode = true;
const mockSetDarkMode = jest.fn();
let mockSoundEffectsEnabled = false;
let mockSoundEffectsLoaded = true;
const mockSetSoundEffectsEnabled = jest.fn();
jest.mock('@/contexts/eiyu-store', () => ({
  useEiyu: () => ({
    theme: { text: '#fff', dim: '#aaa', muted: '#bbb', accent: '#0ff', accentGlass: '#022', accentBorder: '#355', glassBorder: '#333' },
    darkMode: mockDarkMode,
    setDarkMode: mockSetDarkMode,
    soundEffectsEnabled: mockSoundEffectsEnabled,
    soundEffectsLoaded: mockSoundEffectsLoaded,
    setSoundEffectsEnabled: mockSetSoundEffectsEnabled,
    notificationsEnabled: true,
    setNotificationsEnabled: jest.fn(),
  }),
}));
jest.mock('@/contexts/auth-store', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '2.4.6' } } }));
jest.mock('@/components/eiyu/screen', () => ({ Screen: ({ children }: { children: unknown }) => {
  const { View } = jest.requireActual('react-native');
  return <View>{children}</View>;
} }));

describe('SettingsContent', () => {
  beforeEach(() => { mockDarkMode = true; mockSoundEffectsEnabled = false; mockSoundEffectsLoaded = true; mockSetDarkMode.mockReset(); mockSetSoundEffectsEnabled.mockReset(); });

  it('shows the stable Dark Theme name when dark mode is enabled', async () => {
    await render(<SettingsContent embedded />);
    expect(screen.getByRole('switch', { name: 'Dark Theme' }).props.accessibilityState).toMatchObject({ checked: true });
  });

  it('keeps the same Dark Theme name when light mode is enabled', async () => {
    mockDarkMode = false;
    await render(<SettingsContent embedded />);
    expect(screen.getByRole('switch', { name: 'Dark Theme' }).props.accessibilityState).toMatchObject({ checked: false });
  });

  it('reports the version from Expo app config and omits the duplicate embedded title', async () => {
    await render(<SettingsContent embedded />);
    expect(screen.getByText('Eiyu System v2.4.6')).toBeOnTheScreen();
    expect(screen.queryByText('Settings')).toBeNull();
  });

  it('keeps a Settings heading when rendered as a standalone screen', async () => {
    await render(<SettingsContent />);
    const heading = screen.getByText('Settings');
    expect(heading.props.accessibilityRole).toBe('header');
  });

  it('writes the Sound Effects switch through the persistent store preference', async () => {
    const user = userEvent.setup();
    await render(<SettingsContent embedded />);

    const soundSwitch = screen.getByRole('switch', { name: 'Sound Effects' });
    expect(soundSwitch.props.accessibilityState).toMatchObject({ checked: false });
    expect(soundSwitch.props.testID).toBe('settings-sound-effects');
    await user.press(soundSwitch);
    expect(mockSetSoundEffectsEnabled).toHaveBeenCalledWith(true);
  });
});
