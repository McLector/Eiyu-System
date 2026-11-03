import { cleanup, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { TRACKER_PURPOSE_NOTICES as NOTICES, type LongQuest, type TrackerAccess } from '@eiyu/shared';

import LongQuestEditorScreen from '../../app/long-quest-editor';
import { noGrant, trackerAccess } from '../../test-support/tracker-fixtures';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockParams: { id?: string } = {};
let mockStore: any;
const mockSetConsent = jest.fn();

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
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  setTrackerConsent: (...args: unknown[]) => mockSetConsent(...args),
  trackerErrorKind: () => null,
}));

const stage = (id: string, name: string) => ({ id, name, done: false, description: null });
const chain = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'c1', name: 'Campaign', stat: 'WIS', description: null, completedAt: null, createdAt: '2026-10-01T00:00:00Z',
  stages: [stage('s1', 'Research'), stage('s2', 'Execute')], inputKind: 'custom', canWrite: true, ...over,
});
const customChain = chain();
const basicChain = chain({ id: 'c2', name: 'Chain 1', inputKind: 'basic', stages: [stage('b1', 'Stage 1'), stage('b2', 'Stage 2')] });
const legacyChain = (({ inputKind: _k, canWrite: _w, ...rest }) => ({ ...rest, id: 'c3' }) as LongQuest)(chain());

function setup(tracker: TrackerAccess | null, chains: LongQuest[] = [], id?: string) {
  mockParams = id ? { id } : {};
  mockStore = {
    user: { longQuests: chains }, tracker,
    saveLongQuest: jest.fn().mockResolvedValue(undefined), forgetLongQuestSave: jest.fn(), retryLongQuests: jest.fn(),
    acceptTracker: jest.fn(), refreshTracker: jest.fn().mockResolvedValue(undefined),
  };
}
const nameField = () => screen.queryByPlaceholderText('e.g. Ship a Side Project');

afterEach(() => { cleanup(); jest.clearAllMocks(); mockStore = undefined; });

describe('new chain without custom permission', () => {
  beforeEach(() => setup(noGrant()));

  it('starts basic: no names, notes or stage text, and nothing is sent on mount', async () => {
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByRole('radio', { name: 'Use basic tracking' })).toBeChecked();
    expect(nameField()).toBeNull();
    expect(screen.queryByPlaceholderText('Context, why it matters…')).toBeNull();
    expect(screen.queryByPlaceholderText('Stage 1')).toBeNull();
    expect(screen.getByText(/neutral names/i)).toBeOnTheScreen();
    expect(screen.queryByText(NOTICES['custom-tracker'].body)).toBeNull();
    expect(mockStore.saveLongQuest).not.toHaveBeenCalled();
    expect(mockSetConsent).not.toHaveBeenCalled();
  });

  it('creates a basic chain from stage count, attribute and order only', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await user.press(screen.getByRole('button', { name: 'CREATE LONG QUEST' }));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    const [editor, existingId] = mockStore.saveLongQuest.mock.calls[0];
    expect(editor).toEqual({ mode: 'basic', values: { stat: 'INT', strictOrder: true, stages: [{}, {}] } });
    expect(existingId).toBeUndefined();
  });

  it('shows the custom notice before any input is accepted, and declining returns to basic', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await user.press(screen.getByRole('radio', { name: 'Use custom details' }));
    expect(screen.getByText(NOTICES['custom-tracker'].body)).toBeOnTheScreen();
    expect(nameField()).toBeNull();
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
    expect(mockSetConsent).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Keep basic tracking' }));
    expect(screen.getByRole('radio', { name: 'Use basic tracking' })).toBeChecked();
    expect(mockSetConsent).not.toHaveBeenCalled();
  });

  it('records a grant only from the explicit agree button and hands the answer to the store', async () => {
    const granted = trackerAccess({}, 'owner-a');
    mockSetConsent.mockResolvedValue(granted);
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await user.press(screen.getByRole('radio', { name: 'Use custom details' }));
    await user.press(screen.getByRole('button', { name: NOTICES['custom-tracker'].label }));
    await waitFor(() => expect(mockStore.acceptTracker).toHaveBeenCalledWith(granted));
    expect(mockSetConsent).toHaveBeenCalledWith('custom-tracker', true, NOTICES['custom-tracker'].version, noGrant().revision);
    expect(mockStore.saveLongQuest).not.toHaveBeenCalled();
  });
});

