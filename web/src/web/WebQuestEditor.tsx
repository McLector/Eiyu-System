import { useRef, useState } from 'react';
import Dialog from '../components/Dialog';
import { useEditorGuard } from '../components/NavigationGuard';
import { accountDateKey, DEFAULT_HABIT_DAYS, Quest, Stat, Difficulty, STATS, HabitInput, formatError, normalizeNameBoundaries, suggestEasyVersions, validateQuestName } from '@eiyu/shared';
import { STAT_COLORS } from '@eiyu/shared';
import { SparkleIcon, StatIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';
import { announceArchive, getNotificationOwner } from '../components/ArchiveNotice';

interface Props {
  editingQuest?: Quest | null;
  initialType?: 'habit' | 'one_time';
  onClose: () => void;
}

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

export default function WebQuestEditor({ editingQuest, initialType = 'habit', onClose }: Props) {
  const { user, saveHabit, archiveQuest, restoreQuest, deleteQuest } = useEiyu();
  const [name, setName] = useState(editingQuest?.name ?? '');
  const [note, setNote] = useState(editingQuest?.description ?? '');
  const [easyVer, setEasyVer] = useState(editingQuest?.easyVersion ?? '');
  const [time, setTime] = useState(editingQuest?.time ?? '07:00');
  const [scheduledDate, setScheduledDate] = useState(() => accountDateKey(new Date(), user.timeZone));
  const [targetCount, setTargetCount] = useState(editingQuest?.targetCount != null ? String(editingQuest.targetCount) : '');
  const [days, setDays] = useState<number[]>(editingQuest?.days ?? [...DEFAULT_HABIT_DAYS]);
  const [stat, setStat] = useState<Stat>(editingQuest?.stat ?? 'INT');
  const [difficulty, setDifficulty] = useState<Difficulty>(editingQuest?.difficulty ?? 'Medium');
  const questType = (editingQuest?.questType ?? initialType) === 'one_time' ? 'onetime' : 'habit';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const lifecycleInFlight = useRef(false);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const initial = useRef(JSON.stringify({ name, note, easyVer, time, scheduledDate, targetCount, days, stat, difficulty }));
  const closeEditor = useEditorGuard(JSON.stringify({ name, note, easyVer, time, scheduledDate, targetCount, days, stat, difficulty }) !== initial.current, saving);

  const toggleDay = (d: number) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  // One-time quests and quantity habits (target count set) have no easy
  // version — every other habit requires one (the DB enforces this with the
  // habits_easy_version_present CHECK constraint, which exempts both cases).
  const targetCountValid = !targetCount || Number(targetCount) > 1;
  const nameError = editingQuest?.name === name ? null : validateQuestName(name);
  const valid =
    !nameError &&
    (questType === 'onetime' || easyVer.trim().length > 0 || !!targetCount) &&
    targetCountValid;

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const input: HabitInput = {
        name: editingQuest?.name === name ? name : normalizeNameBoundaries(name),
        easyVersion: easyVer.trim() || null,
        stat,
        difficulty,
        time,
        days,
        questType: questType === 'onetime' ? 'one_time' : 'habit',
        description: note.trim() || null,
        scheduledDate: questType === 'onetime' ? scheduledDate : null,
        targetCount: questType === 'habit' && targetCount ? Number(targetCount) : null,
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
      if (operation === 'archive') { await archiveQuest(editingQuest.id); announceArchive(editingQuest.questType, notificationOwner); }
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
      const results = await suggestEasyVersions(name.trim(), stat);
      setSuggestions(results);
    } catch (err) {
      setSuggestError(`The System couldn't summon a suggestion — ${formatError(err)}`);
    } finally {
      setSuggesting(false);
    }
  };

  const diffColors: Record<Difficulty, string> = { Easy: '#4ade80', Medium: '#fbbf24', Hard: '#f87171' };

  return (
    <Dialog title={editingQuest ? 'EDIT QUEST' : questType === 'onetime' ? 'NEW ONE TIME QUEST' : 'NEW DAILY QUEST'} onClose={() => { if (!confirmDelete) closeEditor(onClose); }} pending={saving}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name */}
          <div>
            <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 7 }}>QUEST NAME</label>
            <input aria-label="Quest name" aria-invalid={!!nameError} aria-describedby={nameError ? 'quest-name-error' : undefined} className="field" placeholder="e.g. Morning run for 30 min" value={name} onChange={e => setName(e.target.value)} />
            {nameError && <p id="quest-name-error" role="alert" aria-live="polite" style={{ fontFamily: 'Inter', fontSize: 11, color: '#f87171', margin: '6px 0 0' }}>{nameError}</p>}
          </div>

          {/* Note */}
          <div>
            <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 7 }}>NOTE <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--c-dim-flat)' }}>(optional)</span></label>
            <textarea
              className="field"
              placeholder="Add a note, reminder, or motivation..."
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              style={{ resize: 'vertical', minHeight: 60, lineHeight: 1.5 }}
            />
          </div>

          {/* Penalty — hidden for quantity habits; legacy easyVer state preserves storage compatibility. */}
          {!targetCount && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)' }}>PENALTY <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--c-dim-flat)' }}> (required for habits)</span></label>
              <button
                type="button"
                onClick={() => void handleAiSuggest()}
                disabled={suggesting || !name.trim()}
                style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: suggesting || !name.trim() ? 0.5 : 1 }}
              >
                <SparkleIcon size={12} /> {suggesting ? 'Reading the possibilities…' : 'SUGGEST PENALTIES'}
              </button>
            </div>
            <input className="field" placeholder="e.g. Walk for 10 min instead" value={easyVer} onChange={e => setEasyVer(e.target.value)} />
            {suggestError && <p style={{ fontFamily: 'Inter', fontSize: 11, color: '#f87171', marginTop: 6 }}>{suggestError}</p>}
            {suggestions && suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setEasyVer(s); setSuggestions(null); }}
                    className="btn-ghost"
                    style={{ padding: '5px 10px', fontFamily: 'Inter', fontSize: 11, color: 'var(--c-accent)' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Target count — habit type only */}
          {questType === 'habit' && (
            <div>
              <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 7 }}>
                TARGET COUNT <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--c-dim-flat)' }}>(optional — e.g. 8x a day)</span>
              </label>
              <input
                className="field"
                type="number"
                min={2}
                placeholder="Leave blank for a normal habit"
                value={targetCount}
                onChange={e => setTargetCount(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
          )}

          {/* Time + Days */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 7 }}>TIME</label>
              <input className="field" type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
            {questType === 'habit' && (
            <div>
              <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 7 }}>DAYS</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <button key={i} aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]} aria-pressed={days.includes(i)} onClick={() => toggleDay(i)} style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: days.includes(i) ? 'var(--c-accent-glass)' : 'transparent',
                    border: `1px solid ${days.includes(i) ? 'var(--c-accent-border)' : 'var(--c-glass-border)'}`,
                    fontFamily: 'Rajdhani', fontSize: 10, fontWeight: 700,
                    color: days.includes(i) ? 'var(--c-accent)' : 'var(--c-dim-flat)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>{d}</button>
                ))}
              </div>
            </div>
            )}
          </div>

          {/* Date — one-time quests only */}
          {questType === 'onetime' && (
            <div>
              <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 7 }}>DATE</label>
              <input
                className="field"
                type="date"
                value={scheduledDate}
                min={(() => {
                  const d = new Date();
                  const pad = (n: number) => String(n).padStart(2, '0');
                  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                })()}
                onChange={e => setScheduledDate(e.target.value)}
              />
            </div>
          )}

          {/* Stat */}
          <div>
            <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 8 }}>ATTRIBUTE</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {STATS.map(s => (
                <button key={s} onClick={() => setStat(s)} style={{
                  padding: '8px 4px',
                  borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  background: stat === s ? STAT_COLORS[s] + '18' : 'transparent',
                  border: `1px solid ${stat === s ? STAT_COLORS[s] + '55' : 'var(--c-glass-border)'}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <StatIcon stat={s} size={13} />
                  <span style={{ fontFamily: 'Rajdhani', fontSize: 9, fontWeight: 700, color: stat === s ? STAT_COLORS[s] : 'var(--c-dim-flat)', letterSpacing: '0.08em' }}>{s}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 8 }}>DIFFICULTY</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DIFFICULTIES.map(d => (
                <button key={d} onClick={() => setDifficulty(d)} style={{
                  padding: '9px',
                  borderRadius: 8,
                  background: difficulty === d ? diffColors[d] + '18' : 'transparent',
                  border: `1px solid ${difficulty === d ? diffColors[d] + '55' : 'var(--c-glass-border)'}`,
                  fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                  color: difficulty === d ? diffColors[d] : 'var(--c-muted-flat)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>{d.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {saveError && !confirmDelete && <p style={{ fontFamily: 'Inter', fontSize: 12, color: '#f87171' }}>{saveError}</p>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={() => void handleSave()} disabled={saving || !valid} className="btn-primary" style={{ padding: '13px', fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-bg)', letterSpacing: '0.08em', opacity: saving || !valid ? 0.6 : 1 }}>
              {saving ? 'SAVING…' : editingQuest ? 'SAVE CHANGES' : 'CREATE QUEST'}
            </button>
            <button onClick={() => { if (!confirmDelete && !saving) closeEditor(onClose); }} disabled={confirmDelete || saving} style={{ padding: '13px 20px', background: 'none', border: '1px solid var(--c-glass-border)', borderRadius: 6, fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted-flat)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>

          {/* Lifecycle controls — archive is reversible; delete is permanent. */}
          {editingQuest && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {editingQuest.archived ? (
                  <button
                    onClick={() => void handleLifecycle('restore')}
                    disabled={saving}
                    className="btn-ghost"
                    style={{ padding: '10px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em' }}>
                    RESTORE QUEST
                  </button>
                ) : (
                  <button
                    onClick={() => void handleLifecycle('archive')}
                    disabled={saving}
                    className="btn-ghost"
                    style={{ padding: '10px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-muted-flat)', letterSpacing: '0.08em' }}>
                    ARCHIVE QUEST
                  </button>
                )}
                <button
                  ref={deleteTrigger}
                  onClick={() => { setConfirmDelete(true); setSaveError(null); }}
                  disabled={saving}
                  style={{ padding: '10px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(248,113,113,0.25)', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: '#f87171', letterSpacing: '0.08em' }}>
                  DELETE PERMANENTLY
                </button>
              </div>

              {confirmDelete && <Dialog title={`Delete ${editingQuest?.name} permanently?`} onClose={() => setConfirmDelete(false)} pending={saving} initialFocus="[data-cancel-delete]">
                <p>This permanently removes the saved quest. Its History, Weekly Review, and earned XP remain. This cannot be undone.</p>
                {saveError && <p role="alert">{saveError}</p>}
                <div className="action-footer"><button data-cancel-delete onClick={() => setConfirmDelete(false)} disabled={saving} className="btn-secondary">Cancel</button><button onClick={() => void handleLifecycle('delete')} disabled={saving} className="btn-destructive">{saving ? 'DELETING...' : 'Confirm permanent delete'}</button></div>
              </Dialog>}
            </div>
          )}
        </div>
    </Dialog>
  );
}
