import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';
import { Button } from './button';

interface Props {
  kind: 'loading' | 'empty' | 'error';
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
}

/**
 * One loading / empty / error treatment for every screen. The copy is the caller's; tone and live-region role are ours.
 * The announced group holds only the copy: the Retry button sits outside it so screen readers can still reach it.
 */
export function StateBlock({ kind, title, onRetry, retryLabel = 'Retry', children }: Props) {
  const t = useTokens();
  const role = kind === 'loading' ? 'progressbar' : kind === 'error' ? 'alert' : undefined;
  const live = kind === 'loading' ? 'polite' : kind === 'error' ? 'assertive' : 'none';
  return (
    <View style={styles.block}>
      <View accessible={role !== undefined} accessibilityRole={role} accessibilityLiveRegion={live} style={styles.copy}>
        {kind === 'loading' ? <ActivityIndicator color={t.accent} accessibilityElementsHidden /> : null}
        {title ? <Text style={[styles.title, { color: t['dim-flat'], fontFamily: fonts.display }]}>{title}</Text> : null}
        {children ? (
          <Text style={[styles.body, { color: kind === 'error' ? t.danger : t['dim-flat'], fontFamily: fonts.body }]}>{children}</Text>
        ) : null}
      </View>
      {kind === 'error' && onRetry ? <Button variant="secondary" label={retryLabel} onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingVertical: 40, paddingHorizontal: 16, alignItems: 'center', gap: 10 },
  copy: { alignItems: 'center', gap: 10 },
  title: { fontSize: 16, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  body: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
