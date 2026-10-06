import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  accountDateKey, DEFAULT_HABIT_DAYS, formatError, normalizeNameBoundaries, QUEST_GENRES, STATS, suggestEasyVersions,
  validateQuestName,
  type Difficulty, type HabitInput, type Quest, type QuestGenre, type QuestType, type Stat,
} from '@eiyu/shared';

import { DeleteQuestModal } from '@/components/board/delete-quest-modal';
import { PlusIcon, SparkleIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { DiscardChangesModal } from '@/components/ui/discard-changes-modal';
import { Field } from '@/components/ui/field';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { useTokens } from '@/contexts/theme-store';
import { publishBoardReturnIntent } from '@/lib/board-return-intent';
import { hapticLight, hapticSuccess } from '@/lib/haptics';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const TYPES: { id: QuestType; label: string }[] = [
  { id: 'habit', label: 'Habit' },
  { id: 'one_time', label: 'One-time' },
  { id: 'backlog', label: 'Backlog' },
];
const TITLES: Record<QuestType, string> = { habit: 'NEW QUEST', one_time: 'NEW ONE-TIME QUEST', backlog: 'NEW BACKLOG QUEST' };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
/** reminder_time is required by the database; untimed quests keep this placeholder and timeSet false. */
const PLACEHOLDER_TIME = '08:00';

function questTypeParam(value: string | undefined): QuestType {
  return value === 'one_time' || value === 'backlog' ? value : 'habit';
}

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

/** Local calendar date -> "YYYY-MM-DD", matching how the picker itself reports dates (never UTC). */
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

function FieldLabel({ children }: { children: string }) {
  const t = useTokens();
  return <Text style={[styles.label, { color: t['muted-flat'], fontFamily: fonts.display }]}>{children}</Text>;
}

/** A tappable field that opens the system date or time dialog. */
function PickerTrigger({ label, value, onPress, disabled }: { label: string; value: string; onPress: () => void; disabled?: boolean }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.trigger, { backgroundColor: t.track, borderColor: t['glass-border'] }, disabled && styles.disabled]}>
      <Text style={{ color: t.text, fontFamily: fonts.body, fontSize: 15 }}>{value}</Text>
    </Pressable>
  );
}

