const rpc = jest.fn();
const getSession = jest.fn();
jest.mock('../../supabase/client', () => ({
  supabase: {rpc: (...args: unknown[]) => rpc(...args), auth: {getSession: (...args: unknown[]) => getSession(...args)}},
}));
import {
  OPERATOR_MESSAGE, OperatorError, REVIEW_NOTE_MAX, cancelAuthorityReview, decideReview, fetchOperatorStatus,
  fetchMyReviewRequests, fetchRetentionNotice, listRetention, listReviewRequests, pausePurpose, requestAuthorityReview, resumePurpose,
} from '../operator';
import {OWNER_A, OWNER_B, trackerRpcDouble} from '../../test-support/tracker-rpc';

const REQ = 'da230000-0000-4000-8000-0000000000aa';
const USER = 'da230000-0000-4000-8000-0000000000bb';
const status = {isOperator: true, mfaRequired: false, aal: 'aal2'};
const wire = {requestId: REQ, email: 'teen@example.com', ageBand: 'teen', purpose: 'custom-tracker', note: 'hello', status: 'open', createdAt: '2026-10-24T10:00:00Z'};
const request = {id: REQ, email: 'teen@example.com', ageBand: 'teen', purpose: 'custom-tracker', note: 'hello', createdAt: '2026-10-24T10:00:00Z'};
const retention = {
  email: 'a@example.com', purpose: 'fitness-tracking', withdrawnAt: '2026-10-01T00:00:00Z',
  reminderDueOn: '2026-10-24', removalDueOn: '2026-10-31', status: 'reminded',
};

function reply(data: unknown, error: unknown = null) {
  rpc.mockImplementation(() => trackerRpcDouble({data, error}));
}
beforeEach(() => {
  rpc.mockReset();
  getSession.mockReset().mockResolvedValue({data: {session: {user: {id: OWNER_A}, access_token: 'token-a'}}, error: null});
});

