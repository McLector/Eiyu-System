import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlusIcon } from '@/components/eiyu/icons';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling content (Save, Cancel). */
  footer?: ReactNode;
  /** When false the back button and a tap outside do nothing, and there is no Close button (a save is in flight). */
  dismissible?: boolean;
  testID?: string;
}

/**
 * A bottom sheet on the system Modal: the back button, a tap outside and the Close button all close it, the content
 * scrolls instead of clipping (200% font), and it never grows past 90% of the screen.
 */
export function Sheet({ visible, title, onClose, children, footer, dismissible = true, testID = 'sheet' }: Props) {
  const t = useTokens();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const close = () => { if (dismissible) onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close} testID={testID}>
      <View style={styles.root}>
        <Pressable
          testID={`${testID}-backdrop`}
          accessible={false}
          importantForAccessibility="no"
          onPress={close}
          style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]}
        />
        <View
          testID={`${testID}-panel`}
          accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: t.modal, borderColor: t['accent-border'], maxHeight: height * 0.9 }]}>
          <View style={styles.header}>
            {title ? (
              <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>{title}</Text>
            ) : <View style={styles.titleSpacer} />}
            {dismissible ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
                <View style={styles.closeGlyph}><PlusIcon size={20} color={t['muted-flat']} /></View>
              </Pressable>
            ) : null}
          </View>
          <ScrollView testID={`${testID}-scroll`} keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
          {footer ? (
            <View
              testID={`${testID}-footer`}
              style={[styles.footer, { borderTopColor: t['divider-flat'], paddingBottom: 12 + insets.bottom }]}>
              {footer}
            </View>
          ) : <View style={{ height: insets.bottom }} />}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: { borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 4, minHeight: 56 },
  title: { flex: 1, fontSize: 20, letterSpacing: 1, textTransform: 'uppercase' },
  titleSpacer: { flex: 1 },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { transform: [{ rotate: '45deg' }] },
  scroll: { flexShrink: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 16 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
});
