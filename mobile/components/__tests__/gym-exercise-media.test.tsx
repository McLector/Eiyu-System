import { act, screen, userEvent } from '@testing-library/react-native';
import type { GymExercise } from '@eiyu/shared';

import { ExerciseMedia } from '../gym/exercise-media';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockShared = { signGymMedia: jest.fn() };
jest.mock('@eiyu/shared', () => ({ ...jest.requireActual('@eiyu/shared'), signGymMedia: (...args: unknown[]) => mockShared.signGymMedia(...args) }));
const video = jest.requireMock('expo-video') as { useVideoPlayer: jest.Mock };

const exercise = (over: Partial<GymExercise> = {}): GymExercise => ({
  id: 'e1', routine_id: 'r1', user_id: 'u', name: 'Bench', position: 0, sets: 3, reps: '8', rest_seconds: 90, rir: 2, rir_max: null, notes: '',
  media_path: 'u/r1/a.gif', media_mime: 'image/gif', ...over,
});

beforeEach(() => {
  mockShared.signGymMedia.mockReset().mockResolvedValue('https://signed.example/a');
  video.useVideoPlayer.mockClear();
});

describe('ExerciseMedia', () => {
  it('says there is no guide and offers to attach one when the user can edit', async () => {
    const onEdit = jest.fn();
    await renderWithTheme(<ExerciseMedia exercise={exercise({ media_path: null, media_mime: null })} canEdit onEdit={onEdit} active />);
    expect(screen.getByText('No video guide attached.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Attach a video guide' }));
    expect(onEdit).toHaveBeenCalled();
    expect(mockShared.signGymMedia).not.toHaveBeenCalled();
  });

  it('does not offer to attach when editing is locked', async () => {
    await renderWithTheme(<ExerciseMedia exercise={exercise({ media_path: null, media_mime: null })} canEdit={false} onEdit={jest.fn()} active />);
    expect(screen.queryByRole('button', { name: 'Attach a video guide' })).toBeNull();
  });

  it('signs the path and shows a GIF as an image labelled with the exercise', async () => {
    await renderWithTheme(<ExerciseMedia exercise={exercise()} canEdit onEdit={jest.fn()} active />);
    const image = await screen.findByLabelText('Bench video guide');
    expect(image).toHaveProp('source', { uri: 'https://signed.example/a' });
    expect(mockShared.signGymMedia).toHaveBeenCalledWith('u/r1/a.gif');
  });

  it('plays an MP4 muted and looping with the native controls', async () => {
    await renderWithTheme(<ExerciseMedia exercise={exercise({ media_path: 'u/r1/a.mp4', media_mime: 'video/mp4' })} canEdit onEdit={jest.fn()} active />);
    await screen.findByLabelText('Bench video guide');
    const [source, setup] = video.useVideoPlayer.mock.calls.at(-1)!;
    expect(source).toBe('https://signed.example/a');
    const player = { loop: false, muted: false, play: jest.fn() };
    setup(player);
    expect(player).toMatchObject({ loop: true, muted: true });
  });

  it('shows Loading while the link is being signed', async () => {
    mockShared.signGymMedia.mockReturnValueOnce(new Promise(() => {}));
    await renderWithTheme(<ExerciseMedia exercise={exercise()} canEdit onEdit={jest.fn()} active />);
    expect(screen.getByText('Loading video guide…')).toBeOnTheScreen();
  });

  it('does not read anything for a page that is not showing', async () => {
    await renderWithTheme(<ExerciseMedia exercise={exercise()} canEdit onEdit={jest.fn()} active={false} />);
    expect(mockShared.signGymMedia).not.toHaveBeenCalled();
  });

  it('shows the reason and a Reload button when signing fails, then recovers', async () => {
    mockShared.signGymMedia.mockRejectedValueOnce(new Error('offline'));
    await renderWithTheme(<ExerciseMedia exercise={exercise()} canEdit onEdit={jest.fn()} active />);
    expect(await screen.findByText(/offline/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Reload video guide' }));
    expect(await screen.findByLabelText('Bench video guide')).toBeOnTheScreen();
    expect(mockShared.signGymMedia).toHaveBeenCalledTimes(2);
  });

  it('shows a reload prompt when the image itself cannot load', async () => {
    await renderWithTheme(<ExerciseMedia exercise={exercise()} canEdit onEdit={jest.fn()} active />);
    const image = await screen.findByLabelText('Bench video guide');
    await act(async () => { image.props.onError?.(); });
    expect(screen.getByText('The guide could not load. Reload to refresh access.')).toBeOnTheScreen();
  });

  it('renews the signed link every four minutes and stops when it unmounts', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderWithTheme(<ExerciseMedia exercise={exercise()} canEdit onEdit={jest.fn()} active />);
      await act(async () => { await Promise.resolve(); });
      expect(mockShared.signGymMedia).toHaveBeenCalledTimes(1);
      await act(async () => { jest.advanceTimersByTime(239_000); });
      expect(mockShared.signGymMedia).toHaveBeenCalledTimes(1);
      await act(async () => { jest.advanceTimersByTime(1_000); });
      expect(mockShared.signGymMedia).toHaveBeenCalledTimes(2);
      await act(async () => { await view.unmount(); });
      await act(async () => { jest.advanceTimersByTime(600_000); });
      expect(mockShared.signGymMedia).toHaveBeenCalledTimes(2);
    } finally { jest.useRealTimers(); }
  });
});
