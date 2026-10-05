import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { NAVIGATION_GUARD_COPY, UncertainSaveError, type LongQuest } from '@eiyu/shared';

import LongQuestEditorScreen from '../../app/long-quest-editor';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockParams: { id?: string } = {};
let mockStore: any;
let mockBeforeRemove: ((event: any) => void) | null = null;
const mockDispatch = jest.fn();
const mockNavigation = {
  addListener: (_name: string, handler: (event: any) => void) => { mockBeforeRemove = handler; return () => { mockBeforeRemove = null; }; },
  dispatch: mockDispatch,
};

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));
const mockRouter = jest.requireMock('expo-router').router as { back: jest.Mock };
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

const stage = (id: string, name: string, done = false, description: string | null = null) => ({ id, name, done, description });
const existing = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'quest-1', name: 'Campaign', stat: 'WIS', description: null, completedAt: null, createdAt: '2026-10-01T00:00:00Z',
  stages: [stage('stage-1', 'Research', false, 'Existing\nnotes'), stage('stage-2', 'Execute')],
  ...over,
});

function setup(quests: LongQuest[] = [], id?: string, over: Record<string, unknown> = {}) {
  mockParams = id ? { id } : {};
  mockBeforeRemove = null;
  mockStore = {
    user: { longQuests: quests },
    saveLongQuest: jest.fn().mockResolvedValue(undefined),
    forgetLongQuestSave: jest.fn(),
    retryLongQuests: jest.fn(),
    ...over,
  };
}
const NAME = () => screen.getByPlaceholderText('e.g. Ship a Side Project');
async function fillNew(name = 'Launch', stages: string[] = ['Plan', 'Build']) {
  await fireEvent.changeText(NAME(), name);
  for (const [i, value] of stages.entries()) await fireEvent.changeText(screen.getByPlaceholderText(`Stage ${i + 1}`), value);
}
async function leave() {
  const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
  await act(async () => { mockBeforeRemove?.(event); });
  return event;
}

afterEach(() => { cleanup(); jest.clearAllMocks(); });

describe('long quest editor: stage descriptions', () => {
  it('accepts multiline Unicode descriptions at the boundary and includes them when creating', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await fillNew();
    const first = screen.getByLabelText('Stage 1 description (optional)');
    const atLimit = '🧭'.repeat(2000);
    await fireEvent.changeText(first, atLimit);
    expect(first).toHaveDisplayValue(atLimit);
    await fireEvent.changeText(first, `${atLimit}🧭`);
    expect(first).toHaveDisplayValue(atLimit);
    await fireEvent.changeText(first, 'First line\n勇者');
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest).toHaveBeenCalledWith(
      expect.objectContaining({ stages: [{ id: null, name: 'Plan', description: 'First line\n勇者' }, { id: null, name: 'Build', description: null }] }),
      undefined
    );
  });

  it('loads an existing description and sends its cleared value when editing', async () => {
    setup([existing()], 'quest-1');
    await renderWithTheme(<LongQuestEditorScreen />);
    const description = screen.getByLabelText('Stage 1 description (optional)');
    expect(description).toHaveDisplayValue('Existing\nnotes');
    await fireEvent.changeText(description, '');
    await fireEvent.press(screen.getByText('SAVE CHANGES'));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest.mock.calls[0][0].stages[0]).toEqual({ id: 'stage-1', name: 'Research', description: '' });
    expect(mockStore.saveLongQuest.mock.calls[0][1]).toBe('quest-1');
  });
});

describe('long quest editor: name validation', () => {
  it('rejects 81-code-point and invisible-only names with visible reasons', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.changeText(NAME(), '😀'.repeat(81));
    expect(screen.getByTestId('long-quest-name-error')).toHaveTextContent('Quest name must be 80 characters or fewer.');
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
    await fireEvent.changeText(NAME(), ' \u200b\u200c\u200d\u2060\ufeff ');
    expect(screen.getByTestId('long-quest-name-error')).toHaveTextContent('Enter a quest name.');
    expect(mockStore.saveLongQuest).not.toHaveBeenCalled();
  });

  it('does not show a name error before the name is touched, and still blocks saving', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.queryByTestId('long-quest-name-error')).toBeNull();
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
  });

  it('creates with an 80-code-point name', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    const name = '😀'.repeat(80);
    await fillNew(name);
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ name }), undefined);
  });

  it('allows an unchanged grandfathered name when an unrelated field changes', async () => {
    const legacyName = '🧭'.repeat(81);
    setup([existing({ id: 'legacy', name: legacyName, stages: [stage('s1', 'Plan'), stage('s2', 'Build')] })], 'legacy');
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('Context, why it matters…'), 'Keep this project moving');
    await fireEvent.press(screen.getByText('SAVE CHANGES'));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ name: legacyName, description: 'Keep this project moving' }), 'legacy');
  });
});

