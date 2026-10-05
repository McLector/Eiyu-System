import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { PALETTES } from '@eiyu/shared';

import { ChevronRight, MoonIcon, SunIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { useAppTheme, useTokens } from '@/contexts/theme-store';

/** The reminder failure that only the phone's own settings can fix (the system refused the permission). */
const isPermissionWarning = (warning: string) => /permission/i.test(warning);

function Toggle({ on }: { on: boolean }) {
  const t = useTokens();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, { backgroundColor: on ? t['accent-strong'] : t.track, borderColor: on ? t['accent-border'] : t['divider-flat'] }]}>
      <View style={[styles.thumb, { backgroundColor: on ? t.accent : t['dim-flat'], left: on ? 22 : 3 }]} />
    </View>
  );
}

function SwitchRow({ label, sub, value, onChange, disabled, testID, lead, trail }: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testID?: string;
  lead?: ReactNode;
  trail?: ReactNode;
}) {
  const t = useTokens();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, { color: t.text, fontFamily: fonts.body }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: t['dim-flat'], fontFamily: fonts.body }]}>{sub}</Text> : null}
      </View>
      <View style={styles.rowEnd}>
        {lead}
        <Toggle on={value} />
        {trail}
      </View>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  const t = useTokens();
  return <Text accessibilityRole="header" style={[styles.section, { color: t['dim-flat'], fontFamily: fonts.display }]}>{children}</Text>;
}

/** Settings as a bottom sheet from the account menu: appearance, reminders, sound, history. Logout stays in the menu. */
export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTokens();
  const { mode, palette, setMode, setPalette } = useAppTheme();
  const { notificationsEnabled, setNotificationsEnabled, reminderWarning, retryReminders, soundEffectsEnabled, soundEffectsLoaded, setSoundEffectsEnabled } = useEiyu();
  const version = Constants.expoConfig?.version;
  const dark = mode === 'dark';

  const openHistory = () => {
    // The sheet is a Modal, which sits above every route: close it first or History would open underneath it.
    onClose();
    router.push('/history');
  };
  const openPhoneSettings = () => { Linking.openSettings().catch(() => {}); };

  return (
    <Sheet visible={visible} title="SETTINGS" closeLabel="Close Settings" onClose={onClose} testID="settings-sheet">
      <SectionLabel>APPEARANCE</SectionLabel>
      <SwitchRow
        testID="settings-dark-theme"
        label="Dark Theme"
        sub="Switch between light and dark surfaces"
        value={dark}
        onChange={next => setMode(next ? 'dark' : 'light')}
        lead={<SunIcon size={16} color={dark ? t['dim-flat'] : t.accent} />}
        trail={<MoonIcon size={16} color={dark ? t.accent : t['dim-flat']} />}
      />
      <View style={styles.paletteBlock}>
        <Text style={[styles.rowLabel, { color: t.text, fontFamily: fonts.body }]}>Colour palette</Text>
        <Text style={[styles.rowSub, { color: t['dim-flat'], fontFamily: fonts.body }]}>Tints the whole app, in light and dark</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Colour palette" style={styles.palettes}>
          {PALETTES.map(({ id, label, swatch }) => {
            const selected = palette === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ checked: selected, selected }}
                onPress={() => { if (!selected) setPalette(id); }}
                style={[
                  styles.palette,
                  selected
                    ? { backgroundColor: t['accent-glass'], borderColor: t['accent-border'] }
                    : { backgroundColor: 'transparent', borderColor: t['glass-border'] },
                ]}>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.swatch, { backgroundColor: swatch, borderColor: t['glass-border'] }]} />
                <Text style={[styles.paletteLabel, { color: selected ? t['accent-text'] : t['muted-flat'], fontFamily: fonts.body }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: t['divider-flat'] }]} />
      <SectionLabel>FEEDBACK</SectionLabel>
      <SwitchRow label="Quest Reminders" sub="Notify when quest time arrives" value={notificationsEnabled} onChange={setNotificationsEnabled} />
      {reminderWarning ? (
        <View style={styles.warning}>
          <Text accessibilityRole="alert" style={[styles.warningText, { color: t.warning, fontFamily: fonts.body }]}>{reminderWarning}</Text>
          <View style={styles.warningActions}>
            <Button variant="secondary" label="Retry" onPress={() => void retryReminders()} />
            {isPermissionWarning(reminderWarning) ? <Button variant="quiet" label="Open phone settings" onPress={openPhoneSettings} /> : null}
          </View>
        </View>
      ) : null}
      <SwitchRow
        testID="settings-sound-effects"
        label="Sound Effects"
        sub="Play sound on completion"
        value={soundEffectsEnabled}
        disabled={!soundEffectsLoaded}
        onChange={next => { void setSoundEffectsEnabled(next); }}
      />

      <View style={[styles.divider, { backgroundColor: t['divider-flat'] }]} />
      <SectionLabel>PROGRESS</SectionLabel>
      <Pressable accessibilityRole="button" accessibilityLabel="Quest History" onPress={openHistory} style={styles.row}>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowLabel, { color: t.text, fontFamily: fonts.body }]}>Quest History</Text>
          <Text style={[styles.rowSub, { color: t['dim-flat'], fontFamily: fonts.body }]}>Calendar of past completions</Text>
        </View>
        <ChevronRight size={16} color={t['dim-flat']} />
      </Pressable>

      <Text style={[styles.version, { color: t['dim-flat'], fontFamily: fonts.mono }]}>{version ? `Eiyu System v${version}` : 'Eiyu System'}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 11, letterSpacing: 1.4, marginTop: 8, marginBottom: 2, textTransform: 'uppercase' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  disabled: { opacity: 0.5 },
  rowCopy: { flex: 1 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: 15 },
  rowSub: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  track: { width: 44, height: 24, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center' },
  thumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, top: 2.5 },
  paletteBlock: { paddingVertical: 8 },
  palettes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  palette: { minHeight: 48, minWidth: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 4 },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
  paletteLabel: { flexShrink: 1, fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  warning: { paddingBottom: 8, gap: 8 },
  warningText: { fontSize: 13, lineHeight: 18 },
  warningActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  version: { fontSize: 11, textAlign: 'center', marginTop: 20 },
});
