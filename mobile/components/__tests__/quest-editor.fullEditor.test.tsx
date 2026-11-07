import { cleanup, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { type Quest } from '@eiyu/shared';

import { habitQuest, makeEditorStore } from '../../test-support/quest-editor-kit';
import { renderWithTheme } from '../ui/test-theme';

let mockParams: { id?: string; type?: string } = {};
let mockStore: any;

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

// Quests saved under the old permission rules carry an inputKind (or none) and a canWrite flag the editor must ignore.
const legacyUnclassified: Quest = (({ inputKind: _k, canWrite: _w, ...rest }) => ({ ...rest, id: 'q3' }) as Quest)(habitQuest);
const legacyBasic: Quest = { ...habitQuest, id: 'q2', name: 'Quest 1', description: null, easyVersion: null, targetCount: 3, inputKind: 'basic', canWrite: true };
const legacyNameless: Quest = { ...habitQuest, id: 'q4', name: '', description: null, inputKind: 'basic', canWrite: true };
const legacyCustomReadOnly: Quest = { ...habitQuest, id: 'q1', inputKind: 'custom', canWrite: false };

/** The store has no `tracker`, `audience`, `acceptTracker` or `refreshTracker`: the editor must not read any of them. */
function setup(quests: Quest[] = [], editing?: Quest, backlog: Quest[] = []) {
  mockParams = editing ? { id: editing.id } : {};
  const { tracker: _tracker, ...store } = makeEditorStore(quests, null, backlog);
  mockStore = store;
  return mockStore as typeof store;
}
const nameField = () => screen.queryByLabelText('Quest name');

afterEach(() => { cleanup(); jest.clearAllMocks(); mockStore = undefined; });

describe('new quest', () => {
  beforeEach(() => setup());

  it('shows the normal fields and none of the old tracking or permission wording', async () => {
    await renderWithTheme(<QuestEditorScreen />);
    expect(nameField()).toBeOnTheScreen();
    expect(screen.getByLabelText('Note')).toBeOnTheScreen();
    expect(screen.getByLabelText('Penalty')).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Use basic tracking' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Use custom details' })).toBeNull();
    expect(screen.queryByLabelText('Tracking style')).toBeNull();
    expect(screen.queryByText(/neutral name/i)).toBeNull();
    expect(screen.queryByText(/permission/i)).toBeNull();
    expect(screen.queryByText(/paused for this account/i)).toBeNull();
    expect(screen.queryByLabelText('Read-only quest')).toBeNull();
  });

  it('can be created straight away from a name and a penalty, with no tracker read at all', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(nameField()!, 'Stretch');
    await user.type(screen.getByLabelText('Penalty'), 'One stretch');
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeEnabled();
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledTimes(1));
    const [editor, existingId] = mockStore.saveHabit.mock.calls[0];
    expect(editor).toEqual({ mode: 'custom', values: expect.objectContaining({ name: 'Stretch', easyVersion: 'One stretch', questType: 'habit' }) });
    expect(existingId).toBeUndefined();
  });

  it('cannot be saved without a name', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Penalty'), 'One stretch');
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    expect(mockStore.saveHabit).not.toHaveBeenCalled();
  });

  it('cannot be saved with a whitespace-only name', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(nameField()!, '    ');
    await user.type(screen.getByLabelText('Penalty'), 'One stretch');
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
  });

  it('rejects a 200-character name with the existing validation message and sends nothing', async () => {
    await renderWithTheme(<QuestEditorScreen />);
    await fireEvent.changeText(nameField()!, 'x'.repeat(200));
    await fireEvent.changeText(screen.getByLabelText('Penalty'), 'One stretch');
    expect(await screen.findByTestId('quest-name-error')).toHaveTextContent(/\S/);
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    expect(mockStore.saveHabit).not.toHaveBeenCalled();
  });

  it('keeps the typed draft and shows the error when the save is refused, without retrying', async () => {
    mockStore.saveHabit.mockRejectedValue(new Error('This record changed, so nothing was saved.'));
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(nameField()!, 'Stretch');
    await user.type(screen.getByLabelText('Penalty'), 'One');
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was saved/);
    expect(nameField()!.props.value).toBe('Stretch');
    expect(mockStore.saveHabit).toHaveBeenCalledTimes(1);
  });
});

describe('quests saved under the old permission rules', () => {
  it('opens a quest that has no inputKind as a normal, editable quest', async () => {
    setup([legacyUnclassified], legacyUnclassified);
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.queryByLabelText('Read-only quest')).toBeNull();
    expect(nameField()!.props.editable).not.toBe(false);
    expect(nameField()!.props.value).toBe('Morning walk');
    await user.type(screen.getByLabelText('Note'), '!');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledTimes(1));
    expect(mockStore.saveHabit).toHaveBeenCalledWith({ mode: 'custom', values: expect.objectContaining({ name: 'Morning walk', description: '!' }) }, 'q3');
  });

  it('opens a custom quest the server marked unwritable as editable, with archive and delete available', async () => {
    setup([legacyCustomReadOnly], legacyCustomReadOnly);
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.queryByLabelText('Read-only quest')).toBeNull();
    expect(nameField()!.props.editable).not.toBe(false);
    for (const name of ['SAVE CHANGES', 'ARCHIVE QUEST', 'DELETE PERMANENTLY']) expect(screen.getByRole('button', { name })).toBeOnTheScreen();
  });

  it('shows the full fields for a stored basic quest, with no basic chip and no neutral-name hint', async () => {
    setup([legacyBasic], legacyBasic);
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.queryByRole('radio', { name: 'Use basic tracking' })).toBeNull();
    expect(screen.queryByText(/neutral name/i)).toBeNull();
    expect(nameField()!.props.value).toBe('Quest 1');
    // A quantity habit needs no penalty, so it saves as a normal editor input straight away.
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledTimes(1));
    expect(mockStore.saveHabit).toHaveBeenCalledWith({ mode: 'custom', values: expect.objectContaining({ name: 'Quest 1', targetCount: 3, easyVersion: null }) }, 'q2');
  });

  it('asks for a real name when the stored name is empty, and saves the new name', async () => {
    setup([legacyNameless], legacyNameless);
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    expect(nameField()!.props.value).toBe('');
    await user.type(screen.getByLabelText('Penalty'), 'One minute');
    // The empty stored name does not count as already accepted.
    expect(screen.getByRole('button', { name: 'SAVE CHANGES' })).toBeDisabled();
    await user.type(nameField()!, 'Evening stretch');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledTimes(1));
    expect(mockStore.saveHabit).toHaveBeenCalledWith({ mode: 'custom', values: expect.objectContaining({ name: 'Evening stretch' }) }, 'q4');
  });

  it('asks for the penalty of a stored basic habit that has none, instead of saving it empty', async () => {
    const noPenalty: Quest = { ...legacyBasic, targetCount: null };
    setup([noPenalty], noPenalty);
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByLabelText('Penalty')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'SAVE CHANGES' })).toBeDisabled();
  });

  it('still lets the person archive a stored basic quest', async () => {
    setup([legacyBasic], legacyBasic);
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.press(screen.getByRole('button', { name: 'ARCHIVE QUEST' }));
    await waitFor(() => expect(mockStore.archiveQuest).toHaveBeenCalledWith('q2'));
  });

  it('finds a Backlog quest the same way as a board quest and saves it as a normal quest', async () => {
    const backlogQuest: Quest = { ...legacyBasic, id: 'q9', questType: 'backlog' };
    setup([], backlogQuest, [backlogQuest]);
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'custom' }), 'q9'));
  });
});
