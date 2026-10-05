import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';

import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

export type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  hint?: string;
  style?: StyleProp<TextStyle>;
};

/** A labelled text input. The label stays as written (caps come from style) and doubles as the screen-reader name. */
export function Field({ label, error, hint, accessibilityLabel, multiline, onFocus, onBlur, style, ...rest }: FieldProps) {
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  const border = error ? t.danger : focused ? t.accent : t['glass-border'];
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: t['muted-flat'], fontFamily: fonts.display }]}>{label}</Text>
      <TextInput
        {...rest}
        multiline={multiline}
        accessibilityLabel={accessibilityLabel ?? label}
        placeholderTextColor={t['dim-flat']}
        onFocus={event => { setFocused(true); onFocus?.(event); }}
        onBlur={event => { setFocused(false); onBlur?.(event); }}
        style={[
          styles.input,
          multiline ? styles.multiline : null,
          { backgroundColor: t.track, borderColor: border, color: t.text, fontFamily: fonts.body },
          style,
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.note, { color: t['dim-flat'], fontFamily: fonts.body }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  note: { fontSize: 12, lineHeight: 17 },
});
