import { ScrollViewProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { resolveVerticalPadding } from '@/lib/safe-padding';

type SafeEdge = 'top' | 'bottom';

interface ScreenProps extends Pick<ScrollViewProps, 'showsVerticalScrollIndicator'> {
  children: ReactNode;
  /**
   * Safe-area edges to respect. Tab screens use ['top'] (the tab bar already
   * covers the bottom inset); bottom-sheet screens use [].
   */
  edges?: SafeEdge[];
  /** Render inside a keyboard-aware scroll view (default true). Pass false for non-scrolling containers. */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  /** Extra padding stacked on top of the top safe-area inset (replaces former hardcoded paddingTop values). */
  topGap?: number;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

/** Flattened view style, narrowed to the padding keys we need to reason about. */
type FlatPadding = {
  paddingTop?: unknown;
  paddingBottom?: unknown;
  paddingVertical?: unknown;
};

/**
 * Shared screen scaffold (improvement-pass items #1 and #6): every route
 * opts into safe-area insets + keyboard-aware scrolling through this one
 * component instead of re-solving both per screen. Under edge-to-edge
 * Android, keyboard avoidance is handled by react-native-keyboard-controller.
 *
 * Vertical padding is resolved EXPLICITLY here instead of relying on RN's
 * array-merge: Yoga always resolves a specific edge (paddingTop) over the
 * shorthand (paddingVertical) regardless of array order, which would let the
 * caller's spacing or the safe-area inset silently discard one another.
 * Instead, the caller's intended vertical padding is summed on top of the
 * inset, and every other style property is preserved as-is.
 */
export function Screen({
  children,
  edges = ['top'],
  scroll = true,
  style,
  contentContainerStyle,
  topGap = 0,
  showsVerticalScrollIndicator = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const withSafePadding = <T extends FlatPadding>(flat: T): T => ({
    ...flat,
    ...(edges.includes('top')
      ? { paddingTop: insets.top + topGap + resolveVerticalPadding(flat).top }
      : null),
    ...(edges.includes('bottom')
      ? { paddingBottom: insets.bottom + resolveVerticalPadding(flat).bottom }
      : null),
  });

  if (!scroll) {
    const flat = (StyleSheet.flatten(style) ?? {}) as FlatPadding & ViewStyle;
    return <View style={{ flex: 1, ...withSafePadding(flat) }}>{children}</View>;
  }

  const flatContent = (StyleSheet.flatten(contentContainerStyle) ?? {}) as FlatPadding & ViewStyle;
  return (
    <KeyboardAwareScrollView
      style={[styles.fill, style]}
      contentContainerStyle={withSafePadding(flatContent)}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}>
      {children}
    </KeyboardAwareScrollView>
  );
}