import { useEffect, useRef, useState } from 'react';
import {
  TRACKER_PURPOSE_NOTICES, copyTrackerRevision, formatError, setTrackerConsent,
  type TrackerAccess, type TrackerPurpose,
} from '@eiyu/shared';
import { ReviewRequest } from './ReviewRequest';
import { TRACKER_MESSAGES, safeTrackerErrorKind, trackerErrorMessage, type NoticeAudience } from '../store/tracker';

type Props = {
  userId: string;
  access: TrackerAccess;
  purpose: TrackerPurpose;
  /** `profile` is the standing checkbox; `prompt` asks at the moment a person picks the optional editor. */
  mode?: 'profile' | 'prompt';
  onChanged?: (access: TrackerAccess) => void;
  /** The capability moved under this request (or was refused): the owner of the control re-reads it. */
  onStale?: () => void;
  onDecline?: () => void;
  declineLabel?: string;
  /** Declared age band: `teen` shows the 12-17 explanation; absent or unknown shows the adult notice; `checking` shows neither and holds the grant. */
  audience?: NoticeAudience;
};

const fieldsFor = (purpose: TrackerPurpose) => purpose === 'custom-tracker'
  ? ({ granted: 'customConsent', authority: 'customAuthorityState' } as const)
  : ({ granted: 'fitnessConsent', authority: 'fitnessAuthorityState' } as const);

/** One optional tracker purpose: its notice and a server-confirmed grant or withdrawal. Never writes on mount. */
export function TrackerConsent({ userId, access, purpose, mode = 'profile', onChanged, onStale, onDecline, declineLabel = 'Not now', audience }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(0);
  const latest = useRef({ userId, access, purpose, onChanged, onStale });
  latest.current = { userId, access, purpose, onChanged, onStale };
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const counter = operation;
    counter.current++; setBusy(false); setError(null);
    return () => { counter.current++; };
  }, [userId, purpose]);
  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);

  if (userId !== access.revision.userId) return <p role="alert">Permission settings are unavailable for this account.</p>;

  const notice = TRACKER_PURPOSE_NOTICES[purpose];
  const text = audience === 'teen' ? notice.childBody : notice.body;
  const keys = fieldsFor(purpose);
  const granted = access[keys.granted];
  const authority = access[keys.authority];
  const authorityBlocked = authority === 'pending' || authority === 'revoked';
  const paused = !access.canWriteBasic;
  // Nobody agrees to a notice they have not been shown, so a grant also waits for the age answer.
  const checking = audience === 'checking';
  // Withdrawal is always open; only turning a purpose on waits for authority and an unpaused account.
  const blocked = !granted && (authorityBlocked || paused || checking);
  const disabled = busy || blocked;

  const change = async () => {
    if (disabled || userId !== access.revision.userId) return;
    // Copy before any await so a later refresh cannot retarget this request.
    const captured = copyTrackerRevision(access.revision);
    const revision = ++operation.current;
    const current = () => operation.current === revision && latest.current.userId === userId
      && latest.current.access.revision.userId === userId && latest.current.purpose === purpose;
    setBusy(true); setError(null);
    try {
      const result = await setTrackerConsent(purpose, !granted, notice.version, captured);
      if (current() && result.revision.userId === userId) latest.current.onChanged?.(result);
    } catch (err) {
      if (current()) {
        setError(trackerErrorMessage(err) ?? formatError(err));
        if (safeTrackerErrorKind(err)) latest.current.onStale?.();
      }
    } finally { if (operation.current === revision) setBusy(false); }
  };

  const status = <>
    {authorityBlocked && !granted && <p>This permission needs review before it can be turned on.</p>}
    {authority === 'pending' && !granted && <ReviewRequest userId={userId} purpose={purpose} />}
    {paused && !granted && !authorityBlocked && <p>{TRACKER_MESSAGES.paused}</p>}
    {checking && <p role="status">Checking your account…</p>}
    {busy && <p role="status">Saving permission…</p>}
    {error && <p role="alert" tabIndex={-1} ref={alertRef}>{error}</p>}
  </>;

  if (mode === 'prompt') {
    return <section style={{ display: 'grid', gap: 8 }} aria-label={notice.label}>
      {!checking && <p>{text}</p>}
      {status}
      <div className="action-footer">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => onDecline?.()}>{declineLabel}</button>
        <button type="button" className="btn-primary" disabled={disabled || granted} onClick={() => void change()}>{notice.label}</button>
      </div>
    </section>;
  }

  return <section style={{ display: 'grid', gap: 8 }}>
    {!checking && <p>{text}</p>}
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44, paddingBlock: 10 }}>
      <input type="checkbox" checked={granted} disabled={disabled} onChange={() => void change()} />
      <span>{notice.label}</span>
    </label>
    {status}
  </section>;
}
