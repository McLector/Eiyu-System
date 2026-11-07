import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { fetchMailboxStatus, sendMailboxCode, verifyMailboxCode, formatError, MAILBOX_MESSAGE, type MailboxChallenge, type MailboxStatus } from '@eiyu/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

type Notice = 'sent' | 'resumed' | 'expired' | 'verified' | null;
// The limit is applied here rather than with maxLength: a native maxLength would cut a pasted "123 456 789 0"
// before the spaces could be removed.
const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 10);

export function MailboxVerification({ userId, onVerified, refreshRevision = 0, purpose = 'weekly-debrief' }: { userId: string; onVerified: () => void; refreshRevision?: number; purpose?: 'weekly-debrief' | 'account-export' }) {
  const t = useTokens();
  const [status, setStatus] = useState<MailboxStatus | null>(null);
  const [challenge, setChallengeState] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  // `epoch` guards status reads, which every refresh supersedes. `scope` guards
  // user actions (send, verify, check): a passive refresh must not discard an
  // answer still in flight, only a change of account, purpose or unmount does.
  const epoch = useRef(0);
  const scope = useRef(0);
  const owner = useRef(userId);
  const ownerPurpose = useRef(purpose);
  const acting = useRef(false);
  const observed = useRef<MailboxStatus | null>(null);
  const done = useRef(onVerified);
  // The code id on screen, readable from callbacks that outlive a render.
  const held = useRef<string | null>(null);
  // Counts finished sends. A status read that began before a send finished describes the server as it was
  // before that code existed, so it must not say "no code" afterwards.
  const sends = useRef(0);
  const setChallenge = useCallback((id: string | null) => { held.current = id; setChallengeState(id); }, []);
  // The server's word on the pending code: adopt a new one (an app restart, or a code sent from another device),
  // or drop the one on screen once the server no longer has it (expired, finished, or the email changed).
  const reconcile = useCallback((pending: MailboxChallenge | null, sendsAtStart: number) => {
    if (sends.current !== sendsAtStart) return;
    if (pending) {
      if (held.current === pending.id) return;
      setChallenge(pending.id); setCode(''); setRemaining(pending.resendAfter); setNotice('resumed');
    } else if (held.current) {
      setChallenge(null); setCode(''); setRemaining(0); setNotice('expired');
    }
  }, [setChallenge]);
  useEffect(() => { done.current = onVerified; }, [onVerified]);
  useEffect(() => () => { scope.current++; }, []);
  useEffect(() => {
    const current = ++epoch.current;
    const sendsAtStart = sends.current;
    if (owner.current !== userId || ownerPurpose.current !== purpose) {
      owner.current = userId; ownerPurpose.current = purpose; observed.current = null;
      scope.current++; acting.current = false;
      setStatus(null); setChallenge(null); setCode(''); setRemaining(0); setBusy(false); setSending(false); setNotice(null);
    }
    setError(null);
    void fetchMailboxStatus().then(value => {
      if (epoch.current !== current) return;
      if (value.userId !== userId) throw new Error('Your account changed. Check verification status again.');
      if (observed.current && value.version < observed.current.version) return;
      if (observed.current && value.version !== observed.current.version) {
        if (held.current) setNotice('expired');
        setChallenge(null); setCode('');
      }
      const notify = purpose === 'weekly-debrief' && value.verified && (!observed.current?.verified || value.version !== observed.current.version);
      observed.current = value;
      setStatus(value);
      if (!value.verified) reconcile(value.challenge ?? null, sendsAtStart);
      if (notify) done.current();
    }).catch(err => { if (epoch.current === current) setError(formatError(err)); });
    return () => { epoch.current = current + 1; };
  }, [userId, refreshRevision, purpose, reconcile, setChallenge]);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining(n => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  const act = async (action: 'send' | 'verify' | 'check') => {
    if (busy || acting.current) return;
    const current = scope.current;
    const live = () => scope.current === current;
    const sendsAtStart = sends.current;
    acting.current = true; setBusy(true); setError(null);
    if (action === 'send') { setSending(true); setNotice(null); }
    try {
      if (action === 'verify') {
        if (!challenge || !status) return;
        const verified = await verifyMailboxCode(challenge, code.trim(), status);
        if (live()) { observed.current = verified; setStatus(verified); setCode(''); setChallenge(null); setRemaining(0); setNotice('verified'); done.current(); }
      } else {
        const fresh = await fetchMailboxStatus();
        if (!live()) return;
        if (fresh.userId !== userId) throw new Error('Your account changed. Check verification status again.');
        if (status && fresh.version !== status.version) {
          if (held.current) setNotice('expired');
          setChallenge(null); setCode('');
        }
        observed.current = fresh; setStatus(fresh);
        if (fresh.verified) { done.current(); return; }
        if (action === 'check') reconcile(fresh.challenge ?? null, sendsAtStart);
        if (action === 'send') {
          // A refresh that saw a different mailbox version means the email changed under this request.
          const sentFor = fresh.version;
          const next = await sendMailboxCode();
          if (live() && (observed.current?.version ?? sentFor) === sentFor) {
            sends.current++;
            setChallenge(next.challengeId); setCode(''); setRemaining(next.retryAfter); setNotice('sent');
          }
        }
      }
    } catch (err) { if (live()) setError(formatError(err)); }
    finally { if (live()) { acting.current = false; setBusy(false); setSending(false); } }
  };
  const showBox = !!challenge && !status?.verified;
  const noticeText = notice === 'expired' ? 'That code expired. Send a new one.'
    : notice === 'verified' && status?.verified ? 'Email verified'
    : notice === 'sent' && showBox ? 'We sent a code to your email. It lasts 10 minutes.'
    : notice === 'resumed' && showBox ? 'A code is waiting. Enter it below, or send a new one.'
    : null;
  const noticeColor = notice === 'expired' ? t.warning : notice === 'verified' ? t.success : t['muted-flat'];
  return <View style={{ gap: 10 }}>
    <AppText style={{ fontFamily: fonts.body, color: t['muted-flat'] }}>{purpose === 'account-export' ? 'Verify your email to download your account data.' : MAILBOX_MESSAGE} Your quests remain available.</AppText>
    {error && <AppText accessibilityRole="alert" style={{ fontFamily: fonts.body, color: t.danger }}>{error}</AppText>}
    {!status && !error && <AppText style={{ fontFamily: fonts.body, color: t['muted-flat'] }}>Checking verification status…</AppText>}
    {sending && <AppText accessibilityLiveRegion="polite" style={{ fontFamily: fonts.body, color: t['muted-flat'] }}>Sending your code…</AppText>}
    {!sending && noticeText && <AppText accessibilityLiveRegion="polite" style={{ fontFamily: fonts.body, color: noticeColor }}>{noticeText}</AppText>}
    {showBox && <View style={{ gap: 10 }}>
      <Field label="Verification code" hint="Enter the code from your email" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode"
        autoCorrect={false} value={code} onChangeText={value => setCode(digitsOnly(value))} editable={!busy}
        style={{ minHeight: 56, borderWidth: 2, borderRadius: 8, fontFamily: fonts.monoSemi, fontSize: 24, letterSpacing: 6, textAlign: 'center' }} />
      <Button variant="primary" label="Verify code" busy={busy} disabled={busy || !/^\d{6,10}$/.test(code.trim())} onPress={() => void act('verify')} />
    </View>}
    {status && <Button variant="secondary" disabled={busy || remaining > 0} onPress={() => void act('send')}
      label={remaining > 0 ? `Resend in ${remaining}s` : challenge ? 'Resend verification email' : 'Send verification email'} />}
    <Button variant="secondary" label="Check verification status" disabled={busy} onPress={() => void act('check')} />
  </View>;
}
