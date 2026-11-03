import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  OperatorError, REVIEW_PURPOSES, decideReview, isPauseAccount, listRetention, listReviewRequests, pausePurpose, resumePurpose,
  type ReviewDecision, type ReviewPurpose, type ReviewRequestRow, type RetentionRow,
} from '@eiyu/shared';

import Dialog from '../components/Dialog';
import { useSession } from '../store/session-context';

const PURPOSE_LABEL: Record<ReviewPurpose, string> = {
  'custom-tracker': 'Custom tracker', 'fitness-tracking': 'Fitness tracking', 'weekly-debrief': 'Weekly debrief',
};

function day(value: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

type Pending = { kind: 'decide'; row: ReviewRequestRow; decision: ReviewDecision } | { kind: 'pause' | 'resume'; account: string; purpose: ReviewPurpose };

function failureMessage(kind: Pending['kind'], error: unknown): string {
  if (kind === 'decide') return 'Could not record that decision. Nothing was changed.';
  if (kind === 'pause') return 'Could not pause that purpose. Nothing was changed.';
  return error instanceof OperatorError && error.kind === 'not-needed'
    ? 'That purpose is not paused for that account. Nothing was changed.'
    : 'Could not resume that purpose. Nothing was changed.';
}

/** Operator console. Shows only email, age band, purpose, note and dates. The server re-checks operator and MFA on every call. */
export default function AdminConsole({ userId }: { userId: string }) {
  const { signOut, user } = useSession();
  const [rows, setRows] = useState<ReviewRequestRow[] | null>(null);
  const [queueError, setQueueError] = useState(false);
  const [retention, setRetention] = useState<RetentionRow[] | null>(null);
  const [retentionError, setRetentionError] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('');
  const [purpose, setPurpose] = useState<ReviewPurpose>('custom-tracker');
  const [formError, setFormError] = useState<string | null>(null);
  const actionAlert = useRef<HTMLParagraphElement>(null);
  const formAlert = useRef<HTMLParagraphElement>(null);

  const loadQueue = useCallback(async () => {
    try { setRows(await listReviewRequests('open', userId)); setQueueError(false); } catch { setQueueError(true); }
  }, [userId]);
  useEffect(() => {
    void loadQueue();
    listRetention(userId).then(r => { setRetention(r); setRetentionError(false); }).catch(() => setRetentionError(true));
  }, [userId, loadQueue]);
  useEffect(() => { if (actionError) actionAlert.current?.focus(); }, [actionError]);
  useEffect(() => { if (formError) formAlert.current?.focus(); }, [formError]);

  const confirm = async () => {
    if (!pending || working) return;
    const action = pending;
    setWorking(true); setActionError(null); setNotice(null);
    try {
      if (action.kind === 'decide') {
        await decideReview(action.row.id, action.decision, userId);
        setPending(null);
        await loadQueue();
      } else if (action.kind === 'pause') {
        await pausePurpose(action.account, action.purpose, 'dispute', userId);
        setPending(null); setAccountId('');
        setNotice(`${PURPOSE_LABEL[action.purpose]} paused for that account.`);
      } else {
        await resumePurpose(action.account, action.purpose, userId);
        setPending(null); setAccountId('');
        setNotice(`${PURPOSE_LABEL[action.purpose]} resumed for that account.`);
      }
    } catch (error) {
      setPending(null);
      setActionError(failureMessage(action.kind, error));
    } finally { setWorking(false); }
  };

  const askAccountAction = (kind: 'pause' | 'resume') => {
    setNotice(null); setActionError(null);
    const account = accountId.trim();
    if (!isPauseAccount(account)) { setFormError('Enter an email address or account id.'); return; }
    setFormError(null);
    setPending({ kind, account, purpose });
  };

  const verb = pending?.kind === 'decide' ? (pending.decision === 'approved' ? 'approve' : 'deny') : pending?.kind;

  return <main style={{ maxWidth: 960, margin: '0 auto', padding: 24, display: 'grid', gap: 24 }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <h1>Admin console</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {user?.email && <span>{user.email}</span>}
        <button type="button" className="btn-secondary" onClick={() => void signOut()}>Sign out</button>
      </div>
    </header>

    {actionError && <p role="alert" tabIndex={-1} ref={actionAlert}>{actionError}</p>}
    {notice && <p role="status">{notice}</p>}

    <section aria-labelledby="admin-queue" style={{ display: 'grid', gap: 12 }}>
      <h2 id="admin-queue">Review requests</h2>
      {queueError && <p>Could not load the review queue.</p>}
      {!queueError && rows === null && <p role="status">Loading…</p>}
      {!queueError && rows?.length === 0 && <p>No open requests.</p>}
      {!queueError && rows?.map(row => <article key={row.id} aria-label={`Request from ${row.email}`} style={{ display: 'grid', gap: 6, padding: 12, border: '1px solid currentColor' }}>
        <strong>{row.email}</strong>
        <span>Age band: {row.ageBand} · {PURPOSE_LABEL[row.purpose]} · {day(row.createdAt)}</span>
        <p>{row.note || 'No note.'}</p>
        <div className="action-footer">
          <button type="button" className="btn-secondary" aria-label={`Deny request from ${row.email}`} onClick={() => setPending({ kind: 'decide', row, decision: 'denied' })}>Deny</button>
          <button type="button" className="btn-primary" aria-label={`Approve request from ${row.email}`} onClick={() => setPending({ kind: 'decide', row, decision: 'approved' })}>Approve</button>
        </div>
      </article>)}
    </section>

    <section aria-labelledby="admin-pause" style={{ display: 'grid', gap: 12 }}>
      <h2 id="admin-pause">Dispute pause</h2>
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); askAccountAction('pause'); }} style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          Account email or id
          <input value={accountId} onChange={event => setAccountId(event.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          Purpose
          <select value={purpose} onChange={event => setPurpose(event.target.value as ReviewPurpose)}>
            {REVIEW_PURPOSES.map(p => <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>)}
          </select>
        </label>
        {formError && <p role="alert" tabIndex={-1} ref={formAlert}>{formError}</p>}
        <div className="action-footer">
          <button type="button" className="btn-secondary" onClick={() => askAccountAction('resume')}>Resume purpose</button>
          <button type="submit" className="btn-primary">Pause purpose</button>
        </div>
      </form>
    </section>

    <section aria-labelledby="admin-retention" style={{ display: 'grid', gap: 12 }}>
      <h2 id="admin-retention">Retention</h2>
      {retentionError && <p>Could not load the retention list.</p>}
      {!retentionError && retention?.length === 0 && <p>Nothing is waiting for removal.</p>}
      {!retentionError && retention && retention.length > 0 && <div style={{ overflowX: 'auto' }}>
        <table aria-label="Retention">
          <thead><tr><th scope="col">Email</th><th scope="col">Purpose</th><th scope="col">Withdrawn</th><th scope="col">Reminder</th><th scope="col">Removal</th><th scope="col">Status</th></tr></thead>
          <tbody>{retention.map(r => <tr key={`${r.email}-${r.purpose}`}>
            <td>{r.email}</td><td>{PURPOSE_LABEL[r.purpose]}</td><td>{day(r.withdrawnAt)}</td><td>{day(r.reminderDueOn)}</td><td>{day(r.removalDueOn)}</td><td>{r.status}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    {pending && <Dialog title={pending.kind === 'decide' ? 'CONFIRM DECISION' : pending.kind === 'pause' ? 'CONFIRM PAUSE' : 'CONFIRM RESUME'} onClose={() => { if (!working) setPending(null); }} pending={working}>
      <div style={{ display: 'grid', gap: 12 }}>
        <p>
          {pending.kind === 'decide'
            ? `${pending.decision === 'approved' ? 'Approve' : 'Deny'} ${PURPOSE_LABEL[pending.row.purpose]} for ${pending.row.email}?`
            : pending.kind === 'pause'
              ? `Pause ${PURPOSE_LABEL[pending.purpose]} for ${pending.account}? It stays paused until you resume it.`
              : `Resume ${PURPOSE_LABEL[pending.purpose]} for ${pending.account}? An adult account returns to normal. A teen account can ask for a new review.`}
        </p>
        <div className="action-footer">
          <button type="button" className="btn-secondary" disabled={working} onClick={() => setPending(null)}>Cancel</button>
          <button type="button" className="btn-primary" disabled={working} onClick={() => void confirm()}>Confirm {verb}</button>
        </div>
      </div>
    </Dialog>}
  </main>;
}
