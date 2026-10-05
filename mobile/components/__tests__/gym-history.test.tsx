import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { GymEntry, GymRoutine, GymSession } from '@eiyu/shared';

import HistoryScreen from '../../app/(tabs)/gym/history';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockGym: any;
const mockShared = { fetchGymHistory: jest.fn() };
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/contexts/gym-store', () => ({ useGym: () => mockGym }));
jest.mock('@eiyu/shared', () => ({ ...jest.requireActual('@eiyu/shared'), fetchGymHistory: (...args: unknown[]) => mockShared.fetchGymHistory(...args) }));

const routine = (id: string, name: string, over: Partial<GymRoutine> = {}): GymRoutine => ({ id, user_id: 'u', name, unit: 'kg', archived: false, created_at: '2026-10-01', ...over });
const session = (id: string, routineId: string, name: string, over: Partial<GymSession> = {}): GymSession => ({
  id, routine_id: routineId, user_id: 'u', routine_name: name, unit: 'kg', status: 'completed', created_at: '2026-10-02T10:00:00Z', completed_at: '2026-10-02T11:00:00Z', ...over,
});
const entry = (id: string, sessionId: string, name: string, weight: number | null): GymEntry => ({
  id, session_id: sessionId, user_id: 'u', exercise_id: 'e', position: 0, weight,
  prescription: { name, sets: 3, reps: '8', rest_seconds: 90, rir: 2, rir_max: null, notes: '' },
});

function setup(page: { sessions: GymSession[]; entries: GymEntry[]; hasNext: boolean } = { sessions: [], entries: [], hasNext: false }) {
  mockGym = { userId: 'u', allRoutines: [routine('r1', 'Push'), routine('r2', 'Pull', { deleted_at: '2026-10-03' })] };
  mockShared.fetchGymHistory.mockReset().mockResolvedValue(page);
}
async function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await renderWithTheme(<QueryClientProvider client={client}><HistoryScreen /></QueryClientProvider>);
}

describe('Workout history', () => {
  it('shows the empty message when nothing was logged', async () => {
    setup();
    await open();
    expect(await screen.findByText('No weights logged yet. Log one and it appears here.')).toBeOnTheScreen();
    expect(mockShared.fetchGymHistory).toHaveBeenCalledWith('u', 0, undefined);
  });

  it('lists sessions; opening one shows its exercises with weight and unit', async () => {
    setup({ sessions: [session('s1', 'r1', 'Push')], entries: [entry('n1', 's1', 'Bench', 62.5), entry('n2', 's1', 'Dips', null)], hasNext: false });
    await open();
    const row = await screen.findByRole('button', { name: /Push/ });
    expect(row).toBeCollapsed();
    expect(screen.queryByText('Bench · 3 × 8 · 62.5 kg')).toBeNull();
    await userEvent.setup().press(row);
    expect(screen.getByText('Bench · 3 × 8 · 62.5 kg')).toBeOnTheScreen();
    expect(screen.getByText('Dips · 3 × 8 · — kg')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Push/ })).toBeExpanded();
  });

  it('marks sessions of a deleted routine', async () => {
    setup({ sessions: [session('s2', 'r2', 'Pull')], entries: [], hasNext: false });
    await open();
    expect(await screen.findByRole('button', { name: /Pull · Deleted routine/ })).toBeOnTheScreen();
  });

  it('filters by routine and goes back to the first page', async () => {
    setup({ sessions: [session('s1', 'r1', 'Push')], entries: [], hasNext: true });
    await open();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: /Push/ });
    await user.press(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(mockShared.fetchGymHistory).toHaveBeenLastCalledWith('u', 1, undefined));
    await user.press(screen.getByRole('radio', { name: 'Push' }));
    await waitFor(() => expect(mockShared.fetchGymHistory).toHaveBeenLastCalledWith('u', 0, 'r1'));
    expect(screen.getByRole('radio', { name: 'Push' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Pull (deleted routine)' })).toBeOnTheScreen();
  });

  it('pages: Previous is off on the first page and Next follows hasNext', async () => {
    setup({ sessions: [session('s1', 'r1', 'Push')], entries: [], hasNext: false });
    await open();
    await screen.findByRole('button', { name: /Push/ });
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(within(screen.getByTestId('gym-history-pages')).getByText('1')).toBeOnTheScreen();
  });

  it('shows a read error with Retry', async () => {
    setup();
    mockShared.fetchGymHistory.mockRejectedValueOnce(new Error('offline'));
    await open();
    expect(await screen.findByText(/offline/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No weights logged yet. Log one and it appears here.')).toBeOnTheScreen();
  });
});
