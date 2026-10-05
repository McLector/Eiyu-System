import { saveGymExercise, saveGymRoutine } from '../gym';
import { supabase } from '../../supabase/client';

jest.mock('../../supabase/client', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
afterEach(() => { if (original) Object.defineProperty(globalThis, 'crypto', original); });

describe('gym ids on a device without crypto.randomUUID (Hermes)', () => {
  beforeEach(() => { jest.resetAllMocks(); Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined }); });

  it('creates a routine with a generated id', async () => {
    const insert = jest.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }));
    (supabase.from as jest.Mock).mockReturnValue({ insert });
    await saveGymRoutine('u', 'Push', 'kg');
    expect((insert.mock.calls[0] as unknown as [{ id: string }])[0].id).toMatch(UUID);
  });

  it('saves a new exercise with a generated id', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });
    const id = await saveGymExercise({ user_id: 'u', routine_id: 'r', name: 'Bench', position: 0, sets: 3, reps: '8', rest_seconds: 90, rir: 2, rir_max: null, notes: '', media_path: null, media_mime: null });
    expect(id).toMatch(UUID);
  });
});
