import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import LongQuestEditorScreen from '../../app/long-quest-editor';

const mockSaveLongQuest = jest.fn();
let mockSearchParams: { id?: string } = {};
let mockLongQuests: any[] = [];

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@/contexts/eiyu-store', () => ({
  useEiyu: () => ({
    theme: {
      accent: '#00ffff', accentBorder: '#336666', accentGlass: '#113333', dim: '#777777',
      glassBorder: '#333333', modal: '#111111', muted: '#aaaaaa', overlay: '#000000',
      text: '#ffffff', track: '#222222',
    },
    user: { longQuests: mockLongQuests },
    saveLongQuest: mockSaveLongQuest,
  }),
}));

jest.mock('@/components/eiyu/icons', () => ({ StatIcon: () => null }));
jest.mock('@/components/eiyu/screen', () => ({ Screen: 'Screen' }));

describe('mobile Long Quest stage descriptions', () => {
  beforeEach(() => {
    mockSearchParams = {};
    mockLongQuests = [];
    mockSaveLongQuest.mockReset().mockResolvedValue(undefined);
  });

  it('accepts multiline Unicode descriptions at the boundary and includes them when creating', async () => {
    await render(<LongQuestEditorScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Ship a Side Project'), 'Launch');
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Plan');
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 2'), 'Build');

    const firstDescription = screen.getByLabelText('Stage 1 description (optional)');
    const atLimit = '🧭'.repeat(2000);
    await fireEvent.changeText(firstDescription, atLimit);
    expect(firstDescription).toHaveDisplayValue(atLimit);

    await fireEvent.changeText(firstDescription, `${atLimit}🧭`);
    expect(firstDescription).toHaveDisplayValue(atLimit);

    await fireEvent.changeText(firstDescription, 'First line\n勇者');
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));

    await waitFor(() => expect(mockSaveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockSaveLongQuest).toHaveBeenCalledWith(
      expect.objectContaining({
        stages: [
          { id: null, name: 'Plan', description: 'First line\n勇者' },
          { id: null, name: 'Build', description: null },
        ],
      }),
      undefined
    );
  });

  it('loads an existing description and includes its cleared value when editing', async () => {
    mockSearchParams = { id: 'quest-1' };
    mockLongQuests = [{
      id: 'quest-1', name: 'Campaign', stat: 'WIS', description: null, completed: false,
      stages: [
        { id: 'stage-1', name: 'Research', description: 'Existing\nnotes', done: false },
        { id: 'stage-2', name: 'Execute', description: null, done: false },
      ],
    }];

    await render(<LongQuestEditorScreen />);
    const description = screen.getByLabelText('Stage 1 description (optional)');
    expect(description).toHaveDisplayValue('Existing\nnotes');

    await fireEvent.changeText(description, '');
    await fireEvent.press(screen.getByText('SAVE CHANGES'));

    await waitFor(() => expect(mockSaveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockSaveLongQuest.mock.calls[0][0].stages[0].description).toBe('');
    expect(mockSaveLongQuest.mock.calls[0][1]).toBe('quest-1');
  });
});
