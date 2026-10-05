// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UncertainSaveError, type GymData, type GymRecentWeight } from '@eiyu/shared';

type Logged = { exercise_id: string; weight: number; unit: 'kg' | 'lb' };
const mocks = vi.hoisted(() => ({ data: {} as GymData, logs: [] as Logged[], fetchGym: vi.fn(), log: vi.fn(), cleanup: vi.fn(), sign: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<object>(), fetchGym: mocks.fetchGym, logGymWeight: mocks.log, listGymMediaCleanup: mocks.cleanup,
  // The database answer: the two newest logged weights per exercise, newest first.
  fetchRecentGymWeights: async () => {
    const out: GymRecentWeight[] = [];
    for (const exercise of new Set(mocks.logs.map(l => l.exercise_id))) {
      const own = mocks.logs.filter(l => l.exercise_id === exercise).reverse().slice(0, 2);
      own.forEach((l, i) => out.push({ exercise_id: exercise, weight: l.weight, unit: l.unit, logged_at: '2026-10-01T00:00:00Z', recency: (i + 1) as 1 | 2 }));
    }
    return out;
  },
}));
vi.mock('../gym-media', async importOriginal => ({ ...await importOriginal<object>(), signGymMedia: mocks.sign }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
import WebGym from '../WebGym';
import { NavigationGuard } from '../../components/NavigationGuard';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const exercise = (id: string, name: string, position: number, over: Record<string, unknown> = {}) => ({
  id, routine_id: 'routine', user_id: 'owner', name, position, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, rir_max: null,
  notes: '', media_path: null, media_mime: null, ...over,
});
beforeEach(() => {
  mocks.cleanup.mockReset().mockResolvedValue([]);
  mocks.sign.mockReset().mockResolvedValue('https://example.invalid/squat.mp4');
  mocks.logs = [];
  mocks.data = {
    routines: [{ id: 'routine', user_id: 'owner', name: 'Leg day', unit: 'kg', archived: false, created_at: '2026-10-01' }],
    exercises: [
      exercise('bench', 'Bench press', 0),
      exercise('squat', 'Squat', 1, { notes: 'Brace before the descent.', media_path: 'owner/routine/squat.mp4', media_mime: 'video/mp4' }),
    ],
  } as unknown as GymData;
  mocks.fetchGym.mockReset().mockImplementation(async () => structuredClone(mocks.data));
  mocks.log.mockReset().mockImplementation(async (_id: string, exerciseId: string, weight: number) => { mocks.logs.push({ exercise_id: exerciseId, weight, unit: 'kg' }); });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/gym', element: <NavigationGuard><WebGym /></NavigationGuard> }], { initialEntries: ['/gym'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(await screen.findByRole('button', { name: new RegExp(`^\\d+\\s*${name}`) }));
const weightField = (name = 'Bench press', unit = 'kg') => screen.findByRole('spinbutton', { name: `Current weight for ${name} in ${unit}` });
const logButton = (name = 'Bench press') => screen.getByRole('button', { name: `Log weight for ${name}` });
const tile = (label: string) => screen.getByText(label, { selector: 'dt' }).closest('div') as HTMLElement;
const retype = async (user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) => { await user.clear(field); await user.type(field, value); };

it('lists the exercises and shows the first one in the detail pane', async () => {
  setup();
  const detail = await screen.findByRole('region', { name: 'Bench press details' });
  expect(within(detail).getByText('3 × 8-12')).toBeInTheDocument();
  expect(within(detail).getByText('90s')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^\d+\s*(Bench press|Squat)/ })).toHaveLength(2);
});

it('lays the stats out as Sets × reps, Rest, RIR, Previous, Current, with Current as the only input', async () => {
  setup();
  const detail = await screen.findByRole('region', { name: 'Bench press details' });
  expect(Array.from(detail.querySelectorAll('.gym-kv dt')).map(dt => dt.textContent)).toEqual(['Sets × reps', 'Rest', 'RIR', 'Previous', 'Current']);
  expect(within(tile('Current')).getByRole('spinbutton')).toBeInTheDocument();
  expect(within(detail).getAllByRole('spinbutton')).toHaveLength(1);
});

it('shows the selected exercise, its video guide, and its notes beside the video', async () => {
  const user = userEvent.setup(); setup();
  await pick(user, 'Squat');
  const detail = await screen.findByRole('region', { name: 'Squat details' });
  await waitFor(() => expect(detail.querySelector('video.gym-media')).not.toBeNull());
  const video = detail.querySelector('video.gym-media') as HTMLVideoElement;
  expect(video).toHaveAttribute('controls');
  expect(video.muted).toBe(true);
  expect(video).not.toHaveAttribute('autoplay');
  expect(mocks.sign).toHaveBeenCalledWith('owner/routine/squat.mp4');
  // The notes take the empty space next to the video instead of sitting under it.
  const main = detail.querySelector('.gym-detail-main') as HTMLElement;
  const notes = within(main).getByText('Brace before the descent.');
  expect(notes.closest('.gym-notes')).not.toBeNull();
  expect(main.contains(video)).toBe(true);
  expect(video.closest('.gym-notes')).toBeNull();
  expect(Array.from(main.children).map(child => child.className)).toEqual(['gym-media-box', 'gym-notes']);
});

it('keeps the video column when there are no notes, and the notes column only when there are notes', async () => {
  setup();
  const detail = await screen.findByRole('region', { name: 'Bench press details' });
  const main = detail.querySelector('.gym-detail-main') as HTMLElement;
  expect(Array.from(main.children).map(child => child.className)).toEqual(['gym-media-box']);
  expect(detail.querySelector('.gym-notes')).toBeNull();
});

it('says when an exercise has no video guide and offers to attach one', async () => {
  setup();
  const detail = await screen.findByRole('region', { name: 'Bench press details' });
  expect(within(detail).getByText('No video guide attached.')).toBeInTheDocument();
  expect(within(detail).getByRole('button', { name: 'Attach a video guide' })).toBeEnabled();
});

it('puts the routine and exercise actions in menus', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Routine actions for Leg day' }));
  expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Edit routine', 'Archive routine', 'Delete routine']);
  await user.keyboard('{Escape}');
  await user.click(await screen.findByRole('button', { name: 'Exercise actions for Bench press' }));
  expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(i => i.getAttribute('aria-label') ?? i.textContent)).toEqual(['Edit exercise', 'Move Bench press up', 'Move Bench press down', 'Remove Bench press']);
  expect(screen.getByRole('menuitem', { name: 'Move Bench press up' })).toBeDisabled();
});

