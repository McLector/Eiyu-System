import { cleanup, screen, userEvent, waitFor } from '@testing-library/react-native';
import { TRACKER_PURPOSE_NOTICES as NOTICES, type Quest, type TrackerAccess } from '@eiyu/shared';

import { habitQuest, makeEditorStore } from '../../test-support/quest-editor-kit';
import { noGrant, trackerAccess } from '../../test-support/tracker-fixtures';
import { renderWithTheme } from '../ui/test-theme';

let mockParams: { id?: string; type?: string } = {};
let mockStore: any;
const mockSetConsent = jest.fn();

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
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  setTrackerConsent: (...args: unknown[]) => mockSetConsent(...args),
  trackerErrorKind: () => null,
}));

const { default: QuestEditorScreen } = require('../../app/quest-editor') as typeof import('../../app/quest-editor');

const customQuest: Quest = { ...habitQuest, id: 'q1' };
const basicQuest: Quest = { ...habitQuest, id: 'q2', name: 'Quest 1', description: null, easyVersion: null, targetCount: 3, inputKind: 'basic', canWrite: true };
const legacyQuest: Quest = (({ inputKind: _k, canWrite: _w, ...rest }) => ({ ...rest, id: 'q3' }) as Quest)(habitQuest);

function setup(tracker: TrackerAccess | null, quests: Quest[] = [], editing?: Quest) {
  mockParams = editing ? { id: editing.id } : {};
  mockStore = makeEditorStore(quests, tracker);
  return mockStore as ReturnType<typeof makeEditorStore>;
}
const nameField = () => screen.queryByLabelText('Quest name');

afterEach(() => { cleanup(); jest.clearAllMocks(); mockStore = undefined; });

describe('new quest without custom permission', () => {
  beforeEach(() => setup(noGrant()));

  it('starts as basic tracking: no free-text fields, no notice, nothing sent on mount', async () => {
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByRole('radio', { name: 'Use basic tracking' })).toBeChecked();
    expect(nameField()).toBeNull();
    expect(screen.queryByLabelText('Note')).toBeNull();
    expect(screen.queryByLabelText('Penalty')).toBeNull();
    expect(screen.getByText(/neutral name/i)).toBeOnTheScreen();
    expect(screen.queryByText(NOTICES['custom-tracker'].body)).toBeNull();
    expect(mockStore.saveHabit).not.toHaveBeenCalled();
    expect(mockSetConsent).not.toHaveBeenCalled();
  });

  it('saves a basic habit with only structured fields and no text keys', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledTimes(1));
    const [editor, existingId] = mockStore.saveHabit.mock.calls[0];
    expect(editor).toEqual({ mode: 'basic', values: expect.objectContaining({ questType: 'habit', stat: 'INT', difficulty: 'Medium', time: '08:00', timeSet: true, days: expect.any(Array) }) });
    for (const key of ['name', 'description', 'easyVersion', 'genre']) expect(editor.values).not.toHaveProperty(key);
    expect(existingId).toBeUndefined();
  });

  it('shows the custom notice before any input is accepted, and declining returns to basic', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.press(screen.getByRole('radio', { name: 'Use custom details' }));
    expect(screen.getByText(NOTICES['custom-tracker'].body)).toBeOnTheScreen();
    expect(nameField()).toBeNull();
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    expect(mockSetConsent).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Keep basic tracking' }));
    expect(screen.getByRole('radio', { name: 'Use basic tracking' })).toBeChecked();
    expect(screen.queryByText(NOTICES['custom-tracker'].body)).toBeNull();
    expect(mockSetConsent).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'basic' }), undefined));
  });

  it('records a grant only from the explicit agree button and hands the server answer to the store', async () => {
    const granted = trackerAccess({}, 'owner-a');
    mockSetConsent.mockResolvedValue(granted);
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.press(screen.getByRole('radio', { name: 'Use custom details' }));
    await user.press(screen.getByRole('button', { name: NOTICES['custom-tracker'].label }));
    await waitFor(() => expect(mockStore.acceptTracker).toHaveBeenCalledWith(granted));
    expect(mockSetConsent).toHaveBeenCalledWith('custom-tracker', true, NOTICES['custom-tracker'].version, noGrant().revision);
    expect(mockStore.saveHabit).not.toHaveBeenCalled();
  });

  it('asks the store to re-read access when the grant is refused as stale', async () => {
    const stale = Object.assign(new Error('stale'), { code: 'ET003' });
    mockSetConsent.mockRejectedValue(stale);
    const shared = jest.requireMock('@eiyu/shared');
    const original = shared.trackerErrorKind;
    shared.trackerErrorKind = () => 'access-changed';
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.press(screen.getByRole('radio', { name: 'Use custom details' }));
    await user.press(screen.getByRole('button', { name: NOTICES['custom-tracker'].label }));
    await waitFor(() => expect(mockStore.refreshTracker).toHaveBeenCalledTimes(1));
    expect(mockStore.acceptTracker).not.toHaveBeenCalled();
    shared.trackerErrorKind = original;
  });
});

