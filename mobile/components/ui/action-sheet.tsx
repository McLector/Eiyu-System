import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';
import { Sheet } from './sheet';

export interface SheetAction {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onSelect: (key: string) => void;
  onClose: () => void;
}

/** A Sheet whose body is a list of actions: the phone version of web's overflow menu. Choosing one reports it, then closes. */
export function ActionSheet({ visible, title, actions, onSelect, onClose }: Props) {
  const t = useTokens();
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      {actions.map(action => (
        <Pressable
          key={action.key}
          accessibilityRole="menuitem"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: !!action.disabled }}
          disabled={action.disabled}
          onPress={() => { onSelect(action.key); onClose(); }}
          style={[styles.row, { borderBottomColor: t['divider-flat'] }, action.disabled && styles.disabled]}>
          {action.icon ? <View style={styles.icon}>{action.icon}</View> : null}
          <Text style={[styles.label, { color: action.destructive ? t.danger : t.text, fontFamily: fonts.display }]}>{action.label}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 24, alignItems: 'center' },
  label: { fontSize: 15, letterSpacing: 0.6, flexShrink: 1 },
  disabled: { opacity: 0.45 },
});
