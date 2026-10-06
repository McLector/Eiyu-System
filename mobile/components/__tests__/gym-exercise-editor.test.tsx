import { act, cleanup, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { UncertainSaveError, type GymExercise, type GymRoutine } from '@eiyu/shared';

import ExerciseEditorScreen from '../../app/gym-exercise-editor';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockParams: { routineId?: string; id?: string } = {};
let mockGym: any;
let mockBeforeRemove: ((event: any) => void) | null = null;
const mockDispatch = jest.fn();
const mockNavigation = {
  addListener: (_name: string, handler: (event: any) => void) => { mockBeforeRemove = handler; return () => { mockBeforeRemove = null; }; },
  dispatch: mockDispatch,
};
const mockShared = { saveGymExercise: jest.fn(), deleteGymMedia: jest.fn() };
const mockMedia = { pickGymMedia: jest.fn(), uploadPickedGymMedia: jest.fn() };

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));
const mockRouter = jest.requireMock('expo-router').router as { back: jest.Mock };
jest.mock('@/contexts/gym-store', () => ({ useGym: () => mockGym }));
jest.mock('@/lib/gym-media-upload', () => ({
  pickGymMedia: (...args: unknown[]) => mockMedia.pickGymMedia(...args),
  uploadPickedGymMedia: (...args: unknown[]) => mockMedia.uploadPickedGymMedia(...args),
}));
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  saveGymExercise: (...args: unknown[]) => mockShared.saveGymExercise(...args),
  deleteGymMedia: (...args: unknown[]) => mockShared.deleteGymMedia(...args),
}));
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
const exercise = (over: Partial<GymExercise> = {}): GymExercise => ({
  id: 'e1', routine_id: 'r1', user_id: 'u', name: 'Bench', position: 2, sets: 4, reps: '6-8', rest_seconds: 120, rir: 1, rir_max: 2, notes: 'Pause', media_path: null, media_mime: null, ...over,
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setup(id?: string, exercises: GymExercise[] = [exercise(), exercise({ id: 'e0', position: 0, name: 'Dips' })]) {
  mockParams = { routineId: 'r1', ...(id ? { id } : {}) };
  mockBeforeRemove = null;
  mockShared.saveGymExercise.mockReset().mockResolvedValue('saved');
  mockShared.deleteGymMedia.mockReset().mockResolvedValue(undefined);
  mockMedia.pickGymMedia.mockReset();
  mockMedia.uploadPickedGymMedia.mockReset().mockResolvedValue({ path: 'u/r1/new.gif', mime: 'image/gif' });
  mockGym = { userId: 'u', routine: routine(), exercises, refreshAfterSave: jest.fn().mockResolvedValue(undefined), retryLoad: jest.fn() };
}
const NAME = () => screen.getByLabelText('Exercise name');
const save = (user: ReturnType<typeof userEvent.setup>, label = 'SAVE EXERCISE') => user.press(screen.getByRole('button', { name: label }));
async function fill(over: Partial<Record<'name' | 'sets' | 'reps' | 'rest' | 'rir' | 'notes', string>> = {}) {
  const values = { name: 'Squat', sets: '5', reps: '5', rest: '180', rir: '2', notes: '', ...over };
  await fireEvent.changeText(NAME(), values.name);
  await fireEvent.changeText(screen.getByLabelText('Sets'), values.sets);
  await fireEvent.changeText(screen.getByLabelText('Reps or range'), values.reps);
  await fireEvent.changeText(screen.getByLabelText('Rest (seconds)'), values.rest);
  await fireEvent.changeText(screen.getByLabelText('RIR'), values.rir);
  await fireEvent.changeText(screen.getByLabelText('Notes'), values.notes);
}
async function leave() {
  const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
  await act(async () => { mockBeforeRemove?.(event); });
  return event;
}
afterEach(() => { cleanup(); jest.clearAllMocks(); });

describe('Gym exercise editor', () => {
  it('starts a new exercise with the web defaults', async () => {
    setup();
    await renderWithTheme(<ExerciseEditorScreen />);
    expect(screen.getByText('ADD EXERCISE')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sets')).toHaveDisplayValue('3');
    expect(screen.getByLabelText('Reps or range')).toHaveDisplayValue('6-10');
    expect(screen.getByLabelText('Rest (seconds)')).toHaveDisplayValue('150');
    expect(screen.getByLabelText('RIR')).toHaveDisplayValue('2');
    expect(screen.getByRole('button', { name: 'SAVE EXERCISE' })).toBeDisabled();
  });

  it('creates an exercise after the last one, with a stable id, then refreshes and closes', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<ExerciseEditorScreen />);
    await fill({ rir: '1-2', notes: ' warm up ' });
    await save(user);
    const input = mockShared.saveGymExercise.mock.calls[0][0];
    expect(input).toMatchObject({ name: 'Squat', sets: 5, reps: '5', rest_seconds: 180, rir: 1, rir_max: 2, notes: 'warm up', user_id: 'u', routine_id: 'r1', position: 3, media_path: null, media_mime: null });
    expect(input.id).toMatch(UUID);
    expect(mockGym.refreshAfterSave).toHaveBeenCalledWith('Exercise');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('edits in place, keeping the position and the existing media', async () => {
    setup('e1', [exercise({ media_path: 'u/r1/old.gif', media_mime: 'image/gif' })]);
    const user = userEvent.setup();
    await renderWithTheme(<ExerciseEditorScreen />);
    expect(screen.getByText('EDIT EXERCISE')).toBeOnTheScreen();
    expect(NAME()).toHaveDisplayValue('Bench');
    expect(screen.getByLabelText('RIR')).toHaveDisplayValue('1-2');
    await fireEvent.changeText(NAME(), 'Incline bench');
    await save(user, 'SAVE CHANGES');
    expect(mockShared.saveGymExercise.mock.calls[0][0]).toMatchObject({ id: 'e1', name: 'Incline bench', position: 2, media_path: 'u/r1/old.gif', media_mime: 'image/gif' });
    expect(mockShared.deleteGymMedia).not.toHaveBeenCalled();
  });

  it('says so when the exercise no longer exists', async () => {
    setup('gone');
    await renderWithTheme(<ExerciseEditorScreen />);
    expect(screen.getByText('EXERCISE NOT FOUND')).toBeOnTheScreen();
  });

  describe('validation', () => {
    const rejects = async (over: Parameters<typeof fill>[0], message: string) => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      await fill(over);
      await save(user);
      expect(screen.getByText(message)).toBeOnTheScreen();
      expect(mockShared.saveGymExercise).not.toHaveBeenCalled();
      expect(mockRouter.back).not.toHaveBeenCalled();
    };
    it('rejects reps that are not a positive number or an ascending range', () => rejects({ reps: '12-8' }, 'Enter positive reps or an ascending range, such as 8–12.'));
    it('rejects sets outside 1 to 99', () => rejects({ sets: '100' }, 'Sets must be a whole number from 1 to 99.'));
    it('rejects an empty sets or rest field', () => rejects({ sets: '' }, 'Sets and rest are required.'));
    it('rejects a rest outside 0 to 86400', () => rejects({ rest: '86401' }, 'Rest must be whole seconds from 0 to 86400.'));
    it('rejects an RIR above 10 or a descending range', () => rejects({ rir: '3-1' }, 'RIR must be an ascending whole-number range from 0 to 10.'));
    it('rejects notes over 2000 characters', () => rejects({ notes: 'x'.repeat(2001) }, 'Notes must be 2000 characters or fewer.'));
  });

  describe('demonstration media', () => {
    it('shows a first-time user what the upload is for before anything is picked', async () => {
      setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      expect(screen.getByText('Add a demo video or GIF')).toBeOnTheScreen();
      expect(screen.getByText(/replay it from the exercise card/i)).toBeOnTheScreen();
      expect(screen.getByText(/GIF or MP4, up to 20 MiB/)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Choose GIF or MP4' })).toBeOnTheScreen();
    });

    it('switches the card to "Choose another file" once a file is picked', async () => {
      setup();
      mockMedia.pickGymMedia.mockResolvedValueOnce({ uri: 'file:///c/a.gif', mime: 'image/gif', name: 'a.gif' });
      await renderWithTheme(<ExerciseEditorScreen />);
      await userEvent.setup().press(screen.getByRole('button', { name: 'Choose GIF or MP4' }));
      expect(screen.getByText('Choose another file')).toBeOnTheScreen();
      expect(screen.queryByText('Add a demo video or GIF')).toBeNull();
    });

    it('does not open the picker while the exercise is saving', async () => {
      setup();
      mockShared.saveGymExercise.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      await fill();
      await save(user);
      await user.press(screen.getByRole('button', { name: 'Choose GIF or MP4' }));
      expect(mockMedia.pickGymMedia).not.toHaveBeenCalled();
    });

    it('picks a GIF, shows it, uploads it on save and attaches it', async () => {
      setup();
      mockMedia.pickGymMedia.mockResolvedValueOnce({ uri: 'file:///c/a.gif', mime: 'image/gif', name: 'a.gif' });
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      await user.press(screen.getByRole('button', { name: 'Choose GIF or MP4' }));
      expect(screen.getByText('a.gif')).toBeOnTheScreen();
      expect(screen.getByLabelText('Selected demonstration')).toHaveProp('source', { uri: 'file:///c/a.gif' });
      await fill();
      await save(user);
      expect(mockMedia.uploadPickedGymMedia).toHaveBeenCalledWith('u', 'r1', expect.objectContaining({ uri: 'file:///c/a.gif' }));
      expect(mockShared.saveGymExercise.mock.calls[0][0]).toMatchObject({ media_path: 'u/r1/new.gif', media_mime: 'image/gif' });
    });

    it('shows why a pick was refused and keeps the form', async () => {
      setup();
      mockMedia.pickGymMedia.mockRejectedValueOnce(new Error('Choose a GIF or MP4 file.'));
      await renderWithTheme(<ExerciseEditorScreen />);
      await userEvent.setup().press(screen.getByRole('button', { name: 'Choose GIF or MP4' }));
      expect(screen.getByText('Choose a GIF or MP4 file.')).toBeOnTheScreen();
    });

    it('does nothing when the picker is cancelled, and can drop a chosen file', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      mockMedia.pickGymMedia.mockResolvedValueOnce(null);
      await user.press(screen.getByRole('button', { name: 'Choose GIF or MP4' }));
      expect(screen.queryByRole('button', { name: 'Remove selected file' })).toBeNull();
      mockMedia.pickGymMedia.mockResolvedValueOnce({ uri: 'file:///c/a.mp4', mime: 'video/mp4', name: 'a.mp4' });
      await user.press(screen.getByRole('button', { name: 'Choose GIF or MP4' }));
      await user.press(screen.getByRole('button', { name: 'Remove selected file' }));
      expect(screen.queryByText('a.mp4')).toBeNull();
    });

    it('replacing media deletes the old file only after the exercise is saved', async () => {
      setup('e1', [exercise({ media_path: 'u/r1/old.gif', media_mime: 'image/gif' })]);
      mockMedia.pickGymMedia.mockResolvedValueOnce({ uri: 'file:///c/a.gif', mime: 'image/gif', name: 'a.gif' });
      const order: string[] = [];
      mockShared.saveGymExercise.mockImplementation(async () => { order.push('save'); return 'saved'; });
      mockShared.deleteGymMedia.mockImplementation(async () => { order.push('delete'); });
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      await user.press(screen.getByRole('button', { name: 'Choose GIF or MP4' }));
      await save(user, 'SAVE CHANGES');
      expect(order).toEqual(['save', 'delete']);
      expect(mockShared.deleteGymMedia).toHaveBeenCalledWith('u/r1/old.gif');
    });

    it('warns, but still closes, when the old file could not be cleaned up', async () => {
      setup('e1', [exercise({ media_path: 'u/r1/old.gif', media_mime: 'image/gif' })]);
      mockShared.deleteGymMedia.mockRejectedValueOnce(new Error('storage down'));
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      await user.press(screen.getByRole('checkbox', { name: 'Remove current demonstration' }));
      await save(user, 'SAVE CHANGES');
      expect(mockShared.saveGymExercise.mock.calls[0][0]).toMatchObject({ media_path: null, media_mime: null });
      expect(mockGym.refreshAfterSave).toHaveBeenCalledWith('Exercise', undefined, 'Exercise saved. Previous media cleanup failed: storage down');
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('does not offer to remove media that is not there', async () => {
      setup('e1');
      await renderWithTheme(<ExerciseEditorScreen />);
      expect(screen.queryByRole('checkbox', { name: 'Remove current demonstration' })).toBeNull();
    });

    it('says the upload is held when the save then fails, and reuses the upload on retry', async () => {
      setup();
      mockMedia.pickGymMedia.mockResolvedValueOnce({ uri: 'file:///c/a.gif', mime: 'image/gif', name: 'a.gif' });
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      await user.press(screen.getByRole('button', { name: 'Choose GIF or MP4' }));
      await fill();
      mockShared.saveGymExercise.mockRejectedValueOnce(new UncertainSaveError());
      await save(user);
      expect(screen.getByText(/Your upload is held until the save is confirmed\./)).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Confirm save result' }));
      expect(mockMedia.uploadPickedGymMedia).toHaveBeenCalledTimes(1);
      expect(mockShared.saveGymExercise.mock.calls[1][0].id).toBe(mockShared.saveGymExercise.mock.calls[0][0].id);
      expect(mockShared.saveGymExercise.mock.calls[1][0].media_path).toBe('u/r1/new.gif');
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('shows an upload failure and stays open', async () => {
      setup();
      mockMedia.pickGymMedia.mockResolvedValueOnce({ uri: 'file:///c/a.gif', mime: 'image/gif', name: 'a.gif' });
      mockMedia.uploadPickedGymMedia.mockRejectedValueOnce(new Error('Payload too large'));
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      await user.press(screen.getByRole('button', { name: 'Choose GIF or MP4' }));
      await fill();
      await save(user);
      expect(screen.getByText(/Payload too large/)).toBeOnTheScreen();
      expect(mockShared.saveGymExercise).not.toHaveBeenCalled();
      expect(mockRouter.back).not.toHaveBeenCalled();
    });
  });

  describe('leaving', () => {
    it('closes a clean editor without asking, and asks once something changed', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      expect((await leave()).preventDefault).not.toHaveBeenCalled();
      await fireEvent.changeText(NAME(), 'Squat');
      expect((await leave()).preventDefault).toHaveBeenCalled();
      expect(screen.getByText('Your unsaved exercise changes will be lost.')).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Discard Changes' }));
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    });

    it('lets the user leave an unconfirmed save', async () => {
      setup();
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseEditorScreen />);
      await fill();
      mockShared.saveGymExercise.mockRejectedValueOnce(new UncertainSaveError());
      await save(user);
      expect((await leave()).preventDefault).toHaveBeenCalled();
      await user.press(screen.getByRole('button', { name: 'Leave without confirming' }));
      expect(mockGym.retryLoad).toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalled();
    });
  });
});
