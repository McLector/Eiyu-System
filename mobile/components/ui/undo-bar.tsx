import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { UndoIcon } from '@/components/eiyu/icons';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';
import { Button } from './button';

interface Props {
  message: string;
  actionLabel?: string;
  /** Runs when Undo is pressed. May be async; the bar waits for it and then dismisses, even if it throws (the caller reports that). */
  onAction?: () => void | Promise<void>;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onDismiss: () => void;
  durationMs?: number;
}

/**
 * The notice that follows an archive (or any undoable action): a flat warning-toned card that dismisses itself after a
 * while. Holding a button down pauses the countdown, and it resumes with the time that was left.
 */
export function UndoBar({ message, actionLabel = 'Undo', onAction, secondaryLabel, onSecondary, onDismiss, durationMs = 8000 }: Props) {
  const t = useTokens();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const remaining = useRef(durationMs);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);

  const start = () => {
    startedAt.current = Date.now();
    timer.current = setTimeout(() => dismiss.current(), remaining.current);
  };
  const pause = () => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
  };
  const resume = () => {
    if (timer.current === null && !running.current) start();
  };

  useEffect(() => {
    start();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  const undo = async () => {
    if (running.current) return;
    running.current = true;
    pause();
    setBusy(true);
    try { await onAction?.(); } catch { /* the caller reports its own failure */ }
    dismiss.current();
  };

  const secondary = () => {
    pause();
    onSecondary?.();
    dismiss.current();
  };

  return (
    <View testID="undo-bar" style={[styles.bar, { backgroundColor: t['panel-flat'], borderColor: t['warning-border'] }]}>
      <Text accessibilityLiveRegion="polite" style={[styles.message, { color: t.text, fontFamily: fonts.body }]}>{message}</Text>
      <View style={styles.actions}>
        {onAction ? (
          <Button
            variant="quiet"
            label={actionLabel}
            busy={busy}
            icon={<UndoIcon size={14} color={t['muted-flat']} />}
            onPress={() => void undo()}
            onPressIn={pause}
            onPressOut={resume}
          />
        ) : null}
        {secondaryLabel ? (
          <Button variant="secondary" label={secondaryLabel} onPress={secondary} onPressIn={pause} onPressOut={resume} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderWidth: 1, borderRadius: 4, padding: 12, gap: 8 },
  message: { fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
});
