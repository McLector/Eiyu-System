const upload = jest.fn();
const from = jest.fn(() => ({ upload }));
jest.mock('../../supabase/client', () => ({ supabase: { storage: { from: (...args: unknown[]) => (from as (...a: unknown[]) => unknown)(...args) } } }));
import { uploadGymMediaBody } from '../gym-media';

const OWNER = 'da230000-0000-4000-8000-000000000001';
const ROUTINE = 'da230000-0000-4000-8000-0000000000a1';
const revision = { userId: OWNER, ageVersion: 1, consentVersion: 2, authorityVersion: 3 };
const body = new Uint8Array([1, 2, 3]);

beforeEach(() => { upload.mockReset().mockResolvedValue({ error: null }); from.mockClear(); });

describe('uploadGymMediaBody', () => {
  it('uploads into the folder of the captured revision and returns that path', async () => {
    const result = await uploadGymMediaBody(OWNER, ROUTINE, body, 'image/gif', revision);
    expect(from).toHaveBeenCalledWith('gym-exercise-media');
    expect(result.mime).toBe('image/gif');
    expect(result.path).toMatch(new RegExp(`^${OWNER}/${ROUTINE}/1-2-3/[0-9a-f-]{36}\.gif$`));
    expect(upload).toHaveBeenCalledWith(result.path, body, { contentType: 'image/gif', upsert: false });
  });
  it('uses a new object id for each upload', async () => {
    const first = await uploadGymMediaBody(OWNER, ROUTINE, body, 'video/mp4', revision);
    const second = await uploadGymMediaBody(OWNER, ROUTINE, body, 'video/mp4', revision);
    expect(first.path).not.toBe(second.path);
  });
  it('sends nothing when the revision belongs to another owner or is invalid', async () => {
    await expect(uploadGymMediaBody(OWNER, ROUTINE, body, 'image/gif', { ...revision, userId: 'someone-else' })).rejects.toThrow();
    await expect(uploadGymMediaBody(OWNER, ROUTINE, body, 'image/gif', undefined as never)).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
  });
  it('surfaces a storage refusal unchanged', async () => {
    const refusal = new Error('new row violates row-level security policy');
    upload.mockResolvedValue({ error: refusal });
    await expect(uploadGymMediaBody(OWNER, ROUTINE, body, 'image/gif', revision)).rejects.toBe(refusal);
  });
});
