import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import StateBlock from './StateBlock';

export default function PaginatedList({ children, label, empty }: { children: ReactNode; label: string; empty?: string }) {
  const rows = Children.toArray(children);
  const body = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(2);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / capacity));
  const current = Math.min(page, pages - 1);
  useEffect(() => {
    const measure = () => {
      const node = body.current;
      if (!node || node.clientHeight <= 0) return;
      const heights = Array.from(node.children).map(child => child.getBoundingClientRect().height);
      const height = Math.max(1, ...heights);
      // clientHeight includes the body's own padding, which cards cannot use; rows are separated by the flex gap.
      const style = getComputedStyle(node);
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      const gap = parseFloat(style.rowGap) || 0;
      setCapacity(Math.max(1, Math.floor((node.clientHeight - padding + gap) / (height + gap))));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (body.current) { observer?.observe(body.current); Array.from(body.current.children).forEach(node => observer?.observe(node)); }
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [children, current, capacity]);
  return <div className="paged-list">
    <div ref={body} className="paged-list-body">{rows.length ? rows.slice(current * capacity, (current + 1) * capacity) : <StateBlock kind="empty">{empty ?? 'No items yet.'}</StateBlock>}</div>
    <nav className="list-pagination" aria-label={`${label} pages`}>
      <button className="btn-secondary" type="button" aria-label={`Previous ${label} page`} disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
      <span aria-live="polite">{current + 1} / {pages}</span>
      <button className="btn-secondary" type="button" aria-label={`Next ${label} page`} disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Next</button>
    </nav>
  </div>;
}
