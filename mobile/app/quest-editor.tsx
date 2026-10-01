import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostButton } from '@/components/eiyu/ghost-button';
import { StatIcon } from '@/components/eiyu/icons';
import { Screen } from '@/components/eiyu/screen';
import { accountDateKey, DEFAULT_HABIT_DAYS, DAYS, STATS, STAT_COLORS, validateQuestName } from '@eiyu/shared';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { formatError, suggestEasyVersions } from '@eiyu/shared';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { publishBoardReturnIntent } from '@/lib/board-return-intent';
import { HabitInput, Quest } from '@eiyu/shared';
import { Difficulty, QuestType, Stat } from '@eiyu/shared';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

/** "HH:mm" (24h, as stored) -> "h:mm AM/PM" for the themed trigger. */
function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function timeStringToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Local calendar date -> "YYYY-MM-DD", matching how the picker itself reports dates (never UTC — see Slice 4's global constraint on this). */
function dateToDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" -> local Date at midnight, for handing to DateTimePicker's `value` prop. */
function dateKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Short display form, e.g. "Sep 10, 2026". */
function formatDateShort(key: string): string {
  return dateKeyToDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const difficultyColor: Record<Difficulty, string> = {
  Hard: '#f87171',
  Medium: '#fbbf24',
  Easy: '#4ade80',
};

export default function QuestEditorScreen() {
  const insets = useSafeAreaInsets();
  const { theme, user, saveHabit, archiveQuest, restoreQuest, deleteQuest } = useEiyu();
  const { id, type, returnLane } = useLocalSearchParams<{ id?: string; type?: string; returnLane?: string }>();
  const liveQuest = id ? user.quests.find(q => q.id === id) ?? null : null;
  const editQuestRef = useRef<Quest | null>(liveQuest);
  if (liveQuest) editQuestRef.current = liveQuest;
  const quest = liveQuest ?? editQuestRef.current;
  const isEditing = Boolean(id);
  const editingId = id;

  // Editing locks the quest type; creation takes it from the board's chooser
  // popup. Round-tripping questType/description here is what keeps an edit
  // from silently reverting a one-time quest back into a recurring habit.
  const [questType] = useState<QuestType>(
    quest?.questType ?? (type === 'one_time' ? 'one_time' : 'habit')
  );
  const isOneTime = questType === 'one_time';

  const [name, setName] = useState(quest?.name ?? '');
  const [easyVersion, setEasyVersion] = useState(quest?.easyVersion ?? '');
  const [description, setDescription] = useState(quest?.description ?? '');
  const [time, setTime] = useState(quest?.time ?? '08:00');
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(accountDateKey(new Date(), user.timeZone));
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [targetCount, setTargetCount] = useState<string>(quest?.targetCount != null ? String(quest.targetCount) : '');
  const [days, setDays] = useState<number[]>(quest?.days ?? [...DEFAULT_HABIT_DAYS]);
  const [stat, setStat] = useState<Stat>(quest?.stat ?? 'INT');
  const [difficulty, setDifficulty] = useState<Difficulty>(quest?.difficulty ?? 'Medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const lifecycleInFlight = useRef(false);
  const pendingRef = useRef(false);
  const deleteCancelRef = useRef<View>(null);

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

  // One-time quests have no Penalty — the name alone validates them.
  // A quantity habit (target count set) has no Penalty either — target count
  // and the legacy `easyVersion` field are alternative ways to satisfy a habit's
  // "how do I complete this" requirement, not both required at once.
  const nameError = quest?.name === name ? null : validateQuestName(name);
  const targetCountError = targetCount && Number(targetCount) < 2 ? 'Target count must be at least 2.' : null;
  const penaltyMissing = !isOneTime && !targetCount && !easyVersion.trim();
  const valid = !nameError && !targetCountError && !penaltyMissing;
  const saveDisabledReason = nameError ?? targetCountError ??
    (penaltyMissing ? 'Add a penalty, or set a target count of at least 2.' : undefined);

  const handleSave = async () => {
    if (!valid || submitting) return;
    const input: HabitInput = {
      name: name.trim(),
      easyVersion: isOneTime ? null : easyVersion.trim(),
      description: description.trim(),
      questType,
      time,
      days,
      stat,
      difficulty,
      scheduledDate: isOneTime ? scheduledDate : null,
      targetCount: !isOneTime && targetCount ? Number(targetCount) : null,
    };
    setSubmitting(true);
    pendingRef.current = true;
    setError(null);
    try {
        await saveHabit(input, editingId);
        if (!editingId && isOneTime && returnLane === 'one-time') {
          publishBoardReturnIntent('one-time');
        }
        hapticSuccess();
      router.back();
    } catch (err) {
      setError(formatError(err));
    } finally {
      pendingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleLifecycle = async (operation: 'archive' | 'restore' | 'delete') => {
    if (!editingId || submitting || lifecycleInFlight.current) return;
    lifecycleInFlight.current = true;
    pendingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (operation === 'archive') await archiveQuest(editingId);
      if (operation === 'restore') await restoreQuest(editingId);
      if (operation === 'delete') await deleteQuest(editingId);
      hapticLight();
      router.back();
    } catch (err) {
      pendingRef.current = false;
      setError(formatError(err));
      setSubmitting(false);
      if (operation === 'delete') setConfirmDelete(true);
      lifecycleInFlight.current = false;
    }
  };

  const fieldStyle = { backgroundColor: theme.track, borderColor: theme.accentBorder, color: theme.text };

  return (
    <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
      <View style={[styles.sheet, { backgroundColor: theme.modal, borderColor: theme.glassBorder }]}>
        <View style={[styles.handle, { backgroundColor: theme.accentBorder }]} />
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: theme.text, fontFamily: fonts.display }]}>
            {isEditing ? 'EDIT QUEST' : isOneTime ? 'NEW ONE-TIME QUEST' : 'NEW QUEST'}
          </Text>
          <Pressable
            testID="quest-editor-close"
            accessibilityRole="button"
            accessibilityLabel="Close quest editor"
            onPress={() => { if (!pendingRef.current && !confirmDelete) router.back(); }}
            disabled={submitting || confirmDelete}
            style={styles.closeButton}>
            <Text style={[styles.closeX, { color: theme.dim }]}>×</Text>
          </Pressable>
        </View>

        <View testID="quest-editor-form" style={{ flexShrink: 1 }}>
        <Screen edges={[]} fill={false} contentContainerStyle={{ gap: 16 }}>
          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>QUEST NAME <Text style={{ color: theme.dim, fontSize: 10 }}>(required)</Text></Text>
            <TextInput
              style={[styles.field, fieldStyle]}
              placeholder="e.g. Code for 2 hours"
              placeholderTextColor={theme.dim}
              value={name}
              onChangeText={setName}
              accessibilityLabel="Quest name"
              accessibilityHint={nameError ?? undefined}
            />
            {nameError && <Text testID="quest-name-error" accessibilityRole="alert" style={styles.fieldError}>{nameError}</Text>}
          </View>

          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
              NOTE <Text style={{ color: theme.dim, fontSize: 10 }}>(optional)</Text>
            </Text>
            <TextInput
              style={[styles.field, styles.descriptionField, fieldStyle]}
              placeholder="Context, links, why it matters…"
              placeholderTextColor={theme.dim}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {!isOneTime && !targetCount && (
          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
                  PENALTY <Text style={{ color: theme.dim, fontSize: 10 }}>(required unless target count is 2 or more)</Text>
            </Text>
            <TextInput
              style={[styles.field, fieldStyle]}
              placeholder="e.g. Code for 20 minutes"
              placeholderTextColor={theme.dim}
              value={easyVersion}
              onChangeText={setEasyVersion}
            />
            {penaltyMissing && <Text style={styles.fieldHint}>Add a penalty, or set a target count of at least 2.</Text>}
            <Pressable
              onPress={handleSuggest}
              disabled={!name.trim() || suggesting}
              style={{ marginTop: 8, opacity: !name.trim() || suggesting ? 0.5 : 1 }}>
              <Text style={[styles.suggestText, { color: theme.accent, fontFamily: fonts.display }]}>
                {suggesting ? 'THINKING…' : '✨ SUGGEST PENALTIES'}
              </Text>
            </Pressable>
            {suggestError && <Text style={[styles.errorText, { marginTop: 6 }]}>{suggestError}</Text>}
            {suggestions.length > 0 && (
              <View style={styles.suggestionList}>
                {suggestions.map((s, i) => (
                  <Pressable
                    key={i}
                    testID={`quest-ai-suggestion-${i + 1}`}
                    accessibilityLabel={s}
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
          )}

          {!isOneTime && (
          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
              TARGET COUNT <Text style={{ color: theme.dim, fontSize: 10 }}>(optional — e.g. 8x a day)</Text>
            </Text>
            <TextInput
              style={[styles.field, fieldStyle]}
              placeholder="Leave blank for a normal habit"
              placeholderTextColor={theme.dim}
              value={targetCount}
              onChangeText={t => setTargetCount(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
            {targetCountError && <Text testID="quest-target-error" accessibilityRole="alert" style={styles.fieldError}>{targetCountError}</Text>}
          </View>
          )}

          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
              REMINDER TIME
            </Text>
            {/* Themed trigger -> native platform dialog (#9). Always 12h AM/PM
                BY DESIGN per the original request ("users shouldn't have to
                type, no 24-hour format") - is24Hour only affects Android; iOS
                follows locale regardless. Not locale-adaptive on purpose.
                Replaces the old free-text "08:00" input users had to type into. */}
            <Pressable
              style={[styles.field, styles.timeTrigger, fieldStyle]}
              onPress={() => setTimePickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose reminder time">
              <Text style={{ color: theme.text, fontFamily: fonts.body }}>{formatTime12(time)}</Text>
            </Pressable>
            {timePickerVisible && (
              <View>
                <DateTimePicker
                  value={timeStringToDate(time)}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    if (Platform.OS === 'android') {
                      // Android's dialog is modal and fires onChange once.
                      setTimePickerVisible(false);
                      if (event.type === 'set' && date) {
                        setTime(dateToTimeString(date));
                      }
                    } else {
                      // iOS spinner fires continuously while scrolling —
                      // auto-closing here would unmount it on the first touch.
                      // Update live; the explicit DONE button closes it.
                      if (date) {
                        setTime(dateToTimeString(date));
                      }
                    }
                  }}
                />
                {Platform.OS === 'ios' && (
                  <GhostButton label="DONE" onPress={() => setTimePickerVisible(false)} />
                )}
              </View>
            )}
          </View>

          {isOneTime && (
          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>DATE</Text>
            <Pressable
              style={[styles.field, styles.timeTrigger, fieldStyle]}
              onPress={() => setDatePickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose quest date">
              <Text style={{ color: theme.text, fontFamily: fonts.body }}>{formatDateShort(scheduledDate)}</Text>
            </Pressable>
            {datePickerVisible && (
              <View>
                <DateTimePicker
                  value={dateKeyToDate(scheduledDate)}
                  mode="date"
                  minimumDate={new Date()}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    if (Platform.OS === 'android') {
                      setDatePickerVisible(false);
                      if (event.type === 'set' && date) {
                        setScheduledDate(dateToDateKey(date));
                      }
                    } else {
                      if (date) {
                        setScheduledDate(dateToDateKey(date));
                      }
                    }
                  }}
                />
                {Platform.OS === 'ios' && (
                  <GhostButton label="DONE" onPress={() => setDatePickerVisible(false)} />
                )}
              </View>
            )}
          </View>
          )}

          {!isOneTime && (
          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>DAYS</Text>
            <View style={styles.daysRow}>
              {DAYS.map((day, i) => {
                const active = days.includes(i);
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="checkbox"
                    accessibilityLabel={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]}
                    accessibilityState={{ checked: active }}
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
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][i]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          )}

          <View>
            <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>STAT</Text>
            <View style={styles.statRow}>
              {STATS.map(s => {
                const active = stat === s;
                const color = STAT_COLORS[s];
                return (
                  <Pressable
                    key={s}
                    accessibilityRole="radio"
                    accessibilityLabel={s}
                    accessibilityState={{ checked: active, selected: active }}
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
                    accessibilityRole="radio"
                    accessibilityLabel={d}
                    accessibilityState={{ checked: active, selected: active }}
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

        </Screen>
        </View>

        <View testID="quest-editor-footer" style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <View testID="quest-editor-actions" style={styles.actionsRow}>
            {isEditing && quest && (
              <>
                <Pressable
                  testID={quest.archived ? 'quest-restore' : 'quest-archive'}
                  style={[styles.lifecycleButton, styles.secondaryActionButton, { borderColor: theme.accentBorder }]}
                  onPress={() => void handleLifecycle(quest.archived ? 'restore' : 'archive')}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={quest.archived ? 'RESTORE QUEST' : 'ARCHIVE QUEST'}>
                  <Text style={[styles.lifecycleButtonText, { color: theme.accent, fontFamily: fonts.display }]}>
                    {quest.archived ? 'RESTORE QUEST' : 'ARCHIVE QUEST'}
                  </Text>
                </Pressable>
                <Pressable
                  testID="quest-delete-permanent"
                  style={[styles.deleteButton, styles.secondaryActionButton, { opacity: submitting ? 0.5 : 1 }]}
                  onPress={() => setConfirmDelete(true)}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="DELETE PERMANENTLY">
                  <Text style={[styles.deleteButtonText, { fontFamily: fonts.display }]}>DELETE PERMANENTLY</Text>
                </Pressable>
              </>
            )}
            <Pressable
              testID="quest-save"
              accessibilityRole="button"
              accessibilityLabel={submitting ? 'Saving' : isEditing ? 'SAVE CHANGES' : 'CREATE QUEST'}
              accessibilityHint={saveDisabledReason}
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
                {submitting ? 'SAVING…' : isEditing ? 'SAVE CHANGES' : 'CREATE QUEST'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Modal
        testID="quest-delete-modal"
        visible={confirmDelete}
        transparent
        animationType="fade"
        onShow={() => {
          if (deleteCancelRef.current) AccessibilityInfo.sendAccessibilityEvent(deleteCancelRef.current, 'focus');
        }}
        onRequestClose={() => { if (!pendingRef.current) setConfirmDelete(false); }}>
        <View style={styles.confirmOverlay} accessibilityRole="alert" accessibilityViewIsModal>
          <View style={[styles.confirmCard, { backgroundColor: theme.modal, borderColor: theme.glassBorder }]}>
            <Text style={[styles.confirmTitle, { color: theme.text, fontFamily: fonts.display }]}>DELETE {quest?.name} PERMANENTLY?</Text>
            <Text style={[styles.confirmBody, { color: theme.muted, fontFamily: fonts.body }]}>This permanently removes the saved quest. Its History, Weekly Review, and earned XP remain. This cannot be undone.</Text>
            {error && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.confirmActions}>
              <Pressable
                ref={deleteCancelRef}
                testID="quest-delete-cancel"
                onPress={() => { if (!pendingRef.current) setConfirmDelete(false); }}
                disabled={submitting}
                style={[styles.confirmCancel, { borderColor: theme.glassBorder }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text style={[styles.lifecycleButtonText, { color: theme.muted, fontFamily: fonts.display }]}>CANCEL</Text>
              </Pressable>
              <Pressable
                testID="quest-delete-confirm"
                onPress={() => void handleLifecycle('delete')}
                disabled={submitting}
                style={[styles.confirmDelete, { borderColor: 'rgba(248,113,113,0.45)' }]}
                accessibilityRole="button"
                accessibilityLabel="Confirm permanent delete">
                <Text style={[styles.deleteButtonText, { fontFamily: fonts.display }]}>{submitting ? 'DELETING…' : 'CONFIRM PERMANENT DELETE'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 0,
    maxHeight: '88%',
  },
  footer: {
    flexShrink: 0,
    paddingTop: 8,
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
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
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
  fieldError: {
    fontSize: 12,
    color: '#f87171',
    marginTop: 5,
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 17,
    color: '#fbbf24',
    marginTop: 5,
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
  descriptionField: {
    minHeight: 76,
  },
  timeTrigger: {
    justifyContent: 'center',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 5,
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
    minHeight: 48,
    paddingVertical: 6,
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
    minHeight: 44,
    paddingVertical: 6,
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
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 12,
  },
  lifecycleButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  secondaryActionButton: {
    flexGrow: 1,
    flexBasis: '40%',
    minHeight: 48,
    alignItems: 'center',
  },
  lifecycleButtonText: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  deleteButton: {
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    color: '#f87171',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  confirmTitle: {
    fontSize: 16,
    letterSpacing: 0.8,
  },
  confirmBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  confirmActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
  },
  confirmCancel: {
    flexGrow: 1,
    flexBasis: '25%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  confirmDelete: {
    flexGrow: 1,
    flexBasis: '55%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  saveButton: {
    flexGrow: 1,
    flexBasis: '100%',
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    letterSpacing: 1,
    textAlign: 'center',
  },
});
