import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatError } from '@eiyu/shared';

import { Divider } from '@/components/eiyu/divider';
import { GlassView } from '@/components/eiyu/glass-view';
import { ChevronRight, MoonIcon, SunIcon } from '@/components/eiyu/icons';
import { Screen } from '@/components/eiyu/screen';
import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';

export function Toggle({ active }: { active: boolean }) {
  const { theme } = useEiyu();
  return <View style={[styles.toggleTrack, { backgroundColor: active ? theme.accentGlass : 'transparent', borderColor: active ? theme.accentBorder : theme.glassBorder }]}><View style={[styles.toggleThumb, { backgroundColor: active ? theme.accent : theme.dim, left: active ? 22 : 4 }]} /></View>;
}

function ToggleRow({ label, sublabel, value, onChange }: { label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { theme } = useEiyu();
  return <Pressable style={styles.row} onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}><View style={{ flex: 1 }}><Text style={[styles.rowLabel, { color: theme.text, fontFamily: fonts.body }]}>{label}</Text>{sublabel && <Text style={[styles.rowSub, { color: theme.muted, fontFamily: fonts.body }]}>{sublabel}</Text>}</View><Toggle active={value} /></Pressable>;
}

function ActionRow({ label, sublabel, danger, onPress }: { label: string; sublabel?: string; danger?: boolean; onPress: () => void }) {
  const { theme } = useEiyu();
  return <Pressable style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}><View style={{ flex: 1 }}><Text style={[styles.rowLabel, { color: danger ? '#f87171' : theme.text, fontFamily: fonts.body }]}>{label}</Text>{sublabel && <Text style={[styles.rowSub, { color: theme.muted, fontFamily: fonts.body }]}>{sublabel}</Text>}</View><ChevronRight size={16} color={danger ? '#f87171' : theme.dim} /></Pressable>;
}

export default function SettingsContent({ onClose, embedded = false }: { onClose?: () => void; embedded?: boolean }) {
  const { theme, darkMode, setDarkMode, notificationsEnabled, setNotificationsEnabled } = useEiyu();
  const { signOut } = useAuth();
  const [reminderSound, setReminderSound] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const logout = async () => { if (signOutPending) return; setSignOutPending(true); setSignOutError(null); const { error } = await signOut(); if (error) setSignOutError(formatError(error)); setSignOutPending(false); };

  return <Screen contentContainerStyle={styles.scroll} topGap={16}>
    <Text style={[styles.title, { color: theme.text, fontFamily: fonts.display }]}>Settings</Text>
    <View style={styles.section}><Text style={[styles.sectionLabel, { color: theme.dim, fontFamily: fonts.display }]}>APPEARANCE</Text><GlassView style={styles.sectionCard}><Pressable style={styles.row} onPress={() => setDarkMode(!darkMode)} accessibilityRole="switch" accessibilityState={{ checked: darkMode }} accessibilityLabel="Dark theme"><View style={styles.themeRowLeft}><SunIcon size={16} color={darkMode ? theme.muted : theme.accent} /><View><Text style={[styles.rowLabel, { color: theme.text, fontFamily: fonts.body }]}>{darkMode ? 'Dark Theme' : 'Light Theme'}</Text><Text style={[styles.rowSub, { color: theme.muted, fontFamily: fonts.body }]}>{darkMode ? 'Deep navy glass aesthetic' : 'Soft azure glass aesthetic'}</Text></View></View><View style={styles.themeRowRight}><MoonIcon size={16} color={darkMode ? theme.accent : theme.muted} /><Toggle active={darkMode} /></View></Pressable></GlassView></View>
    <View style={styles.section}><Text style={[styles.sectionLabel, { color: theme.dim, fontFamily: fonts.display }]}>NOTIFICATIONS</Text><GlassView style={styles.sectionCard}><ToggleRow label="Quest Reminders" sublabel="Notify when quest time arrives" value={notificationsEnabled} onChange={setNotificationsEnabled} /><Divider /><ToggleRow label="Sound Effects" sublabel="Play sound on completion" value={reminderSound} onChange={setReminderSound} /></GlassView></View>
    <View style={styles.section}><Text style={[styles.sectionLabel, { color: theme.dim, fontFamily: fonts.display }]}>PROGRESS</Text><GlassView style={styles.sectionCard}><ActionRow label="Quest History" sublabel="Calendar of past completions" onPress={() => { onClose?.(); router.push('/history'); }} /></GlassView></View>
    {!embedded && <View style={styles.section}><Text style={[styles.sectionLabel, { color: theme.dim, fontFamily: fonts.display }]}>ACCOUNT</Text><GlassView style={styles.sectionCard}><ActionRow label="Export Data" sublabel="Download your progress as JSON" onPress={() => Alert.alert('Exporting data...')} /><Divider /><ActionRow label={signOutPending ? 'Signing Out…' : 'Sign Out'} danger onPress={() => void logout()} />{signOutError && <Text accessibilityRole="alert" style={styles.error}>{signOutError}</Text>}</GlassView></View>}
    <Text style={[styles.version, { color: theme.dim }]}>Eiyu System v0.1.0</Text>
  </Screen>;
}

const styles = StyleSheet.create({ scroll: { paddingHorizontal: 16, paddingBottom: 100 }, title: { fontSize: 22, letterSpacing: 0.5, marginBottom: 20 }, section: { marginBottom: 12 }, sectionLabel: { fontSize: 11, letterSpacing: 1.5, marginBottom: 4, paddingLeft: 4 }, sectionCard: { paddingHorizontal: 16 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 }, rowLabel: { fontSize: 14, fontWeight: '500' }, rowSub: { fontSize: 12, marginTop: 1 }, themeRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }, themeRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 }, toggleTrack: { width: 42, height: 24, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center' }, toggleThumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, top: 3 }, error: { color: '#f87171', fontFamily: 'Inter_400Regular', fontSize: 12, paddingBottom: 12 }, version: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 11, textAlign: 'center', marginTop: 24 } });
