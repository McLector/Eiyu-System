import { act, fireEvent, screen, userEvent, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { GymExercise, GymRoutine } from '@eiyu/shared';

import ExerciseCardScreen from '../../app/(tabs)/gym/[id]';
import { renderWithTheme, TestThemeProvider } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockGym: any;
let mockParams: { id?: string } = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock; back: jest.Mock };
jest.mock('@/contexts/gym-store', () => ({ useGym: () => mockGym }));
jest.mock('@/components/gym/exercise-media', () => {
  const { Text } = jest.requireActual('react-native');
  return { ExerciseMedia: ({ exercise, active }: any) => <Text testID={`media-${exercise.id}`}>{active ? 'media-active' : 'media-idle'}</Text> };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const routine = (over: Partial<GymRoutine> = {}): GymRoutine => ({ id: 'r1', user_id: 'u', name: 'Push', unit: 'kg', archived: false, created_at: '2026-10-01', ...over });
const exercise = (id: string, position: number, over: Partial<GymExercise> = {}): GymExercise => ({
  id, routine_id: 'r1', user_id: 'u', name: `Lift ${id}`, position, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, rir_max: null, notes: '', media_path: null, media_mime: null, ...over,
});

function setup(over: Record<string, unknown> = {}, exercises = [exercise('e1', 0), exercise('e2', 1, { rir: 1, rir_max: 2, notes: 'Pause at the chest' })]) {
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
  mockParams = { id: 'e1' };
  const drafts: Record<string, string> = {};
  const weights: Record<string, Record<number, number>> = { e1: { 1: 60, 2: 55 } };
  mockGym = {
    routine: routine(), exercises, unit: 'kg', pending: false, error: null, uncertain: false, notice: null,
    logged: (id: string, recency: 1 | 2) => weights[id]?.[recency] ?? null,
    draft: (id: string) => drafts[id] ?? String(weights[id]?.[1] ?? ''),
    setDraft: jest.fn((id: string, value: string) => { drafts[id] = value; }),
    logWeight: jest.fn().mockResolvedValue(undefined), retryUncertain: jest.fn(),
    moveExercise: jest.fn().mockResolvedValue(undefined), removeExercise: jest.fn().mockResolvedValue(true),
    ...over,
  };
}
const press = (user: ReturnType<typeof userEvent.setup>, name: string | RegExp) => user.press(screen.getByRole('button', { name }));
const swipeTo = async (index: number) => {
  const pager = screen.getByTestId('gym-pager');
  await act(async () => { pager.props.onPageSelected?.({ nativeEvent: { position: index } }); });
};

describe('Gym exercise card', () => {
  it('shows the exercise, its tiles, Current in the field and Previous', async () => {
    setup();
    await renderWithTheme(<ExerciseCardScreen />);
    const card = screen.getByTestId('gym-card-e1');
    expect(within(card).getByText('Lift e1')).toBeOnTheScreen();
    expect(within(card).getByText('3 × 8-12')).toBeOnTheScreen();
    expect(within(card).getByText('90s')).toBeOnTheScreen();
    expect(within(card).getByText('2')).toBeOnTheScreen();
    expect(within(card).getByText('55 kg')).toBeOnTheScreen();
    expect(within(card).getByLabelText('Current weight for Lift e1 in kg')).toHaveDisplayValue('60');
    expect(screen.getByText('1 / 2')).toBeOnTheScreen();
  });

  it('shows a dash when there is no Previous weight, a range for RIR and the notes', async () => {
    setup();
    await renderWithTheme(<ExerciseCardScreen />);
    const card = screen.getByTestId('gym-card-e2');
    expect(within(card).getByText('1-2')).toBeOnTheScreen();
    expect(within(card).getByText('—')).toBeOnTheScreen();
    expect(within(card).getByText('Pause at the chest')).toBeOnTheScreen();
  });

  it('only the exercise being looked at reads its media', async () => {
    setup();
    await renderWithTheme(<ExerciseCardScreen />);
    expect(screen.getByTestId('media-e1')).toHaveTextContent('media-active');
    expect(screen.getByTestId('media-e2')).toHaveTextContent('media-idle');
    await swipeTo(1);
    expect(screen.getByTestId('media-e2')).toHaveTextContent('media-active');
    expect(screen.getByText('2 / 2')).toBeOnTheScreen();
  });

  it('opens on the exercise from the route', async () => {
    setup();
    mockParams = { id: 'e2' };
    await renderWithTheme(<ExerciseCardScreen />);
    expect(screen.getByText('2 / 2')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-pager')).toHaveProp('initialPage', 1);
  });

  it('goes to the next and previous exercise with the buttons, and not past either end', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<ExerciseCardScreen />);
    expect(screen.getByRole('button', { name: 'Previous exercise' })).toBeDisabled();
    await press(user, 'Next exercise');
    expect(screen.getByText('2 / 2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next exercise' })).toBeDisabled();
    await press(user, 'Previous exercise');
    expect(screen.getByText('1 / 2')).toBeOnTheScreen();
  });

  it('says so when the exercise does not exist', async () => {
    setup();
    mockParams = { id: 'gone' };
    await renderWithTheme(<ExerciseCardScreen />);
    expect(screen.getByText('EXERCISE NOT FOUND')).toBeOnTheScreen();
  });

  describe('logging a weight', () => {
    it('puts the weight field and LOG WEIGHT side by side, with a field sized like the other controls', async () => {
      setup();
      await renderWithTheme(<ExerciseCardScreen />);
      const row = screen.getByTestId('gym-weight-row-e1');
      expect(within(row).getByLabelText('Current weight for Lift e1 in kg')).toBeOnTheScreen();
      expect(within(row).getByRole('button', { name: 'LOG WEIGHT' })).toBeOnTheScreen();
      const field = StyleSheet.flatten(screen.getByLabelText('Current weight for Lift e1 in kg').props.style);
      expect(field.fontSize).toBeLessThanOrEqual(24);
      expect(field.minHeight).toBeLessThanOrEqual(52);
      expect(field.minHeight).toBeGreaterThanOrEqual(48);
    });

    it('stores what is typed for that exercise', async () => {
      setup();
      await renderWithTheme(<ExerciseCardScreen />);
      await fireEvent.changeText(screen.getByLabelText('Current weight for Lift e1 in kg'), '62.5');
      expect(mockGym.setDraft).toHaveBeenCalledWith('e1', '62.5');
    });

    it('logs a new typed weight with the button', async () => {
      setup({ draft: () => '62.5' });
      await renderWithTheme(<ExerciseCardScreen />);
      await userEvent.setup().press(within(screen.getByTestId('gym-card-e1')).getByRole('button', { name: 'LOG WEIGHT' }));
      expect(mockGym.logWeight).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
    });

    it('keeps LOG WEIGHT off until the typed weight differs from the logged one', async () => {
      setup();
      await renderWithTheme(<ExerciseCardScreen />);
      const button = within(screen.getByTestId('gym-card-e1')).getByRole('button', { name: 'LOG WEIGHT' });
      expect(button).toBeDisabled();
    });

    it('keeps LOG WEIGHT off for an empty exercise and on once something is typed', async () => {
      setup();
      mockParams = { id: 'e2' };
      mockGym.draft = (id: string) => (id === 'e2' ? '' : '60');
      const view = await renderWithTheme(<ExerciseCardScreen />);
      expect(within(screen.getByTestId('gym-card-e2')).getByRole('button', { name: 'LOG WEIGHT' })).toBeDisabled();
      mockGym.draft = (id: string) => (id === 'e2' ? '40' : '60');
      await view.rerender(<TestThemeProvider><ExerciseCardScreen /></TestThemeProvider>);
      expect(within(screen.getByTestId('gym-card-e2')).getByRole('button', { name: 'LOG WEIGHT' })).toBeEnabled();
    });

    it('locks the field and the button while the routine is archived', async () => {
      setup({ routine: routine({ archived: true }), draft: () => '70' });
      await renderWithTheme(<ExerciseCardScreen />);
      expect(screen.getByLabelText('Current weight for Lift e1 in kg')).toHaveProp('editable', false);
      expect(within(screen.getByTestId('gym-card-e1')).getByRole('button', { name: 'LOG WEIGHT' })).toBeDisabled();
    });

    it('asks to confirm an unconfirmed log, with the error shown', async () => {
      setup({ uncertain: true, error: 'The System could not confirm' });
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseCardScreen />);
      expect(screen.getByText('The System could not confirm')).toBeOnTheScreen();
      await press(user, 'Confirm save result');
      expect(mockGym.retryUncertain).toHaveBeenCalled();
    });

    it('shows the confirmation notice after a log', async () => {
      setup({ notice: 'Lift e1: 62.5 kg logged.' });
      await renderWithTheme(<ExerciseCardScreen />);
      expect(screen.getByText('Lift e1: 62.5 kg logged.')).toBeOnTheScreen();
    });
  });

  describe('exercise menu', () => {
    it('edits the exercise', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseCardScreen />);
      await press(user, 'Exercise actions for Lift e1');
      await user.press(screen.getByRole('menuitem', { name: 'Edit exercise' }));
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/gym-exercise-editor', params: { routineId: 'r1', id: 'e1' } });
    });

    it('moves the exercise, and disables the move that has nowhere to go', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseCardScreen />);
      await press(user, 'Exercise actions for Lift e1');
      expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
      await user.press(screen.getByRole('menuitem', { name: 'Move down' }));
      expect(mockGym.moveExercise).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), 1);
    });

    it('removes only after the confirmation, then leaves the card when none is left', async () => {
      setup({}, [exercise('e1', 0)]);
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseCardScreen />);
      await press(user, 'Exercise actions for Lift e1');
      await user.press(screen.getByRole('menuitem', { name: 'Remove' }));
      expect(mockGym.removeExercise).not.toHaveBeenCalled();
      expect(screen.getByText('Remove Lift e1? Logged weights remain in your history.')).toBeOnTheScreen();
      await press(user, 'Remove Exercise');
      expect(mockGym.removeExercise).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('moves to the neighbouring exercise, not a not-found screen, when one of several is removed', async () => {
      setup();
      mockParams = { id: 'e2' };
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseCardScreen />);
      await press(user, 'Exercise actions for Lift e2');
      await user.press(screen.getByRole('menuitem', { name: 'Remove' }));
      await press(user, 'Remove Exercise');
      expect(mockGym.removeExercise).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2' }));
      expect(screen.queryByText('EXERCISE NOT FOUND')).toBeNull();
      expect(screen.getByText('1 / 2')).toBeOnTheScreen();
      expect(mockRouter.back).not.toHaveBeenCalled();
    });

    it('returns to the removed exercise when the removal failed', async () => {
      setup({ removeExercise: jest.fn().mockResolvedValue(false) });
      mockParams = { id: 'e2' };
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseCardScreen />);
      await press(user, 'Exercise actions for Lift e2');
      await user.press(screen.getByRole('menuitem', { name: 'Remove' }));
      await press(user, 'Remove Exercise');
      expect(screen.getByText('2 / 2')).toBeOnTheScreen();
    });

    it('stays on the card when the removal failed', async () => {
      setup({ removeExercise: jest.fn().mockResolvedValue(false) }, [exercise('e1', 0)]);
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseCardScreen />);
      await press(user, 'Exercise actions for Lift e1');
      await user.press(screen.getByRole('menuitem', { name: 'Remove' }));
      await press(user, 'Remove Exercise');
      expect(mockRouter.back).not.toHaveBeenCalled();
    });

    it('is unavailable while a save is running or unconfirmed', async () => {
      setup({ pending: true });
      await renderWithTheme(<ExerciseCardScreen />);
      expect(screen.getByRole('button', { name: 'Exercise actions for Lift e1' })).toBeDisabled();
    });
  });
});
