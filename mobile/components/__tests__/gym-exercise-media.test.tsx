import { AccessibilityInfo } from 'react-native';
import { act, screen, userEvent } from '@testing-library/react-native';
import type { GymExercise } from '@eiyu/shared';

import { ExerciseMedia } from '../gym/exercise-media';
import { renderWithTheme, TestThemeProvider } from '../ui/test-theme';

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

  describe('sound', () => {
    const mp4 = () => exercise({ media_path: 'u/r1/a.mp4', media_mime: 'video/mp4' });
    const latest = () => video.useVideoPlayer.mock.results.at(-1)!.value as { muted: boolean; audioMixingMode?: string };

    it('starts muted and offers a button to turn the sound on', async () => {
      await renderWithTheme(<ExerciseMedia exercise={mp4()} canEdit onEdit={jest.fn()} active />);
      const toggle = await screen.findByRole('button', { name: 'Turn sound on' });
      expect(toggle).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));
      expect(latest().muted).toBe(true);
    });

    it('turns the sound on and off again', async () => {
      const user = userEvent.setup();
      await renderWithTheme(<ExerciseMedia exercise={mp4()} canEdit onEdit={jest.fn()} active />);
      await user.press(await screen.findByRole('button', { name: 'Turn sound on' }));
      expect(latest().muted).toBe(false);
      await user.press(screen.getByRole('button', { name: 'Turn sound off' }));
      expect(latest().muted).toBe(true);
    });

    it('lowers other apps audio instead of pausing it while the sound is on', async () => {
      await renderWithTheme(<ExerciseMedia exercise={mp4()} canEdit onEdit={jest.fn()} active />);
      await screen.findByRole('button', { name: 'Turn sound on' });
      const [, setup] = video.useVideoPlayer.mock.calls.at(-1)!;
      const player = { loop: false, muted: false, play: jest.fn(), audioMixingMode: 'auto' };
      setup(player);
      expect(player.audioMixingMode).toBe('duckOthers');
    });

    it('has no sound button on a GIF, which has no audio', async () => {
      await renderWithTheme(<ExerciseMedia exercise={exercise()} canEdit onEdit={jest.fn()} active />);
      await screen.findByLabelText('Bench video guide');
      expect(screen.queryByRole('button', { name: /Turn sound/ })).toBeNull();
    });

    it('drops back to muted when the card is left and returned to', async () => {
      const user = userEvent.setup();
      const { rerender } = await renderWithTheme(<ExerciseMedia exercise={mp4()} canEdit onEdit={jest.fn()} active />);
      await user.press(await screen.findByRole('button', { name: 'Turn sound on' }));
      await rerender(<TestThemeProvider><ExerciseMedia exercise={mp4()} canEdit onEdit={jest.fn()} active={false} /></TestThemeProvider>);
      await rerender(<TestThemeProvider><ExerciseMedia exercise={mp4()} canEdit onEdit={jest.fn()} active /></TestThemeProvider>);
      await screen.findByRole('button', { name: 'Turn sound on' });
      expect(latest().muted).toBe(true);
    });
  });

  it('pauses an MP4 when the phone asks for reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await renderWithTheme(<ExerciseMedia exercise={exercise({ media_path: 'u/r1/a.mp4', media_mime: 'video/mp4' })} canEdit onEdit={jest.fn()} active />);
    await screen.findByLabelText('Bench video guide');
    await act(async () => { await Promise.resolve(); });
    const players = video.useVideoPlayer.mock.results.map(r => r.value as { pause: jest.Mock });
    expect(players.some(p => p.pause.mock.calls.length > 0)).toBe(true);
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
