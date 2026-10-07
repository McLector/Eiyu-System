import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { LongQuest } from '@eiyu/shared';

import LongQuestEditorScreen from '../../app/long-quest-editor';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockParams: { id?: string } = {};
let mockStore: any;
let mockBeforeRemove: ((event: any) => void) | null = null;
const mockNavigation = {
  addListener: (_name: string, handler: (event: any) => void) => { mockBeforeRemove = handler; return () => { mockBeforeRemove = null; }; },
  dispatch: jest.fn(),
};

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStore }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-keyboard-controller', () => {
  const React = jest.requireActual('react');
  const { View, ScrollView } = jest.requireActual('react-native');
  return {
    KeyboardAwareScrollView: ({ children, ...props }: any) => React.createElement(ScrollView, props, children),
    KeyboardAvoidingView: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

const stage = (id: string, name: string, done = false) => ({ id, name, done, description: null });
const quest = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'quest-1', name: 'Campaign', stat: 'WIS', description: null, completedAt: null, createdAt: '2026-10-01T00:00:00Z',
  stages: [stage('stage-1', 'Research', true), stage('stage-2', 'Execute')], ...over,
});
const gapped = () => quest({ strictOrder: false, stages: [stage('g-1', 'First', true), stage('g-2', 'Second'), stage('g-3', 'Third', true)] });

function setup(quests: LongQuest[] = [], id?: string) {
  mockParams = id ? { id } : {};
  mockBeforeRemove = null;
  mockStore = { user: { longQuests: quests }, saveLongQuest: jest.fn().mockResolvedValue(undefined), forgetLongQuestSave: jest.fn(), retryLongQuests: jest.fn() };
}
const ORDER = 'Stages in order';
const chip = () => screen.getByRole('checkbox', { name: ORDER });
const BLOCKED = 'Mark the later done stages not done first to keep stages in order.';

afterEach(() => { cleanup(); jest.clearAllMocks(); });

describe('long quest editor: the order option', () => {
  it('is on for a new chain and is saved with it', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(chip()).toBeChecked();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Ship a Side Project'), 'Launch');
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Plan');
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ strictOrder: true }), undefined);
  });

  it('can be turned off for a new chain', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.press(chip());
    expect(chip()).not.toBeChecked();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Ship a Side Project'), 'Launch');
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Plan');
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ strictOrder: false }), undefined));
  });

  it.each([[false, false], [true, true], [undefined, true]])('starts from the chain: strictOrder %s shows checked=%s', async (strictOrder, checked) => {
    setup([quest({ strictOrder })], 'quest-1');
    await renderWithTheme(<LongQuestEditorScreen />);
    if (checked) expect(chip()).toBeChecked(); else expect(chip()).not.toBeChecked();
  });

  it('names the stage list by the mode', async () => {
    setup([quest({ strictOrder: false })], 'quest-1');
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByText('STAGES (ANY ORDER)')).toBeOnTheScreen();
    await fireEvent.press(chip());
    expect(screen.getByText('STAGES (IN ORDER)')).toBeOnTheScreen();
  });

  it('may always go from in order to any order, and saves it with the quest id', async () => {
    setup([quest({ strictOrder: true })], 'quest-1');
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(chip()).toBeEnabled();
    await fireEvent.press(chip());
    await fireEvent.press(screen.getByText('SAVE CHANGES'));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ strictOrder: false }), 'quest-1');
  });

  it('counts a changed mode as an unsaved edit', async () => {
    setup([quest({ strictOrder: true })], 'quest-1');
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.press(chip());
    const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    await act(async () => { mockBeforeRemove?.(event); });
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('cannot be turned on while a done stage follows an open one, and says why', async () => {
    setup([gapped()], 'quest-1');
    mockParams = { id: 'quest-1' };
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(chip()).not.toBeChecked();
    expect(chip()).toBeDisabled();
    expect(screen.getByText(BLOCKED)).toBeOnTheScreen();
  });

  it('can be turned on after the open stage that causes the gap is removed from the draft', async () => {
    setup([{ ...gapped(), id: 'quest-1' }], 'quest-1');
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove stage 2' }));
    expect(chip()).toBeEnabled();
    expect(screen.queryByText(BLOCKED)).toBeNull();
    await fireEvent.press(chip());
    await fireEvent.press(screen.getByText('SAVE CHANGES'));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    const [draft, id] = mockStore.saveLongQuest.mock.calls[0];
    expect(id).toBe('quest-1');
    expect(draft.strictOrder).toBe(true);
    expect(draft.stages.map((s: { id: string }) => s.id)).toEqual(['g-1', 'g-3']);
  });

  it('stays enabled when the done stages of a chain done in any order already form a run from the start', async () => {
    setup([quest({ strictOrder: false })], 'quest-1');
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(chip()).toBeEnabled();
  });
});
