import { useEffect, useId, useRef, useState } from 'react';
import { OperatorError, REVIEW_NOTE_MAX, cancelAuthorityReview, fetchMyReviewRequests, requestAuthorityReview, type ReviewPurpose } from '@eiyu/shared';

type Phase = 'idle' | 'form' | 'sending' | 'sent' | 'cancelling';
const SENT = 'Review requested. You will see this permission change if the request is approved.';
const ALREADY = 'You already requested a review. You will see this permission change if it is approved.';

/** Ask the owner to review a pending purpose. Sends a short note only; never IDs or documents. Writes nothing on mount. */
export function ReviewRequest({ userId, purpose }: { userId: string; purpose: ReviewPurpose }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const hintId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const live = useRef(0);
  const refocusOpen = useRef(false);

  useEffect(() => {
    const token = live;
    const run = ++token.current;
    setPhase('idle'); setNote(''); setError(null); setAlready(false);
    // Restore an open request after a reload. A failed read keeps the button; a repeat send still recovers from ER002.
    fetchMyReviewRequests(userId).then(rows => {
      if (token.current !== run || !rows.some(row => row.purpose === purpose && row.status === 'open')) return;
      setAlready(true);
      setPhase(current => current === 'idle' ? 'sent' : current);
    }).catch(() => undefined);
    return () => { token.current++; };
  }, [userId, purpose]);
  useEffect(() => { if (phase === 'form' && !error) noteRef.current?.focus(); }, [phase, error]);
  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (phase === 'idle' && refocusOpen.current) { refocusOpen.current = false; openRef.current?.focus(); }
  }, [phase]);

  const send = async () => {
    if (phase !== 'form') return;
    const run = ++live.current;
    setPhase('sending'); setError(null);
    try {
      await requestAuthorityReview(purpose, note, userId);
      if (live.current === run) { setAlready(false); setPhase('sent'); }
    } catch (err) {
      if (live.current !== run) return;
      const kind = err instanceof OperatorError ? err.kind : null;
      if (kind === 'already-open') { setAlready(true); setPhase('sent'); return; }
      setError(kind === 'limit' ? 'You have asked too many times today. Try again tomorrow.'
        : kind === 'not-needed' ? 'No review is needed for this permission right now.'
        : 'We could not send your request. Try again later.');
      setPhase('form');
    }
  };
  const cancel = async () => {
    if (phase !== 'sent') return;
    const run = ++live.current;
    setPhase('cancelling'); setError(null);
    try {
      await cancelAuthorityReview(purpose, userId);
      if (live.current === run) { setNote(''); setAlready(false); setPhase('idle'); }
    } catch {
      if (live.current === run) { setError('We could not cancel your request. Try again later.'); setPhase('sent'); }
    }
  };
  const errorLine = error && <p role="alert" tabIndex={-1} ref={alertRef}>{error}</p>;

  if (phase === 'sent' || phase === 'cancelling') {
    return <div style={{ display: 'grid', gap: 8 }}>
      <p role="status">{already ? ALREADY : SENT}</p>
      {errorLine}
      <button type="button" className="btn-secondary" disabled={phase === 'cancelling'} onClick={() => void cancel()}>Cancel review request</button>
    </div>;
  }
  if (phase === 'idle') {
    return <button ref={openRef} type="button" className="btn-secondary" onClick={() => setPhase('form')}>Request review</button>;
  }
  const sending = phase === 'sending';
  return <div style={{ display: 'grid', gap: 8 }}>
    <label style={{ display: 'grid', gap: 4 }}>
      Note (optional)
      <textarea ref={noteRef} value={note} rows={3} maxLength={REVIEW_NOTE_MAX} disabled={sending} aria-describedby={hintId}
        onChange={event => setNote(event.target.value)} />
    </label>
    <p id={hintId}>Don&apos;t include IDs or documents</p>
    {errorLine}
    <div className="action-footer">
      <button type="button" className="btn-secondary" disabled={sending} onClick={() => { refocusOpen.current = true; setError(null); setPhase('idle'); }}>Not now</button>
      <button type="button" className="btn-primary" disabled={sending} onClick={() => void send()}>{sending ? 'Sending…' : 'Send request'}</button>
    </div>
  </div>;
}
