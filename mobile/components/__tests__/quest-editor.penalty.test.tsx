import { cleanup, fireEvent, screen } from '@testing-library/react-native';

import { makeEditorStore } from '../../test-support/quest-editor-kit';
import { renderWithTheme } from '../ui/test-theme';

let mockParams: { id?: string; type?: string } = {};
const mockStore = makeEditorStore();

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }),
}));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStore }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = ({ children, ...props }: any) => React.createElement(View, props, children);
  return { KeyboardAwareScrollView: passthrough, KeyboardAvoidingView: passthrough };
});

const { default: QuestEditorScreen } = require('../../app/quest-editor') as typeof import('../../app/quest-editor');

describe('mobile Quest Editor penalty field', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    mockParams = {};
  });

  it('asks for a penalty on a habit but offers no AI suggestion for it', async () => {
    mockParams = { type: 'habit' };
    await renderWithTheme(<QuestEditorScreen />);
    await fireEvent.changeText(screen.getByLabelText('Quest name'), 'Read every day');
    expect(screen.getByPlaceholderText('e.g. Code for 20 minutes')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /suggest/i })).toBeNull();
    expect(screen.queryByTestId('quest-ai-suggestion-1')).toBeNull();
  });

  it('shows no penalty field on a 1-Time quest', async () => {
    mockParams = { type: 'one_time' };
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.queryByPlaceholderText('e.g. Code for 20 minutes')).toBeNull();
  });
});
