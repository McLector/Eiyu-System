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
import { GYM_COPY, gymCleanupPending, gymSavedRefreshFailed, isGymCleanupNotice } from '@eiyu/shared';
import { useSession } from '../store/session-context';
import Dialog from '../components/Dialog';
import ActionMenu from '../components/ActionMenu';
import { ArchiveIcon, ChevronIcon, CheckIcon, EditIcon, PlayIcon, RestoreIcon, TrashIcon } from '../Icons';
import FlowList from '../components/FlowList';
import StateBlock from '../components/StateBlock';
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
      <div className="action-footer"><button type="button" className="btn-secondary" disabled={pending || uncertain} onClick={() => closeEditor(onClose)}>Cancel</button><button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : uncertain ? GYM_COPY.confirmSave : 'Save routine'}</button></div>
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
        if (uploaded && !committed) message += ` ${GYM_COPY.uploadHeld}`;
        setError(message);
      } finally { inFlight.current = false; setPending(false); }
    }}>
      <label>Demonstration (optional GIF or MP4, up to 20 MiB)<input type="file" accept="image/gif,video/mp4" disabled={pending || uncertain} onChange={event => { setFile(event.target.files?.[0] ?? null); uploadedMedia.current = null; setRemoveMedia(false); }} /></label>
      {file && <div className="gym-upload-preview"><span>{file.name}</span>{preview && (file.type === 'image/gif' ? <img src={preview} alt="Selected demonstration" /> : <video src={preview} controls muted playsInline />)}<button type="button" className="btn-secondary btn-compact" disabled={pending || uncertain} onClick={() => { setFile(null); uploadedMedia.current = null; }}>Remove selected file</button></div>}
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
      <div className="action-footer"><button type="button" className="btn-secondary" disabled={pending || uncertain} onClick={() => closeEditor(onClose)}>Cancel</button><button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : uncertain ? GYM_COPY.confirmSave : 'Save exercise'}</button></div>
    </form>
  </Dialog>;
}

type GymRow = { id: string; name: string; sets: number; reps: string; rest_seconds: number; rir: number; rir_max?: number | null; notes?: string | null };

