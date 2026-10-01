import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useBlocker, useNavigate } from 'react-router-dom';
import { formatError, normalizeProfileEdit, profileInitials, RANK_CONFIG } from '@eiyu/shared';

import { BoardIcon, ScrollIcon, StatusIcon } from '../Icons';
import { useSession } from '../store/session-context';
import { useEiyu } from '../store/eiyu-store';
import WebSettings from './WebSettings';
import ArchivedHabits from './ArchivedHabits';

export type AccountOverlay = 'profile' | 'settings' | 'archived' | null;

interface Props {
  overlay: AccountOverlay;
  onOpenOverlay: (overlay: Exclude<AccountOverlay, null>) => void;
  onCloseOverlay: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

const NAV = [
  { to: '/board', label: 'BOARD', Icon: BoardIcon },
  { to: '/status', label: 'STATUS', Icon: StatusIcon },
  { to: '/longquests', label: 'LONG QUESTS', Icon: ScrollIcon },
  { to: '/gym', label: 'GYM PROGRESS', Icon: StatusIcon },
] as const;

function initials(name: string) { return profileInitials(name); }

function OverlayFrame({ title, onClose, children, canClose = true, theme }: { title: string; onClose: () => void; children: ReactNode; canClose?: boolean; theme: 'dark' | 'light' }) {
  const overlay = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => {
    const background = Array.from(document.body.children).filter(node => node !== overlay.current) as HTMLElement[];
    const previous = background.map(node => ({ node, inert: node.inert, ariaHidden: node.getAttribute('aria-hidden') }));
    for (const node of background) { node.inert = true; node.setAttribute('aria-hidden', 'true'); }
    closeButton.current?.focus();
    const containFocus = (event: FocusEvent) => {
      if (!dialog.current?.contains(event.target as Node)) {
        (dialog.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? dialog.current)?.focus();
      }
    };
    document.addEventListener('focusin', containFocus);
    const originalTrigger = trigger.current;
    return () => {
      document.removeEventListener('focusin', containFocus);
      for (const state of previous) {
        state.node.inert = state.inert;
        if (state.ariaHidden === null) state.node.removeAttribute('aria-hidden');
        else state.node.setAttribute('aria-hidden', state.ariaHidden);
      }
      if (originalTrigger?.isConnected) originalTrigger.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (canClose) onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []);
      if (!focusable.length) { event.preventDefault(); dialog.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [canClose, onClose]);

  return createPortal(
    <div
      ref={overlay}
      data-theme={theme}
      className="phase4-overlay"
      role="presentation"
      onMouseDown={event => {
        if (canClose && event.target === event.currentTarget) onClose();
      }}
    >
      <section ref={dialog} className="phase4-dialog" role="dialog" aria-modal="true" aria-labelledby="phase4-dialog-title" tabIndex={-1}>
        <div className="phase4-dialog-heading">
          <h2 id="phase4-dialog-title">{title}</h2>
          <button ref={closeButton} className="phase4-close" type="button" onClick={onClose} aria-label={`Close ${title}`} disabled={!canClose}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>, document.body
  );
}

function ProfileDialog({ onClose, theme }: { onClose: () => void; theme: 'dark' | 'light' }) {
  const { user, saveProfile } = useEiyu();
  const [displayName, setDisplayName] = useState(user.name);
  const [userClass, setUserClass] = useState(user.userClass);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const dirty = displayName !== user.name || userClass !== user.userClass;
  const allowNavigation = useRef(false);
  const blocker = useBlocker(() => (dirty || pending) && !allowNavigation.current);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (pending) { blocker.reset(); return; }
    if (window.confirm('Discard your unsaved profile changes?')) blocker.proceed();
    else blocker.reset();
  }, [blocker, pending]);

  useEffect(() => {
    setDisplayName(user.name);
    setUserClass(user.userClass);
    setError(null);
  }, [user.name, user.userClass]);

  const requestClose = () => {
    if (pending) return;
    onClose();
  };

  const save = async () => {
    if (saving.current) return;
    setError(null);
    try {
      const normalized = normalizeProfileEdit({ displayName, userClass }, {
        displayName: user.name, userClass: user.userClass,
      });
      saving.current = true;
      setPending(true);
      await saveProfile(normalized);
      allowNavigation.current = true;
      onClose();
    } catch (err) {
      setError(formatError(err));
    } finally {
      saving.current = false;
      setPending(false);
    }
  };

