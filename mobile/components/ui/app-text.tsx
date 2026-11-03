import { createContext, forwardRef, useContext, type ReactNode } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { useSharedFontScaleNudge } from '@/contexts/font-scale-nudge';

/** True inside another AppText, where an unstyled child inherits the parent's (already nudged) letterSpacing. */
const InsideAppText = createContext(false);

/** Only element children can hold a nested AppText, so plain strings and numbers skip the extra provider. */
function hasElementChild(children: ReactNode): boolean {
  if (Array.isArray(children)) return children.some(hasElementChild);
  return typeof children === 'object' && children !== null;
}

/**
 * The one text component for app UI. It is a React Native Text, plus the font-scale nudge (lib/font-scale-nudge.ts):
 * after the system font size changes it adds a tiny letterSpacing offset on top of whatever the style already sets, so
 * Android re-measures the text. Nothing is patched at mount, and fontSize/lineHeight/allowFontScaling are untouched.
 */
export const AppText = forwardRef<Text, TextProps>(function AppText({ style, children, ...rest }, ref) {
  const nested = useContext(InsideAppText);
  const base = StyleSheet.flatten(style)?.letterSpacing;
  const nudge = useSharedFontScaleNudge(base);
  // A nested child without its own tracking inherits the parent's nudged value; adding again would drop that tracking.
  const patch = nested && base === undefined ? undefined : nudge;
  return (
    <Text ref={ref} {...rest} style={patch ? [style, patch] : style}>
      {hasElementChild(children) ? <InsideAppText.Provider value>{children}</InsideAppText.Provider> : children}
    </Text>
  );
});
