import {useEffect, useRef, useState} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import {formatError, PROCESSING_AUTHORITY_REVIEW, PROCESSING_NOTICES, setProcessingConsent, type ProcessingAccess} from '@eiyu/shared';
import {ReviewRequest} from '@/components/status/review-request';
import {fonts} from '@/constants/eiyu-theme';
import {useTokens} from '@/contexts/theme-store';

type Props = {userId: string; access: ProcessingAccess; purpose?: 'age-screening' | 'weekly-debrief'; onChanged?: (status: ProcessingAccess) => void};
const revisions = ['ageVersion', 'consentVersion', 'authorityVersion', 'mailboxVersion'] as const;
export function DebriefConsent({userId, access, purpose = 'weekly-debrief', onChanged}: Props) {
  const t = useTokens();
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
  if (userId !== access.userId) return <AppText accessibilityRole="alert">Permission settings are unavailable for this account.</AppText>;
  const body = {fontFamily: fonts.body, color: t['muted-flat'], fontSize: 13, lineHeight: 20};
  return <View style={styles.container}>
    <AppText selectable style={body}>{notice.body}</AppText>
    {purpose === 'weekly-debrief' && authorityBlocked ? <AppText selectable style={body}>{PROCESSING_AUTHORITY_REVIEW}</AppText> : null}
    {purpose === 'weekly-debrief' && !access.ageConsent ? <AppText style={body}>Review the birthday permission in Profile before turning on AI.</AppText> : null}
    {purpose === 'weekly-debrief' && access.authorityState === 'pending' && !granted ? <ReviewRequest userId={userId} purpose="weekly-debrief"/> : null}
    <Pressable role="checkbox" aria-label={notice.label} accessibilityState={{checked: granted, disabled}}
      disabled={disabled} onPress={() => void change()} style={[styles.choice, disabled && styles.disabled]}>
      <AppText aria-hidden style={{color: t['accent-text'], fontSize: 20}}>{granted ? '☑' : '☐'}</AppText>
      <AppText style={[body, styles.label]}>{notice.label}</AppText>
    </Pressable>
    {busy ? <AppText accessibilityRole="text" style={body}>Saving permission…</AppText> : null}
    {error ? <AppText accessibilityRole="alert" style={[body, {color: t.danger}]}>{error}</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({container: {gap: 8}, choice: {minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10}, label: {flex: 1}, disabled: {opacity: 0.6}});
