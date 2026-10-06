import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { EyeIcon, EyeOffIcon } from '@/components/eiyu/icons';
import { Field, type FieldProps } from '@/components/ui/field';
import { useTokens } from '@/contexts/theme-store';

/** A password field with an eye button that reveals what was typed. Starts hidden, and the state is local to the field. */
export function PasswordField(props: Omit<FieldProps, 'secureTextEntry' | 'trailing'>) {
  const t = useTokens();
  const [shown, setShown] = useState(false);
  const name = props.label.toLowerCase();
  const Icon = shown ? EyeOffIcon : EyeIcon;
  return (
    <Field
      {...props}
      secureTextEntry={!shown}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${shown ? 'Hide' : 'Show'} ${name}`}
          accessibilityState={{ checked: shown }}
          hitSlop={4}
          onPress={() => setShown(value => !value)}
          style={styles.toggle}>
          <Icon size={20} color={t['muted-flat']} />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  toggle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