it('names the exercise list for assistive technology', async () => {
  setup();
  expect(await screen.findByRole('group', { name: 'Leg day exercises' })).toBeInTheDocument();
});

// ---- Current and Previous ----

it('shows the latest logged weight as Current and the one before as Previous', async () => {
  mocks.logs = [{ exercise_id: 'bench', weight: 97.5, unit: 'kg' }, { exercise_id: 'bench', weight: 100, unit: 'kg' }];
  setup();
  const field = await weightField();
  await waitFor(() => expect(field).toHaveValue(100));
  expect(tile('Previous')).toHaveTextContent('97.5 kg');
});

it('shows a dash for Previous until a second weight is logged, and an empty Current before the first', async () => {
  setup();
  const field = await weightField();
  expect(field).toHaveValue(null);
  expect(tile('Previous')).toHaveTextContent('—');
});

it('shows a dash for Previous when only one weight has been logged', async () => {
  mocks.logs = [{ exercise_id: 'bench', weight: 60, unit: 'kg' }];
  setup();
  await waitFor(async () => expect(await weightField()).toHaveValue(60));
  expect(tile('Previous')).toHaveTextContent('—');
});

it('converts weights logged in another unit into the routine unit', async () => {
  mocks.logs = [{ exercise_id: 'bench', weight: 220.462, unit: 'lb' }];
  setup();
  await waitFor(async () => expect(await weightField()).toHaveValue(100));
});

// ---- Logging ----

it('logs a typed weight with Enter, then it becomes Current and the old Current becomes Previous', async () => {
  mocks.logs = [{ exercise_id: 'bench', weight: 100, unit: 'kg' }];
  const user = userEvent.setup(); setup();
  const field = await weightField();
  await waitFor(() => expect(field).toHaveValue(100));
  await retype(user, field, '102.5');
  await user.keyboard('{Enter}');
  await waitFor(() => expect(mocks.log).toHaveBeenCalledOnce());
  const [logId, exerciseId, weight] = mocks.log.mock.calls[0];
  expect(logId).toMatch(/^[0-9a-f-]{36}$/);
  expect([exerciseId, weight]).toEqual(['bench', 102.5]);
  await waitFor(() => expect(tile('Previous')).toHaveTextContent('100 kg'));
  expect(field).toHaveValue(102.5);
  expect(logButton()).toBeDisabled();
});

it('logs with the arrow button and returns focus to the weight field', async () => {
  const user = userEvent.setup(); setup();
  const field = await weightField();
  await user.type(field, '60');
  await user.click(logButton());
  await waitFor(() => expect(mocks.log).toHaveBeenCalledWith(expect.any(String), 'bench', 60));
  await waitFor(() => expect(field).toHaveFocus());
});

it('logs a zero weight, which is a real weight', async () => {
  mocks.logs = [{ exercise_id: 'bench', weight: 20, unit: 'kg' }];
  const user = userEvent.setup(); setup();
  const field = await weightField();
  await waitFor(() => expect(field).toHaveValue(20));
  await retype(user, field, '0');
  await user.click(logButton());
  await waitFor(() => expect(mocks.log).toHaveBeenCalledWith(expect.any(String), 'bench', 0));
});

it('keeps the arrow disabled until the weight is a new value', async () => {
  mocks.logs = [{ exercise_id: 'bench', weight: 100, unit: 'kg' }];
  const user = userEvent.setup(); setup();
  const field = await weightField();
  await waitFor(() => expect(field).toHaveValue(100));
  expect(logButton()).toBeDisabled();
  await retype(user, field, '105');
  expect(logButton()).toBeEnabled();
  await retype(user, field, '100');
  expect(logButton()).toBeDisabled();
  await user.clear(field);
  expect(logButton()).toBeDisabled();
  await user.keyboard('{Enter}');
  expect(mocks.log).not.toHaveBeenCalled();
});