describe('new chain with custom permission', () => {
  beforeEach(() => setup(trackerAccess({}, 'owner-a')));

  it('requires a chain name and a stage name, then sends mode custom', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
    await fireEvent.changeText(nameField()!, 'Launch');
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Plan');
    await user.press(screen.getByRole('button', { name: 'CREATE LONG QUEST' }));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest.mock.calls[0][0]).toEqual({ mode: 'custom', values: expect.objectContaining({ name: 'Launch', stat: 'INT' }) });
  });

  it('never leaks typed text into a basic save', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    await fireEvent.changeText(nameField()!, 'Private plan');
    await fireEvent.changeText(screen.getByPlaceholderText('Stage 1'), 'Secret step');
    await user.press(screen.getByRole('radio', { name: 'Use basic tracking' }));
    await user.press(screen.getByRole('button', { name: 'CREATE LONG QUEST' }));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    const editor = mockStore.saveLongQuest.mock.calls[0][0];
    expect(editor.mode).toBe('basic');
    expect(JSON.stringify(editor)).not.toMatch(/Private plan|Secret step/);
  });

  it('keeps the draft and shows the reason when the save is refused, without retrying', async () => {
    mockStore.saveLongQuest.mockRejectedValue(new Error('Your permissions or this record changed, so nothing was saved.'));
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

describe('paused or unloaded access', () => {
  it('refuses to save while the account is paused and says why', async () => {
    setup(trackerAccess({ canWriteBasic: false, canWriteCustom: false }, 'owner-a'));
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByText(/paused for this account/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
  });

  it('refuses to save while access has not loaded', async () => {
    setup(null);
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByRole('button', { name: 'CREATE LONG QUEST' })).toBeDisabled();
  });
});

describe('existing chains', () => {
  it('shows a custom chain without permission as read-only with a reason and no save path', async () => {
    setup(noGrant(), [{ ...customChain, canWrite: false }], 'c1');
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByText(/read-only until custom tracker permission/i)).toBeOnTheScreen();
    expect(nameField()!.props.value).toBe('Campaign');
    expect(nameField()!.props.editable).toBe(false);
    expect(screen.queryByRole('button', { name: 'SAVE CHANGES' })).toBeNull();
    expect(screen.getByRole('button', { name: NOTICES['custom-tracker'].label })).toBeOnTheScreen();
    expect(mockStore.saveLongQuest).not.toHaveBeenCalled();
  });

  it('treats an unclassified chain as read-only even with custom permission', async () => {
    setup(trackerAccess({}, 'owner-a'), [legacyChain], 'c3');
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.getByText(/read-only/i)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'SAVE CHANGES' })).toBeNull();
  });

  it('edits a basic chain as basic and keeps its stage ids', async () => {
    setup(noGrant(), [basicChain], 'c2');
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(nameField()).toBeNull();
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledTimes(1));
    expect(mockStore.saveLongQuest).toHaveBeenCalledWith({ mode: 'basic', values: { stat: 'WIS', strictOrder: true, stages: [{ id: 'b1' }, { id: 'b2' }] } }, 'c2');
  });

  it('lets a writable custom chain keep its custom form and sends mode custom', async () => {
    setup(trackerAccess({}, 'owner-a'), [customChain], 'c1');
    const user = userEvent.setup();
    await renderWithTheme(<LongQuestEditorScreen />);
    expect(screen.queryByRole('radio', { name: 'Use basic tracking' })).toBeNull();
    await fireEvent.changeText(nameField()!, 'Campaign 2');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ mode: 'custom' }), 'c1'));
  });
});

describe('age-appropriate custom notice in the prompt', () => {
  const open = async (audience?: 'teen' | 'adult') => {
    setup(noGrant()); mockStore.audience = audience;
    await renderWithTheme(<LongQuestEditorScreen />);
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