describe('fetchOperatorStatus', () => {
  it('returns the three fields and pins the caller session', async () => {
    reply({...status, extra: 'dropped'});
    expect(await fetchOperatorStatus(OWNER_A)).toEqual(status);
    expect(rpc).toHaveBeenCalledWith('get_operator_status');
    expect(rpc.mock.results[0].value.headers.Authorization).toBe('Bearer token-a');
  });
  it('refuses when the session belongs to another owner, without calling the server', async () => {
    reply(status);
    await expect(fetchOperatorStatus(OWNER_B)).rejects.toThrow(OPERATOR_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, [], 'x', {}, {...status, isOperator: 'yes'}, {...status, aal: 'aal3'}, {...status, mfaRequired: 1}])(
    'rejects an unknown shape %#', async value => {
      reply(value);
      await expect(fetchOperatorStatus(OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    });
  it('turns a server error into a safe error that does not echo it', async () => {
    reply(null, {code: '42501', message: 'secret detail user@example.com'});
    const err = await fetchOperatorStatus(OWNER_A).catch(e => e);
    expect(err).toBeInstanceOf(OperatorError);
    expect(err.message).not.toMatch(/secret|example/);
  });
});

describe('requestAuthorityReview and cancelAuthorityReview', () => {
  it('sends a trimmed note and the purpose', async () => {
    reply({ok: true});
    await requestAuthorityReview('custom-tracker', '  please look  ', OWNER_A);
    expect(rpc).toHaveBeenCalledWith('request_authority_review', {p_purpose: 'custom-tracker', p_note: 'please look'});
  });
  it('sends an empty note when none is given', async () => {
    reply({ok: true});
    await requestAuthorityReview('weekly-debrief', undefined, OWNER_A);
    expect(rpc).toHaveBeenCalledWith('request_authority_review', {p_purpose: 'weekly-debrief', p_note: ''});
  });
  it('rejects a note over the limit and an unknown purpose before calling the server', async () => {
    reply({ok: true});
    await expect(requestAuthorityReview('custom-tracker', 'x'.repeat(REVIEW_NOTE_MAX + 1), OWNER_A)).rejects.toThrow(/280/);
    await expect(requestAuthorityReview('age-screening' as never, '', OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('accepts a note of exactly the limit', async () => {
    reply({ok: true});
    await requestAuthorityReview('custom-tracker', 'x'.repeat(REVIEW_NOTE_MAX), OWNER_A);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([['ER001', 'limit'], ['ER002', 'already-open'], ['ER003', 'not-needed'], ['22023', 'invalid']])(
    'classifies server code %s as %s without echoing text', async (code, kind) => {
      reply(null, {code, message: 'detail for user@example.com'});
      const err = await requestAuthorityReview('custom-tracker', '', OWNER_A).catch(e => e);
      expect(err).toBeInstanceOf(OperatorError);
      expect(err.kind).toBe(kind);
      expect(err.message).not.toMatch(/example|detail/);
    });
  it('maps a server refusal to a safe error', async () => {
    reply(null, {code: 'P0001', message: 'rate limit for user@example.com'});
    const err = await requestAuthorityReview('custom-tracker', '', OWNER_A).catch(e => e);
    expect(err).toBeInstanceOf(OperatorError);
    expect(err.message).not.toMatch(/example/);
  });
  it('cancels one purpose and refuses a foreign session', async () => {
    reply({ok: true});
    await cancelAuthorityReview('fitness-tracking', OWNER_A);
    expect(rpc).toHaveBeenCalledWith('cancel_authority_review', {p_purpose: 'fitness-tracking'});
    rpc.mockClear();
    await expect(cancelAuthorityReview('fitness-tracking', OWNER_B)).rejects.toThrow(OPERATOR_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('fetchMyReviewRequests', () => {
  const mine = {requestId: REQ, purpose: 'custom-tracker', status: 'open', createdAt: '2026-10-24T10:00:00Z'};
  it('returns only the allowed fields for the caller', async () => {
    reply([{...mine, note: 'never kept', email: 'teen@example.com'}]);
    expect(await fetchMyReviewRequests(OWNER_A)).toEqual([mine]);
    expect(rpc).toHaveBeenCalledWith('get_my_review_requests');
    expect(rpc.mock.results[0].value.headers.Authorization).toBe('Bearer token-a');
  });
  it('returns an empty list when there are none', async () => {
    reply([]);
    expect(await fetchMyReviewRequests(OWNER_A)).toEqual([]);
  });
  it('refuses a foreign session without calling the server', async () => {
    reply([mine]);
    await expect(fetchMyReviewRequests(OWNER_B)).rejects.toThrow(OPERATOR_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, {}, 'x', [{...mine, requestId: 'nope'}], [{...mine, purpose: 'age-screening'}],
    [{...mine, status: 'maybe'}], [{...mine, createdAt: 'soon'}], [null]])(
    'rejects an unknown shape %#', async value => {
      reply(value);
      await expect(fetchMyReviewRequests(OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    });
  it('turns a server error into a safe error', async () => {
    reply(null, {code: '42501', message: 'detail for user@example.com'});
    const err = await fetchMyReviewRequests(OWNER_A).catch(e => e);
    expect(err).toBeInstanceOf(OperatorError);
    expect(err.message).not.toMatch(/example|detail/);
  });
});

describe('fetchRetentionNotice', () => {
  const notice = [{purpose: 'custom-tracker', removalDueOn: '2026-10-31', reminded: true}];
  it('returns validated notices', async () => {
    reply(notice);
    expect(await fetchRetentionNotice(OWNER_A)).toEqual(notice);
    expect(rpc).toHaveBeenCalledWith('get_tracker_retention_notice');
  });
  it('treats null as no notice', async () => {
    reply(null);
    expect(await fetchRetentionNotice(OWNER_A)).toEqual([]);
  });
  it.each([{}, 'x', [{purpose: 'weekly-debrief', removalDueOn: '2026-10-31', reminded: true}],
    [{purpose: 'custom-tracker', removalDueOn: 'soon', reminded: true}], [{purpose: 'custom-tracker', removalDueOn: '2026-10-31'}]])(
    'rejects an unknown shape %#', async value => {
      reply(value);
      await expect(fetchRetentionNotice(OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    });
});

describe('operator calls', () => {
  it('lists review requests and projects only the allowed fields', async () => {
    reply([{...wire, birthday: '2010-01-01', questNames: ['x']}]);
    const rows = await listReviewRequests('open', OWNER_A);
    expect(rows).toEqual([request]);
    expect(rpc).toHaveBeenCalledWith('operator_list_review_requests', {p_status: 'open'});
  });
  it.each([{}, [{...wire, requestId: 'nope'}], [{...wire, ageBand: 'child'}], [{...wire, purpose: 'age-screening'}],
    [{...wire, email: 7}], [{...wire, note: 5}]])('rejects an unknown list shape %#', async value => {
    reply(value);
    await expect(listReviewRequests('open', OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
  });
  it('accepts an account with no email and an empty note', async () => {
    reply([{...wire, email: null, note: null}]);
    expect(await listReviewRequests('open', OWNER_A)).toEqual([{...request, email: '', note: ''}]);
  });
  it('rejects an unknown status filter before calling', async () => {
    await expect(listReviewRequests('everything' as never, OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('decides a review with a valid id and decision only', async () => {
    reply({ok: true});
    await decideReview(REQ, 'approved', OWNER_A);
    expect(rpc).toHaveBeenCalledWith('operator_decide_review', {p_request_id: REQ, p_decision: 'approved'});
    rpc.mockClear();
    await expect(decideReview('not-a-uuid', 'approved', OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    await expect(decideReview(REQ, 'maybe' as never, OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['ER003', 'ER004'])('reports a decision refused with %s as no longer applying, without echoing the server', async code => {
    reply(null, {code, message: 'server detail for a@example.com'});
    const err = await decideReview(REQ, 'approved', OWNER_A).catch(e => e);
    expect(err).toBeInstanceOf(OperatorError);
    expect(err.kind).toBe('stale');
    expect(err.message).toBe('This request no longer applies.');
  });
  it('keeps other decision failures generic', async () => {
    reply(null, {code: 'XX000', message: 'boom'});
    const err = await decideReview(REQ, 'approved', OWNER_A).catch(e => e);
    expect(err.kind).toBe('unavailable');
    reply(null, {code: '42501', message: 'nope'});
    expect((await decideReview(REQ, 'approved', OWNER_A).catch(e => e)).kind).toBe('denied');
  });
  it('pauses a purpose with a fixed reason code', async () => {
    reply({ok: true});
    await pausePurpose(USER, 'weekly-debrief', 'dispute', OWNER_A);
    expect(rpc).toHaveBeenCalledWith('operator_pause_purpose', {p_user_id: USER, p_purpose: 'weekly-debrief', p_reason_code: 'dispute'});
    rpc.mockClear();
    await expect(pausePurpose(USER, 'nope' as never, 'dispute', OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    await expect(pausePurpose(USER, 'custom-tracker', 'because i said so' as never, OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    reply({ok: true});
    await pausePurpose(USER, 'custom-tracker', 'report', OWNER_A);
    expect(rpc).toHaveBeenCalledWith('operator_pause_purpose', {p_user_id: USER, p_purpose: 'custom-tracker', p_reason_code: 'report'});
    rpc.mockClear();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('pauses by email, naming the account only by email', async () => {
    reply({ok: true});
    await pausePurpose('  Teen@Example.com ', 'fitness-tracking', 'dispute', OWNER_A);
    expect(rpc).toHaveBeenCalledWith('operator_pause_purpose', {
      p_user_id: null, p_email: 'Teen@Example.com', p_purpose: 'fitness-tracking', p_reason_code: 'dispute',
    });
  });
  it.each(['', '   ', 'not an account', 'a@', '@b.com', 'a b@c.com', `${'x'.repeat(320)}@b.com`])(
    'refuses %j as an account before calling the server', async account => {
      reply({ok: true});
      await expect(pausePurpose(account, 'custom-tracker', 'dispute', OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
      expect(rpc).not.toHaveBeenCalled();
    });
  it('does not reveal whether an email exists when the server refuses it', async () => {
    reply(null, {code: '42501', message: 'Account unavailable. nobody@example.com'});
    const err = await pausePurpose('nobody@example.com', 'custom-tracker', 'dispute', OWNER_A).catch(e => e);
    expect(err).toBeInstanceOf(OperatorError);
    expect(err.kind).toBe('denied');
    expect(err.message).not.toMatch(/example|unavailable/i);
  });
  it('resumes a purpose by id or by email, naming the account exactly one way', async () => {
    reply({purpose: 'weekly-debrief', state: 'pending'});
    await resumePurpose(USER, 'weekly-debrief', OWNER_A);
    expect(rpc).toHaveBeenCalledWith('operator_resume_purpose', {p_user_id: USER, p_purpose: 'weekly-debrief'});
    rpc.mockClear();
    await resumePurpose('  Teen@Example.com ', 'fitness-tracking', OWNER_A);
    expect(rpc).toHaveBeenCalledWith('operator_resume_purpose', {p_user_id: null, p_email: 'Teen@Example.com', p_purpose: 'fitness-tracking'});
  });
  it.each(['', '   ', 'not an account', 'a@'])('refuses %j as an account to resume before calling the server', async account => {
    reply({ok: true});
    await expect(resumePurpose(account, 'custom-tracker', OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('refuses an unknown purpose to resume and a foreign session before calling the server', async () => {
    reply({ok: true});
    await expect(resumePurpose(USER, 'nope' as never, OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    await expect(resumePurpose(USER, 'custom-tracker', OWNER_B)).rejects.toThrow(OPERATOR_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('reports a purpose that is not paused without echoing the server text', async () => {
    reply(null, {code: 'ER003', message: 'server detail for a@example.com'});
    const err = await resumePurpose(USER, 'custom-tracker', OWNER_A).catch(e => e);
    expect(err).toBeInstanceOf(OperatorError);
    expect(err.kind).toBe('not-needed');
    expect(err.message).not.toContain('a@example.com');
  });
  it('lists retention rows and rejects bad shapes', async () => {
    reply([{...retention, content: 'x'}]);
    expect(await listRetention(OWNER_A)).toEqual([retention]);
    expect(rpc).toHaveBeenCalledWith('operator_list_retention');
    reply([{...retention, removalDueOn: 'someday'}]);
    await expect(listRetention(OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
    reply('x');
    await expect(listRetention(OWNER_A)).rejects.toThrow(OPERATOR_MESSAGE);
  });
  it('keeps a retention row for an account with no email, so one row cannot hide the list', async () => {
    reply([{...retention, email: null}]);
    expect(await listRetention(OWNER_A)).toEqual([{...retention, email: ''}]);
  });
  it('surfaces a non-operator refusal as a safe denied error', async () => {
    reply(null, {code: '42501', message: 'Operator access required.'});
    const err = await listRetention(OWNER_A).catch(e => e);
    expect(err).toBeInstanceOf(OperatorError);
    expect(err.kind).toBe('denied');
  });
});
