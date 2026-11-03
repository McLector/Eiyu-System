import { forwardRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { useSharedFontScaleNudge } from '@/contexts/font-scale-nudge';

/** The one text input for app UI: a React Native TextInput plus the same font-scale nudge as AppText. */
export const AppTextInput = forwardRef<TextInput, TextInputProps>(function AppTextInput({ style, ...rest }, ref) {
  const nudge = useSharedFontScaleNudge(StyleSheet.flatten(style)?.letterSpacing);
  return <TextInput ref={ref} {...rest} style={nudge ? [style, nudge] : style} />;
});
