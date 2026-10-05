import { act, cleanup, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { UncertainSaveError, type GymRoutine } from '@eiyu/shared';

import RoutineEditorScreen from '../../app/gym-routine-editor';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockParams: { id?: string } = {};
let mockGym: any;
let mockBeforeRemove: ((event: any) => void) | null = null;
const mockDispatch = jest.fn();
const mockNavigation = {
  addListener: (_name: string, handler: (event: any) => void) => { mockBeforeRemove = handler; return () => { mockBeforeRemove = null; }; },
  dispatch: mockDispatch,
};
const mockShared = { saveGymRoutine: jest.fn() };

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));
const mockRouter = jest.requireMock('expo-router').router as { back: jest.Mock };
jest.mock('@/contexts/gym-store', () => ({ useGym: () => mockGym }));
jest.mock('@eiyu/shared', () => ({ ...jest.requireActual('@eiyu/shared'), saveGymRoutine: (...args: unknown[]) => mockShared.saveGymRoutine(...args) }));
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

const routine = (over: Partial<GymRoutine> = {}): GymRoutine => ({ id: 'r1', user_id: 'u', name: 'Push', unit: 'kg', archived: false, created_at: '2026-10-01', ...over });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setup(id?: string, routines: GymRoutine[] = [routine()]) {
  mockParams = id ? { id } : {};
  mockBeforeRemove = null;
  mockShared.saveGymRoutine.mockReset().mockResolvedValue('saved-id');
  mockGym = { userId: 'u', routines, loading: false, refreshAfterSave: jest.fn().mockResolvedValue(undefined), retryLoad: jest.fn() };
}
const NAME = () => screen.getByLabelText('Routine name');
async function leave() {
  const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
  await act(async () => { mockBeforeRemove?.(event); });
  return event;
}
afterEach(() => { cleanup(); jest.clearAllMocks(); });

describe('Gym routine editor', () => {
  it('creates a routine with a name and a unit, then selects it and closes', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<RoutineEditorScreen />);
    expect(screen.getByText('NEW ROUTINE')).toBeOnTheScreen();
    await fireEvent.changeText(NAME(), '  Chest and Tris ');
    await user.press(screen.getByRole('radio', { name: 'lb' }));
    await user.press(screen.getByRole('button', { name: 'SAVE ROUTINE' }));
    const [userId, name, unit, id, creationId] = mockShared.saveGymRoutine.mock.calls[0];
    expect([userId, name, unit, id]).toEqual(['u', '  Chest and Tris ', 'lb', undefined]);
    expect(creationId).toMatch(UUID);
    expect(mockGym.refreshAfterSave).toHaveBeenCalledWith('Routine', 'saved-id');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('keeps Save disabled for a blank name and shows the error once the name was touched', async () => {
    setup();
    await renderWithTheme(<RoutineEditorScreen />);
    expect(screen.getByRole('button', { name: 'SAVE ROUTINE' })).toBeDisabled();
    await fireEvent.changeText(NAME(), '   ');
    expect(screen.getByText('Enter a routine name.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'SAVE ROUTINE' })).toBeDisabled();
  });

  it('edits an existing routine in place with its id', async () => {
    setup('r1');
    const user = userEvent.setup();
    await renderWithTheme(<RoutineEditorScreen />);
    expect(screen.getByText('EDIT ROUTINE')).toBeOnTheScreen();
    expect(NAME()).toHaveDisplayValue('Push');
    expect(screen.getByRole('radio', { name: 'kg' })).toBeChecked();
    await fireEvent.changeText(NAME(), 'Pull');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    expect(mockShared.saveGymRoutine.mock.calls[0].slice(0, 4)).toEqual(['u', 'Pull', 'kg', 'r1']);
  });

  it('says so when the routine no longer exists', async () => {
    setup('gone');
    await renderWithTheme(<RoutineEditorScreen />);
    expect(screen.getByText('ROUTINE NOT FOUND')).toBeOnTheScreen();
  });

  it('shows a confirmed failure and lets the user try again with the same id', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<RoutineEditorScreen />);
    await fireEvent.changeText(NAME(), 'Legs');
    mockShared.saveGymRoutine.mockRejectedValueOnce(new Error('name too long'));
    await user.press(screen.getByRole('button', { name: 'SAVE ROUTINE' }));
    expect(screen.getByText(/name too long/)).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'SAVE ROUTINE' }));
    expect(mockShared.saveGymRoutine.mock.calls[1][4]).toBe(mockShared.saveGymRoutine.mock.calls[0][4]);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('asks to confirm an uncertain save and locks the fields, reusing the creation id', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<RoutineEditorScreen />);
    await fireEvent.changeText(NAME(), 'Legs');
    mockShared.saveGymRoutine.mockRejectedValueOnce(new UncertainSaveError());
    await user.press(screen.getByRole('button', { name: 'SAVE ROUTINE' }));
    expect(screen.getByRole('button', { name: 'Confirm save result' })).toBeOnTheScreen();
    expect(NAME()).toHaveProp('editable', false);
    await user.press(screen.getByRole('button', { name: 'Confirm save result' }));
    expect(mockShared.saveGymRoutine.mock.calls[1][4]).toBe(mockShared.saveGymRoutine.mock.calls[0][4]);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  describe('leaving', () => {
    it('lets a clean editor close without asking', async () => {
      setup();
      await renderWithTheme(<RoutineEditorScreen />);
      const event = await leave();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('asks before discarding edits, and keeps editing on request', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<RoutineEditorScreen />);
      await fireEvent.changeText(NAME(), 'Legs');
      const event = await leave();
      expect(event.preventDefault).toHaveBeenCalled();
      expect(screen.getByText('Your unsaved routine changes will be lost.')).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Keep Editing' }));
      expect(mockDispatch).not.toHaveBeenCalled();
      await leave();
      await user.press(screen.getByRole('button', { name: 'Discard Changes' }));
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    });

    it('does not ask again after a successful save', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<RoutineEditorScreen />);
      await fireEvent.changeText(NAME(), 'Legs');
      await user.press(screen.getByRole('button', { name: 'SAVE ROUTINE' }));
      const event = await leave();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('blocks leaving while the answer to a save is unknown, but lets the user leave without confirming', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<RoutineEditorScreen />);
      await fireEvent.changeText(NAME(), 'Legs');
      mockShared.saveGymRoutine.mockRejectedValueOnce(new UncertainSaveError());
      await user.press(screen.getByRole('button', { name: 'SAVE ROUTINE' }));
      const event = await leave();
      expect(event.preventDefault).toHaveBeenCalled();
      await user.press(screen.getByRole('button', { name: 'Leave without confirming' }));
      expect(mockGym.retryLoad).toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    });
  });
});
