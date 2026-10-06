import { screen, userEvent, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { GymExercise, GymRoutine } from '@eiyu/shared';

import GymScreen from '../../app/(tabs)/gym/index';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockGym: any;
let mockFontScale = 1;
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock };
jest.mock('@/contexts/gym-store', () => ({ useGym: () => mockGym }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 2, fontScale: mockFontScale }),
}));

const routine = (over: Partial<GymRoutine> = {}): GymRoutine => ({ id: 'r1', user_id: 'u', name: 'Push', unit: 'kg', archived: false, created_at: '2026-10-01', ...over });
const exercise = (id: string, position: number): GymExercise => ({
  id, routine_id: 'r1', user_id: 'u', name: `Lift ${id}`, position, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, rir_max: null, notes: '', media_path: null, media_mime: null,
});

function setup(over: Record<string, unknown> = {}) {
  mockRouter.push.mockClear();
  mockFontScale = 1;
  const r = routine();
  mockGym = {
    loading: false, loadError: null, refreshError: false, retryLoad: jest.fn(), recentError: false, retryRecent: jest.fn(),
    routines: [r], routine: r, selectRoutine: jest.fn(), showArchived: false, setShowArchived: jest.fn(),
    exercises: [exercise('e1', 0), exercise('e2', 1)], unit: 'kg', dirty: false, resetDrafts: jest.fn(),
    pending: false, error: null, notice: null, uncertain: false, cleanupPending: false, clearError: jest.fn(),
    retryUncertain: jest.fn(), retryCleanup: jest.fn(), archiveRoutine: jest.fn().mockResolvedValue(undefined), deleteRoutine: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}
const press = (user: ReturnType<typeof userEvent.setup>, name: string | RegExp) => user.press(screen.getByRole('button', { name }));

describe('Gym list', () => {
  it('shows the routine chip with its unit and the exercises in order with sets and reps', async () => {
    setup();
    await renderWithTheme(<GymScreen />);
    expect(screen.getByRole('button', { name: 'Routine Push, kg. Change routine' })).toBeOnTheScreen();
    const rows = screen.getAllByTestId('gym-exercise-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Lift e1')).toBeOnTheScreen();
    expect(within(rows[0]).getByText('3 × 8-12')).toBeOnTheScreen();
  });

  it.each([1, 1.3])('sits its footer flush on the tab bar at font scale %s', async scale => {
    mockFontScale = scale;
    setup();
    await renderWithTheme(<GymScreen />);
    expect(StyleSheet.flatten(screen.getByTestId('gym-footer').props.style).marginBottom ?? 0).toBe(0);
  });

  it('opens an exercise card on the tapped exercise', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<GymScreen />);
    await user.press(screen.getAllByTestId('gym-exercise-row')[1]);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/gym/[id]', params: { id: 'e2' } });
  });

  it('shows loading', async () => {
    setup({ loading: true, routine: undefined, routines: [] });
    await renderWithTheme(<GymScreen />);
    expect(screen.getByRole('progressbar')).toBeOnTheScreen();
  });

  it('shows a load error with Retry', async () => {
    setup({ loadError: 'offline', routine: undefined, routines: [] });
    await renderWithTheme(<GymScreen />);
    expect(screen.getByText('offline')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retry' }));
    expect(mockGym.retryLoad).toHaveBeenCalled();
  });

  it('shows the empty state with NEW ROUTINE', async () => {
    setup({ routine: undefined, routines: [], exercises: [] });
    await renderWithTheme(<GymScreen />);
    expect(screen.getByText('No routine yet. Create one, then add its exercises.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'NEW ROUTINE' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/gym-routine-editor');
  });

  it('keeps Include archived and Workout history reachable when no routine is showing', async () => {
    setup({ routine: undefined, routines: [], exercises: [] });
    const user = userEvent.setup();
    await renderWithTheme(<GymScreen />);
    await user.press(screen.getByRole('checkbox', { name: 'Include archived' }));
    expect(mockGym.setShowArchived).toHaveBeenCalledWith(true);
    await press(user, 'Workout history');
    expect(mockRouter.push).toHaveBeenCalledWith('/gym/history');
  });

  it('says a routine with no exercises is empty', async () => {
    setup({ exercises: [] });
    await renderWithTheme(<GymScreen />);
    expect(screen.getByText('No exercises yet. Add the first one.')).toBeOnTheScreen();
  });

  it('adds an exercise to the routine', async () => {
    setup();
    await renderWithTheme(<GymScreen />);
    await press(userEvent.setup(), 'ADD EXERCISE');
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/gym-exercise-editor', params: { routineId: 'r1' } });
  });

  it('disables Add exercise while the routine is archived', async () => {
    setup({ routine: routine({ archived: true }) });
    await renderWithTheme(<GymScreen />);
    expect(screen.getByRole('button', { name: 'ADD EXERCISE' })).toBeDisabled();
  });

  it('disables Add exercise while a save is unconfirmed', async () => {
    setup({ uncertain: true });
    await renderWithTheme(<GymScreen />);
    expect(screen.getByRole('button', { name: 'ADD EXERCISE' })).toBeDisabled();
  });

  describe('routine picker', () => {
    it('lists routines as radios, marks archived ones, and selects one', async () => {
      setup({ routines: [routine(), routine({ id: 'r2', name: 'Pull', archived: true })] });
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      await press(user, /Change routine/);
      expect(screen.getByRole('radio', { name: 'Push' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Pull (archived)' })).not.toBeChecked();
      await user.press(screen.getByRole('radio', { name: 'Pull (archived)' }));
      expect(mockGym.selectRoutine).toHaveBeenCalledWith('r2');
      expect(mockGym.resetDrafts).not.toHaveBeenCalled();
    });

    it('toggles Include archived and offers a new routine', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      await press(user, /Change routine/);
      await user.press(screen.getByRole('checkbox', { name: 'Include archived' }));
      expect(mockGym.setShowArchived).toHaveBeenCalledWith(true);
      await press(user, 'NEW ROUTINE');
      expect(mockRouter.push).toHaveBeenCalledWith('/gym-routine-editor');
    });

    it('pins the routine being looked at before archived ones are included, so the view cannot jump', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      await press(user, /Change routine/);
      await user.press(screen.getByRole('checkbox', { name: 'Include archived' }));
      expect(mockGym.selectRoutine).toHaveBeenCalledWith('r1');
      expect(mockGym.setShowArchived).toHaveBeenCalledWith(true);
    });

    it('asks first when Include archived is toggled with a typed weight that was never logged', async () => {
      setup({ dirty: true });
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      await press(user, /Change routine/);
      await user.press(screen.getByRole('checkbox', { name: 'Include archived' }));
      expect(mockGym.setShowArchived).not.toHaveBeenCalled();
      await press(user, 'Discard Changes');
      expect(mockGym.resetDrafts).toHaveBeenCalled();
      expect(mockGym.selectRoutine).toHaveBeenCalledWith('r1');
      expect(mockGym.setShowArchived).toHaveBeenCalledWith(true);
    });

    it('asks before leaving a routine that has a typed weight that was never logged', async () => {
      setup({ routines: [routine(), routine({ id: 'r2', name: 'Pull' })], dirty: true });
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      await press(user, /Change routine/);
      await user.press(screen.getByRole('radio', { name: 'Pull' }));
      expect(mockGym.selectRoutine).not.toHaveBeenCalled();
      expect(screen.getByText('Your typed weights that were not logged will be lost.')).toBeOnTheScreen();
      await press(user, 'Discard Changes');
      expect(mockGym.resetDrafts).toHaveBeenCalled();
      expect(mockGym.selectRoutine).toHaveBeenCalledWith('r2');
    });

    it('keeps the current routine when the user keeps editing', async () => {
      setup({ routines: [routine(), routine({ id: 'r2', name: 'Pull' })], dirty: true });
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      await press(user, /Change routine/);
      await user.press(screen.getByRole('radio', { name: 'Pull' }));
      await press(user, 'Keep Editing');
      expect(mockGym.selectRoutine).not.toHaveBeenCalled();
    });
  });

  describe('routine menu', () => {
    it('edits the routine and opens the workout history', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      await press(user, 'Routine actions');
      await user.press(screen.getByRole('menuitem', { name: 'Edit routine' }));
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/gym-routine-editor', params: { id: 'r1' } });
      await press(user, 'Routine actions');
      await user.press(screen.getByRole('menuitem', { name: 'Workout history' }));
      expect(mockRouter.push).toHaveBeenCalledWith('/gym/history');
    });

    it('archives the routine', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      await press(user, 'Routine actions');
      await user.press(screen.getByRole('menuitem', { name: 'Archive routine' }));
      expect(mockGym.archiveRoutine).toHaveBeenCalled();
    });

    it('shows Restore routine for an archived routine', async () => {
      setup({ routine: routine({ archived: true }) });
      await renderWithTheme(<GymScreen />);
      await press(userEvent.setup(), 'Routine actions');
      expect(screen.getByRole('menuitem', { name: 'Restore routine' })).toBeOnTheScreen();
    });

    it('will not archive while a typed weight is unsaved', async () => {
      setup({ dirty: true });
      await renderWithTheme(<GymScreen />);
      await press(userEvent.setup(), 'Routine actions');
      expect(screen.getByRole('menuitem', { name: 'Archive routine' })).toBeDisabled();
    });

    it('deletes only after the confirmation', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      await press(user, 'Routine actions');
      await user.press(screen.getByRole('menuitem', { name: 'Delete routine' }));
      expect(mockGym.deleteRoutine).not.toHaveBeenCalled();
      expect(screen.getByText('Delete Push? Logged weights remain in your history.')).toBeOnTheScreen();
      await press(user, 'Delete Routine');
      expect(mockGym.deleteRoutine).toHaveBeenCalled();
    });

    it('is unavailable while a save is running', async () => {
      setup({ pending: true });
      await renderWithTheme(<GymScreen />);
      expect(screen.getByRole('button', { name: 'Routine actions' })).toBeDisabled();
    });
  });

  describe('feedback', () => {
    it('shows an error, an uncertain save with a confirm button, and a cleanup notice with its retry', async () => {
      setup({ error: 'It broke', uncertain: true, notice: 'A demonstration file is still waiting for cleanup — offline', cleanupPending: true });
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      expect(screen.getByText('It broke')).toBeOnTheScreen();
      await press(user, 'Confirm save result');
      expect(mockGym.retryUncertain).toHaveBeenCalled();
      await press(user, 'Retry media cleanup');
      expect(mockGym.retryCleanup).toHaveBeenCalled();
    });

    it('shows a refresh failure and a failed weights read, each with a retry', async () => {
      setup({ refreshError: true, recentError: true });
      const user = userEvent.setup();
      await renderWithTheme(<GymScreen />);
      expect(screen.getByText("The System couldn't refresh. Your saved progress is safe.")).toBeOnTheScreen();
      await press(user, 'Retry refresh');
      expect(mockGym.retryLoad).toHaveBeenCalled();
      await press(user, 'Retry weights');
      expect(mockGym.retryRecent).toHaveBeenCalled();
    });

    it('shows a plain notice', async () => {
      setup({ notice: 'Routine saved.' });
      await renderWithTheme(<GymScreen />);
      expect(screen.getByText('Routine saved.')).toBeOnTheScreen();
    });
  });
});
