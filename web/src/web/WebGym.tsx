import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveGymRoutine, convertGymWeight, discardGymSession, fetchGym, formatError, gymWeight,
  moveGymExercises, normalizeGymExercise, removeGymExercise, saveGymExercise, saveGymRoutine,
  saveGymSession, startGymSession, type GymData, type GymEntry, type GymExercise,
  type GymPrescription, type GymRoutine, type GymSession, type GymUnit,
} from '@eiyu/shared';
import { useSession } from '../store/session-context';
import Dialog from '../components/Dialog';
import PaginatedList from '../components/PaginatedList';
import { deleteGymMedia, signGymMedia, uploadGymMedia } from './gym-media';

const EMPTY: GymData = { routines: [], exercises: [], sessions: [], entries: [] };

function RoutineEditor({ routine, userId, onClose, onSaved }: {
  routine?: GymRoutine; userId: string; onClose: () => void; onSaved: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(routine?.name ?? '');
  const [unit, setUnit] = useState<GymUnit>(routine?.unit ?? 'kg');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  return <Dialog title={routine ? 'Edit routine' : 'Create routine'} onClose={onClose} pending={pending}>
    <form className="gym-form" onSubmit={async event => {
      event.preventDefault(); if (inFlight.current) return;
      inFlight.current = true; setPending(true); setError(null);
      try { const id = await saveGymRoutine(userId, name, unit, routine?.id); await onSaved(id); onClose(); }
      catch (err) { setError(formatError(err)); }
      finally { inFlight.current = false; setPending(false); }
    }}>
      <label>Routine name<input className="field" required maxLength={80} value={name} onChange={e => setName(e.target.value)} disabled={pending} placeholder="Chest–Tricep–Shoulders" /></label>
      <label>Weight unit<select className="field" value={unit} onChange={e => setUnit(e.target.value as GymUnit)} disabled={pending}><option value="kg">kg</option><option value="lb">lb</option></select></label>
      <p>Completed workouts keep their original unit and exercise details.</p>
      {error && <p role="alert" className="phase4-error">{error}</p>}
      <button className="btn-ghost" disabled={pending}>{pending ? 'Saving…' : 'Save routine'}</button>
    </form>
  </Dialog>;
}

function ExerciseEditor({ exercise, routine, userId, nextPosition, onClose, onSaved }: {
  exercise?: GymExercise; routine: GymRoutine; userId: string; nextPosition: number;
  onClose: () => void; onSaved: (warning?: string) => Promise<void>;
}) {
  const [form, setForm] = useState<GymPrescription>(exercise ?? { name: '', sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const field = <K extends keyof GymPrescription>(key: K, value: GymPrescription[K]) => setForm(prev => ({ ...prev, [key]: value }));
  return <Dialog title={exercise ? 'Edit exercise' : 'Add exercise'} onClose={onClose} pending={pending}>
    <form className="gym-form" onSubmit={async event => {
      event.preventDefault(); if (inFlight.current) return;
      inFlight.current = true; setPending(true); setError(null);
      let uploaded: string | null = null;
      let committed = false;
      try {
        const normalized = normalizeGymExercise(form);
        let path = removeMedia ? null : exercise?.media_path ?? null;
        let mime = removeMedia ? null : exercise?.media_mime ?? null;
        if (file) { const media = await uploadGymMedia(userId, routine.id, file); uploaded = media.path; path = media.path; mime = media.mime; }
        await saveGymExercise({ ...normalized, id: exercise?.id, user_id: userId, routine_id: routine.id, position: exercise?.position ?? nextPosition, media_path: path, media_mime: mime });
        committed = true;
        let warning: string | undefined;
        if (exercise?.media_path && exercise.media_path !== path) {
          try { await deleteGymMedia(exercise.media_path); }
          catch (err) { warning = `Exercise saved. Previous media cleanup failed: ${formatError(err)}`; }
        }
        await onSaved(warning); onClose();
      } catch (err) {
        let message = formatError(err);
        if (uploaded && !committed) { try { await deleteGymMedia(uploaded); } catch (cleanup) { message += ` Uploaded media cleanup failed: ${formatError(cleanup)}`; } }
        setError(message);
      } finally { inFlight.current = false; setPending(false); }
    }}>
      <label>Demonstration (optional GIF or MP4, up to 20 MiB)<input type="file" accept="image/gif,video/mp4" disabled={pending} onChange={event => { setFile(event.target.files?.[0] ?? null); setRemoveMedia(false); }} /></label>
      {exercise?.media_path && <label className="gym-checkbox"><input type="checkbox" checked={removeMedia} disabled={pending} onChange={e => { setRemoveMedia(e.target.checked); setFile(null); }} />Remove current demonstration</label>}
      <label>Exercise name<input className="field" required maxLength={80} value={form.name} disabled={pending} onChange={e => field('name', e.target.value)} /></label>
      <div className="gym-fields">
        <label>Sets<input className="field" type="number" min={1} max={99} required value={form.sets} disabled={pending} onChange={e => field('sets', Number(e.target.value))} /></label>
        <label>Reps or range<input className="field" required value={form.reps} disabled={pending} onChange={e => field('reps', e.target.value)} placeholder="8–12" /></label>
        <label>Rest (seconds)<input className="field" type="number" min={0} max={86400} required value={form.rest_seconds} disabled={pending} onChange={e => field('rest_seconds', Number(e.target.value))} /></label>
        <label>RIR<input className="field" type="number" min={0} max={10} required value={form.rir} disabled={pending} onChange={e => field('rir', Number(e.target.value))} /></label>
      </div>
      <label>Notes<textarea className="field" rows={2} maxLength={2000} value={form.notes} disabled={pending} onChange={e => field('notes', e.target.value)} /></label>
      {error && <p role="alert" className="phase4-error">{error}</p>}
      <button className="btn-ghost" disabled={pending}>{pending ? 'Saving…' : 'Save exercise'}</button>
    </form>
  </Dialog>;
}

function Demonstration({ exercise, onClose, onEdit }: { exercise: GymExercise; onClose: () => void; onEdit: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setUrl(null); setError(null);
    if (exercise.media_path) signGymMedia(exercise.media_path).then(value => { if (active) setUrl(value); }).catch(err => { if (active) setError(formatError(err)); });
    return () => { active = false; };
  }, [exercise.media_path, retry]);
  return <Dialog title={exercise.name} onClose={onClose}>
    {!exercise.media_path ? <><p>No demonstration uploaded for this exercise.</p><button className="btn-ghost" onClick={onEdit}>Edit exercise</button></> : error ? <div role="alert"><p>{error}</p><button className="btn-ghost" onClick={() => setRetry(n => n + 1)}>Reload demonstration</button></div> : !url ? <p role="status">Loading demonstration…</p> : exercise.media_mime === 'image/gif' ? <img className="gym-media" src={url} alt={`${exercise.name} demonstration`} onError={() => setError('Demonstration could not load. Reload to refresh access.')} /> : <video className="gym-media" src={url} controls playsInline preload="metadata" onError={() => setError('Video could not load. Reload to refresh access.')} />}
  </Dialog>;
}

function WorkoutHistory({ sessions, entries, onClose }: { sessions: GymSession[]; entries: GymEntry[]; onClose: () => void }) {
  return <Dialog title="Workout history" onClose={onClose}><div className="gym-history"><PaginatedList label="Workout history" empty="No completed workouts yet.">
    {sessions.filter(s => s.status === 'completed').map(session => <details key={session.id} className="gym-history-session"><summary>{session.routine_name} · {new Date(session.completed_at!).toLocaleString()} · {session.unit}</summary>
      {entries.filter(e => e.session_id === session.id).map(entry => <p key={entry.id}>{entry.prescription.name} · {entry.prescription.sets} × {entry.prescription.reps} · {entry.weight ?? '—'} {session.unit}</p>)}
    </details>)}
  </PaginatedList></div></Dialog>;
}

export default function WebGym() {
  const { user } = useSession();
  return user ? <GymWorkspace key={user.id} userId={user.id} /> : null;
}

function GymWorkspace({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const key = ['gym', userId];
  const query = useQuery({ queryKey: key, queryFn: () => fetchGym(userId!), enabled: !!userId });
  const data = query.data ?? EMPTY;
  const [selected, setSelected] = useState<string>('');
  const [routineEditor, setRoutineEditor] = useState<'new' | 'edit' | null>(null);
  const [exerciseEditor, setExerciseEditor] = useState<GymExercise | 'new' | null>(null);
  const [demo, setDemo] = useState<GymExercise | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const routines = data.routines.filter(r => showArchived || !r.archived);
  const routine = routines.find(r => r.id === selected) ?? routines[0];
  const exercises = data.exercises.filter(e => e.routine_id === routine?.id);
  const sessions = data.sessions.filter(s => s.routine_id === routine?.id);
  const draft = sessions.find(s => s.status === 'draft');
  const latest = sessions.find(s => s.status === 'completed');
  const draftEntries = data.entries.filter(e => e.session_id === draft?.id);
  const rows = draft ? draftEntries.map(entry => ({ id: entry.exercise_id, ...entry.prescription })) : exercises;
  const unit = draft?.unit ?? routine?.unit ?? 'kg';
  const dirty = draftEntries.some(entry => weights[entry.exercise_id] !== undefined && weights[entry.exercise_id] !== (entry.weight === null ? '' : String(entry.weight)));
  const blocker = useBlocker(() => pending || dirty);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (pending || !window.confirm('Leave without saving current weights? Your last saved draft will remain.')) blocker.reset(); else blocker.proceed();
  }, [blocker, pending]);
  useEffect(() => {
    if (!dirty) return;
    const before = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['gym', userId] }); };
  const run = async (task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null); setNotice(null);
    try { await task(); await refresh(); }
    catch (err) { setError(formatError(err)); }
    finally { inFlight.current = false; setPending(false); }
  };
  const previousWeight = (id: string) => {
    const entry = data.entries.find(e => e.session_id === latest?.id && e.exercise_id === id);
    return entry?.weight == null || !latest ? '—' : convertGymWeight(entry.weight, latest.unit, unit);
  };
  const inputWeight = (id: string) => weights[id] ?? (draftEntries.find(e => e.exercise_id === id)?.weight == null ? '' : String(draftEntries.find(e => e.exercise_id === id)!.weight));
  const saveWorkout = (finish: boolean) => void run(async () => {
    if (!draft) return;
    await saveGymSession(draft.id, draftEntries.map(entry => ({ exercise_id: entry.exercise_id, weight: gymWeight(inputWeight(entry.exercise_id)) })), finish);
    setWeights({}); setNotice(finish ? 'Workout completed. Progress saved.' : 'Workout draft saved.');
  });
  if (!userId) return null;
  if (query.isPending) return <p role="status">Reading Gym Progress…</p>;
  if (query.isError) return <div className="board-state" role="alert"><p>{formatError(query.error)}</p><button className="btn-ghost" onClick={() => void query.refetch()}>Retry</button></div>;
  return <div className="gym-page">
    <header className="gym-heading"><h1>Gym Progress</h1><div className="gym-actions"><button className="btn-ghost" onClick={() => setHistory(true)}>Workout history</button><button className="btn-ghost" onClick={() => setRoutineEditor('new')} disabled={pending}>Create routine</button></div></header>
    <div className="gym-toolbar"><label>Routine<select className="field" value={routine?.id ?? ''} disabled={pending} onChange={e => { if (!dirty || window.confirm('Switch routines without saving current weights?')) { setSelected(e.target.value); setWeights({}); } }}>{!routines.length && <option value="">No routines</option>}{routines.map(r => <option key={r.id} value={r.id}>{r.name}{r.archived ? ' (archived)' : ''}</option>)}</select></label><label className="gym-checkbox"><input type="checkbox" checked={showArchived} onChange={e => { if (!dirty || window.confirm('Leave without saving current weights?')) { setShowArchived(e.target.checked); setWeights({}); } }} />Include archived routines</label></div>
    {error && <p role="alert" className="phase4-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!routine ? <p className="board-lane-empty">Create your first routine, then add its exercises.</p> : <>
      <div className="gym-routine-heading"><h2>{routine.name} <small>{unit}</small></h2><div className="gym-actions">
        <button className="btn-ghost" disabled={pending} onClick={() => setRoutineEditor('edit')}>Edit routine</button>
        <button className="btn-ghost" disabled={pending || dirty} onClick={() => void run(async () => { await archiveGymRoutine(routine.id, !routine.archived); setWeights({}); })}>{routine.archived ? 'Restore routine' : 'Archive routine'}</button>
        <button className="btn-ghost" disabled={pending || routine.archived} onClick={() => setExerciseEditor('new')}>Add exercise</button>
      </div></div>
      <div className="gym-table" role="table" aria-label={routine.name}>
        <div className="gym-table-header" role="row">{['#', 'Exercise', 'Sets × Reps', 'Rest', 'RIR', 'Notes', 'Previous Weight', 'Current Weight'].map(title => <span role="columnheader" key={title}>{title}</span>)}</div>
        <PaginatedList label="Exercises" empty="Add exercises to this routine before starting a workout.">
          {rows.map((row, index) => <div className="gym-row" role="row" key={row.id}>
            <span role="cell" data-label="#">{index + 1}</span>
            <div role="cell" data-label="Exercise"><button className="gym-exercise-name" onClick={() => { const exercise = exercises.find(e => e.id === row.id); if (exercise) setDemo(exercise); else setNotice('This exercise was removed from the routine. Its saved workout details remain.'); }}>{row.name}</button>
              {!draft && <div className="gym-row-actions"><button className="btn-ghost" onClick={() => setExerciseEditor(exercises.find(e => e.id === row.id)!)} disabled={pending}>Edit</button><button className="btn-ghost" aria-label={`Move ${row.name} up`} disabled={index === 0 || pending} onClick={() => void run(async () => { const ids = exercises.map(e => e.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; await moveGymExercises(routine, ids); })}>↑</button><button className="btn-ghost" aria-label={`Move ${row.name} down`} disabled={index === exercises.length - 1 || pending} onClick={() => void run(async () => { const ids = exercises.map(e => e.id); [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]; await moveGymExercises(routine, ids); })}>↓</button><button className="btn-ghost" disabled={pending} onClick={() => { if (window.confirm(`Remove ${row.name} from the routine? Completed workout history remains.`)) void run(async () => { const exercise = exercises.find(e => e.id === row.id)!; await removeGymExercise(row.id); if (exercise.media_path) { try { await deleteGymMedia(exercise.media_path); } catch (err) { setNotice(`Exercise removed. Media cleanup failed: ${formatError(err)}`); } } }); }}>Remove</button></div>}
            </div>
            <span role="cell" data-label="Sets × Reps">{row.sets} × {row.reps}</span><span role="cell" data-label="Rest">{row.rest_seconds}s</span><span role="cell" data-label="RIR">{row.rir}</span><span role="cell" data-label="Notes" className="gym-notes" title={row.notes}>{row.notes || '—'}</span><span role="cell" data-label="Previous Weight">{previousWeight(row.id)} {unit}</span>
            <div role="cell" data-label="Current Weight"><input className="field gym-weight" aria-label={`Current weight for ${row.name} in ${unit}`} type="number" min={0} max={1000000} step="0.001" value={inputWeight(row.id)} disabled={!draft || pending} onChange={e => setWeights(prev => ({ ...prev, [row.id]: e.target.value }))} /></div>
          </div>)}
        </PaginatedList>
      </div>
      <footer className="gym-session-actions">{draft ? <><span>Workout draft · {draft.unit}</span><button className="btn-ghost" disabled={pending} onClick={() => saveWorkout(false)}>Save draft</button><button className="btn-ghost" disabled={pending} onClick={() => saveWorkout(true)}>Finish workout</button><button className="btn-ghost" disabled={pending} onClick={() => { if (window.confirm('Discard this unfinished workout?')) void run(async () => { await discardGymSession(draft.id); setWeights({}); }); }}>Discard draft</button></> : <button className="btn-ghost" disabled={pending || !exercises.length || routine.archived} onClick={() => void run(async () => { await startGymSession(routine.id); setWeights({}); })}>Start workout</button>}{pending && <span role="status">Saving…</span>}</footer>
    </>}
    {routineEditor && <RoutineEditor routine={routineEditor === 'edit' ? routine : undefined} userId={userId} onClose={() => setRoutineEditor(null)} onSaved={async id => { setSelected(id); await refresh(); }} />}
    {exerciseEditor && routine && <ExerciseEditor exercise={exerciseEditor === 'new' ? undefined : exerciseEditor} routine={routine} userId={userId} nextPosition={Math.max(-1, ...exercises.map(e => e.position)) + 1} onClose={() => setExerciseEditor(null)} onSaved={async warning => { await refresh(); setNotice(warning ?? 'Exercise saved.'); }} />}
    {demo && <Demonstration exercise={demo} onClose={() => setDemo(null)} onEdit={() => { setExerciseEditor(demo); setDemo(null); }} />}
    {note !== null && <Dialog title="Exercise notes" onClose={() => setNote(null)}><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note}</p></Dialog>}
    {history && <WorkoutHistory sessions={data.sessions} entries={data.entries} onClose={() => setHistory(false)} />}
  </div>;
}
