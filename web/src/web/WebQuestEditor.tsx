import { useState } from 'react';
import { Quest, Stat, Difficulty } from '../types';
import { STAT_COLORS, DAYS } from '../data';
import { StatIcon } from '../Icons';

interface Props {
  editingQuest?: Quest | null;
  onSave: (q: Quest) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const STATS: Stat[] = ['STR', 'INT', 'DEX', 'WIS', 'CHA'];

export default function WebQuestEditor({ editingQuest, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(editingQuest?.name ?? '');
  const [note, setNote] = useState(editingQuest?.note ?? '');
  const [easyVer, setEasyVer] = useState(editingQuest?.easyVersion ?? '');
  const [time, setTime] = useState(editingQuest?.time ?? '07:00');
  const [days, setDays] = useState<number[]>(editingQuest?.days ?? [1, 2, 3, 4, 5]);
  const [stat, setStat] = useState<Stat>(editingQuest?.stat ?? 'INT');
  const [difficulty, setDifficulty] = useState<Difficulty>(editingQuest?.difficulty ?? 'Medium');
  const [questType, setQuestType] = useState<'habit' | 'onetime'>('habit');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleDay = (d: number) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleSave = () => {
    if (!name.trim()) return;
    const quest: Quest = {
      id: editingQuest?.id ?? Date.now().toString(),
      name, note: note.trim() || undefined, easyVersion: easyVer, time, days, stat, difficulty,
      streak: editingQuest?.streak ?? 0, frozen: false, completed: false,
    };
    onSave(quest);
    onClose();
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete?.(editingQuest!.id);
    onClose();
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
              <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)' }}>EASY VERSION</label>
              <button style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>✦</span> AI Suggest
              </button>
            </div>
            <input className="field" placeholder="e.g. Walk for 10 min instead" value={easyVer} onChange={e => setEasyVer(e.target.value)} />
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

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={handleSave} className="btn-ghost" style={{ flex: 1, padding: '13px', fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em' }}>
              {editingQuest ? 'SAVE CHANGES' : 'CREATE QUEST'}
            </button>
            <button onClick={onClose} style={{ padding: '13px 20px', background: 'none', border: '1px solid var(--c-glass-border)', borderRadius: 50, fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>

          {/* Delete — only when editing */}
          {editingQuest && onDelete && (
            <button
              onClick={handleDelete}
              onMouseLeave={() => setConfirmDelete(false)}
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