it('rejects an invalid weight with the reason, without calling the server', async () => {
  const user = userEvent.setup(); setup();
  const field = await weightField();
  for (const bad of ['1.2345', '-5']) {
    await retype(user, field, bad);
    await user.click(logButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Weight must be a number from 0 to 1000000 with at most three decimals.');
  }
  expect(mocks.log).not.toHaveBeenCalled();
  await retype(user, field, '1000001');
  await user.click(logButton());
  expect(await screen.findByRole('alert')).toHaveTextContent('Weight must be a number');
  expect(mocks.log).not.toHaveBeenCalled();
});

it('lets the arrow explain text the browser cannot read as a number instead of staying silent', async () => {
  const user = userEvent.setup(); setup();
  const field = await weightField();
  // A lone "e" leaves a number input empty, with the unreadable text only visible through validity.badInput.
  Object.defineProperty(field, 'validity', { configurable: true, value: { badInput: true } });
  fireEvent.input(field);
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(logButton()).toBeEnabled();
  await user.click(logButton());
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid weight for Bench press.');
  expect(mocks.log).not.toHaveBeenCalled();
});

it('accepts the largest allowed weight and up to three decimals', async () => {
  const user = userEvent.setup(); setup();
  const field = await weightField();
  await retype(user, field, '1000000');
  await user.click(logButton());
  await waitFor(() => expect(mocks.log).toHaveBeenCalledWith(expect.any(String), 'bench', 1000000));
  await retype(user, field, '2.125');
  await user.click(logButton());
  await waitFor(() => expect(mocks.log).toHaveBeenLastCalledWith(expect.any(String), 'bench', 2.125));
});

it('keeps a failed log editable and says why', async () => {
  mocks.log.mockRejectedValueOnce(new Error('Network unavailable'));
  const user = userEvent.setup(); setup();
  const field = await weightField();
  await user.type(field, '60');
  await user.click(logButton());
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
  expect(field).toHaveValue(60);
  expect(logButton()).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Confirm save result' })).toBeNull();
  await user.click(logButton());
  await waitFor(() => expect(mocks.log).toHaveBeenCalledTimes(2));
});

it('retries an uncertain log with the same log id so it cannot be recorded twice', async () => {
  mocks.log.mockRejectedValueOnce(new UncertainSaveError());
  const user = userEvent.setup(); setup();
  const field = await weightField();
  await user.type(field, '60');
  await user.click(logButton());
  const confirm = await screen.findByRole('button', { name: 'Confirm save result' });
  expect(field).toBeDisabled();
  await user.click(confirm);
  await waitFor(() => expect(mocks.log).toHaveBeenCalledTimes(2));
  expect(mocks.log.mock.calls[1][0]).toBe(mocks.log.mock.calls[0][0]);
  expect(mocks.log.mock.calls[1].slice(1)).toEqual(['bench', 60]);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm save result' })).toBeNull());
});

it('does not log twice when submitted twice before the first finishes', async () => {
  let release!: () => void;
  mocks.log.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const user = userEvent.setup(); setup();
  const field = await weightField();
  await user.type(field, '60');
  const form = field.closest('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(mocks.log).toHaveBeenCalledOnce();
  release();
  await waitFor(() => expect(logButton()).toBeDisabled());
});

it('keeps typed weights per exercise while switching between them', async () => {
  const user = userEvent.setup(); setup();
  await user.type(await weightField(), '40');
  await pick(user, 'Squat');
  expect(await weightField('Squat')).toHaveValue(null);
  await pick(user, 'Bench press');
  expect(await weightField()).toHaveValue(40);
  expect(mocks.log).not.toHaveBeenCalled();
});

it('locks the weight of an archived routine', async () => {
  mocks.data.routines[0].archived = true;
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('checkbox', { name: 'Include archived routines' }));
  const field = await weightField();
  expect(field).toBeDisabled();
  expect(logButton()).toBeDisabled();
});

it('asks before leaving a routine with a typed weight that was never logged', async () => {
  mocks.data.routines.push({ id: 'second', user_id: 'owner', name: 'Pull day', unit: 'kg', archived: false, created_at: '2026-10-02' } as never);
  const user = userEvent.setup(); setup();
  await user.type(await weightField(), '40');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Routine' }), 'second');
  expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(await weightField()).toHaveValue(40);
});

it('has no workout to start, finish, save or discard', async () => {
  setup();
  await weightField();
  for (const name of ['Start workout', 'Finish workout', 'Save draft', 'Discard draft']) expect(screen.queryByRole('button', { name })).toBeNull();
  expect(document.querySelector('.gym-session-actions')).toBeNull();
  expect(screen.queryByText(/Workout draft/)).toBeNull();
  expect(screen.queryByRole('dialog', { name: /blank weights/i })).toBeNull();
});