export default function QuestEditorScreen() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, saveHabit, archiveQuest, restoreQuest, deleteQuest } = useEiyu();
  const { id, type: typeParam, returnLane } = useLocalSearchParams<{ id?: string; type?: string; returnLane?: string }>();
  const liveQuest = id ? user.quests.find(q => q.id === id) ?? null : null;
  // A quest that leaves live data mid-delete keeps the editor in edit mode instead of flipping to "new".
  const editQuestRef = useRef<Quest | null>(liveQuest);
  if (liveQuest) editQuestRef.current = liveQuest;
  const quest = liveQuest ?? editQuestRef.current;
  const isEditing = Boolean(id);

  // The type is chosen when a quest is created and never changed in the editor: after that only the server's move
  // functions change it.
  const [type, setType] = useState<QuestType>(quest?.questType ?? questTypeParam(typeParam));
  const [name, setName] = useState(quest?.name ?? '');
  const [nameTouched, setNameTouched] = useState(false);
  const [note, setNote] = useState(quest?.description ?? '');
  const [easyVersion, setEasyVersion] = useState(quest?.easyVersion ?? '');
  const [time, setTime] = useState(quest?.time ?? PLACEHOLDER_TIME);
  const [noTime, setNoTime] = useState(quest ? quest.timeSet === false : true);
  const [scheduledDate, setScheduledDate] = useState(() => quest?.scheduledDate ?? accountDateKey(new Date(), user.timeZone));
  // A stored null is "No date": it stays null on save instead of falling back to today. A time needs a date.
  const [noDate, setNoDate] = useState(quest?.questType === 'one_time' && quest.scheduledDate === null);
  const dateLocked = Boolean(quest?.completed);
  const [targetCount, setTargetCount] = useState(quest?.targetCount != null ? String(quest.targetCount) : '');
  const [days, setDays] = useState<number[]>(quest?.days ?? [...DEFAULT_HABIT_DAYS]);
  const [stat, setStat] = useState<Stat>(quest?.stat ?? 'INT');
  const [difficulty, setDifficulty] = useState<Difficulty>(quest?.difficulty ?? 'Medium');
  const [genre, setGenre] = useState<QuestGenre | null>(quest?.genre ?? null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const lifecycleInFlight = useRef(false);
  const pendingRef = useRef(false);
  const committed = useRef(false);
  const heldAction = useRef<unknown>(null);

  const isHabit = type === 'habit';
  const isOneTime = type === 'one_time';
  const noTimeShown = noTime || noDate;

  const snapshot = () => JSON.stringify({ name, note, easyVersion, time, noTime, noDate, scheduledDate, targetCount, days, stat, difficulty, type, genre });
  const [initialSnapshot] = useState(snapshot);
  const dirty = snapshot() !== initialSnapshot;

  // Leaving with unsaved edits (Back, swipe, the close button) asks first; a finished save or lifecycle change does not.
  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (!dirty || committed.current) return;
    event.preventDefault();
    heldAction.current = event.data.action;
    setDiscardPrompt(true);
  }), [navigation, dirty]);

  const keepEditing = () => setDiscardPrompt(false);
  const discard = () => {
    committed.current = true;
    setDiscardPrompt(false);
    navigation.dispatch(heldAction.current as Parameters<typeof navigation.dispatch>[0]);
  };

  const handleSuggest = async () => {
    if (!name.trim() || suggesting) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      setSuggestions(await suggestEasyVersions(name.trim(), stat));
    } catch (err) {
      setSuggestError(formatError(err));
    } finally {
      setSuggesting(false);
    }
  };

  const toggleDay = (d: number) => setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));

  // One-time and Backlog quests have no penalty, and neither does a quantity habit (target count set): every other habit
  // needs one (the database enforces this with habits_easy_version_present).
  const nameProblem = quest?.name === name ? null : validateQuestName(name);
  const nameError = nameTouched ? nameProblem : null;
  const targetCountError = targetCount && Number(targetCount) < 2 ? 'Target count must be at least 2.' : null;
  const penaltyMissing = isHabit && !targetCount && !easyVersion.trim();
  const valid = !nameProblem && !targetCountError && !penaltyMissing;

  const finish = () => {
    committed.current = true;
    router.back();
  };

  const handleSave = async () => {
    if (!valid || submitting) return;
    const input: HabitInput = {
      name: quest?.name === name ? name : normalizeNameBoundaries(name),
      easyVersion: isHabit ? easyVersion.trim() || null : null,
      description: note.trim() || null,
      questType: type,
      time: isHabit || (isOneTime && !noTimeShown) ? time : PLACEHOLDER_TIME,
      days: isHabit ? days : [],
      stat,
      difficulty,
      scheduledDate: isOneTime && !noDate ? scheduledDate : null,
      targetCount: isHabit && targetCount ? Number(targetCount) : null,
      genre: isHabit ? null : genre,
      timeSet: isHabit ? true : isOneTime ? !noTimeShown : false,
    };
    setSubmitting(true);
    setSaving(true);
    pendingRef.current = true;
    setError(null);
    try {
      await saveHabit(input, id);
      if (!id && isOneTime && returnLane === 'one-time') publishBoardReturnIntent('one-time');
      if (!id && type === 'backlog' && returnLane === 'backlog') publishBoardReturnIntent('backlog');
      hapticSuccess();
      finish();
    } catch (err) {
      setError(formatError(err));
    } finally {
      pendingRef.current = false;
      setSaving(false);
      setSubmitting(false);
    }
  };

  const handleLifecycle = async (operation: 'archive' | 'restore' | 'delete') => {
    if (!id || submitting || lifecycleInFlight.current) return;
    lifecycleInFlight.current = true;
    pendingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (operation === 'archive') await archiveQuest(id);
      if (operation === 'restore') await restoreQuest(id);
      if (operation === 'delete') await deleteQuest(id);
      hapticLight();
      finish();
    } catch (err) {
      pendingRef.current = false;
      setError(formatError(err));
      setSubmitting(false);
      if (operation === 'delete') setConfirmDelete(true);
      lifecycleInFlight.current = false;
    }
  };

  const close = () => { if (!pendingRef.current && !confirmDelete) router.back(); };

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: t['divider-flat'] }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>
          {isEditing ? 'EDIT QUEST' : TITLES[type]}
        </Text>
        <Pressable
          testID="quest-editor-close"
          accessibilityRole="button"
          accessibilityLabel="Close quest editor"
          onPress={close}
          disabled={submitting || confirmDelete}
          style={styles.close}>
          <View style={styles.closeGlyph}><PlusIcon size={22} color={t['muted-flat']} /></View>
        </Pressable>
      </View>

      <View testID="quest-editor-form" style={styles.form}>
        <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
          {!isEditing ? (
            <View>
              <FieldLabel>TYPE</FieldLabel>
              <View style={styles.row}>
                {TYPES.map(option => (
                  <Chip key={option.id} label={option.label} selected={type === option.id} onPress={() => setType(option.id)} />
                ))}
              </View>
            </View>
          ) : null}

          <Field
            label="Quest name"
            placeholder="e.g. Code for 2 hours"
            value={name}
            onChangeText={value => { setName(value); setNameTouched(true); }}
            onBlur={() => setNameTouched(true)}
            error={nameError ?? undefined}
            errorTestID="quest-name-error"
          />

          <Field
            label="Note"
            placeholder="Context, links, why it matters…"
            value={note}
            onChangeText={setNote}
            multiline
          />

          {isHabit && !targetCount ? (
            <View style={styles.group}>
              <Field
                label="Penalty"
                placeholder="e.g. Code for 20 minutes"
                value={easyVersion}
                onChangeText={setEasyVersion}
                hint={penaltyMissing ? 'Add a penalty, or set a target count of at least 2.' : 'Required unless a target count is set.'}
              />
              <Button
                variant="quiet"
                label="SUGGEST PENALTIES"
                icon={<SparkleIcon color={t.accent} />}
                disabled={!name.trim()}
                busy={suggesting}
                onPress={() => void handleSuggest()}
              />
              {suggestError ? <Text accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{suggestError}</Text> : null}
              {suggestions.map((s, i) => (
                <Pressable
                  key={s}
                  testID={`quest-ai-suggestion-${i + 1}`}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                  onPress={() => { setEasyVersion(s); setSuggestions([]); }}
                  style={[styles.suggestion, { borderColor: t['accent-border'], backgroundColor: t['accent-glass'] }]}>
                  <Text style={{ color: t.text, fontFamily: fonts.body, fontSize: 14 }}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {isHabit ? (
            <Field
              label="Target count"
              placeholder="Leave blank for a normal habit"
              value={targetCount}
              onChangeText={value => setTargetCount(value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              hint="Optional — e.g. 8 for 8x a day"
              error={targetCountError ?? undefined}
              errorTestID="quest-target-error"
            />
          ) : null}

          {isOneTime ? (
            <View>
              <View style={styles.labelRow}>
                <FieldLabel>DATE</FieldLabel>
                {dateLocked ? null : <Chip kind="checkbox" compact label="No date" selected={noDate} onPress={() => setNoDate(v => !v)} />}
              </View>
              {dateLocked ? (
                <>
                  <Text style={[styles.lockedDate, { color: t.text, fontFamily: fonts.body }]}>{formatDateShort(scheduledDate)}</Text>
                  <Text style={[styles.note, { color: t['dim-flat'], fontFamily: fonts.body }]}>The date is fixed once the quest is finished.</Text>
                </>
              ) : (
                <>
                  <PickerTrigger label="Choose quest date" value={noDate ? 'No date' : formatDateShort(scheduledDate)} disabled={noDate} onPress={() => setDatePickerVisible(true)} />
                  {datePickerVisible && !noDate ? (
                    <DateTimePicker
                      value={dateKeyToDate(scheduledDate)}
                      mode="date"
                      minimumDate={dateKeyToDate(accountDateKey(new Date(), user.timeZone))}
                      onChange={(event, date) => {
                        setDatePickerVisible(false);
                        if (event.type === 'set' && date) setScheduledDate(dateToDateKey(date));
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {isHabit || isOneTime ? (
            <View>
              <View style={styles.labelRow}>
                <FieldLabel>{isHabit ? 'REMINDER TIME' : 'TIME'}</FieldLabel>
                {isOneTime ? <Chip kind="checkbox" compact label="No set time" selected={noTimeShown} disabled={noDate} onPress={() => setNoTime(v => !v)} /> : null}
              </View>
              <PickerTrigger
                label="Choose reminder time"
                value={formatTime12(time)}
                disabled={isOneTime && noTimeShown}
                onPress={() => setTimePickerVisible(true)}
              />
              {timePickerVisible ? (
                <DateTimePicker
                  value={timeStringToDate(time)}
                  mode="time"
                  is24Hour={false}
                  onChange={(event, date) => {
                    setTimePickerVisible(false);
                    if (event.type === 'set' && date) setTime(dateToTimeString(date));
                  }}
                />
              ) : null}
            </View>
          ) : null}

          {isHabit ? (
            <View>
              <FieldLabel>DAYS</FieldLabel>
              <View style={styles.row}>
                {DAY_SHORT.map((short, i) => (
                  <Chip
                    key={short}
                    compact
                    kind="checkbox"
                    label={short}
                    accessibilityLabel={DAY_NAMES[i]}
                    selected={days.includes(i)}
                    onPress={() => toggleDay(i)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {!isHabit ? (
            <View>
              <FieldLabel>GENRE</FieldLabel>
              <View style={styles.row}>
                {QUEST_GENRES.map(g => (
                  <Chip key={g.id} label={g.label} selected={genre === g.id} onPress={() => setGenre(genre === g.id ? null : g.id)} />
                ))}
              </View>
            </View>
          ) : null}

          <View>
            <FieldLabel>STAT</FieldLabel>
            <View style={styles.row}>
              {STATS.map(s => <Chip key={s} label={s} selected={stat === s} onPress={() => setStat(s)} />)}
            </View>
          </View>

          <View>
            <FieldLabel>DIFFICULTY</FieldLabel>
            <View style={styles.row}>
              {DIFFICULTIES.map(d => <Chip key={d} label={d} selected={difficulty === d} onPress={() => setDifficulty(d)} />)}
            </View>
          </View>
        </KeyboardAwareScrollView>
      </View>

      <View testID="quest-editor-footer" style={[styles.footer, { borderTopColor: t['divider-flat'], paddingBottom: Math.max(12, insets.bottom) }]}>
        {error ? <Text accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{error}</Text> : null}
        <View testID="quest-editor-actions" style={styles.actions}>
          {isEditing && quest ? (
            <>
              <Button
                testID={quest.archived ? 'quest-restore' : 'quest-archive'}
                variant="secondary"
                label={quest.archived ? 'RESTORE QUEST' : 'ARCHIVE QUEST'}
                disabled={submitting}
                onPress={() => void handleLifecycle(quest.archived ? 'restore' : 'archive')}
                style={styles.secondaryAction}
              />
              <Button
                testID="quest-delete-permanent"
                variant="destructive"
                label="DELETE PERMANENTLY"
                disabled={submitting}
                onPress={() => setConfirmDelete(true)}
                style={styles.secondaryAction}
              />
            </>
          ) : null}
          <Button
            testID="quest-save"
            variant="primary"
            label={saving ? 'SAVING…' : isEditing ? 'SAVE CHANGES' : 'CREATE QUEST'}
            accessibilityLabel={saving ? 'Saving' : isEditing ? 'SAVE CHANGES' : 'CREATE QUEST'}
            disabled={!valid || submitting}
            busy={saving}
            onPress={() => void handleSave()}
            style={styles.save}
          />
        </View>
      </View>

      <DeleteQuestModal
        idPrefix="quest"
        quest={confirmDelete ? quest : null}
        pending={submitting}
        error={error}
        onCancel={() => { if (!pendingRef.current) setConfirmDelete(false); }}
        onConfirm={() => void handleLifecycle('delete')}
      />

      <DiscardChangesModal
        visible={discardPrompt}
        testID="quest-discard-modal"
        message="Your unsaved quest changes will be lost."
        onKeep={keepEditing}
        onDiscard={discard}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 4, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 20, letterSpacing: 1 },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { transform: [{ rotate: '45deg' }] },
  form: { flex: 1 },
  formContent: { padding: 20, gap: 18 },
  label: { fontSize: 11, letterSpacing: 1.2, marginBottom: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { gap: 8 },
  note: { fontSize: 12, lineHeight: 17 },
  trigger: { minHeight: 48, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  lockedDate: { fontSize: 15, minHeight: 32 },
  suggestion: { borderWidth: 1, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 12, minHeight: 48, justifyContent: 'center' },
  footer: { flexShrink: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 8 },
  secondaryAction: { flexGrow: 1, flexBasis: '40%' },
  save: { flexGrow: 1, flexBasis: '100%' },
});
