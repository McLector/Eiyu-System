import { cleanup, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { type LongQuest } from '@eiyu/shared';

import LongQuestEditorScreen from '../../app/long-quest-editor';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockParams: { id?: string } = {};
let mockStore: any;

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }),
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

const stage = (id: string, name: string) => ({ id, name, done: false, description: null });
const chain = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'c1', name: 'Campaign', stat: 'WIS', description: null, completedAt: null, createdAt: '2026-10-01T00:00:00Z',
  stages: [stage('s1', 'Research'), stage('s2', 'Execute')], ...over,
});
// Chains saved under the old permission rules carry an inputKind (or none) and a canWrite flag the editor must ignore.
const legacyUnclassified = chain({ id: 'c3' });
const legacyCustomReadOnly = chain({ id: 'c4', inputKind: 'custom', canWrite: false });
const legacyBasic = chain({ id: 'c2', name: 'Chain 1', inputKind: 'basic', canWrite: true, stages: [stage('b1', 'Stage 1'), stage('b2', 'Stage 2')] });
const legacyNameless = chain({ id: 'c5', name: '', inputKind: 'basic', canWrite: true });

/** The store has no `tracker`, `audience`, `acceptTracker` or `refreshTracker`: the editor must not read any of them. */
function setup(chains: LongQuest[] = [], id?: string) {
  mockParams = id ? { id } : {};
  mockStore = {
    user: { longQuests: chains },
    saveLongQuest: jest.fn().mockResolvedValue(undefined), forgetLongQuestSave: jest.fn(), retryLongQuests: jest.fn(),
  };
}
const nameField = () => screen.queryByPlaceholderText('e.g. Ship a Side Project');

afterEach(() => { cleanup(); jest.clearAllMocks(); mockStore = undefined; });

describe('new chain', () => {
  beforeEach(() => setup());

  it('shows the normal fields and none of the old tracking or permission wording', async () => {
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(nameField()).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Context, why it matters…')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Stage 1')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Stage 2')).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Use basic tracking' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Use custom details' })).toBeNull();
    expect(screen.queryByLabelText('Tracking style')).toBeNull();
    expect(screen.queryByText(/neutral names/i)).toBeNull();
    expect(screen.queryByText(/permission/i)).toBeNull();
    expect(screen.queryByText(/paused for this account/i)).toBeNull();
    expect(screen.queryByLabelText('Read-only quest')).toBeNull();
  });

  it('requires a chain name and a stage name, then sends custom-mode values', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
    await fireEvent.changeText(nameField()!, 'Launch');
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Plan');
    await user.press(screen.getByRole('button', { name: 'CREATE LONG QUEST' }));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    const [editor, existingId] = mockStore.saveLongQuest.mock.calls[0];
    expect(editor).toEqual({ mode: 'custom', values: expect.objectContaining({ name: 'Launch', stat: 'INT', stages: [expect.objectContaining({ name: 'Plan' })] }) });
    expect(existingId).toBeUndefined();
  });

  it('cannot be created with a stage name but no chain name', async () => {
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Plan');
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
    expect(mockStore.saveLongQuest).not.toHaveBeenCalled();
  });

  it('rejects a 200-character name with the existing validation message and sends nothing', async () => {
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.changeText(nameField()!, 'x'.repeat(200));
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Plan');
    expect(await screen.findByTestId('long-quest-name-error')).toHaveTextContent(/\S/);
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
    expect(mockStore.saveLongQuest).not.toHaveBeenCalled();
  });

  it('keeps the draft and shows the reason when the save is refused, without retrying', async () => {
    mockStore.saveLongQuest.mockRejectedValue(new Error('This record changed, so nothing was saved.'));
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.changeText(nameField()!, 'Launch');
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Plan');
    await user.press(screen.getByRole('button', { name: 'CREATE LONG QUEST' }));
    expect(await screen.findByText(/nothing was saved/)).toBeOnTheScreen();
    expect(nameField()!.props.value).toBe('Launch');
    expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1);
  });
});

describe('chains saved under the old permission rules', () => {
  it('opens a chain with no inputKind as a normal, editable chain', async () => {
    setup([legacyUnclassified], 'c3');
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.queryByLabelText('Read-only quest')).toBeNull();
    expect(nameField()!.props.editable).not.toBe(false);
    expect(nameField()!.props.value).toBe('Campaign');
    await user.type(nameField()!, '!');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest).toHaveBeenCalledWith({ mode: 'custom', values: expect.objectContaining({ name: 'Campaign!' }) }, 'c3');
  });

  it('opens a custom chain the server marked unwritable as editable', async () => {
    setup([legacyCustomReadOnly], 'c4');
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.queryByLabelText('Read-only quest')).toBeNull();
    expect(nameField()!.props.editable).not.toBe(false);
    expect(screen.getByRole('button', { name: 'SAVE CHANGES' })).toBeOnTheScreen();
  });

  it('shows names and stage text for a stored basic chain and saves it as a normal chain, keeping stage ids', async () => {
    setup([legacyBasic], 'c2');
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.queryByRole('radio', { name: 'Use basic tracking' })).toBeNull();
    expect(screen.queryByText(/neutral names/i)).toBeNull();
    expect(nameField()!.props.value).toBe('Chain 1');
    expect(screen.getByPlaceholderText('Stage 1').props.value).toBe('Stage 1');
    await user.press(screen.getByRole('button', { name: 'Remove stage 2' }));
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest).toHaveBeenCalledWith(
      { mode: 'custom', values: expect.objectContaining({ name: 'Chain 1', stages: [{ id: 'b1', name: 'Stage 1', description: null }] }) }, 'c2');
  });

  it('asks for a real name when the stored name is empty, and saves the new name', async () => {
    setup([legacyNameless], 'c5');
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(nameField()!.props.value).toBe('');
    // The empty stored name does not count as already accepted.
    expect(screen.getByRole('button', { name: 'SAVE CHANGES' })).toBeDisabled();
    await user.type(nameField()!, 'Real name');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledWith({ mode: 'custom', values: expect.objectContaining({ name: 'Real name' }) }, 'c5'));
  });
});