describe('new quest with custom permission', () => {
  beforeEach(() => setup(trackerAccess({}, 'owner-a')));

  it('keeps the existing custom form and sends mode custom with a name', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Stretch');
    await user.type(screen.getByLabelText('Penalty'), 'One stretch');
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledTimes(1));
    expect(mockStore.saveHabit.mock.calls[0][0]).toEqual({ mode: 'custom', values: expect.objectContaining({ name: 'Stretch', easyVersion: 'One stretch' }) });
  });

  it('never leaks an already typed name into a basic save', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Private thing');
    await user.type(screen.getByLabelText('Note'), 'secret');
    await user.press(screen.getByRole('radio', { name: 'Use basic tracking' }));
    expect(nameField()).toBeNull();
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledTimes(1));
    const { values } = mockStore.saveHabit.mock.calls[0][0];
    expect(JSON.stringify(values)).not.toMatch(/Private thing|secret/);
    for (const key of ['name', 'description', 'easyVersion', 'genre']) expect(values).not.toHaveProperty(key);
  });

  it('keeps the typed draft and shows the error when the save is refused, without retrying', async () => {
    mockStore.saveHabit.mockRejectedValue(new Error('Your permissions or this record changed, so nothing was saved.'));
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Stretch');
    await user.type(screen.getByLabelText('Penalty'), 'One');
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was saved/);
    expect(screen.getByLabelText('Quest name').props.value).toBe('Stretch');
    expect(mockStore.saveHabit).toHaveBeenCalledTimes(1);
  });
});

describe('paused account', () => {
  it('refuses to save and says why', async () => {
    setup(trackerAccess({ canWriteBasic: false, canWriteCustom: false }, 'owner-a'));
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByText(/paused for this account/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
  });

  it('refuses to save while access has not loaded', async () => {
    setup(null);
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
  });
});

describe('existing quests', () => {
  it('shows a custom quest without permission as read-only with a reason and no write path', async () => {
    const quest = { ...customQuest, canWrite: false };
    setup(noGrant(), [quest], quest);
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByText(/read-only until custom tracker permission/i)).toBeOnTheScreen();
    expect(screen.getByLabelText('Quest name').props.value).toBe('Morning walk');
    expect(screen.getByLabelText('Quest name').props.editable).toBe(false);
    for (const name of ['SAVE CHANGES', 'ARCHIVE QUEST', 'DELETE PERMANENTLY', 'RESTORE QUEST']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByRole('button', { name: NOTICES['custom-tracker'].label })).toBeOnTheScreen();
    expect(mockStore.saveHabit).not.toHaveBeenCalled();
  });

  it('treats an unclassified (legacy) quest as read-only even with custom permission', async () => {
    setup(trackerAccess({}, 'owner-a'), [legacyQuest], legacyQuest);
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByText(/read-only/i)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'SAVE CHANGES' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ARCHIVE QUEST' })).toBeNull();
  });

  it('keeps every quest read-only while access is not loaded', async () => {
    setup(null, [customQuest], customQuest);
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.queryByRole('button', { name: 'SAVE CHANGES' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'DELETE PERMANENTLY' })).toBeNull();
  });

  it('edits a basic quest as basic without custom permission, with no text fields', async () => {
    setup(noGrant(), [basicQuest], basicQuest);
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    expect(nameField()).toBeNull();
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledTimes(1));
    expect(mockStore.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'basic' }), 'q2');
  });

  it('finds a Backlog quest the same way as a board quest', async () => {
    const backlogQuest = { ...basicQuest, id: 'q9', questType: 'backlog' as const };
    mockParams = { id: 'q9' };
    mockStore = makeEditorStore([], noGrant(), [backlogQuest]);
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'basic' }), 'q9'));
  });

  it('lets a writable custom quest keep its custom form and sends mode custom', async () => {
    setup(trackerAccess({}, 'owner-a'), [customQuest], customQuest);
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.queryByRole('radio', { name: 'Use basic tracking' })).toBeNull();
    await user.type(screen.getByLabelText('Note'), '!');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'custom' }), 'q1'));
  });
});

describe('age-appropriate custom notice in the prompt', () => {
  const open = async (audience?: 'teen' | 'adult') => {
    setup(noGrant()); mockStore.audience = audience;
    await renderWithTheme(<QuestEditorScreen />);
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Use custom details' }));
  };

  it('shows the 12-17 explanation to a teen', async () => {
    await open('teen');
    expect(screen.getByText(NOTICES['custom-tracker'].childBody)).toBeOnTheScreen();
    expect(screen.queryByText(NOTICES['custom-tracker'].body)).toBeNull();
  });

  it.each([['adult', 'adult' as const], ['unknown', undefined]])('shows the adult notice for %s', async (_name, audience) => {
    await open(audience);
    expect(screen.getByText(NOTICES['custom-tracker'].body)).toBeOnTheScreen();
    expect(screen.queryByText(NOTICES['custom-tracker'].childBody)).toBeNull();
  });
});