  return (
    <OverlayFrame title="EDIT DETAILS" onClose={requestClose} canClose={!pending} theme={theme}>
      <div className="phase4-form">
        <label>
          Display name
          <input aria-label="Display name" value={displayName} disabled={pending} onChange={event => setDisplayName(event.target.value)} />
        </label>
        <label>
          Class
          <input aria-label="Class" value={userClass} disabled={pending} onChange={event => setUserClass(event.target.value)} />
        </label>
        {error && <p className="phase4-error" role="alert">{error}</p>}
        <div className="phase4-dialog-actions">
          <button type="button" className="btn-ghost phase4-secondary" onClick={requestClose} disabled={pending}>CANCEL</button>
          <button type="button" className="btn-ghost phase4-primary" onClick={() => void save()} disabled={pending}>
            {pending ? 'SAVING…' : 'SAVE'}
          </button>
        </div>
      </div>
    </OverlayFrame>
  );
}

export default function AccountShell({ overlay, onOpenOverlay, onCloseOverlay, darkMode, onToggleDark }: Props) {
  const { user } = useEiyu();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const accountButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const rankCfg = RANK_CONFIG[user.rank];

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!accountButton.current?.parentElement?.contains(target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!overlay && !menuOpen) accountButton.current?.focus();
  }, [overlay, menuOpen]);

  const openOverlay = (kind: Exclude<AccountOverlay, null>) => {
    setMenuOpen(false);
    setLogoutError(null);
    onOpenOverlay(kind);
  };

  const closeOverlay = () => {
    onCloseOverlay();
    accountButton.current?.focus();
  };

  const logout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError(null);
    const { error } = await signOut();
    if (error) setLogoutError(formatError(error));
    else setMenuOpen(false);
    setLogoutPending(false);
  };

  return (
    <>
      <header className="phase4-header">
        <NavLink to="/board" className="phase4-brand" aria-label="Eiyu System home">
          <span className="phase4-brand-mark">英</span>
          <span><strong>EIYU</strong><small>SYSTEM</small></span>
        </NavLink>
        <nav aria-label="Primary navigation" className="phase4-primary-nav">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="phase4-nav-link">
              {({ isActive }) => <><Icon active={isActive} /><span>{label}</span></>}
            </NavLink>
          ))}
        </nav>
        <div className="phase4-account-wrap">
          <button
            ref={accountButton}
            type="button"
            className="phase4-account-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`${user.name}, ${user.userClass}, rank ${user.rank}`}
            onClick={() => setMenuOpen(open => !open)}
          >
            <span className="phase4-avatar">{initials(user.name)}</span>
            <span className="phase4-account-copy"><strong>{user.name}</strong><small>{user.userClass}</small></span>
            <span className="phase4-rank" style={{ color: rankCfg.color, borderColor: rankCfg.color }}>{user.rank}</span>
          </button>
          {menuOpen && (
            <div className="phase4-account-menu" role="menu" aria-label="Account menu">
              <button role="menuitem" type="button" onClick={() => openOverlay('profile')}>Edit details</button>
              <button role="menuitem" type="button" onClick={() => openOverlay('settings')}>Settings</button>
              <button role="menuitem" type="button" onClick={() => openOverlay('archived')}>Archived habits</button>
              <button role="menuitem" type="button" onClick={() => void logout()} disabled={logoutPending}>
                {logoutPending ? 'Logging out…' : 'Logout'}
              </button>
              {logoutError && <p className="phase4-error" role="alert">{logoutError}</p>}
            </div>
          )}
        </div>
      </header>
      {overlay === 'archived' && <ArchivedHabits onClose={closeOverlay} />}
      {overlay === 'profile' && <ProfileDialog onClose={closeOverlay} theme={darkMode ? 'dark' : 'light'} />}
      {overlay === 'settings' && (
        <OverlayFrame title="SETTINGS" onClose={closeOverlay} theme={darkMode ? 'dark' : 'light'}>
          <WebSettings
            darkMode={darkMode}
            onToggleDark={onToggleDark}
            onShowHistory={() => navigate('/history')}
            onLogout={() => void logout()}
            signOutError={logoutError}
            embedded
          />
        </OverlayFrame>
      )}
    </>
  );
}
