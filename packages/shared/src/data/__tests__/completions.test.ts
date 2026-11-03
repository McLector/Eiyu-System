import {
  completeHabit,
  completeHabitRecovery,
  undoCompletion,
  incrementHabitProgress,
} from '../completions';
import { supabase } from '../../supabase/client';
import { trackerRpcDouble } from '../../test-support/tracker-rpc';

jest.mock('../../supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
    auth: { getSession: jest.fn() },
  },
}));

const OWNER = 'da230000-0000-4000-8000-000000000001';
const REVISION = { userId: OWNER, ageVersion: 1, consentVersion: 2, authorityVersion: 3 };
const HABIT = { kind: 'habit' as const, id: 'da230000-0000-4000-8000-0000000000a1', inputKind: 'basic' as const };
const rpc = supabase.rpc as jest.Mock;

/** The gateway answers with `data`; everything it is asked is recorded on the mock. */
function gateway(data: unknown = null, error: unknown = null) {
  rpc.mockReset().mockImplementation(() => trackerRpcDouble({ data, error }));
}
const sent = (index = 0) => rpc.mock.calls[index];

beforeEach(() => {
  (supabase.auth.getSession as jest.Mock).mockReset().mockResolvedValue({ data: { session: { user: { id: OWNER }, access_token: 't' } }, error: null });
  gateway();
});

