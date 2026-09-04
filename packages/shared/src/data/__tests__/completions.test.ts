import { completeHabit, undoCompletion, incrementHabitProgress } from '../completions';
import { supabase } from '../../supabase/client';

jest.mock('../../supabase/client', () => ({
  supabase: {
    rpc: jest.fn(async () => ({ error: null })),
  },
}));

describe('completeHabit', () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockClear();
  });

  it('calls complete_habit without a client-supplied XP amount', async () => {
    await completeHabit('user-1', 'habit-1', 'STR', 'full', '2026-08-28');

    expect(supabase.rpc).toHaveBeenCalledWith('complete_habit', {
      p_habit_id: 'habit-1',
      p_completed_on: '2026-08-28',
      p_kind: 'full',
    });
  });

  it('propagates an RPC error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: new Error('boom') });

    await expect(
      completeHabit('user-1', 'habit-1', 'STR', 'full', '2026-08-28')
    ).rejects.toThrow('boom');
  });
});

describe('undoCompletion', () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockClear();
  });

  it("calls undo_habit_completion with today's date", async () => {
    await undoCompletion('user-1', 'habit-1', 'STR');

    expect(supabase.rpc).toHaveBeenCalledWith('undo_habit_completion', {
      p_habit_id: 'habit-1',
      p_completed_on: expect.any(String),
    });
  });
});

describe('incrementHabitProgress', () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
  });

  it('calls the RPC with habit id, date, and delta, returning the server count', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 3, error: null });

    const result = await incrementHabitProgress('h1', '2026-09-04', 1);

    expect(supabase.rpc).toHaveBeenCalledWith('increment_habit_progress', {
      p_habit_id: 'h1',
      p_date: '2026-09-04',
      p_delta: 1,
    });
    expect(result).toBe(3);
  });

  it('throws on RPC error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(incrementHabitProgress('h1', '2026-09-04', 1)).rejects.toThrow('boom');
  });
});
