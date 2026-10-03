import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveGymRoutine, convertGymWeight, discardGymSession, fetchGym, formatError, gymWeight,
  moveGymExercises, normalizeGymExercise, removeGymExercise, saveGymExercise, saveGymRoutine,
  saveGymSession, startGymSession, type GymData, type GymEntry, type GymExercise,
  type GymRoutine, type GymUnit,
  parseGymRir, fetchPreviousGymWeights, fetchGymHistory, deleteGymRoutine, listGymMediaCleanup, acknowledgeGymMediaCleanup,
  UncertainSaveError,
} from '@eiyu/shared';
import { useSession } from '../store/session-context';
import Dialog from '../components/Dialog';
import FlowList from '../components/FlowList';
import { announceFeedback } from '../components/ArchiveNotice';
import { useEditorGuard } from '../components/NavigationGuard';
import { deleteGymMedia, signGymMedia, uploadGymMedia } from './gym-media';

const EMPTY: GymData = { routines: [], exercises: [], sessions: [], entries: [] };

function RoutineEditor({ routine, userId, onClose, onSaved }: {
  routine?: GymRoutine; userId: string; onClose: () => void; onSaved: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(routine?.name ?? '');
  const [unit, setUnit] = useState<GymUnit>(routine?.unit ?? 'kg');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const creationId = useRef(crypto.randomUUID());
  const closeEditor = useEditorGuard(name !== (routine?.name ?? '') || unit !== (routine?.unit ?? 'kg'), pending || uncertain);
  return <Dialog title={routine ? 'Edit routine' : 'Create routine'} onClose={() => closeEditor(onClose)} pending={pending}>
    <form className="gym-form" onSubmit={async event => {
      event.preventDefault(); if (inFlight.current) return;
      inFlight.current = true; setPending(true); setError(null);
      try { const id = await saveGymRoutine(userId, name, unit, routine?.id, creationId.current); onClose(); await onSaved(id); }
      catch (err) { setUncertain(err instanceof UncertainSaveError); setError(formatError(err)); }
      finally { inFlight.current = false; setPending(false); }
    }}>
      <label>Routine name<input className="field" required value={name} onChange={e => setName(e.target.value)} disabled={pending || uncertain} placeholder="Chest–Tricep–Shoulders" /></label>
      <label>Weight unit<select className="field" value={unit} onChange={e => setUnit(e.target.value as GymUnit)} disabled={pending || uncertain}><option value="kg">kg</option><option value="lb">lb</option></select></label>

      {error && <p role="alert" className="phase4-error">{error}</p>}
      <div className="action-footer"><button type="button" className="btn-secondary" disabled={pending || uncertain} onClick={() => closeEditor(onClose)}>Cancel</button><button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : uncertain ? 'Check save result' : 'Save routine'}</button></div>
    </form>
  </Dialog>;
}