describe('completeHabit', () => {
  it('calls complete_habit through the gateway without a client-supplied XP amount', async () => {
    await completeHabit('user-1', HABIT.id, 'STR', 'full', REVISION, [HABIT], '2026-08-28');

    expect(sent()).toEqual(['apply_tracker_write', {
      p_operation: 'complete_habit',
      p_arguments: { p_habit_id: HABIT.id, p_completed_on: '2026-08-28', p_kind: 'full', p_expected_targets: [HABIT] },
      p_expected: REVISION,
    }]);
  });

  it('defaults the date to the account day for the given zone', async () => {
    await completeHabit('user-1', HABIT.id, 'STR', 'easy', REVISION, [HABIT], undefined, 'UTC');
    expect(sent()[1].p_arguments.p_completed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('sends the captured revision, never a fresh one, and never writes directly', async () => {
    const live = { ...REVISION };
    const pending = completeHabit('user-1', HABIT.id, 'STR', 'full', live, [HABIT], '2026-08-28');
    live.consentVersion = 99;
    await pending;
    expect(sent()[1].p_expected).toEqual(REVISION);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('propagates a gateway error unchanged', async () => {
    const failure = Object.assign(new Error('Tracker access changed.'), { code: 'ET003' });
    gateway(null, failure);
    await expect(completeHabit('user-1', HABIT.id, 'STR', 'full', REVISION, [HABIT], '2026-08-28')).rejects.toBe(failure);
  });

  it('treats a duplicate completion (22023) for a well-formed request as already recorded', async () => {
    const duplicate = Object.assign(new Error('Invalid tracker input.'), { code: '22023' });
    gateway(null, duplicate);
    await expect(completeHabit('user-1', HABIT.id, 'STR', 'full', REVISION, [HABIT], '2026-08-28')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does not hide 22023 for a malformed request, and does not hide other refusals', async () => {
    gateway(null, Object.assign(new Error('x'), { code: '22023' }));
    await expect(completeHabit('user-1', HABIT.id, 'STR', 'full', REVISION, [HABIT], 'not-a-date')).rejects.toThrow();
    await expect(completeHabit('user-1', HABIT.id, 'STR', 'bogus' as never, REVISION, [HABIT], '2026-08-28')).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    for (const code of ['ET001', 'ET002', 'ET003', '42501']) {
      const failure = Object.assign(new Error('refused'), { code });
      gateway(null, failure);
      await expect(completeHabit('user-1', HABIT.id, 'STR', 'full', REVISION, [HABIT], '2026-08-28')).rejects.toBe(failure);
    }
  });

  it('refuses without a request when the revision is missing', async () => {
    await expect(completeHabit('user-1', HABIT.id, 'STR', 'full', undefined as never, [HABIT], '2026-08-28')).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('undoCompletion', () => {
  it("calls undo_habit_completion with today's date through the gateway", async () => {
    await undoCompletion('user-1', HABIT.id, 'STR', REVISION, [HABIT]);

    expect(sent()).toEqual(['apply_tracker_write', {
      p_operation: 'undo_habit_completion',
      p_arguments: { p_habit_id: HABIT.id, p_completed_on: expect.any(String), p_expected_targets: [HABIT] },
      p_expected: REVISION,
    }]);
  });

  it('undoes the given date instead of recomputing today', async () => {
    await undoCompletion('user-1', HABIT.id, 'STR', REVISION, [HABIT], 'UTC', '2026-08-28');
    expect(sent()[1].p_arguments.p_completed_on).toBe('2026-08-28');
  });

  it('propagates a gateway error unchanged', async () => {
    const failure = Object.assign(new Error('paused'), { code: 'ET001' });
    gateway(null, failure);
    await expect(undoCompletion('user-1', HABIT.id, 'STR', REVISION, [HABIT])).rejects.toBe(failure);
  });
});

describe('completeHabitRecovery', () => {
  it('uses the authoritative recovery operation without a client date or clock', async () => {
    gateway({ status: 'recovered' });

    await expect(completeHabitRecovery(HABIT.id, REVISION, [HABIT])).resolves.toBe('recovered');
    expect(sent()).toEqual(['apply_tracker_write', {
      p_operation: 'complete_habit_recovery',
      p_arguments: { p_habit_id: HABIT.id, p_expected_targets: [HABIT] },
      p_expected: REVISION,
    }]);
  });

  it('accepts an already recovered window', async () => {
    gateway({ status: 'already_recovered' });
    await expect(completeHabitRecovery(HABIT.id, REVISION, [HABIT])).resolves.toBe('already_recovered');
  });

  it('surfaces an authoritative expired result as an error', async () => {
    gateway({ status: 'expired' });
    await expect(completeHabitRecovery(HABIT.id, REVISION, [HABIT])).rejects.toThrow('Recovery window has expired');
  });

  it('surfaces a missing window and an unknown result', async () => {
    gateway({ status: 'no_open_recovery' });
    await expect(completeHabitRecovery(HABIT.id, REVISION, [HABIT])).rejects.toThrow('No recovery window is available');
    for (const odd of [null, {}, { status: 'recovered!' }, 'recovered']) {
      gateway(odd);
      await expect(completeHabitRecovery(HABIT.id, REVISION, [HABIT])).rejects.toThrow('Unexpected recovery result');
    }
  });

  it('propagates a gateway error unchanged', async () => {
    const failure = Object.assign(new Error('purpose'), { code: 'ET002' });
    gateway(null, failure);
    await expect(completeHabitRecovery(HABIT.id, REVISION, [HABIT])).rejects.toBe(failure);
  });
});

describe('incrementHabitProgress', () => {
  it('calls the gateway with habit id, date, and delta, returning the server count', async () => {
    gateway(3);

    const result = await incrementHabitProgress(HABIT.id, '2026-09-04', 1, REVISION, [HABIT]);

    expect(sent()).toEqual(['apply_tracker_write', {
      p_operation: 'increment_habit_progress',
      p_arguments: { p_habit_id: HABIT.id, p_date: '2026-09-04', p_delta: 1, p_expected_targets: [HABIT] },
      p_expected: REVISION,
    }]);
    expect(result).toBe(3);
  });

  it('throws on a gateway error', async () => {
    gateway(null, new Error('boom'));
    await expect(incrementHabitProgress(HABIT.id, '2026-09-04', 1, REVISION, [HABIT])).rejects.toThrow('boom');
  });

  it('does not coerce a result that is not a whole count', async () => {
    for (const odd of [null, '3', { count: 3 }, 1.5, NaN, -1]) {
      gateway(odd);
      await expect(incrementHabitProgress(HABIT.id, '2026-09-04', 1, REVISION, [HABIT])).rejects.toThrow();
    }
  });
});
