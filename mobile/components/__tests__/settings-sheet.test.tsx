import { screen, userEvent, within } from '@testing-library/react-native';
import { Linking, StyleSheet } from 'react-native';
import { PALETTES } from '@eiyu/shared';

import { SettingsSheet } from '../settings/settings-sheet';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
let mockVersion: string | undefined = '2.4.6';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { get expoConfig() { return mockVersion === undefined ? {} : { version: mockVersion }; } },
}));

const mockStore = {
  notificationsEnabled: true,
  setNotificationsEnabled: jest.fn(),
  reminderWarning: null as string | null,
  retryReminders: jest.fn(),
  soundEffectsEnabled: false,
  soundEffectsLoaded: true,
  setSoundEffectsEnabled: jest.fn(),
};
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStore }));

const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock };
const setMode = jest.fn();
const setPalette = jest.fn();
const onClose = jest.fn();

const show = (options: { mode?: 'dark' | 'light'; palette?: (typeof PALETTES)[number]['id'] } = {}) =>
  renderWithTheme(<SettingsSheet visible onClose={onClose} />, { ...options, setMode, setPalette });

describe('SettingsSheet', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    Object.assign(mockStore, {
      notificationsEnabled: true, reminderWarning: null, soundEffectsEnabled: false, soundEffectsLoaded: true,
    });
    mockStore.setNotificationsEnabled.mockReset();
    mockStore.retryReminders.mockReset();
    mockStore.setSoundEffectsEnabled.mockReset();
    setMode.mockReset();
    setPalette.mockReset();
    onClose.mockReset();
    mockRouter.push.mockReset();
    mockVersion = '2.4.6';
  });

  it('is a Settings sheet that closes from its Close button', async () => {
    const user = userEvent.setup();
    await show();
    expect(screen.getByText('SETTINGS').props.accessibilityRole).toBe('header');
    await user.press(screen.getByRole('button', { name: 'Close Settings' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while hidden', async () => {
    await renderWithTheme(<SettingsSheet visible={false} onClose={onClose} />);
    expect(screen.queryByText('SETTINGS')).toBeNull();
  });

  describe('theme switch', () => {
    it('is named Dark Theme and checked in dark mode', async () => {
      await show({ mode: 'dark' });
      expect(screen.getByRole('switch', { name: 'Dark Theme' }).props.accessibilityState).toMatchObject({ checked: true });
      expect(screen.getByRole('switch', { name: 'Dark Theme' }).props.testID).toBe('settings-dark-theme');
    });

    it('keeps the same name, unchecked, in light mode (the label must not flip with the state)', async () => {
      await show({ mode: 'light' });
      expect(screen.getByRole('switch', { name: 'Dark Theme' }).props.accessibilityState).toMatchObject({ checked: false });
      expect(screen.queryByRole('switch', { name: 'Light Theme' })).toBeNull();
    });

    it('switches to light from dark', async () => {
      const user = userEvent.setup();
      await show({ mode: 'dark' });
      await user.press(screen.getByRole('switch', { name: 'Dark Theme' }));
      expect(setMode).toHaveBeenCalledWith('light');
    });

    it('switches to dark from light', async () => {
      const user = userEvent.setup();
      await show({ mode: 'light' });
      await user.press(screen.getByRole('switch', { name: 'Dark Theme' }));
      expect(setMode).toHaveBeenCalledWith('dark');
    });
  });

  describe('palette', () => {
    it('lists every palette as a radio inside a labelled radiogroup, with the current one checked', async () => {
      await show({ palette: 'jade' });
      const group = screen.getByLabelText('Colour palette');
      expect(group.props.accessibilityRole).toBe('radiogroup');
      const radios = within(group).getAllByRole('radio');
      expect(radios).toHaveLength(PALETTES.length);
      for (const { id, label } of PALETTES) {
        const radio = within(group).getByRole('radio', { name: label });
        expect(radio.props.accessibilityState).toMatchObject({ checked: id === 'jade', selected: id === 'jade' });
      }
    });

    it('picks another palette', async () => {
      const user = userEvent.setup();
      await show({ palette: 'cyan' });
      await user.press(screen.getByRole('radio', { name: 'Monarch violet' }));
      expect(setPalette).toHaveBeenCalledWith('violet');
    });

    it('does nothing when the current palette is pressed again', async () => {
      const user = userEvent.setup();
      await show({ palette: 'cyan' });
      await user.press(screen.getByRole('radio', { name: 'Cyan' }));
      expect(setPalette).not.toHaveBeenCalled();
    });

    it('gives every option a 48dp target', async () => {
      await show();
      for (const radio of screen.getAllByRole('radio')) {
        expect(StyleSheet.flatten(radio.props.style).minHeight).toBeGreaterThanOrEqual(48);
      }
    });
  });

  describe('quest reminders', () => {
    it('reflects the stored preference and writes the opposite when pressed', async () => {
      const user = userEvent.setup();
      await show();
      const row = screen.getByRole('switch', { name: 'Quest Reminders' });
      expect(row.props.accessibilityState).toMatchObject({ checked: true });
      await user.press(row);
      expect(mockStore.setNotificationsEnabled).toHaveBeenCalledWith(false);
    });

    it('shows no warning when reminders are fine', async () => {
      await show();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });

    it('shows a failure with Retry only', async () => {
      const user = userEvent.setup();
      mockStore.reminderWarning = 'Reminders could not be updated: network down';
      await show();
      expect(screen.getByRole('alert')).toHaveTextContent('Reminders could not be updated: network down');
      expect(screen.queryByRole('button', { name: 'Open phone settings' })).toBeNull();
      await user.press(screen.getByRole('button', { name: 'Retry' }));
      expect(mockStore.retryReminders).toHaveBeenCalledTimes(1);
    });

    it('offers phone settings when the system permission is the problem', async () => {
      const user = userEvent.setup();
      const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
      mockStore.reminderWarning = 'Reminders could not be updated: Notification permission is unavailable on this device.';
      await show();
      await user.press(screen.getByRole('button', { name: 'Open phone settings' }));
      expect(open).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
    });

    it('does not crash when the phone refuses to open its settings', async () => {
      const user = userEvent.setup();
      jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('no settings'));
      mockStore.reminderWarning = 'Reminders could not be updated: Notification permission is unavailable on this device.';
      await show();
      await user.press(screen.getByRole('button', { name: 'Open phone settings' }));
      expect(screen.getByRole('button', { name: 'Open phone settings' })).toBeOnTheScreen();
    });
  });

  describe('completion sound', () => {
    it('writes the switch through the stored preference, keeping its test id', async () => {
      const user = userEvent.setup();
      await show();
      const sound = screen.getByRole('switch', { name: 'Sound Effects' });
      expect(sound.props.testID).toBe('settings-sound-effects');
      expect(sound.props.accessibilityState).toMatchObject({ checked: false });
      await user.press(sound);
      expect(mockStore.setSoundEffectsEnabled).toHaveBeenCalledWith(true);
    });

    it('is disabled until the stored value has loaded', async () => {
      const user = userEvent.setup();
      mockStore.soundEffectsLoaded = false;
      await show();
      const sound = screen.getByRole('switch', { name: 'Sound Effects' });
      expect(sound.props.accessibilityState).toMatchObject({ disabled: true });
      await user.press(sound);
      expect(mockStore.setSoundEffectsEnabled).not.toHaveBeenCalled();
    });
  });

  it('closes the sheet before opening Quest History', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    onClose.mockImplementation(() => order.push('close'));
    mockRouter.push.mockImplementation(() => order.push('push'));
    await show();
    await user.press(screen.getByRole('button', { name: 'Quest History' }));
    expect(order).toEqual(['close', 'push']);
    expect(mockRouter.push).toHaveBeenCalledWith('/history');
  });

  it('shows the version from the app config', async () => {
    await show();
    expect(screen.getByText('Eiyu System v2.4.6')).toBeOnTheScreen();
  });

  it('shows just the name when the config has no version', async () => {
    mockVersion = undefined;
    await show();
    expect(screen.getByText('Eiyu System')).toBeOnTheScreen();
  });

  it('has no Export Data and no Sign Out (Logout lives in the account menu)', async () => {
    await show();
    expect(screen.queryByText(/export/i)).toBeNull();
    expect(screen.queryByText(/sign out/i)).toBeNull();
  });
});
