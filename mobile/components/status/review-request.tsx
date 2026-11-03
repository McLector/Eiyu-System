import {useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {OperatorError, REVIEW_NOTE_MAX, cancelAuthorityReview, fetchMyReviewRequests, requestAuthorityReview, type ReviewPurpose} from '@eiyu/shared';
import {AppText} from '@/components/ui/app-text';
import {Button} from '@/components/ui/button';
import {Field} from '@/components/ui/field';
import {fonts} from '@/constants/eiyu-theme';
import {useTokens} from '@/contexts/theme-store';

type Phase = 'idle' | 'form' | 'sending' | 'sent' | 'cancelling';
const SENT = 'Review requested. You will see this permission change if the request is approved.';
const ALREADY = 'You already requested a review. You will see this permission change if it is approved.';

/** Ask the owner to review a pending purpose. Sends a short note only; never IDs or documents. Writes nothing on mount. */
export function ReviewRequest({userId, purpose}: {userId: string; purpose: ReviewPurpose}) {
  const t = useTokens();
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const live = useRef(0);

  useEffect(() => {
    const token = live;
    const run = ++token.current;
    setPhase('idle'); setNote(''); setError(null); setAlready(false);
    // Restore an open request after a relaunch. A failed read keeps the button; a repeat send still recovers from ER002.
    fetchMyReviewRequests(userId).then(rows => {
      if (token.current !== run || !rows.some(row => row.purpose === purpose && row.status === 'open')) return;
      setAlready(true);
      setPhase(current => current === 'idle' ? 'sent' : current);
    }).catch(() => undefined);
    return () => { token.current++; };
  }, [userId, purpose]);

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

  const body = {fontFamily: fonts.body, color: t['muted-flat'], fontSize: 13, lineHeight: 20};
  const errorLine = error ? <AppText accessibilityRole="alert" style={[body, {color: t.danger}]}>{error}</AppText> : null;

  if (phase === 'sent' || phase === 'cancelling') {
    return <View style={styles.container}>
      <AppText accessibilityRole="text" style={body}>{already ? ALREADY : SENT}</AppText>
      {errorLine}
      <Button variant="secondary" label="Cancel review request" disabled={phase === 'cancelling'} onPress={() => void cancel()}/>
    </View>;
  }
  if (phase === 'idle') {
    return <Button variant="secondary" label="Request review" onPress={() => setPhase('form')}/>;
  }
  const sending = phase === 'sending';
  return <View style={styles.container}>
    <Field label="Note (optional)" value={note} multiline maxLength={REVIEW_NOTE_MAX} editable={!sending}
      hint="Don't include IDs or documents" onChangeText={setNote} autoFocus/>
    {errorLine}
    <View style={styles.actions}>
      <Button variant="quiet" label="Not now" disabled={sending} onPress={() => { setError(null); setPhase('idle'); }}/>
      <Button variant="primary" label={sending ? 'Sending…' : 'Send request'} disabled={sending} onPress={() => void send()}/>
    </View>
  </View>;
}

const styles = StyleSheet.create({container: {gap: 8}, actions: {gap: 8}});
