import { saveGymExercise, saveGymRoutine } from '../gym';
import { supabase } from '../../supabase/client';
import { trackerRpcDouble } from '../../test-support/tracker-rpc';

jest.mock('../../supabase/client', () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), auth: { getSession: jest.fn() } } }));

const OWNER = 'da230000-0000-4000-8000-000000000001';
const REVISION = { userId: OWNER, ageVersion: 1, consentVersion: 2, authorityVersion: 3 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
afterEach(() => { if (original) Object.defineProperty(globalThis, 'crypto', original); });

/** The gateway echoes the id it was given, as the server does. */
function echoGateway() {
  (supabase.rpc as jest.Mock).mockImplementation((_name: string, args: { p_arguments: { p_id: string } }) =>
    trackerRpcDouble({ data: args.p_arguments.p_id, error: null }));
}

describe('gym ids on a device without crypto.randomUUID (Hermes)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: OWNER }, access_token: 't' } }, error: null });
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  });

  it('creates a routine with a generated id', async () => {
    echoGateway();
    const id = await saveGymRoutine('u', 'Push', 'kg', REVISION, []);
    expect(id).toMatch(UUID);
    const call = (supabase.rpc as jest.Mock).mock.calls[0][1];
    expect(call.p_arguments).toMatchObject({ p_id: id, p_create: true });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('saves a new exercise with a generated id', async () => {
    echoGateway();
    const id = await saveGymExercise({ user_id: OWNER, routine_id: 'da230000-0000-4000-8000-0000000000a1', name: 'Bench', position: 0, sets: 3, reps: '8', rest_seconds: 90, rir: 2, rir_max: null, notes: '', media_path: null, media_mime: null }, REVISION, []);
    expect(id).toMatch(UUID);
    expect((supabase.rpc as jest.Mock).mock.calls[0][1].p_arguments.p_id).toBe(id);
  });
});
