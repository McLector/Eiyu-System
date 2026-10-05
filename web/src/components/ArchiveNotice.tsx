import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArchiveIcon, UndoIcon } from '../Icons';
import { formatError, type QuestType } from '@eiyu/shared';
import { useSession } from '../store/session-context';

let activeOwner: string | null = null;
export const getNotificationOwner = () => activeOwner;
export function announceArchive(type: QuestType, owner = activeOwner, undo?: () => Promise<void>) {
  window.dispatchEvent(new CustomEvent('eiyu:archived', { detail: { id: crypto.randomUUID(), owner, type, undo } }));
}
export type FeedbackTone = 'info' | 'success' | 'warning' | 'danger';
export function announceFeedback(message: string, owner = activeOwner, tone: FeedbackTone = 'success') {
  window.dispatchEvent(new CustomEvent('eiyu:archived', { detail: { id: crypto.randomUUID(), owner, message, tone } }));
}
/** How long a notice takes to fade out; matches --dur-base in index.css. */
export const NOTICE_FADE_MS = 200;
interface Notice { id: string; owner: string; type?: QuestType; message?: string; tone?: FeedbackTone; undo?: () => Promise<void> }
/** The bar mounts with a negative delay equal to the time already elapsed, so a remount (portal target change) never restarts it. */
function NoticeTimer({ paused, elapsed }: { paused: boolean; elapsed: () => number }) {
  const [delay] = useState(() => -elapsed());
  return <i className={`archive-notice-timer${paused ? ' is-paused' : ''}`} style={{ animationDelay: `${delay}ms` }} aria-hidden="true" />;
}
export default function ArchiveNotice({ onOpen }: { onOpen: () => void }) {
  const { user } = useSession();
  const owner = user?.id ?? null;
  const [queue, setQueue] = useState<Notice[]>([]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // The id of the notice that is fading out. It stays on screen, inert to hover and focus, until the fade is done.
  const [leaving, setLeaving] = useState<string | null>(null);
  const paused = hovered || focused;
  const remaining = useRef(8000);
  const runStart = useRef<number | null>(null);
  const timerFor = useRef<string | null>(null);
  const elapsed = (id: string) => timerFor.current !== id ? 0 : 8000 - remaining.current + (runStart.current === null ? 0 : Date.now() - runStart.current);
  const notice = queue[0];
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => {
    activeOwner = owner;
    setQueue([]);
    setLeaving(null);
    setHovered(false); setFocused(false);
    const show = (event: Event) => {
      const next = (event as CustomEvent<Notice>).detail;
      if (!next.owner || next.owner !== owner) return;
      setQueue(previous => {
        if (next.message) {
          // The latest result wins: it replaces visible and waiting plain messages so it is never hidden behind
          // stale feedback, while action-bearing archive notices keep their place in line.
          const archives = previous.slice(previous[0]?.message ? 1 : 0).filter(item => !item.message);
          const [head, ...waiting] = archives;
          return previous[0]?.message ? [next, ...archives] : head ? [head, next, ...waiting] : [next];
        }
        return previous[0]?.type === next.type && previous[0]?.message === next.message ? [next, ...previous.slice(1)] : [...previous, next];
      });
    };
    window.addEventListener('eiyu:archived', show);
    return () => { window.removeEventListener('eiyu:archived', show); if (activeOwner === owner) activeOwner = null; };
  }, [owner]);
  useEffect(() => { remaining.current = 8000; runStart.current = null; timerFor.current = notice?.id ?? null; }, [notice?.id]);
  useEffect(() => {
    if (!notice || paused || leaving === notice.id) return;
    const start = Date.now();
    runStart.current = start;
    const timer = window.setTimeout(() => setLeaving(notice.id), remaining.current);
    return () => { window.clearTimeout(timer); runStart.current = null; remaining.current = Math.max(0, remaining.current - (Date.now() - start)); };
  }, [notice, paused, leaving]);
  // A timer rather than transitionend: that event never fires under reduced motion or without a layout engine.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => {
      setQueue(q => q[0]?.id === leaving ? q.slice(1) : q);
      setLeaving(null);
    }, NOTICE_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  useEffect(() => {
    const update = () => setTarget(Array.from(document.querySelectorAll('[data-eiyu-dialog] .compact-dialog-body')).at(-1) ?? null);
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  // Moving between a dialog and the page remounts the notice; the old node never gets mouseleave or blur,
  // so a pause it held would otherwise last forever and the notice would never dismiss itself.
  useEffect(() => { setHovered(false); setFocused(false); }, [target]);
  const undo = async () => {
    const run = notice?.undo;
    if (notice) setLeaving(notice.id);
    if (!run) return;
    try { await run(); } catch (err) { announceFeedback(`Could not undo that: ${formatError(err)}`, owner, 'danger'); }
  };
  if (!notice || notice.owner !== owner) return null;
  const content = <div className={`archive-notice feedback-card${leaving === notice.id ? ' is-leaving' : ''}`} data-tone={notice.tone ?? (notice.message ? 'success' : 'warning')} role="status" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    {notice.message ? <span>{notice.message}</span> : <>
      <ArchiveIcon />
      <span><strong>{notice.type === 'habit' ? 'Habit' : 'Quest'} archived ✓</strong><br />Your archived habits are available from your profile.</span>
      {notice.undo && <button type="button" className="btn-quiet btn-compact" onClick={() => void undo()}><UndoIcon size={14} /> Undo</button>}
      <button type="button" className="btn-secondary btn-compact" onClick={() => { setLeaving(notice.id); onOpen(); }}>View archived habits</button>
    </>}
    {!notice.message && <NoticeTimer key={notice.id} paused={paused} elapsed={() => elapsed(notice.id)} />}
  </div>;
  return target ? createPortal(content, target) : content;
}
