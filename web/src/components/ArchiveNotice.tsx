import { useEffect, useState } from 'react';
import { CheckIcon } from '../Icons';
export function announceArchive(type: 'habit' | 'one_time') {
  window.dispatchEvent(new CustomEvent('eiyu:archived', { detail: type }));
}
export default function ArchiveNotice({ onOpen }: { onOpen: () => void }) {
  const [type, setType] = useState<'habit' | 'one_time' | null>(null);
  useEffect(() => {
    const show = (event: Event) => setType((event as CustomEvent<'habit' | 'one_time'>).detail);
    window.addEventListener('eiyu:archived', show);
    return () => window.removeEventListener('eiyu:archived', show);
  }, []);
  useEffect(() => { if (!type) return; const timer = window.setTimeout(() => setType(null), 8000); return () => window.clearTimeout(timer); }, [type]);
  return type && <div className="archive-notice" role="status"><CheckIcon /><span>{type === 'habit' ? 'Habit' : 'Quest'} archived. View archived habits in your profile.</span><button className="btn-ghost" onClick={() => { onOpen(); setType(null); }}>Open archived habits</button><button className="btn-ghost" aria-label="Dismiss archive notice" onClick={() => setType(null)}>×</button></div>;
}
