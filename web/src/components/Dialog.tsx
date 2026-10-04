import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Stacked dialogs share topmost-only keyboard handling and restore the trigger. */
export default function Dialog({ title, onClose, children, pending = false, initialFocus }: {
  title: string; onClose: () => void; children: ReactNode; pending?: boolean; initialFocus?: string;
}) {
  const titleId = useId();
  const [theme, setTheme] = useState(document.querySelector<HTMLElement>('.surface-flat[data-theme]')?.dataset.theme);
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const origin = useRef(document.activeElement as HTMLElement | null);
  const initialFocusTarget = useRef(initialFocus);
  const closeAction = useRef(onClose);
  const busy = useRef(pending);
  closeAction.current = onClose;
  busy.current = pending;
  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.surface-flat[data-theme]');
    const themes = new MutationObserver(() => setTheme(surface?.dataset.theme));
    if (surface) themes.observe(surface, { attributes: true, attributeFilter: ['data-theme'] });
    const states = Array.from(document.body.children).filter(node => node !== overlay.current).map(node => ({
      node: node as HTMLElement, inert: (node as HTMLElement).inert, hidden: node.getAttribute('aria-hidden'),
    }));
    states.forEach(({ node }) => { node.inert = true; node.setAttribute('aria-hidden', 'true'); });
    (initialFocusTarget.current ? panel.current?.querySelector<HTMLElement>(initialFocusTarget.current) : close.current)?.focus();
    const top = () => Array.from(document.querySelectorAll('[data-eiyu-dialog]')).slice(-1)[0] === overlay.current;
    const keys = (event: KeyboardEvent) => {
      if (!top()) return;
      if (event.key === 'Escape') { event.preventDefault(); if (!busy.current) closeAction.current(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []);
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keys);
    const contain = (event: FocusEvent) => { if (top() && !panel.current?.contains(event.target as Node)) (panel.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? panel.current)?.focus(); };
    document.addEventListener('focusin', contain);
    const trigger = origin.current;
    return () => {
      document.removeEventListener('keydown', keys);
      document.removeEventListener('focusin', contain);
      themes.disconnect();
      states.forEach(({ node, inert, hidden }) => { node.inert = inert; if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', hidden); });
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return createPortal(<div ref={overlay} data-eiyu-dialog data-theme={theme} className="phase4-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <section ref={panel} className="phase4-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="phase4-dialog-heading"><h2 id={titleId}>{title}</h2><button ref={close} type="button" className="phase4-close" aria-label={`Close ${title}`} disabled={pending} onClick={onClose}>×</button></div>
      <div className="dialog-rule" aria-hidden="true" />
      <div className="compact-dialog-body">{children}</div>
    </section>
  </div>, document.body);
}
