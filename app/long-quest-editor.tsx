import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { StatIcon } from '@/components/eiyu/icons';
import { STATS, STAT_COLORS } from '@/constants/eiyu-data';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { formatError } from '@/lib/format-error';
import { Stat } from '@/types/eiyu';

const MIN_STAGES = 2;
const MAX_STAGES = 8;

export default function LongQuestEditorScreen() {
  const { theme, saveLongQuest } = useEiyu();
  const [name, setName] = useState('');
  const [stat, setStat] = useState<Stat>('INT');
  const [stages, setStages] = useState<string[]>(['', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStageAt = (i: number, value: string) => {
    setStages(prev => prev.map((s, idx) => (idx === i ? value : s)));
  };

  const addStage = () => {
    if (stages.length >= MAX_STAGES) return;
    setStages(prev => [...prev, '']);
  };

  const removeStage = (i: number) => {
    if (stages.length <= MIN_STAGES) return;
    setStages(prev => prev.filter((_, idx) => idx !== i));
  };

  const filledStages = stages.map(s => s.trim()).filter(s => s.length > 0);
  const valid = name.trim().length > 0 && filledStages.length >= MIN_STAGES;

  const handleSave = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveLongQuest({ name: name.trim(), stat, stageNames: filledStages });
      router.back();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldStyle = { backgroundColor: theme.track, borderColor: theme.accentBorder, color: theme.text };

  return (
    <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
      <View style={[styles.sheet, { backgroundColor: theme.modal, borderColor: theme.glassBorder }]}>
        <View style={[styles.handle, { backgroundColor: theme.accentBorder }]} />
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: theme.text, fontFamily: fonts.display }]}>
            NEW LONG QUEST
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.closeX, { color: theme.dim }]}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ gap: 16 }} showsVerticalScrollIndicator={false}>
          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>QUEST NAME</Text>
            <TextInput
              style={[styles.field, fieldStyle]}
              placeholder="e.g. Ship a Side Project"
              placeholderTextColor={theme.dim}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>STAT</Text>
            <View style={styles.statRow}>
              {STATS.map(s => {
                const active = stat === s;
                const color = STAT_COLORS[s];
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStat(s)}
                    style={[
                      styles.statButton,
                      {
                        borderColor: active ? color : theme.glassBorder,
                        backgroundColor: active ? `${color}15` : 'transparent',
                      },
                    ]}>
                    <StatIcon stat={s} size={14} />
                    <Text
                      style={[
                        styles.statButtonText,
                        { color: active ? color : theme.dim, fontFamily: fonts.display },
                      ]}>
                      {s}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
              STAGES <Text style={{ color: theme.dim, fontSize: 10 }}>(in order, at least 2)</Text>
            </Text>
            <View style={{ gap: 8 }}>
              {stages.map((value, i) => (
                <View key={i} style={styles.stageInputRow}>
                  <Text style={[styles.stageIndex, { color: theme.dim, fontFamily: fonts.mono }]}>
                    {i + 1}
                  </Text>
                  <TextInput
                    style={[styles.field, fieldStyle, { flex: 1 }]}
                    placeholder={`Stage ${i + 1}`}
                    placeholderTextColor={theme.dim}
                    value={value}
                    onChangeText={v => setStageAt(i, v)}
                  />
                  {stages.length > MIN_STAGES && (
                    <Pressable onPress={() => removeStage(i)} style={styles.stageRemove}>
                      <Text style={{ color: theme.dim, fontSize: 18, lineHeight: 18 }}>×</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
            {stages.length < MAX_STAGES && (
              <Pressable onPress={addStage} style={{ marginTop: 8 }}>
                <Text style={[styles.addStageText, { color: theme.accent, fontFamily: fonts.display }]}>
                  + ADD STAGE
                </Text>
              </Pressable>
            )}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            disabled={!valid || submitting}
            onPress={handleSave}
            style={[
              styles.saveButton,
              {
                backgroundColor: valid ? theme.accentGlass : 'transparent',
                borderColor: valid ? theme.accentBorder : theme.glassBorder,
                opacity: submitting ? 0.6 : 1,
              },
            ]}>
            <Text
              style={[
                styles.saveButtonText,
                { color: valid ? theme.accent : theme.dim, fontFamily: fonts.display },
              ]}>
              {submitting ? 'CREATING…' : 'CREATE LONG QUEST'}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    maxHeight: '88%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    letterSpacing: 1,
  },
  closeX: {
    fontSize: 22,
    lineHeight: 22,
  },
  label: {
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 7,
  },
  field: {
    borderWidth: 1,
    borderRadius: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  statButtonText: {
    fontSize: 9,
    letterSpacing: 0.5,
  },
  stageInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageIndex: {
    fontSize: 12,
    width: 14,
    textAlign: 'center',
  },
  stageRemove: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStageText: {
    fontSize: 12,
    letterSpacing: 1,
  },
  errorText: {
    fontSize: 12,
    color: '#f87171',
  },
  saveButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    letterSpacing: 1,
  },
});
