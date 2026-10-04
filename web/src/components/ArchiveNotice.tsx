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
interface Notice { id: string; owner: string; type?: QuestType; message?: string; tone?: FeedbackTone; undo?: () => Promise<void> }
export default function ArchiveNotice({ onOpen }: { onOpen: () => void }) {
  const { user } = useSession();
  const owner = user?.id ?? null;
  const [queue, setQueue] = useState<Notice[]>([]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(8000);
  const notice = queue[0];
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => {
    activeOwner = owner;
    setQueue([]);
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
  useEffect(() => { remaining.current = 8000; }, [notice?.id]);
  useEffect(() => {
    if (!notice || paused) return;
    const start = Date.now();
    const timer = window.setTimeout(() => setQueue(q => q.slice(1)), remaining.current);
    return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - start)); };
  }, [notice, paused]);
  useEffect(() => {
    const update = () => setTarget(Array.from(document.querySelectorAll('[data-eiyu-dialog] .compact-dialog-body')).at(-1) ?? null);
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const undo = async () => {
    const run = notice?.undo;
    setQueue(q => q.slice(1));
    if (!run) return;
    try { await run(); } catch (err) { announceFeedback(`Could not undo that: ${formatError(err)}`, owner, 'danger'); }
  };
  if (!notice || notice.owner !== owner) return null;
  const content = <div className="archive-notice feedback-card" data-tone={notice.tone ?? (notice.message ? 'success' : 'warning')} role="status" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    {notice.message ? <span>{notice.message}</span> : <>
      <ArchiveIcon />
      <span><strong>{notice.type === 'habit' ? 'Habit' : 'Quest'} archived ✓</strong><br />Your archived habits are available from your profile.</span>
      {notice.undo && <button type="button" className="btn-quiet btn-compact" onClick={() => void undo()}><UndoIcon size={14} /> Undo</button>}
      <button type="button" className="btn-secondary btn-compact" onClick={() => { setQueue(q => q.slice(1)); onOpen(); }}>View archived habits</button>
    </>}
    <button className="phase4-close" aria-label="Dismiss archive notice" onClick={() => setQueue(q => q.slice(1))}>×</button>
    {!notice.message && <i key={notice.id} className={`archive-notice-timer${paused ? ' is-paused' : ''}`} aria-hidden="true" />}
  </div>;
  return target ? createPortal(content, target) : content;
}
