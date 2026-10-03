import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigationGuard } from './NavigationGuard';

export default function FlowList({ children, label, size = 2, narrowSize = size, revealId, onRevealed, protectEditors = false }: { children: ReactNode; label: string; size?: number; narrowSize?: number; revealId?: string | null; onRevealed?: () => void; protectEditors?: boolean }) {
  const rows = Children.toArray(children);
  const requestNavigation = useNavigationGuard();
  const navigate = (action: () => void) => protectEditors ? requestNavigation(action) : action();
  const body = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(() => window.innerWidth < 1200 ? narrowSize : size);
  const [anchor, setAnchor] = useState(0);
  const page = Math.min(Math.floor(anchor / capacity), Math.max(0, Math.ceil(rows.length / capacity) - 1));
  const pages = Math.max(1, Math.ceil(rows.length / capacity));
  const focusId = useRef<string | null>(null);
  const revealed = useRef<string | null>(null);
  const revealIndex = rows.findIndex(row => typeof row === 'object' && row !== null && 'props' in row && (row.props as { 'data-item-id'?: string })['data-item-id'] === revealId);
  useEffect(() => {
    const change = () => {
      focusId.current = (document.activeElement?.closest('[data-item-id]') as HTMLElement | null)?.dataset.itemId ?? null;
      const elements = Array.from(body.current?.children ?? []);
      const offset = elements.findIndex(el => el.contains(document.activeElement));
      if (offset >= 0) setAnchor(page * capacity + offset);
      setCapacity(window.innerWidth < 1200 ? narrowSize : size);
    };
    window.addEventListener('resize', change);
    return () => window.removeEventListener('resize', change);
  }, [page, capacity, size, narrowSize]);
  useEffect(() => {
    if (!revealId) { revealed.current = null; return; }
    if (revealIndex >= 0 && revealed.current !== revealId) { setAnchor(revealIndex); focusId.current = revealId; revealed.current = revealId; }
  }, [revealId, revealIndex]);
  useEffect(() => {
    if (focusId.current) {
      const item = Array.from(body.current?.querySelectorAll<HTMLElement>('[data-item-id]') ?? []).find(el => el.dataset.itemId === focusId.current);
      (item?.querySelector<HTMLElement>('input') ?? item?.querySelector<HTMLElement>('button'))?.focus();
      if (item) { focusId.current = null; if (revealId) onRevealed?.(); }
    }
  });
  return <div className="flow-list"><div ref={body} className="flow-list-body">{rows.slice(page * capacity, (page + 1) * capacity)}</div>
    {pages > 1 && <nav className="list-pagination" aria-label={`${label} pages`}><button className="btn-secondary" aria-label={`Previous ${label} page`} disabled={!page} onClick={() => navigate(() => setAnchor((page - 1) * capacity))}>Previous</button><span aria-live="polite">{page + 1} / {pages}</span><button className="btn-secondary" aria-label={`Next ${label} page`} disabled={page === pages - 1} onClick={() => navigate(() => setAnchor((page + 1) * capacity))}>Next</button></nav>}
  </div>;
}
