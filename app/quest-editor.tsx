import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { StatIcon } from '@/components/eiyu/icons';
import { Screen } from '@/components/eiyu/screen';
import { DAYS, STATS, STAT_COLORS } from '@/constants/eiyu-data';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { suggestEasyVersions } from '@/lib/ai';
import { formatError } from '@/lib/format-error';
import { HabitInput } from '@/lib/habits';
import { Difficulty, Stat } from '@/types/eiyu';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

const difficultyColor: Record<Difficulty, string> = {
  Hard: '#f87171',
  Medium: '#fbbf24',
  Easy: '#4ade80',
};

export default function QuestEditorScreen() {
  const { theme, user, saveHabit, archiveQuest } = useEiyu();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const quest = id ? user.quests.find(q => q.id === id) ?? null : null;

  const [name, setName] = useState(quest?.name ?? '');
  const [easyVersion, setEasyVersion] = useState(quest?.easyVersion ?? '');
  const [time, setTime] = useState(quest?.time ?? '08:00');
  const [days, setDays] = useState<number[]>(quest?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [stat, setStat] = useState<Stat>(quest?.stat ?? 'INT');
  const [difficulty, setDifficulty] = useState<Difficulty>(quest?.difficulty ?? 'Medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const handleSuggest = async () => {
    if (!name.trim() || suggesting) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const result = await suggestEasyVersions(name.trim(), stat);
      setSuggestions(result);
    } catch (err) {
      setSuggestError(formatError(err));
    } finally {
      setSuggesting(false);
    }
  };

  const toggleDay = (d: number) => {
    setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));
  };

  const valid = name.trim().length > 0 && easyVersion.trim().length > 0;

  const handleSave = async () => {
    if (!valid || submitting) return;
    const input: HabitInput = {
      name: name.trim(),
      easyVersion: easyVersion.trim(),
      time,
      days,
      stat,
      difficulty,
    };
    setSubmitting(true);
    setError(null);
    try {
      await saveHabit(input, quest?.id);
      router.back();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!quest || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await archiveQuest(quest.id);
      router.back();
    } catch (err) {
      setError(formatError(err));
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
            {quest ? 'EDIT QUEST' : 'NEW QUEST'}
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.closeX, { color: theme.dim }]}>×</Text>
          </Pressable>
        </View>

        <Screen edges={[]} contentContainerStyle={{ gap: 16 }}>
          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>QUEST NAME</Text>
            <TextInput
              style={[styles.field, fieldStyle]}
              placeholder="e.g. Code for 2 hours"
              placeholderTextColor={theme.dim}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
              EASY VERSION <Text style={{ color: theme.dim, fontSize: 10 }}>(recovery fallback)</Text>
            </Text>
            <TextInput
              style={[styles.field, fieldStyle]}
              placeholder="e.g. Code for 20 minutes"
              placeholderTextColor={theme.dim}
              value={easyVersion}
              onChangeText={setEasyVersion}
            />
            <Pressable
              onPress={handleSuggest}
              disabled={!name.trim() || suggesting}
              style={{ marginTop: 8, opacity: !name.trim() || suggesting ? 0.5 : 1 }}>
              <Text style={[styles.suggestText, { color: theme.accent, fontFamily: fonts.display }]}>
                {suggesting ? 'THINKING…' : '✨ SUGGEST EASY VERSIONS'}
              </Text>
            </Pressable>
            {suggestError && <Text style={[styles.errorText, { marginTop: 6 }]}>{suggestError}</Text>}
            {suggestions.length > 0 && (
              <View style={styles.suggestionList}>
                {suggestions.map((s, i) => (
                  <Pressable
                    key={i}
                    onPress={() => {
                      setEasyVersion(s);
                      setSuggestions([]);
                    }}
                    style={[styles.suggestionChip, { borderColor: theme.accentBorder, backgroundColor: theme.accentGlass }]}>
                    <Text style={[styles.suggestionChipText, { color: theme.text, fontFamily: fonts.body }]}>
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
              REMINDER TIME
            </Text>
            <TextInput
              style={[styles.field, fieldStyle]}
              placeholder="08:00"
              placeholderTextColor={theme.dim}
              value={time}
              onChangeText={setTime}
            />
          </View>

          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>DAYS</Text>
            <View style={styles.daysRow}>
              {DAYS.map((day, i) => {
                const active = days.includes(i);
                return (
                  <Pressable
                    key={day}
                    onPress={() => toggleDay(i)}
                    style={[
                      styles.dayButton,
                      {
                        borderColor: active ? theme.accentStrong : theme.glassBorder,
                        backgroundColor: active ? theme.accentGlass : 'transparent',
                      },
                    ]}>
                    <Text
                      style={[
                        styles.dayButtonText,
                        { color: active ? theme.accent : theme.dim, fontFamily: fonts.display },
                      ]}>
                      {day[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
              DIFFICULTY
            </Text>
            <View style={styles.diffRow}>
              {DIFFICULTIES.map(d => {
                const active = difficulty === d;
                const color = difficultyColor[d];
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDifficulty(d)}
                    style={[
                      styles.diffButton,
                      {
                        borderColor: active ? color : theme.glassBorder,
                        backgroundColor: active ? `${color}15` : 'transparent',
                      },
                    ]}>
                    <Text
                      style={[styles.diffButtonText, { color: active ? color : theme.dim, fontFamily: fonts.display }]}>
                      {d}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.actionsRow}>
            {quest && (
              <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={submitting}>
                <Text style={[styles.deleteButtonText, { fontFamily: fonts.display }]}>DELETE</Text>
              </Pressable>
            )}
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
                {submitting ? 'SAVING…' : quest ? 'SAVE CHANGES' : 'CREATE QUEST'}
              </Text>
            </Pressable>
          </View>
        </Screen>
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
  errorText: {
    fontSize: 12,
    color: '#f87171',
  },
  suggestText: {
    fontSize: 11,
    letterSpacing: 1,
  },
  suggestionList: {
    gap: 6,
    marginTop: 10,
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  suggestionChipText: {
    fontSize: 13,
  },
  field: {
    borderWidth: 1,
    borderRadius: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayButton: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButtonText: {
    fontSize: 11,
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
  diffRow: {
    flexDirection: 'row',
    gap: 8,
  },
  diffButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diffButtonText: {
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  deleteButton: {
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.2)',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    color: '#f87171',
    letterSpacing: 0.5,
  },
  saveButton: {
    flex: 1,
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
