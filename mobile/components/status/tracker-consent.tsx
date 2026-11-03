import {useEffect, useRef, useState} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import {
  DELIVERED_REMINDER_NOTICE, TRACKER_PURPOSE_NOTICES, copyTrackerRevision, formatError, setTrackerConsent,
  type TrackerAccess, type TrackerPurpose,
} from '@eiyu/shared';
import {ReviewRequest} from '@/components/status/review-request';
import {fonts} from '@/constants/eiyu-theme';
import {useTokens} from '@/contexts/theme-store';
import {TRACKER_MESSAGES, safeTrackerErrorKind, trackerErrorMessage, type NoticeAudience} from '@/contexts/tracker-access';

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
  ? ({granted: 'customConsent', authority: 'customAuthorityState'} as const)
  : ({granted: 'fitnessConsent', authority: 'fitnessAuthorityState'} as const);

/** One optional tracker purpose: its notice and a server-confirmed grant or withdrawal. Never writes on mount. */
export function TrackerConsent({userId, access, purpose, mode = 'profile', onChanged, onStale, onDecline, declineLabel = 'Not now', audience}: Props) {
  const t = useTokens();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remindersNote, setRemindersNote] = useState(false);
  const operation = useRef(0);
  const latest = useRef({userId, access, purpose, onChanged, onStale});
  latest.current = {userId, access, purpose, onChanged, onStale};

  useEffect(() => {
    const counter = operation;
    counter.current++; setBusy(false); setError(null); setRemindersNote(false);
    return () => { counter.current++; };
  }, [userId, purpose]);

  const body = {fontFamily: fonts.body, color: t['muted-flat'], fontSize: 13, lineHeight: 20};
  if (userId !== access.revision.userId) {
    return <AppText accessibilityRole="alert" style={body}>Permission settings are unavailable for this account.</AppText>;
  }

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
    setBusy(true); setError(null); setRemindersNote(false);
    try {
      const result = await setTrackerConsent(purpose, !granted, notice.version, captured);
      if (current() && result.revision.userId === userId) {
        latest.current.onChanged?.(result);
        // Only custom quests have reminders with their own details, and Android cannot recall what it already delivered.
        if (granted && purpose === 'custom-tracker') setRemindersNote(true);
      }
    } catch (err) {
      if (current()) {
        setError(trackerErrorMessage(err) ?? formatError(err));
        if (safeTrackerErrorKind(err)) latest.current.onStale?.();
      }
    } finally { if (operation.current === revision) setBusy(false); }
  };

  const status = <>
    {authorityBlocked && !granted ? <AppText selectable style={body}>This permission needs review before it can be turned on.</AppText> : null}
    {authority === 'pending' && !granted ? <ReviewRequest userId={userId} purpose={purpose}/> : null}
    {paused && !granted && !authorityBlocked ?<AppText selectable style={body}>{TRACKER_MESSAGES.paused}</AppText> : null}
    {checking ? <AppText style={body}>Checking your account…</AppText> : null}
    {busy ? <AppText style={body}>Saving permission…</AppText> : null}
    {remindersNote ? <AppText selectable style={body}>{DELIVERED_REMINDER_NOTICE}</AppText> : null}
    {error ? <AppText accessibilityRole="alert" style={[body, {color: t.danger}]}>{error}</AppText> : null}
  </>;

  if (mode === 'prompt') {
    return <View style={styles.container} accessibilityLabel={notice.label}>
      {checking ? null : <AppText selectable style={body}>{text}</AppText>}
      {status}
      <View style={styles.actions}>
        <Pressable role="button" aria-label={declineLabel} disabled={busy} onPress={() => onDecline?.()}
          style={[styles.button, busy && styles.disabled]}>
          <AppText style={[body, {color: t['accent-text']}]}>{declineLabel}</AppText>
        </Pressable>
        <Pressable role="button" aria-label={notice.label} disabled={disabled || granted} onPress={() => void change()}
          style={[styles.button, (disabled || granted) && styles.disabled]}>
          <AppText style={[body, {color: t['accent-text']}]}>{notice.label}</AppText>
        </Pressable>
      </View>
    </View>;
  }

  return <View style={styles.container}>
    {checking ? null : <AppText selectable style={body}>{text}</AppText>}
    <Pressable role="checkbox" aria-label={notice.label} accessibilityState={{checked: granted, disabled}}
      disabled={disabled} onPress={() => void change()} style={[styles.choice, disabled && styles.disabled]}>
      <AppText aria-hidden style={{color: t['accent-text'], fontSize: 20}}>{granted ? '☑' : '☐'}</AppText>
      <AppText style={[body, styles.label]}>{notice.label}</AppText>
    </Pressable>
    {status}
  </View>;
}

const styles = StyleSheet.create({
  container: {gap: 8},
  choice: {minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10},
  label: {flex: 1},
  actions: {gap: 8},
  button: {minHeight: 44, justifyContent: 'center', paddingVertical: 10},
  disabled: {opacity: 0.6},
});
