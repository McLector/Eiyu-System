const getSession = jest.fn();
jest.mock('../client', () => ({supabase: {auth: {getSession: (...args: unknown[]) => getSession(...args)}}}));
import {authorizationForOwner} from '../authorization';

beforeEach(() => getSession.mockReset());

it('returns a bearer token only for the pinned owner', async () => {
  getSession.mockResolvedValue({data: {session: {user: {id: 'owner'}, access_token: 'tok'}}, error: null});
  expect(await authorizationForOwner('owner')).toBe('Bearer tok');
});
it.each([
  ['another person', {session: {user: {id: 'other'}, access_token: 'tok'}}],
  ['no session', {session: null}],
  ['no token', {session: {user: {id: 'owner'}, access_token: ''}}],
])('refuses %s', async (_name, data) => {
  getSession.mockResolvedValue({data, error: null});
  await expect(authorizationForOwner('owner', 'custom message')).rejects.toThrow('custom message');
});
it('refuses on a session error', async () => {
  getSession.mockResolvedValue({data: {session: null}, error: new Error('x')});
  await expect(authorizationForOwner('owner', 'custom message')).rejects.toThrow('custom message');
});
it('uses a neutral default message that no longer talks about birthdays', async () => {
  getSession.mockResolvedValue({data: {session: null}, error: null});
  const failure = await authorizationForOwner('owner').catch((e: Error) => e);
  expect((failure as Error).message).toBe('Sign in again to continue.');
  expect((failure as Error).message).not.toMatch(/birthday|adult|age/i);
});
