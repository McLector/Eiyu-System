import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ActionMenuItem { label: string; ariaLabel?: string; onSelect: () => void; danger?: boolean; disabled?: boolean; icon?: ReactNode; tone?: 'edit' | 'warn' | 'danger' }

const CLOSE_OTHERS = 'eiyu:action-menu-open';
const ITEM_HEIGHT = 40;

/**
 * A menu button for secondary row actions. The menu is portalled into the app root (so it escapes the lane's
 * clipping but keeps the theme, cursor and fonts), closes on Escape, Tab, outside press, scroll and resize,
 * and hands focus back to the trigger before it runs an action so a dialog opened by that action restores
 * focus to a control that still exists.
 */
export default function ActionMenu({ label, items, disabled = false, busy = false }: {
  label: string; items: ActionMenuItem[]; disabled?: boolean; busy?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, []);

  const openMenu = () => {
    const rect = trigger.current!.getBoundingClientRect();
    const height = items.length * ITEM_HEIGHT + 10;
    const below = rect.bottom + 4 + height <= window.innerHeight;
    setPlace(below ? { top: rect.bottom + 4, right: window.innerWidth - rect.right } : { bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right });
    window.dispatchEvent(new CustomEvent(CLOSE_OTHERS, { detail: id }));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const enabled = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    enabled()[0]?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close(false);
    };
    const other = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close(false); };
    // A scroll or resize can close the menu while focus is inside it; focus must not fall to the page.
    const dismiss = () => close(!!menu.current?.contains(document.activeElement));
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener(CLOSE_OTHERS, other);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener(CLOSE_OTHERS, other);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open, id, close]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (next: number) => { event.preventDefault(); list[(next + list.length) % list.length]?.focus(); };
    if (event.key === 'ArrowDown') go(index + 1);
    else if (event.key === 'ArrowUp') go(index - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(list.length - 1);
    else if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); close(true); }
  };

  const select = (item: ActionMenuItem) => {
    if (item.disabled) return;
    close(true);
    item.onSelect();
  };

  const host = typeof document === 'undefined' ? null : document.querySelector('.surface-flat') ?? document.body;
  return (
    <>
      <button
        ref={trigger} type="button" className="btn-quiet btn-compact action-menu-trigger" aria-label={label}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-busy={busy || undefined}
        disabled={disabled} onClick={() => (open ? close(false) : openMenu())}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && host && createPortal(
        <div ref={menu} id={id} role="menu" aria-label={label} className="action-menu" style={place} onKeyDown={onKeyDown}>
          {items.map(item => (
            <button
              key={item.label} type="button" role="menuitem" aria-label={item.ariaLabel} disabled={item.disabled}
              data-tone={item.tone ?? (item.danger ? 'danger' : undefined)}
              className={`btn-quiet action-menu-item${item.danger ? ' is-danger' : ''}`} onClick={() => select(item)}
            >{item.icon}<span>{item.label}</span></button>
          ))}
        </div>,
        host,
      )}
    </>
  );
}