describe('long quest editor: form', () => {
  it('has no Suggest Stages control (the AI action is not offered on mobile)', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.queryByText(/suggest stages/i)).toBeNull();
    expect(screen.queryByText(/thinking/i)).toBeNull();
  });

  it('is a full-screen editor with a pinned Save and a close button', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByText('NEW LONG QUEST')).toBeOnTheScreen();
    expect(screen.getByTestId('long-quest-editor-footer')).toContainElement(screen.getByTestId('long-quest-save'));
    await fireEvent.press(screen.getByRole('button', { name: 'Close long quest editor' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('chooses the stat with accessible radios and sends it', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByRole('radio', { name: 'INT' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'STR' }));
    expect(screen.getByRole('radio', { name: 'STR' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'INT' })).not.toBeChecked();
    await fillNew();
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ stat: 'STR' }), undefined));
  });

  it('needs at least one named stage, ignores blank stages, and has no upper limit on stages', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.changeText(NAME(), 'Launch');
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), '   ');
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Plan');
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeEnabled();
    for (let i = 0; i < 9; i += 1) await fireEvent.press(screen.getByRole('button', { name: 'ADD STAGE' }));
    expect(screen.getByPlaceholderText('Stage 11')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'CREATE LONG QUEST' }));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalled());
    expect(mockStore.saveLongQuest.mock.calls[0][0].stages).toEqual([{ id: null, name: 'Plan', description: null }]);
  });

  it('removes a stage, but never the last one', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await fillNew();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove stage 1' }));
    expect(screen.getByPlaceholderText('Stage 1')).toHaveDisplayValue('Build');
    expect(screen.queryByRole('button', { name: /Remove stage/ })).toBeNull();
  });

  it('keeps done stages: their remove button is disabled', async () => {
    setup([existing({ stages: [stage('stage-1', 'Research', true), stage('stage-2', 'Execute')] })], 'quest-1');
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByRole('button', { name: 'Remove stage 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove stage 2' })).toBeEnabled();
  });

  it('shows a calm empty state, not a blank "new" form, when the chain being edited is gone', async () => {
    setup([], 'deleted-elsewhere');
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByText('CHAIN NOT FOUND')).toBeOnTheScreen();
    expect(screen.queryByTestId('long-quest-save')).toBeNull();
  });

  it('shows a confirmed save failure, stays editable, and can try again', async () => {
    setup();
    mockStore.saveLongQuest.mockRejectedValueOnce(new Error('Quest name must contain visible text'));
    await renderWithTheme(<LongQuestEditorScreen />);
    await fillNew();
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    expect(await screen.findByText(/The System couldn't create that quest — .*visible text/)).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(NAME()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeEnabled();
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });

  it('says it is saving and ignores a second press', async () => {
    let finish!: () => void;
    setup();
    mockStore.saveLongQuest.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    await renderWithTheme(<LongQuestEditorScreen />);
    await fillNew();
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    expect(await screen.findByText('SAVING…')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('long-quest-save'));
    expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });
});

describe('long quest editor: discard guard', () => {
  it('lets a clean editor close without asking', async () => {
    setup([existing()], 'quest-1');
    await renderWithTheme(<LongQuestEditorScreen />);
    expect((await leave()).preventDefault).not.toHaveBeenCalled();
  });

  it('asks before leaving with unsaved edits, and Keep Editing stays', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.changeText(NAME(), 'Half done');
    expect((await leave()).preventDefault).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Discard changes?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(NAME()).toHaveDisplayValue('Half done');
  });

  it('Discard Changes lets the held navigation through', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.changeText(NAME(), 'Half done');
    await leave();
    await fireEvent.press(await screen.findByRole('button', { name: 'Discard Changes' }));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('counts a changed stage description or removed stage as an unsaved edit when editing', async () => {
    setup([existing()], 'quest-1');
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.changeText(screen.getByLabelText('Stage 2 description (optional)'), 'new');
    expect((await leave()).preventDefault).toHaveBeenCalled();
  });

  it('does not ask again after a successful save', async () => {
    setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await fillNew();
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect((await leave()).preventDefault).not.toHaveBeenCalled();
  });
});

describe('long quest editor: unconfirmed save', () => {
  async function uncertain() {
    setup();
    mockStore.saveLongQuest.mockRejectedValueOnce(new UncertainSaveError());
    await renderWithTheme(<LongQuestEditorScreen />);
    await fillNew();
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    await screen.findByText('CHECK SAVE RESULT');
  }

  it('locks the fields, relabels the button and explains', async () => {
    await uncertain();
    expect(screen.getByText(/The System couldn't create that quest/)).toBeOnTheScreen();
    expect(NAME()).toBeDisabled();
    expect(screen.getByPlaceholderText('Stage 1')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ADD STAGE' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'STR' })).toBeDisabled();
  });

  it('retries the same draft with CHECK SAVE RESULT, then closes', async () => {
    await uncertain();
    await fireEvent.press(screen.getByText('CHECK SAVE RESULT'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(2);
    expect(mockStore.saveLongQuest.mock.calls[1][0]).toEqual(mockStore.saveLongQuest.mock.calls[0][0]);
  });

  it('blocks leaving with the "save in progress" notice instead of the discard prompt', async () => {
    await uncertain();
    expect((await leave()).preventDefault).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(NAVIGATION_GUARD_COPY.busyTitle)).toBeOnTheScreen();
    expect(screen.getByText(NAVIGATION_GUARD_COPY.busyBody)).toBeOnTheScreen();
    expect(screen.queryByText('Discard changes?')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Stay' }));
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('can still leave when the result stays unknown: forgets the pending save and refreshes the list', async () => {
    await uncertain();
    await leave();
    await fireEvent.press(await screen.findByRole('button', { name: 'Leave without confirming' }));
    expect(mockStore.forgetLongQuestSave).toHaveBeenCalledTimes(1);
    expect(mockStore.retryLongQuests).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('blocks leaving while the save is running, with no way around it', async () => {
    setup();
    mockStore.saveLongQuest.mockReturnValue(new Promise(() => {}));
    await renderWithTheme(<LongQuestEditorScreen />);
    await fillNew();
    await fireEvent.press(screen.getByText('CREATE LONG QUEST'));
    await screen.findByText('SAVING…');
    expect((await leave()).preventDefault).toHaveBeenCalled();
    expect(await screen.findByText(NAVIGATION_GUARD_COPY.busyTitle)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Leave without confirming' })).toBeNull();
  });
});
