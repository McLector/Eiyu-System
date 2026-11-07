const rpc = jest.fn();
jest.mock('../../supabase/client', () => ({supabase: {rpc: (...args: unknown[]) => rpc(...args)}}));
import {acceptTerms, fetchTermsStatus} from '../terms';
import {TERMS_VERSION} from '../../logic/legal-content';

const accepted = {userId: 'owner-a', accepted: true, version: TERMS_VERSION};
beforeEach(() => rpc.mockReset().mockResolvedValue({data: {...accepted}, error: null}));

describe('fetchTermsStatus', () => {
  it('reads caller-scoped state without sending an owner', async () => {
    expect(await fetchTermsStatus()).toEqual(accepted);
    expect(rpc).toHaveBeenCalledWith('get_terms_status');
  });
  it('reads "not accepted yet" as accepted false with no version', async () => {
    rpc.mockResolvedValue({data: {userId: 'owner-a', accepted: false, version: null}, error: null});
    expect(await fetchTermsStatus()).toEqual({userId: 'owner-a', accepted: false, version: null});
  });
  it('accepts an earlier version as accepted (existing accounts hold the first Terms)', async () => {
    rpc.mockResolvedValue({data: {userId: 'owner-a', accepted: true, version: '2026-10-20-terms-v1'}, error: null});
    expect((await fetchTermsStatus()).version).toBe('2026-10-20-terms-v1');
  });
  it('keeps only the contract fields', async () => {
    rpc.mockResolvedValue({data: {...accepted, extra: 'do-not-keep'}, error: null});
    expect(await fetchTermsStatus()).toEqual(accepted);
  });
  it.each([
    ['null', null], ['an array', []], ['a string', 'ok'], ['no fields', {}],
    ['an empty user id', {...accepted, userId: ''}], ['a blank user id', {...accepted, userId: '  '}],
    ['a user id that is not text', {...accepted, userId: 4}],
    ['accepted given as text', {...accepted, accepted: 'true'}],
    ['accepted given as 1', {...accepted, accepted: 1}],
    ['accepted without a version', {...accepted, version: null}],
    ['accepted with an empty version', {...accepted, version: ''}],
    ['not accepted but carrying a version', {...accepted, accepted: false}],
    ['a version that is not text', {...accepted, version: 2}],
  ])('rejects a malformed response: %s', async (_name, data) => {
    rpc.mockResolvedValue({data, error: null});
    await expect(fetchTermsStatus()).rejects.toThrow('Terms status is unavailable.');
  });
  it('passes a read error through unchanged', async () => {
    const error = new Error('offline'); rpc.mockResolvedValue({data: null, error});
    await expect(fetchTermsStatus()).rejects.toBe(error);
  });
});

describe('acceptTerms', () => {
  it('sends only the current version and returns the confirmed acceptance', async () => {
    expect(await acceptTerms()).toEqual(accepted);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('accept_terms', {p_version: '2026-11-08-terms-v2'});
  });
  it('accepts the confirmation when the expected owner matches', async () => {
    expect(await acceptTerms('owner-a')).toEqual(accepted);
  });
  it('rejects a confirmation for a different person than the one expected', async () => {
    await expect(acceptTerms('owner-b')).rejects.toThrow('Could not save your agreement.');
  });
  it.each([
    ['an older version', {...accepted, version: '2026-10-20-terms-v1'}],
    ['no version', {...accepted, version: null}],
    ['not accepted', {...accepted, accepted: false, version: null}],
    ['accepted given as text', {...accepted, accepted: 'true'}],
    ['no user', {...accepted, userId: ''}],
    ['nothing', null],
  ])('rejects a confirmation that shows %s', async (_name, data) => {
    rpc.mockResolvedValue({data, error: null});
    await expect(acceptTerms()).rejects.toThrow('Could not save your agreement.');
  });
  it('passes a server refusal through unchanged', async () => {
    const error = new Error('Review the current Terms before accepting them.'); rpc.mockResolvedValue({data: null, error});
    await expect(acceptTerms()).rejects.toBe(error);
  });
  it('sends exactly one request per call', async () => {
    await Promise.all([acceptTerms(), acceptTerms()]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
