import { useState } from 'react';
import { Quest, Stat, Difficulty, STATS, HabitInput, formatError, suggestEasyVersions } from '@eiyu/shared';
import { STAT_COLORS, DAYS } from '@eiyu/shared';
import { StatIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';

interface Props {
  editingQuest?: Quest | null;
  onClose: () => void;
}

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

export default function WebQuestEditor({ editingQuest, onClose }: Props) {
  const { saveHabit, archiveQuest } = useEiyu();
  const [name, setName] = useState(editingQuest?.name ?? '');
  const [note, setNote] = useState(editingQuest?.description ?? '');
  const [easyVer, setEasyVer] = useState(editingQuest?.easyVersion ?? '');
  const [time, setTime] = useState(editingQuest?.time ?? '07:00');
  const [days, setDays] = useState<number[]>(editingQuest?.days ?? [1, 2, 3, 4, 5]);
  const [stat, setStat] = useState<Stat>(editingQuest?.stat ?? 'INT');
  const [difficulty, setDifficulty] = useState<Difficulty>(editingQuest?.difficulty ?? 'Medium');
  const [questType, setQuestType] = useState<'habit' | 'onetime'>(
    editingQuest?.questType === 'one_time' ? 'onetime' : 'habit'
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const toggleDay = (d: number) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  // One-time quests have no easy version — habit-type quests require one
  // (the DB enforces this with the habits_easy_version_present CHECK constraint).
  const valid = name.trim().length > 0 && (questType === 'onetime' || easyVer.trim().length > 0);

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const input: HabitInput = {
        name: name.trim(),
        easyVersion: easyVer.trim() || null,
        stat,
        difficulty,
        time,
        days,
        questType: questType === 'onetime' ? 'one_time' : 'habit',
        description: note.trim() || null,
      };
      await saveHabit(input, editingQuest?.id);
      onClose();
    } catch (err) {
      setSaveError(formatError(err));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (!editingQuest) return;
    setSaving(true);
    setSaveError(null);
    try {
      await archiveQuest(editingQuest.id);
      onClose();
    } catch (err) {
      setSaveError(formatError(err));
      setSaving(false);
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
      setSuggestError(formatError(err));
    } finally {
      setSuggesting(false);
    }
  };

  const diffColors: Record<Difficulty, string> = { Easy: '#4ade80', Medium: '#fbbf24', Hard: '#f87171' };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'var(--c-overlay)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--c-modal)', border: '1px solid var(--c-glass-border)',
        borderRadius: 20, width: '100%', maxWidth: 480,
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'Rajdhani', fontSize: 20, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.06em', margin: 0 }}>
            {editingQuest ? 'EDIT QUEST' : 'NEW QUEST'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-dim)', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ height: 2, background: 'var(--c-accent)', margin: '16px 24px 0', borderRadius: 1, opacity: 0.7 }} />

        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Quest type */}
          <div>
            <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 8 }}>TYPE</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['habit', 'onetime'] as const).map(t => (
                <button key={t} onClick={() => setQuestType(t)} style={{
                  flex: 1, padding: '9px', borderRadius: 10,
                  background: questType === t ? 'var(--c-accent-glass)' : 'transparent',
                  border: `1px solid ${questType === t ? 'var(--c-accent-border)' : 'var(--c-glass-border)'}`,
                  fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
                  color: questType === t ? 'var(--c-accent)' : 'var(--c-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {t === 'habit' ? 'HABIT' : 'ONE-TIME'}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 7 }}>QUEST NAME</label>
            <input className="field" placeholder="e.g. Morning run for 30 min" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* Note */}
          <div>
            <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 7 }}>NOTE <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--c-dim)' }}>(optional)</span></label>
            <textarea
              className="field"
              placeholder="Add a note, reminder, or motivation..."
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              style={{ resize: 'vertical', minHeight: 60, lineHeight: 1.5 }}
            />
          </div>

          {/* Easy version */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)' }}>EASY VERSION <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--c-dim)' }}> (required for habits)</span></label>
              <button
                type="button"
                onClick={() => void handleAiSuggest()}
                disabled={suggesting || !name.trim()}
                style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: suggesting || !name.trim() ? 0.5 : 1 }}
              >
                <span>✦</span> {suggesting ? 'Thinking…' : 'AI Suggest'}
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

          {/* Time + Days */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 7 }}>TIME</label>
              <input className="field" type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div>
              <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 7 }}>DAYS</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <button key={i} onClick={() => toggleDay(i)} style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: days.includes(i) ? 'var(--c-accent-glass)' : 'transparent',
                    border: `1px solid ${days.includes(i) ? 'var(--c-accent-border)' : 'var(--c-glass-border)'}`,
                    fontFamily: 'Rajdhani', fontSize: 10, fontWeight: 700,
                    color: days.includes(i) ? 'var(--c-accent)' : 'var(--c-dim)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>{d}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Stat */}
          <div>
            <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 8 }}>ATTRIBUTE</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {STATS.map(s => (
                <button key={s} onClick={() => setStat(s)} style={{
                  flex: 1, padding: '8px 4px',
                  borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  background: stat === s ? STAT_COLORS[s] + '18' : 'transparent',
                  border: `1px solid ${stat === s ? STAT_COLORS[s] + '55' : 'var(--c-glass-border)'}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <StatIcon stat={s} size={13} />
                  <span style={{ fontFamily: 'Rajdhani', fontSize: 9, fontWeight: 700, color: stat === s ? STAT_COLORS[s] : 'var(--c-dim)', letterSpacing: '0.08em' }}>{s}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 8 }}>DIFFICULTY</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DIFFICULTIES.map(d => (
                <button key={d} onClick={() => setDifficulty(d)} style={{
                  flex: 1, padding: '9px',
                  borderRadius: 10,
                  background: difficulty === d ? diffColors[d] + '18' : 'transparent',
                  border: `1px solid ${difficulty === d ? diffColors[d] + '55' : 'var(--c-glass-border)'}`,
                  fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                  color: difficulty === d ? diffColors[d] : 'var(--c-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>{d.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {saveError && <p style={{ fontFamily: 'Inter', fontSize: 12, color: '#f87171' }}>{saveError}</p>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={() => void handleSave()} disabled={saving || !valid} className="btn-ghost" style={{ flex: 1, padding: '13px', fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em', opacity: saving || !valid ? 0.6 : 1 }}>
              {saving ? 'SAVING…' : editingQuest ? 'SAVE CHANGES' : 'CREATE QUEST'}
            </button>
            <button onClick={onClose} style={{ padding: '13px 20px', background: 'none', border: '1px solid var(--c-glass-border)', borderRadius: 50, fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>

          {/* Delete — only when editing */}
          {editingQuest && (
            <button
              onClick={() => void handleDelete()}
              onMouseLeave={() => setConfirmDelete(false)}
              disabled={saving}
              style={{
                padding: '10px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                background: confirmDelete ? 'rgba(248,113,113,0.12)' : 'transparent',
                border: `1px solid ${confirmDelete ? 'rgba(248,113,113,0.45)' : 'rgba(248,113,113,0.2)'}`,
                fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700,
                color: '#f87171', letterSpacing: '0.08em',
              }}
            >
              {confirmDelete ? 'CONFIRM DELETE' : 'DELETE QUEST'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
