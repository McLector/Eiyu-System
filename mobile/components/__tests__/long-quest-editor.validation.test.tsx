import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
const mockSuggestStages = jest.fn();
jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  suggestStages: mockSuggestStages,
}));
const { default: LongQuestEditorScreen } = require('../../app/long-quest-editor') as typeof import('../../app/long-quest-editor');

const mockSaveLongQuest = jest.fn();
let mockParams: { id?: string } = {};
let mockLongQuests: any[] = [];

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => mockParams }));
jest.mock('@/contexts/eiyu-store', () => ({
  useEiyu: () => ({
    theme: { accent: '#00ffff', accentBorder: '#336666', accentGlass: '#113333', dim: '#777777', glassBorder: '#333333', modal: '#111111', muted: '#aaaaaa', overlay: '#000000', text: '#ffffff', track: '#222222' },
    user: { longQuests: mockLongQuests }, saveLongQuest: mockSaveLongQuest,
  }),
}));
jest.mock('@/components/eiyu/icons', () => ({ StatIcon: () => null }));
jest.mock('@/components/eiyu/screen', () => ({ Screen: 'Screen' }));

describe('mobile Long Quest name validation', () => {
  beforeEach(() => {
    mockParams = {};
    mockLongQuests = [];
    mockSaveLongQuest.mockReset().mockResolvedValue(undefined);
    mockSuggestStages.mockReset();
  });

  it('rejects 81-code-point and invisible-only names with visible reasons', async () => {
    await render(<LongQuestEditorScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Ship a Side Project'), '😀'.repeat(81));
    expect(screen.getByTestId('long-quest-name-error')).toHaveTextContent('Quest name must be 80 characters or fewer.');
    expect(screen.getByText('CREATE LONG QUEST')).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Ship a Side Project'), ' \u200b\u200c\u200d\u2060\ufeff ');
    expect(screen.getByTestId('long-quest-name-error')).toHaveTextContent('Enter a quest name.');
    expect(mockSaveLongQuest).not.toHaveBeenCalled();
  });

  it('creates a long quest with an 80-code-point name', async () => {
    await render(<LongQuestEditorScreen />);
    const name = '😀'.repeat(80);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Ship a Side Project'), name);
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Plan');
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 2'), 'Build');
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    await waitFor(() => expect(mockSaveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockSaveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ name }), undefined);
  });

  it('allows an unchanged grandfathered name when an unrelated field changes', async () => {
    const legacyName = '🧭'.repeat(81);
    mockParams = { id: 'legacy' };
    mockLongQuests = [{
      id: 'legacy', name: legacyName, stat: 'INT', description: null, completed: false,
      stages: [{ id: 's1', name: 'Plan', description: null }, { id: 's2', name: 'Build', description: null }],
    }];
    await render(<LongQuestEditorScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('Context, why it matters…'), 'Keep this project moving');
    await fireEvent.press(screen.getByText('SAVE CHANGES'));
    await waitFor(() => expect(mockSaveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockSaveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ name: legacyName, description: 'Keep this project moving' }), 'legacy');
  });

  it('populates editable stage fields after a successful AI response', async () => {
    mockSuggestStages.mockResolvedValue(['Research the opportunity', 'Build a portfolio', 'Apply to three roles']);
    await render(<LongQuestEditorScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Ship a Side Project'), 'Get a developer role');
    await fireEvent.press(screen.getByText('✨ SUGGEST STAGES').parent!);
    await waitFor(() => expect(mockSuggestStages).toHaveBeenCalledWith('Get a developer role', expect.any(String)));
    await waitFor(() => expect(screen.getByTestId('long-quest-stage-name-3').props.value).toBe('Apply to three roles'));
    expect(screen.getByTestId('long-quest-stage-name-3').props.accessibilityLabel).toBe('Stage 3: Apply to three roles');
  });
});