function ExerciseEditor({ exercise, routine, userId, nextPosition, onClose, onSaved }: {
  exercise?: GymExercise; routine: GymRoutine; userId: string; nextPosition: number;
  onClose: () => void; onSaved: (warning?: string) => Promise<void>;
}) {
  const initial = { name: exercise?.name ?? '', sets: String(exercise?.sets ?? 3), reps: exercise?.reps ?? '6-10', rest_seconds: String(exercise?.rest_seconds ?? 150), rir: exercise?.rir_max ? `${exercise.rir}-${exercise.rir_max}` : String(exercise?.rir ?? 2), notes: exercise?.notes ?? '' };
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const creationId = useRef(exercise?.id ?? crypto.randomUUID());
  const uploadedMedia = useRef<{ path: string; mime: 'image/gif' | 'video/mp4' } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const closeEditor = useEditorGuard(JSON.stringify(form) !== JSON.stringify(initial) || !!file || removeMedia, pending || uncertain);
  useEffect(() => { if (!file) { setPreview(null); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const field = (key: keyof typeof initial, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  return <Dialog title={exercise ? 'Edit exercise' : 'Add exercise'} onClose={() => closeEditor(onClose)} pending={pending}>
    <form className="gym-form" onSubmit={async event => {
      event.preventDefault(); if (inFlight.current) return;
      inFlight.current = true; setPending(true); setError(null);
      let uploaded: string | null = null;
      let committed = false;
      try {
        if (!form.sets.trim() || !form.rest_seconds.trim()) throw new Error('Sets and rest are required.');
        const normalized = normalizeGymExercise({ ...form, sets: Number(form.sets), rest_seconds: Number(form.rest_seconds), ...parseGymRir(form.rir) });
        let path = removeMedia ? null : exercise?.media_path ?? null;
        let mime = removeMedia ? null : exercise?.media_mime ?? null;
        if (file) { const media = uploadedMedia.current ?? await uploadGymMedia(userId, routine.id, file); uploadedMedia.current = media; uploaded = media.path; path = media.path; mime = media.mime; }
        await saveGymExercise({ ...normalized, id: creationId.current, user_id: userId, routine_id: routine.id, position: exercise?.position ?? nextPosition, media_path: path, media_mime: mime });
        committed = true;
        let warning: string | undefined;
        if (exercise?.media_path && exercise.media_path !== path) {
          try { await deleteGymMedia(exercise.media_path); }
          catch (err) { warning = `Exercise saved. Previous media cleanup failed: ${formatError(err)}`; }
        }
        onClose(); await onSaved(warning);
      } catch (err) {
        setUncertain(err instanceof UncertainSaveError);
        let message = formatError(err);
        if (uploaded && !committed) message += ' Uploaded media retained until the saved record is reconciled.';
        setError(message);
      } finally { inFlight.current = false; setPending(false); }
    }}>
      <label>Demonstration (optional GIF or MP4, up to 20 MiB)<input type="file" accept="image/gif,video/mp4" disabled={pending || uncertain} onChange={event => { setFile(event.target.files?.[0] ?? null); uploadedMedia.current = null; setRemoveMedia(false); }} /></label>
      {file && <div className="gym-upload-preview"><span>{file.name}</span>{preview && (file.type === 'image/gif' ? <img src={preview} alt="Selected demonstration" /> : <video src={preview} controls muted playsInline />)}<button type="button" className="btn-secondary" disabled={pending || uncertain} onClick={() => { setFile(null); uploadedMedia.current = null; }}>Remove selected file</button></div>}
      {exercise?.media_path && <label className="gym-checkbox"><input type="checkbox" checked={removeMedia} disabled={pending || uncertain} onChange={e => { setRemoveMedia(e.target.checked); setFile(null); }} />Remove current demonstration</label>}
      <label>Exercise name<input className="field" required value={form.name} disabled={pending || uncertain} onChange={e => field('name', e.target.value)} /></label>
      <div className="gym-fields">
        <label>Sets<input className="field" type="number" min={1} max={99} required value={form.sets} disabled={pending || uncertain} onChange={e => field('sets', e.target.value)} /></label>
        <label>Reps or range<input className="field" required value={form.reps} disabled={pending || uncertain} onChange={e => field('reps', e.target.value)} placeholder="8–12" /></label>
        <label>Rest (seconds)<input className="field" type="number" min={0} max={86400} required value={form.rest_seconds} disabled={pending || uncertain} onChange={e => field('rest_seconds', e.target.value)} /></label>
        <label>RIR<input className="field" type="text" required value={form.rir} placeholder="1-2" disabled={pending || uncertain} onChange={e => field('rir', e.target.value)} /></label>
      </div>
      <label>Notes<textarea className="field" rows={2} value={form.notes} disabled={pending || uncertain} onChange={e => field('notes', e.target.value)} /></label>
      {error && <p role="alert" className="phase4-error">{error}</p>}
      <div className="action-footer"><button type="button" className="btn-secondary" disabled={pending || uncertain} onClick={() => closeEditor(onClose)}>Cancel</button><button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : uncertain ? 'Check save result' : 'Save exercise'}</button></div>
    </form>
  </Dialog>;
}

function Demonstration({ exercise, onClose, onEdit }: { exercise: GymExercise; onClose: () => void; onEdit: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { const player = video.current; if (url && player) void player.play().catch(() => setBlocked(true)); return () => player?.pause(); }, [url]);
  useEffect(() => {
    let active = true; setUrl(null); setError(null);
    const renew = () => { if (exercise.media_path) void signGymMedia(exercise.media_path).then(value => { if (active) { setUrl(value); setError(null); setBlocked(false); } }).catch(err => { if (active) setError(formatError(err)); }); };
    renew();
    const timer = window.setInterval(renew, 240000);
    return () => { active = false; window.clearInterval(timer); };
  }, [exercise.media_path, retry]);
  return <Dialog title={exercise.name} onClose={onClose}>
    {!exercise.media_path ? <><p>No demonstration uploaded for this exercise.</p><button className="btn-ghost" onClick={onEdit}>Edit exercise</button></> : error ? <div role="alert"><p>{error}</p><button className="btn-ghost" onClick={() => setRetry(n => n + 1)}>Reload demonstration</button></div> : !url ? <p role="status">Loading demonstration…</p> : exercise.media_mime === 'image/gif' ? <img className="gym-media" src={url} alt={`${exercise.name} demonstration`} onError={() => setError('Demonstration could not load. Reload to refresh access.')} /> : <><video ref={video} className="gym-media" src={url} controls muted autoPlay playsInline preload="metadata" onError={() => setError('Video could not load. Reload to refresh access.')} />{blocked && <button className="btn-primary" onClick={() => void video.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true))}>Play demonstration</button>}</>}
  </Dialog>;
}

function WorkoutHistory({ userId, routines, onClose }: { userId: string; routines: GymRoutine[]; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');
  const query = useQuery({ queryKey: ['gym-history', userId, filter, page], queryFn: () => fetchGymHistory(userId, page, filter || undefined) });
  return <Dialog title="Workout history" onClose={onClose}><div className="gym-history">
    <label>Workouts<select className="field" value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="">All workouts</option>{routines.map(r => <option key={r.id} value={r.id}>{r.name}{r.deleted_at ? ' (deleted routine)' : ''}</option>)}</select></label>
    {query.isPending ? <p role="status">Loading workouts...</p> : query.isError ? <p role="alert">{formatError(query.error)}</p> : <>
      {!query.data.sessions.length && <p>No completed workouts yet.</p>}
      {query.data.sessions.map(session => <details key={session.id} className="gym-history-session"><summary>{session.routine_name}{routines.find(r => r.id === session.routine_id)?.deleted_at ? ' · Deleted routine' : ''} · {new Date(session.completed_at!).toLocaleString()} · {session.unit}</summary>
        {query.data.entries.filter(e => e.session_id === session.id).map(entry => <p key={entry.id}>{entry.prescription.name} · {entry.prescription.sets} × {entry.prescription.reps} · {entry.weight ?? '—'} {session.unit}</p>)}
      </details>)}
      <nav className="list-pagination" aria-label="Workout history pages"><button className="btn-secondary" disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</button><span>{page + 1}</span><button className="btn-secondary" disabled={!query.data.hasNext} onClick={() => setPage(p => p + 1)}>Next</button></nav>
    </>}
  </div></Dialog>;
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
  const [invalidWeights, setInvalidWeights] = useState(new Set<string>());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNoticeMessage] = useState<string | null>(null);
  const setNotice = useCallback((message: string | null) => { setNoticeMessage(message); if (message) announceFeedback(message, userId); }, [userId]);
  const [uncertain, setUncertain] = useState(false);
  const retryTask = useRef<(() => Promise<void>) | null>(null);
  const inFlight = useRef(false);
  const routines = data.routines.filter(r => !r.deleted_at && (showArchived || !r.archived));
  const routine = routines.find(r => r.id === selected) ?? routines[0];
  const exercises = data.exercises.filter(e => e.routine_id === routine?.id);
  const sessions = data.sessions.filter(s => s.routine_id === routine?.id);
  const draft = sessions.find(s => s.status === 'draft');
  const previous = useQuery({ queryKey: ['gym-previous', userId, routine?.id], queryFn: () => fetchPreviousGymWeights(routine!.id), enabled: !!routine });
  const draftEntries = data.entries.filter(e => e.session_id === draft?.id);
  const rows = draft ? draftEntries.map(entry => ({ id: entry.exercise_id, ...entry.prescription })) : exercises;
  const unit = draft?.unit ?? routine?.unit ?? 'kg';
  const dirty = draftEntries.some(entry => invalidWeights.has(entry.exercise_id) || (weights[entry.exercise_id] !== undefined && weights[entry.exercise_id] !== (entry.weight === null ? '' : String(entry.weight))));
  const requestSwitch = useEditorGuard(dirty, pending || uncertain);
  const [confirmation, setConfirmation] = useState<{ title: string; text: string; action: () => void } | null>(null);
  const [blankWeights, setBlankWeights] = useState<GymEntry[] | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  const cleanup = async () => {
    let after = '';
    for (;;) {
      const paths = await listGymMediaCleanup(after);
      for (const item of paths) { await deleteGymMedia(item.path); await acknowledgeGymMediaCleanup(item.path); after = item.path; }
      if (paths.length < 100) return;
    }
  };
  useEffect(() => { void cleanup().catch(err => setNotice('Media cleanup needs retry: ' + formatError(err))); }, [userId, setNotice]);
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['gym', userId] }, { throwOnError: true }); await qc.invalidateQueries({ queryKey: ['gym-previous', userId] }, { throwOnError: true }); };
  const run = async (task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null); setNotice(null);
    try { await task(); setUncertain(false); retryTask.current = null; try { await refresh(); } catch (err) { setNotice('Saved. Refresh failed: ' + formatError(err)); } }
    catch (err) { setUncertain(err instanceof UncertainSaveError); retryTask.current = err instanceof UncertainSaveError ? task : null; setError(formatError(err)); }
    finally { inFlight.current = false; setPending(false); }
  };
  const previousWeight = (id: string) => {
    const value = previous.data?.find(e => e.exercise_id === id);
    return value ? convertGymWeight(value.weight, value.unit, unit) : '—';
  };
  const inputWeight = (id: string) => weights[id] ?? (draftEntries.find(e => e.exercise_id === id)?.weight == null ? '' : String(draftEntries.find(e => e.exercise_id === id)!.weight));
  const saveWorkout = (finish: boolean, blanksConfirmed = false) => {
    const invalid = draftEntries.find(entry => invalidWeights.has(entry.exercise_id));
    if (invalid) { setError(`Enter a valid weight for ${invalid.prescription.name}.`); setReveal(invalid.exercise_id); return; }
    try { draftEntries.forEach(entry => gymWeight(inputWeight(entry.exercise_id))); }
    catch (err) { setError(formatError(err)); return; }
    const blanks = draftEntries.filter(entry => !inputWeight(entry.exercise_id).trim());
    if (finish && blanks.length && !blanksConfirmed) { setBlankWeights(blanks); return; }
    void run(async () => {
    if (!draft) return;
    await saveGymSession(draft.id, draftEntries.map(entry => ({ exercise_id: entry.exercise_id, weight: gymWeight(inputWeight(entry.exercise_id)) })), finish);
    qc.setQueryData<GymData>(key, current => current ? { ...current,
      entries: current.entries.map(entry => entry.session_id === draft.id ? { ...entry, weight: gymWeight(inputWeight(entry.exercise_id)) } : entry),
      sessions: current.sessions.map(session => session.id === draft.id && finish ? { ...session, status: 'completed', completed_at: new Date().toISOString() } : session),
    } : current);
    setWeights({}); setInvalidWeights(new Set()); setNotice(finish ? 'Workout completed. Progress saved.' : 'Workout draft saved.');
    });
  };
  if (!userId) return null;
  if (query.isPending) return <p role="status">Reading Gym Progress…</p>;
  if (query.isError && !query.data) return <div className="board-state" role="alert"><p>{formatError(query.error)}</p><button className="btn-ghost" onClick={() => void query.refetch()}>Retry</button></div>;
  return <div className="gym-page">
    <header className="gym-heading"><h1>Gym Progress</h1><div className="gym-actions"><button className="btn-ghost" onClick={() => setHistory(true)}>Workout history</button><button className="btn-ghost" onClick={() => setRoutineEditor('new')} disabled={pending || uncertain}>Create routine</button></div></header>
    <div className="gym-toolbar"><label>Routine<select className="field" value={routine?.id ?? ''} disabled={pending || uncertain} onChange={e => { const id = e.target.value; requestSwitch(() => { setSelected(id); setWeights({}); }); }}>{!routines.length && <option value="">No routines</option>}{routines.map(r => <option key={r.id} value={r.id}>{r.name}{r.archived ? ' (archived)' : ''}</option>)}</select></label><label className="gym-checkbox"><input type="checkbox" checked={showArchived} onChange={e => { const checked = e.target.checked; requestSwitch(() => { setShowArchived(checked); setWeights({}); }); }} />Include archived routines</label></div>
    {query.isError && <p role="alert">Refresh failed. Your saved progress remains. <button className="btn-secondary" onClick={() => void query.refetch()}>Retry refresh</button></p>}
    {error && <p role="alert" className="phase4-error">{error}</p>}
    {!routine ? <p className="board-lane-empty">Create your first routine, then add its exercises.</p> : <>
      <div className="gym-routine-heading"><h2>{routine.name} <small>{unit}</small></h2><div className="gym-actions">
        <button className="btn-ghost" disabled={pending || uncertain} onClick={() => setRoutineEditor('edit')}>Edit routine</button>
        <button className="btn-ghost" disabled={pending || uncertain || dirty} onClick={() => void run(async () => { await archiveGymRoutine(routine.id, !routine.archived); setWeights({}); })}>{routine.archived ? 'Restore routine' : 'Archive routine'}</button>
        <button className="btn-secondary" disabled={pending || uncertain || routine.archived} onClick={() => setExerciseEditor('new')}>Add exercise</button>
        <button className="btn-destructive" disabled={pending || uncertain} onClick={() => setConfirmation({ title: 'Delete routine', text: `Delete ${routine.name}? Completed history remains.${draft ? ' This also discards the unfinished workout.' : ''}`, action: () => void run(async () => { await deleteGymRoutine(routine.id, !!draft); setWeights({}); await cleanup().catch(err => setNotice('Routine deleted. Cleanup needs retry: ' + formatError(err))); }) })}>Delete routine</button>
      </div></div>
      <div className="gym-table" role="table" aria-label={routine.name}>
        <div className="gym-table-header" role="row">{['#', 'Exercise', 'Sets × Reps', 'Rest', 'RIR', 'Notes', 'Previous Weight', 'Current Weight'].map(title => <span role="columnheader" key={title}>{title}</span>)}</div>
        <FlowList label="Exercises" size={6} narrowSize={3} revealId={reveal} onRevealed={() => setReveal(null)}>
          {rows.map((row, index) => <div className="gym-row" role="row" key={row.id} data-item-id={row.id}>
            <span role="cell" data-label="#">{index + 1}</span>
            <div role="cell" data-label="Exercise"><button className="gym-exercise-name" onClick={() => { const exercise = exercises.find(e => e.id === row.id); if (exercise) setDemo(exercise); else setNotice('This exercise was removed from the routine. Its saved workout details remain.'); }}>{row.name}</button>
              {!draft && <div className="gym-row-actions"><button className="btn-ghost" onClick={() => setExerciseEditor(exercises.find(e => e.id === row.id)!)} disabled={pending || uncertain}>Edit</button><button className="btn-ghost" aria-label={`Move ${row.name} up`} disabled={index === 0 || pending} onClick={() => void run(async () => { const ids = exercises.map(e => e.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; await moveGymExercises(routine, ids); })}>↑</button><button className="btn-ghost" aria-label={`Move ${row.name} down`} disabled={index === exercises.length - 1 || pending} onClick={() => void run(async () => { const ids = exercises.map(e => e.id); [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]; await moveGymExercises(routine, ids); })}>↓</button><button className="btn-ghost" disabled={pending || uncertain} onClick={() => setConfirmation({ title: 'Remove exercise', text: `Remove ${row.name}? Completed history remains.`, action: () => void run(async () => { await removeGymExercise(row.id); await cleanup().catch(err => setNotice('Exercise removed. Cleanup needs retry: ' + formatError(err))); }) })}>Remove</button></div>}
            </div>
            <span role="cell" data-label="Sets × Reps">{row.sets} × {row.reps}</span><span role="cell" data-label="Rest">{row.rest_seconds}s</span><span role="cell" data-label="RIR">{row.rir}{row.rir_max ? `-${row.rir_max}` : ''}</span><span role="cell" data-label="Notes">{row.notes ? <button className="gym-exercise-name gym-notes" onClick={() => setNote(row.notes)}>{row.notes}</button> : '—'}</span><span role="cell" data-label="Previous Weight">{previousWeight(row.id)} {unit}</span>
            <div role="cell" data-label="Current Weight"><input className="field gym-weight" aria-label={`Current weight for ${row.name} in ${unit}`} type="number" min={0} max={1000000} step="0.001" value={inputWeight(row.id)} aria-invalid={invalidWeights.has(row.id)} disabled={!draft || pending || uncertain} onInput={e => { const invalid = e.currentTarget.validity.badInput; setInvalidWeights(prev => { const next = new Set(prev); if (invalid) next.add(row.id); else next.delete(row.id); return next; }); }} onChange={e => setWeights(prev => ({ ...prev, [row.id]: e.target.value }))} /></div>
          </div>)}
        </FlowList>
      </div>
      <footer className="gym-session-actions">{draft ? <><span>Workout draft · {draft.unit}</span><button className="btn-ghost" disabled={pending || uncertain} onClick={() => saveWorkout(false)}>Save draft</button><button className="btn-primary" disabled={pending || uncertain} onClick={() => saveWorkout(true)}>Finish workout</button><button className="btn-ghost" disabled={pending || uncertain} onClick={() => setConfirmation({ title: 'Discard workout', text: 'Discard this unfinished workout and its entered weights?', action: () => void run(async () => { await discardGymSession(draft.id); setWeights({}); }) })}>Discard draft</button></> : <button className="btn-primary" disabled={pending || uncertain || !exercises.length || routine.archived} onClick={() => void run(async () => { await startGymSession(routine.id); setWeights({}); })}>Start workout</button>}{pending && <span role="status">Saving…</span>}</footer>
    </>}
    {routineEditor && <RoutineEditor routine={routineEditor === 'edit' ? routine : undefined} userId={userId} onClose={() => setRoutineEditor(null)} onSaved={async id => { setSelected(id); try { await refresh(); setNotice('Routine saved.'); } catch (err) { setNotice('Routine saved. Refresh failed: ' + formatError(err)); } }} />}
    {exerciseEditor && routine && <ExerciseEditor exercise={exerciseEditor === 'new' ? undefined : exerciseEditor} routine={routine} userId={userId} nextPosition={Math.max(-1, ...exercises.map(e => e.position)) + 1} onClose={() => setExerciseEditor(null)} onSaved={async warning => { try { await refresh(); setNotice(warning ?? 'Exercise saved.'); } catch (err) { setNotice('Exercise saved. Refresh failed: ' + formatError(err)); } }} />}
    {demo && <Demonstration exercise={demo} onClose={() => setDemo(null)} onEdit={() => { setExerciseEditor(demo); setDemo(null); }} />}
    {note !== null && <Dialog title="Exercise notes" onClose={() => setNote(null)}><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note}</p></Dialog>}
    {history && <WorkoutHistory userId={userId} routines={data.routines} onClose={() => setHistory(false)} />}
    {confirmation && <Dialog title={confirmation.title} onClose={() => setConfirmation(null)}><p>{confirmation.text}</p><div className="action-footer"><button className="btn-secondary" onClick={() => setConfirmation(null)}>Cancel</button><button className="btn-destructive" onClick={() => { const action = confirmation.action; setConfirmation(null); action(); }}>Confirm</button></div></Dialog>}
    {blankWeights && <Dialog title="Finish with blank weights?" onClose={() => setBlankWeights(null)}><p>{blankWeights.length} blank weights: {blankWeights.map(e => e.prescription.name).join(', ')}</p><div className="action-footer"><button className="btn-secondary" onClick={() => { setReveal(blankWeights[0].exercise_id); setBlankWeights(null); }}>Review fields</button><button className="btn-primary" onClick={() => { setBlankWeights(null); saveWorkout(true, true); }}>Finish with blanks</button></div></Dialog>}
    {uncertain && <button className="btn-secondary" disabled={pending} onClick={() => { if (retryTask.current) void run(retryTask.current); }}>Check save result</button>}
    {notice?.toLowerCase().includes('cleanup') && <button className="btn-secondary" onClick={() => void cleanup().then(() => setNotice('Media cleanup complete.')).catch(err => setError(formatError(err)))}>Retry media cleanup</button>}
  </div>;
}
