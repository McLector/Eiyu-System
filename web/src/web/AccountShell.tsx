import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { formatError, normalizeProfileEdit, RANK_CONFIG } from '@eiyu/shared';

import { BoardIcon, ScrollIcon, StatusIcon } from '../Icons';
import { useSession } from '../store/session-context';
import { useEiyu } from '../store/eiyu-store';
import WebSettings from './WebSettings';

export type AccountOverlay = 'profile' | 'settings' | null;

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
] as const;

function initials(name: string) {
  return name.split(' ').filter(Boolean).map(part => part[0]).join('').slice(0, 3).toUpperCase();
}

function OverlayFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="phase4-overlay"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="phase4-dialog" role="dialog" aria-modal="true" aria-labelledby="phase4-dialog-title">
        <div className="phase4-dialog-heading">
          <h2 id="phase4-dialog-title">{title}</h2>
          <button className="phase4-close" type="button" onClick={onClose} aria-label={`Close ${title}`} autoFocus>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { user, saveProfile } = useEiyu();
  const [displayName, setDisplayName] = useState(user.name);
  const [userClass, setUserClass] = useState(user.userClass);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = displayName !== user.name || userClass !== user.userClass;

  useEffect(() => {
    setDisplayName(user.name);
    setUserClass(user.userClass);
    setError(null);
  }, [user.name, user.userClass]);

  const requestClose = () => {
    if (!dirty || window.confirm('Discard your unsaved profile changes?')) onClose();
  };

  const save = async () => {
    setError(null);
    try {
      const normalized = normalizeProfileEdit({ displayName, userClass });
      setPending(true);
      await saveProfile(normalized);
      onClose();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <OverlayFrame title="EDIT DETAILS" onClose={requestClose}>
      <div className="phase4-form">
        <label>
          Display name
          <input aria-label="Display name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} />
        </label>
        <label>
          Class
          <input aria-label="Class" value={userClass} onChange={event => setUserClass(event.target.value)} maxLength={80} />
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
              <button role="menuitem" type="button" onClick={() => void logout()} disabled={logoutPending}>
                {logoutPending ? 'Logging out…' : 'Logout'}
              </button>
              {logoutError && <p className="phase4-error" role="alert">{logoutError}</p>}
            </div>
          )}
        </div>
      </header>
      {overlay === 'profile' && <ProfileDialog onClose={closeOverlay} />}
      {overlay === 'settings' && (
        <OverlayFrame title="SETTINGS" onClose={closeOverlay}>
          <WebSettings
            darkMode={darkMode}
            onToggleDark={onToggleDark}
            onShowHistory={() => { closeOverlay(); navigate('/history'); }}
            onLogout={() => void logout()}
            signOutError={logoutError}
            embedded
          />
        </OverlayFrame>
      )}
    </>
  );
}
