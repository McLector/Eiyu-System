import { useRef, useState } from 'react';
import Dialog from '../components/Dialog';
import { useEditorGuard } from '../components/NavigationGuard';
import {
  accountDateKey, DEFAULT_HABIT_DAYS, QUEST_GENRES, Quest, QuestGenre, QuestType, Stat, Difficulty, STATS, HabitInput,
  formatError, normalizeNameBoundaries, suggestEasyVersions, validateQuestName,
} from '@eiyu/shared';
import StatChip from '../components/StatChip';
import { SparkleIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';
import { announceArchive, getNotificationOwner } from '../components/ArchiveNotice';

interface Props {
  editingQuest?: Quest | null;
  initialType?: QuestType;
  onClose: () => void;
}

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const TYPES: { id: QuestType; label: string }[] = [
  { id: 'habit', label: 'Habit' },
  { id: 'one_time', label: 'One-time' },
  { id: 'backlog', label: 'Backlog' },
];
const TITLES: Record<QuestType, string> = { habit: 'NEW DAILY QUEST', one_time: 'NEW ONE TIME QUEST', backlog: 'NEW BACKLOG QUEST' };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function WebQuestEditor({ editingQuest, initialType = 'habit', onClose }: Props) {
  const { user, saveHabit, archiveQuest, restoreQuest, deleteQuest } = useEiyu();
  const [name, setName] = useState(editingQuest?.name ?? '');
  const [note, setNote] = useState(editingQuest?.description ?? '');
  const [easyVer, setEasyVer] = useState(editingQuest?.easyVersion ?? '');
  const [time, setTime] = useState(editingQuest?.time ?? '07:00');
  const [scheduledDate, setScheduledDate] = useState(() => editingQuest?.scheduledDate ?? accountDateKey(new Date(), user.timeZone));
  const [targetCount, setTargetCount] = useState(editingQuest?.targetCount != null ? String(editingQuest.targetCount) : '');
  const [days, setDays] = useState<number[]>(editingQuest?.days ?? [...DEFAULT_HABIT_DAYS]);
  const [stat, setStat] = useState<Stat>(editingQuest?.stat ?? 'INT');
  const [difficulty, setDifficulty] = useState<Difficulty>(editingQuest?.difficulty ?? 'Medium');
  // The type is chosen when a quest is created and never changed in the editor: after that only the server move functions change it.
  const [type, setType] = useState<QuestType>(editingQuest?.questType ?? initialType);
  const [genre, setGenre] = useState<QuestGenre | null>(editingQuest?.genre ?? null);
  const [noTime, setNoTime] = useState(editingQuest ? editingQuest.timeSet === false : true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const lifecycleInFlight = useRef(false);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const snapshot = () => JSON.stringify({ name, note, easyVer, time, scheduledDate, targetCount, days, stat, difficulty, type, genre, noTime });
  const initial = useRef(snapshot());
  const closeEditor = useEditorGuard(snapshot() !== initial.current, saving);

  const toggleDay = (d: number) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  // One-time and Backlog quests and quantity habits (target count set) have no penalty — every other habit requires one
  // (the DB enforces this with habits_easy_version_present, which exempts all three cases).
  const targetCountValid = !targetCount || Number(targetCount) > 1;
  // Shown only once the name has been typed in; an untouched form is incomplete, not wrong.
  const [nameTouched, setNameTouched] = useState(false);
  const nameProblem = editingQuest?.name === name ? null : validateQuestName(name);
  const nameError = nameTouched ? nameProblem : null;
  const valid = !nameProblem && (type !== 'habit' || easyVer.trim().length > 0 || !!targetCount) && targetCountValid;
  const showPenalty = type === 'habit' && !targetCount;

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const input: HabitInput = {
        name: editingQuest?.name === name ? name : normalizeNameBoundaries(name),
        easyVersion: type === 'habit' ? easyVer.trim() || null : null,
        stat,
        difficulty,
        // reminder_time is required by the database; untimed quests keep a placeholder and timeSet false.
        time: type === 'habit' || (type === 'one_time' && !noTime) ? time : '08:00',
        days: type === 'habit' ? days : [],
        questType: type,
        description: note.trim() || null,
        scheduledDate: type === 'one_time' ? scheduledDate : null,
        targetCount: type === 'habit' && targetCount ? Number(targetCount) : null,
        genre: type === 'habit' ? null : genre,
        timeSet: type === 'habit' ? true : type === 'one_time' ? !noTime : false,
      };
      await saveHabit(input, editingQuest?.id);
      closeEditor.committed(onClose);
    } catch (err) {
      setSaveError(formatError(err));
      setSaving(false);
    }
  };

  const handleLifecycle = async (operation: 'archive' | 'restore' | 'delete') => {
    if (!editingQuest || saving || lifecycleInFlight.current) return;
    const notificationOwner = getNotificationOwner();
    lifecycleInFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (operation === 'archive') { await archiveQuest(editingQuest.id); announceArchive(editingQuest.questType, notificationOwner, () => restoreQuest(editingQuest.id)); }
      if (operation === 'restore') await restoreQuest(editingQuest.id);
      if (operation === 'delete') await deleteQuest(editingQuest.id);
      closeEditor.committed(onClose);
    } catch (err) {
      setSaveError(formatError(err));
      setSaving(false);
      if (operation === 'delete') setConfirmDelete(true);
      lifecycleInFlight.current = false;
    }
  };

  const handleAiSuggest = async () => {
    if (!name.trim() || suggesting) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      setSuggestions(await suggestEasyVersions(name.trim(), stat));
    } catch (err) {
      setSuggestError(`The System couldn't summon a suggestion — ${formatError(err)}`);
    } finally {
      setSuggesting(false);
    }
  };

  const optional = <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--c-dim-flat)' }}>(optional)</span>;
  const timeField = (
    <div>
      <div className="field-label-row">
        <label className="field-label" htmlFor="quest-time">TIME</label>
        {type === 'one_time' && (
          <label className="gym-checkbox"><input type="checkbox" checked={noTime} onChange={e => setNoTime(e.target.checked)} />No set time</label>
        )}
      </div>
      <input id="quest-time" className="field" type="time" value={time} disabled={type === 'one_time' && noTime} onChange={e => setTime(e.target.value)} />
    </div>
  );

  return (
    <Dialog title={editingQuest ? 'EDIT QUEST' : TITLES[type]} onClose={() => { if (!confirmDelete) closeEditor(onClose); }} pending={saving}>
      <div className="form-stack">
        {!editingQuest && (
          <div role="group" aria-label="Quest type">
            <span className="field-label">TYPE</span>
            <div className="seg">
              {TYPES.map(t => <button key={t.id} type="button" className="choice-chip" aria-pressed={type === t.id} onClick={() => setType(t.id)}>{t.label}</button>)}
            </div>
          </div>
        )}

        <div>
          {/* The error sits beside the label so showing it never adds a line to a dialog that must not scroll. */}
          <div className="field-label-row">
            <label className="field-label">QUEST NAME</label>
            {nameError && <p id="quest-name-error" role="alert" aria-live="polite" className="phase4-error field-label-error">{nameError}</p>}
          </div>
          <input aria-label="Quest name" aria-invalid={!!nameError} aria-describedby={nameError ? 'quest-name-error' : undefined} className="field" placeholder="e.g. Morning run for 30 min" value={name} onChange={e => { setName(e.target.value); setNameTouched(true); }} />
        </div>

        <div>
          <label className="field-label">NOTE {optional}</label>
          <textarea className="field" placeholder="Add a note, reminder, or motivation..." value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ resize: 'none', lineHeight: 1.5 }} />
        </div>

        {type !== 'habit' && (
          <div role="group" aria-label="Genre">
            <span className="field-label">GENRE {optional}</span>
            <div className="chip-row">
              {QUEST_GENRES.map(g => <button key={g.id} type="button" className="choice-chip" aria-pressed={genre === g.id} onClick={() => setGenre(genre === g.id ? null : g.id)}>{g.label}</button>)}
            </div>
          </div>
        )}

        {showPenalty && (
          <div>
            <div className="field-label-row">
              <label className="field-label">PENALTY <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--c-dim-flat)' }}> (required for habits)</span></label>
              <button
                type="button"
                onClick={() => void handleAiSuggest()}
                disabled={suggesting || !name.trim()}
                className="btn-quiet btn-compact"
              >
                <SparkleIcon size={12} /> {suggesting ? 'Reading the possibilities…' : 'SUGGEST PENALTIES'}
              </button>
            </div>
            <input className="field" placeholder="e.g. Walk for 10 min instead" value={easyVer} onChange={e => setEasyVer(e.target.value)} />
            {suggestError && <p role="alert" className="phase4-error">{suggestError}</p>}
            {suggestions && suggestions.length > 0 && (
              <div className="chip-row" style={{ marginTop: 8 }}>
                {suggestions.map(s => (
                  <button key={s} type="button" onClick={() => { setEasyVer(s); setSuggestions(null); }} className="choice-chip">{s}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {type === 'habit' && (
          <div className="habit-schedule">
            <div style={{ gridArea: 'time' }}>{timeField}</div>
            <div style={{ gridArea: 'days' }}>
              <label className="field-label">DAYS</label>
              <div className="day-chips">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <button key={i} type="button" className="day-chip" aria-label={DAY_NAMES[i]} aria-pressed={days.includes(i)} onClick={() => toggleDay(i)}>{d}</button>
                ))}
              </div>
            </div>
            <div style={{ gridArea: 'target' }}>
              <label className="field-label" htmlFor="quest-target">TARGET COUNT {optional}</label>
              <input id="quest-target" className="field" type="number" min={2} placeholder="e.g. 8 times a day" value={targetCount} onChange={e => setTargetCount(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
          </div>
        )}

        {type === 'one_time' && (
          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="quest-date">DATE</label>
              <input
                id="quest-date"
                className="field"
                type="date"
                value={scheduledDate}
                min={editingQuest ? undefined : accountDateKey(new Date(), user.timeZone)}
                disabled={!!editingQuest}
                aria-describedby={editingQuest ? 'quest-date-hint' : undefined}
                onChange={e => setScheduledDate(e.target.value)}
              />
              {editingQuest && <p id="quest-date-hint" className="field-hint">The date can't be changed after creation.</p>}
            </div>
            {timeField}
          </div>
        )}

        <div>
          <label className="field-label">ATTRIBUTE</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {STATS.map(s => <StatChip key={s} stat={s} selected={stat === s} onClick={() => setStat(s)} />)}
          </div>
        </div>

        <div>
          <label className="field-label">DIFFICULTY</label>
          <div className="seg">
            {DIFFICULTIES.map(d => (
              <button key={d} type="button" className="choice-chip" data-tone={d} aria-pressed={difficulty === d}
                style={{ fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }} onClick={() => setDifficulty(d)}>{d.toUpperCase()}</button>
            ))}
          </div>
        </div>

        {saveError && !confirmDelete && <p role="alert" className="phase4-error">{saveError}</p>}

        {editingQuest && (
          <div className="action-footer">
            {editingQuest.archived ? (
              <button type="button" onClick={() => void handleLifecycle('restore')} disabled={saving} className="btn-secondary">RESTORE QUEST</button>
            ) : editingQuest.questType !== 'backlog' ? (
              <button type="button" onClick={() => void handleLifecycle('archive')} disabled={saving} className="btn-secondary">ARCHIVE QUEST</button>
            ) : null}
            <button ref={deleteTrigger} type="button" onClick={() => { setConfirmDelete(true); setSaveError(null); }} disabled={saving} className="btn-destructive">DELETE PERMANENTLY</button>
          </div>
        )}

        <div className="action-footer">
          <button type="button" onClick={() => { if (!confirmDelete && !saving) closeEditor(onClose); }} disabled={confirmDelete || saving} className="btn-secondary">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving || !valid} className="btn-primary">
            {saving ? 'SAVING…' : editingQuest ? 'SAVE CHANGES' : 'CREATE QUEST'}
          </button>
        </div>

        {editingQuest && confirmDelete && <Dialog title={`Delete ${editingQuest.name} permanently?`} onClose={() => setConfirmDelete(false)} pending={saving} initialFocus="[data-cancel-delete]">
          <p>This permanently removes the saved quest. Its History, Weekly Review, and earned XP remain. This cannot be undone.</p>
          {saveError && <p role="alert" className="phase4-error">{saveError}</p>}
          <div className="action-footer"><button data-cancel-delete onClick={() => setConfirmDelete(false)} disabled={saving} className="btn-secondary">Cancel</button><button onClick={() => void handleLifecycle('delete')} disabled={saving} className="btn-destructive">{saving ? 'DELETING...' : 'Confirm permanent delete'}</button></div>
        </Dialog>}
      </div>
    </Dialog>
  );
}