/** The video guide, shown beside the numbers instead of in a dialog. The signed URL is renewed before it lapses. */
function ExerciseMedia({ exercise, canEdit, onEdit }: { exercise: GymExercise | undefined; canEdit: boolean; onEdit: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const path = exercise?.media_path ?? null;
  useEffect(() => {
    let active = true;
    setUrl(null); setError(null);
    if (!path) return () => undefined;
    const renew = () => { void signGymMedia(path).then(value => { if (active) { setUrl(value); setError(null); } }).catch(err => { if (active) setError(formatError(err)); }); };
    renew();
    const timer = window.setInterval(renew, 240000);
    return () => { active = false; window.clearInterval(timer); };
  }, [path, retry]);
  if (!exercise) return <div className="gym-media-empty"><p>{GYM_COPY.exerciseRemoved}</p></div>;
  if (!path) {
    return <div className="gym-media-empty"><PlayIcon size={20} /><p>No video guide attached.</p>{canEdit && <button type="button" className="btn-secondary btn-compact" onClick={onEdit}>Attach a video guide</button>}</div>;
  }
  if (error) return <div className="gym-media-empty" role="alert"><p>{error}</p><button type="button" className="btn-secondary btn-compact" onClick={() => setRetry(n => n + 1)}>Reload video guide</button></div>;
  if (!url) return <p className="gym-media-empty" role="status">Loading video guide…</p>;
  return exercise.media_mime === 'image/gif'
    ? <img className="gym-media" src={url} alt={`${exercise.name} video guide`} onError={() => setError('The guide could not load. Reload to refresh access.')} />
    : <video className="gym-media" src={url} controls muted playsInline preload="metadata" onError={() => setError('The video could not load. Reload to refresh access.')} />;
}

function GymExercisePane({ row, index, total, exercise, unit, previous, weight, weightInvalid, weightDisabled, canEditDefinition, pending, onWeightInput, onWeightChange, onEdit, onMove, onRemove }: {
  row: GymRow; index: number; total: number; exercise: GymExercise | undefined; unit: string; previous: string; weight: string;
  weightInvalid: boolean; weightDisabled: boolean; canEditDefinition: boolean; pending: boolean;
  onWeightInput: (invalid: boolean) => void; onWeightChange: (value: string) => void; onEdit: () => void; onMove: (delta: -1 | 1) => void; onRemove: () => void;
}) {
  return (
    <section className="gym-detail" aria-label={`${row.name} details`}>
      <div className="gym-detail-head">
        <h3>{row.name}</h3>
        <ActionMenu
          label={`Exercise actions for ${row.name}`} disabled={pending || !canEditDefinition}
          items={[
            { label: 'Edit exercise', onSelect: onEdit, icon: <EditIcon />, tone: 'edit', disabled: !exercise },
            { label: 'Move up', ariaLabel: `Move ${row.name} up`, onSelect: () => onMove(-1), icon: <ChevronIcon direction="up" />, tone: 'edit', disabled: index === 0 },
            { label: 'Move down', ariaLabel: `Move ${row.name} down`, onSelect: () => onMove(1), icon: <ChevronIcon direction="down" />, tone: 'edit', disabled: index === total - 1 },
            { label: 'Remove', ariaLabel: `Remove ${row.name}`, onSelect: onRemove, icon: <TrashIcon />, danger: true, tone: 'danger', disabled: !exercise },
          ]}
        />
      </div>
      <ExerciseMedia key={exercise?.id ?? row.id} exercise={exercise} canEdit={canEditDefinition} onEdit={onEdit} />
      <dl className="gym-kv">
        <div><dt>Sets × reps</dt><dd>{row.sets} × {row.reps}</dd></div>
        <div><dt>Rest</dt><dd>{row.rest_seconds}s</dd></div>
        <div><dt>RIR</dt><dd>{row.rir}{row.rir_max ? `-${row.rir_max}` : ''}</dd></div>
        <div><dt>Previous</dt><dd>{previous} {unit}</dd></div>
      </dl>
      <label className="gym-weight-field">Current weight ({unit})
        <input className="field gym-weight" aria-label={`Current weight for ${row.name} in ${unit}`} type="number" min={0} max={1000000} step="0.001"
          value={weight} aria-invalid={weightInvalid} disabled={weightDisabled}
          onInput={event => onWeightInput(event.currentTarget.validity.badInput)} onChange={event => onWeightChange(event.target.value)} />
      </label>
      {row.notes && <div><span className="field-label">NOTES</span><p className="details-note">{row.notes}</p></div>}
    </section>
  );
}

function WorkoutHistory({ userId, routines, onClose }: { userId: string; routines: GymRoutine[]; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');
  const query = useQuery({ queryKey: ['gym-history', userId, filter, page], queryFn: () => fetchGymHistory(userId, page, filter || undefined) });
  return <Dialog title="Workout history" onClose={onClose}><div className="gym-history">
    <label>Workouts<select className="field" value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="">All workouts</option>{routines.map(r => <option key={r.id} value={r.id}>{r.name}{r.deleted_at ? ' (deleted routine)' : ''}</option>)}</select></label>
    {query.isPending ? <StateBlock kind="loading">{GYM_COPY.loadingHistory}</StateBlock> : query.isError ? <StateBlock kind="error">{formatError(query.error)}</StateBlock> : <>
      {!query.data.sessions.length && <StateBlock kind="empty">{GYM_COPY.emptyHistory}</StateBlock>}
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
  const [selectedExercise, setSelectedExercise] = useState('');
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
  const current = rows.find(row => row.id === selectedExercise) ?? rows[0];
  const currentIndex = current ? rows.findIndex(row => row.id === current.id) : -1;
  const dirty = draftEntries.some(entry => invalidWeights.has(entry.exercise_id) || (weights[entry.exercise_id] !== undefined && weights[entry.exercise_id] !== (entry.weight === null ? '' : String(entry.weight))));
  const requestSwitch = useEditorGuard(dirty, pending || uncertain);
  const [confirmation, setConfirmation] = useState<{ title: string; text: string; action: () => void } | null>(null);
  const [blankWeights, setBlankWeights] = useState<GymEntry[] | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  /** Select an exercise and page the list to it; FlowList focuses its row, then onRevealed moves focus to the weight. */
  const revealExercise = (id: string) => { setSelectedExercise(id); setReveal(id); };
  const cleanup = async () => {
    let after = '';
    for (;;) {
      const paths = await listGymMediaCleanup(after);
      for (const item of paths) { await deleteGymMedia(item.path); await acknowledgeGymMediaCleanup(item.path); after = item.path; }
      if (paths.length < 100) return;
    }
  };
  useEffect(() => { void cleanup().catch(err => setNotice(gymCleanupPending(err))); }, [userId, setNotice]);
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['gym', userId] }, { throwOnError: true }); await qc.invalidateQueries({ queryKey: ['gym-previous', userId] }, { throwOnError: true }); };
  const run = async (task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null); setNotice(null);
    try { await task(); setUncertain(false); retryTask.current = null; try { await refresh(); } catch (err) { setNotice(gymSavedRefreshFailed('Saved', err)); } }
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
    if (invalid) { setError(`Enter a valid weight for ${invalid.prescription.name}.`); revealExercise(invalid.exercise_id); return; }
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
  if (query.isPending) return <StateBlock kind="loading">Reading Gym Progress…</StateBlock>;
  if (query.isError && !query.data) return <StateBlock kind="error" onRetry={() => void query.refetch()}>{formatError(query.error)}</StateBlock>;
  return <div className="gym-page">
    <header className="gym-heading"><h1 className="page-title">Gym Progress</h1><div className="gym-actions"><button className="btn-secondary" onClick={() => setHistory(true)}>Workout history</button><button className="btn-secondary" onClick={() => setRoutineEditor('new')} disabled={pending || uncertain}>Create routine</button></div></header>
    <div className="gym-toolbar"><label>Routine<select className="field" value={routine?.id ?? ''} disabled={pending || uncertain} onChange={e => { const id = e.target.value; requestSwitch(() => { setSelected(id); setWeights({}); }); }}>{!routines.length && <option value="">No routines</option>}{routines.map(r => <option key={r.id} value={r.id}>{r.name}{r.archived ? ' (archived)' : ''}</option>)}</select></label><label className="gym-checkbox"><input type="checkbox" checked={showArchived} onChange={e => { const checked = e.target.checked; requestSwitch(() => { setShowArchived(checked); setWeights({}); }); }} />Include archived routines</label></div>
    {query.isError && <StateBlock kind="error" retryLabel="Retry refresh" onRetry={() => void query.refetch()}>{GYM_COPY.refreshFailed}</StateBlock>}
    {error && <p role="alert" className="phase4-error">{error}</p>}
    {(uncertain || isGymCleanupNotice(notice)) && <div className="action-footer">
      {uncertain && <button className="btn-secondary" disabled={pending} onClick={() => { if (retryTask.current) void run(retryTask.current); }}>{GYM_COPY.confirmSave}</button>}
      {isGymCleanupNotice(notice) && <button className="btn-secondary" onClick={() => void cleanup().then(() => setNotice('Media cleanup complete.')).catch(err => setError(formatError(err)))}>Retry media cleanup</button>}
    </div>}
    {!routine ? <StateBlock kind="empty">{GYM_COPY.noRoutine}</StateBlock> : <>
      <div className="gym-routine-heading"><h2>{routine.name} <small>{unit}</small></h2><div className="gym-actions">
        {draft && <span className="quest-chip is-cur">Workout draft · {draft.unit}</span>}
        <button className="btn-secondary" disabled={pending || uncertain || routine.archived} onClick={() => setExerciseEditor('new')}>Add exercise</button>
        <ActionMenu
          label={`Routine actions for ${routine.name}`} disabled={pending || uncertain}
          items={[
            { label: 'Edit routine', onSelect: () => setRoutineEditor('edit'), icon: <EditIcon />, tone: 'edit' },
            { label: routine.archived ? 'Restore routine' : 'Archive routine', onSelect: () => void run(async () => { await archiveGymRoutine(routine.id, !routine.archived); setWeights({}); }), icon: routine.archived ? <RestoreIcon /> : <ArchiveIcon />, tone: 'warn', disabled: dirty },
            { label: 'Delete routine', onSelect: () => setConfirmation({ title: 'Delete routine', text: `Delete ${routine.name}? Completed history remains.${draft ? ' This also discards the unfinished workout.' : ''}`, action: () => void run(async () => { await deleteGymRoutine(routine.id, !!draft); setWeights({}); await cleanup().catch(err => setNotice(gymCleanupPending(err, 'Routine deleted'))); }) }), icon: <TrashIcon />, danger: true, tone: 'danger' },
          ]}
        />
      </div></div>
      <div className="gym-split">
        <div className="gym-list" role="group" aria-label={`${routine.name} exercises`}>
          <FlowList label="Exercises" size={8} narrowSize={5} revealId={reveal} onRevealed={() => { setReveal(null); window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.gym-detail .gym-weight')?.focus()); }}>
            {rows.map((row, index) => <div key={row.id} data-item-id={row.id}>
              <button type="button" className={`gym-list-item${current?.id === row.id ? ' is-active' : ''}`} aria-current={current?.id === row.id ? 'true' : undefined} onClick={() => setSelectedExercise(row.id)}>
                <span className="gym-list-index">{index + 1}</span>
                <span className="gym-list-name">{row.name}</span>
                <span className="gym-list-sets">{row.sets} × {row.reps}</span>
                {draft && inputWeight(row.id).trim() && <><span aria-hidden="true"><CheckIcon size={13} /></span><span className="sr-only">, weight entered</span></>}
              </button>
            </div>)}
          </FlowList>
        </div>
        {current && <GymExercisePane
          row={current} index={currentIndex} total={rows.length} exercise={exercises.find(e => e.id === current.id)} unit={unit}
          previous={String(previousWeight(current.id))} weight={inputWeight(current.id)} weightInvalid={invalidWeights.has(current.id)}
          weightDisabled={!draft || pending || uncertain} canEditDefinition={!draft && !pending && !uncertain} pending={pending}
          onWeightInput={invalid => setInvalidWeights(prev => { const next = new Set(prev); if (invalid) next.add(current.id); else next.delete(current.id); return next; })}
          onWeightChange={value => setWeights(prev => ({ ...prev, [current.id]: value }))}
          onEdit={() => { const definition = exercises.find(e => e.id === current.id); if (definition) setExerciseEditor(definition); }}
          onMove={delta => void run(async () => { const ids = exercises.map(e => e.id); const at = ids.indexOf(current.id); [ids[at], ids[at + delta]] = [ids[at + delta], ids[at]]; await moveGymExercises(routine, ids); })}
          onRemove={() => setConfirmation({ title: 'Remove exercise', text: `Remove ${current.name}? Completed history remains.`, action: () => void run(async () => { await removeGymExercise(current.id); await cleanup().catch(err => setNotice(gymCleanupPending(err, 'Exercise removed'))); }) })}
        />}
      </div>
      <footer className="gym-session-actions">{draft ? <><span>Workout draft · {draft.unit}</span><button className="btn-destructive" disabled={pending || uncertain} onClick={() => setConfirmation({ title: 'Discard workout', text: 'Discard this unfinished workout and its entered weights?', action: () => void run(async () => { await discardGymSession(draft.id); setWeights({}); }) })}>Discard draft</button><button className="btn-secondary" disabled={pending || uncertain} onClick={() => saveWorkout(false)}>Save draft</button><button className="btn-primary" disabled={pending || uncertain} onClick={() => saveWorkout(true)}>Finish workout</button></> : <button className="btn-primary" disabled={pending || uncertain || !exercises.length || routine.archived} onClick={() => void run(async () => { await startGymSession(routine.id); setWeights({}); })}>Start workout</button>}{pending && <span role="status">Saving…</span>}</footer>
    </>}
    {routineEditor && <RoutineEditor routine={routineEditor === 'edit' ? routine : undefined} userId={userId} onClose={() => setRoutineEditor(null)} onSaved={async id => { setSelected(id); try { await refresh(); setNotice('Routine saved.'); } catch (err) { setNotice(gymSavedRefreshFailed('Routine saved', err)); } }} />}
    {exerciseEditor && routine && <ExerciseEditor exercise={exerciseEditor === 'new' ? undefined : exerciseEditor} routine={routine} userId={userId} nextPosition={Math.max(-1, ...exercises.map(e => e.position)) + 1} onClose={() => setExerciseEditor(null)} onSaved={async warning => { try { await refresh(); setNotice(warning ?? 'Exercise saved.'); } catch (err) { setNotice(gymSavedRefreshFailed('Exercise saved', err)); } }} />}
    {history && <WorkoutHistory userId={userId} routines={data.routines} onClose={() => setHistory(false)} />}
    {confirmation && <Dialog title={confirmation.title} onClose={() => setConfirmation(null)}><p>{confirmation.text}</p><div className="action-footer"><button className="btn-secondary" onClick={() => setConfirmation(null)}>Cancel</button><button className="btn-destructive" onClick={() => { const action = confirmation.action; setConfirmation(null); action(); }}>{confirmation.title}</button></div></Dialog>}
    {blankWeights && <Dialog title="Finish with blank weights?" onClose={() => setBlankWeights(null)}><p>{blankWeights.length} blank weights: {blankWeights.map(e => e.prescription.name).join(', ')}</p><div className="action-footer"><button className="btn-secondary" onClick={() => { revealExercise(blankWeights[0].exercise_id); setBlankWeights(null); }}>Review fields</button><button className="btn-primary" onClick={() => { setBlankWeights(null); saveWorkout(true, true); }}>Finish with blanks</button></div></Dialog>}
  </div>;
}
