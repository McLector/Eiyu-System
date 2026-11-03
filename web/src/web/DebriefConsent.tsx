import {useEffect, useRef, useState} from 'react';
import {ReviewRequest} from './ReviewRequest';
import {formatError, PROCESSING_AUTHORITY_REVIEW, PROCESSING_NOTICES, setProcessingConsent, type ProcessingAccess} from '@eiyu/shared';
type Props = {userId: string; access: ProcessingAccess; purpose?: 'age-screening' | 'weekly-debrief'; onChanged?: (status: ProcessingAccess) => void};
const revisions = ['ageVersion', 'consentVersion', 'authorityVersion', 'mailboxVersion'] as const;
export function DebriefConsent({userId, access, purpose = 'weekly-debrief', onChanged}: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const operation = useRef(0), latest = useRef({userId, access, purpose, onChanged});
  latest.current = {userId, access, purpose, onChanged};
  useEffect(() => {
    const counter = operation;
    counter.current++; setBusy(false); setError(null);
    return () => {counter.current++;};
  }, [userId, purpose]);
  const notice = PROCESSING_NOTICES[purpose];
  const granted = purpose === 'age-screening' ? access.ageConsent : access.aiConsent;
  const authorityBlocked = access.authorityState === 'pending' || access.authorityState === 'revoked';
  const disabled = busy || (purpose === 'weekly-debrief' && !granted && (authorityBlocked || !access.ageConsent));
  const change = async () => {
    if (disabled || userId !== access.userId) return;
    const captured = {...access}, revision = ++operation.current;
    const current = () => operation.current === revision && latest.current.userId === userId
      && latest.current.access.userId === userId && latest.current.purpose === purpose
      && revisions.every(key => latest.current.access[key] === captured[key]);
    setBusy(true); setError(null);
    try {
      const result = await setProcessingConsent(purpose, !granted, notice.version, captured);
      if (current() && result.userId === userId) latest.current.onChanged?.(result);
    } catch (err) {if (current()) setError(formatError(err));}
    finally {if (operation.current === revision) setBusy(false);}
  };
  if (userId !== access.userId) return <p role="alert">Permission settings are unavailable for this account.</p>;
  return <section style={{display: 'grid', gap: 8}}>
    <p>{notice.body}</p>
    {purpose === 'weekly-debrief' && authorityBlocked && <p>{PROCESSING_AUTHORITY_REVIEW}</p>}
    {purpose === 'weekly-debrief' && access.authorityState === 'pending' && !granted && <ReviewRequest userId={userId} purpose="weekly-debrief"/>}
    {purpose === 'weekly-debrief' && !access.ageConsent && <p>Review the birthday permission in Profile before turning on AI.</p>}
    <label style={{display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44, paddingBlock: 10}}>
      <input type="checkbox" checked={granted} disabled={disabled} onChange={() => void change()}/>
      <span>{notice.label}</span>
    </label>
    {busy && <p role="status">Saving permission…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
