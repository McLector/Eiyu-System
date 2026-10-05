import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTokens } from '@/contexts/theme-store';

const CORNERS = {
  tl: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  tr: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
  bl: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
  br: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
} as const;

/**
 * A flat panel with a hairline border and four corner brackets. Reserve it for the one or two "look here" panels on a
 * screen; everything else sits on the page with dividers and no frame.
 */
export function SignaturePanel({ children, tint, style, testID }: { children: ReactNode; tint?: string; style?: StyleProp<ViewStyle>; testID?: string }) {
  const t = useTokens();
  const bracket = tint ?? t.accent;
  return (
    <View
      testID={testID}
      style={[styles.panel, { backgroundColor: t['panel-flat'], borderColor: tint ?? t['panel-border'] }, style]}>
      {(Object.keys(CORNERS) as (keyof typeof CORNERS)[]).map(name => (
        <View
          key={name}
          testID={`panel-corner-${name}`}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.corner, CORNERS[name], { borderColor: bracket }]}
        />
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 4 },
  corner: { position: 'absolute', width: 10, height: 10 },
});
