import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { formatError, normalizeProfileEdit, profileInitials, RANK_CONFIG } from '@eiyu/shared';

import { BoardIcon, DumbbellIcon, GearIcon, ScrollIcon, SignOutIcon, StatusIcon } from '../Icons';
import { useSession } from '../store/session-context';
import { useEiyu } from '../store/eiyu-store';
import WebSettings from './WebSettings';
import ArchivedHabits from './ArchivedHabits';
import Dialog from '../components/Dialog';
import { useEditorGuard, useNavigationGuard } from '../components/NavigationGuard';
import type { Palette } from '../palette';

export type AccountOverlay = 'profile' | 'settings' | 'archived' | null;

interface Props {
  overlay: AccountOverlay;
  onOpenOverlay: (overlay: Exclude<AccountOverlay, null>) => void;
  onCloseOverlay: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  palette: Palette;
  onPaletteChange: (palette: Palette) => void;
}

const NAV = [
  { to: '/board', label: 'BOARD', Icon: BoardIcon },
  { to: '/status', label: 'STATUS', Icon: StatusIcon },
  { to: '/longquests', label: 'CHAIN PROGRESSION', Icon: ScrollIcon },
  { to: '/gym', label: 'GYM PROGRESS', Icon: DumbbellIcon },
] as const;

function initials(name: string) { return profileInitials(name); }

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { user, saveProfile } = useEiyu();
  const [displayName, setDisplayName] = useState(user.name);
  const [userClass, setUserClass] = useState(user.userClass);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const dirty = displayName !== user.name || userClass !== user.userClass;
  const requestClose = useEditorGuard(dirty, pending, true);

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
      requestClose.committed(onClose);
    } catch (err) {
      setError(formatError(err));
    } finally {
      saving.current = false;
      setPending(false);
    }
  };

  return (
    <Dialog title="EDIT DETAILS" onClose={() => requestClose(onClose)} pending={pending}>
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
          <button type="button" className="btn-secondary" onClick={() => requestClose(onClose)} disabled={pending}>CANCEL</button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={pending}>
            {pending ? 'SAVING…' : 'SAVE'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export default function AccountShell({ overlay, onOpenOverlay, onCloseOverlay, darkMode, onToggleDark, palette, onPaletteChange }: Props) {
  const { user } = useEiyu();
  const { signOut } = useSession();
  const guardNavigation = useNavigationGuard();
  const navigate = useNavigate();
  const accountButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const rankCfg = RANK_CONFIG[user.rank];

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(accountButton.current?.parentElement?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); accountButton.current?.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[target]?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest('[data-eiyu-dialog]')) return;
      if (!accountButton.current?.parentElement?.contains(target)) setMenuOpen(false);
    };
    accountButton.current?.parentElement?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
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
    try {
      const { error } = await signOut();
      if (error) { setLogoutError(formatError(error)); setMenuOpen(true); }
      else setMenuOpen(false);
    } catch (error) {
      setLogoutError(formatError(error));
      setMenuOpen(true);
    } finally { setLogoutPending(false); }
  };

  return (
    <>
      <header className="phase4-header">
        <NavLink to="/board" className="phase4-brand" aria-label="Eiyu System home">
          <span className="phase4-brand-mark brand-pulse">英</span>
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
              <button role="menuitem" type="button" onClick={() => openOverlay('profile')}><StatusIcon active={false} />Edit details</button>
              <button role="menuitem" type="button" onClick={() => openOverlay('settings')}><GearIcon active={false} />Settings</button>
              <button role="menuitem" type="button" onClick={() => openOverlay('archived')}><ScrollIcon active={false} />Archived habits</button>
              <button role="menuitem" type="button" onClick={() => guardNavigation(() => void logout())} disabled={logoutPending}>
                <SignOutIcon active={false} />{logoutPending ? 'Logging out…' : 'Logout'}
              </button>
              {logoutError && <p className="phase4-error" role="alert">{logoutError}</p>}
            </div>
          )}
        </div>
      </header>
      {overlay === 'archived' && <ArchivedHabits onClose={closeOverlay} />}
      {overlay === 'profile' && <ProfileDialog onClose={closeOverlay} />}
      {overlay === 'settings' && (
        <Dialog title="SETTINGS" onClose={closeOverlay}>
          <WebSettings
            darkMode={darkMode}
            onToggleDark={onToggleDark}
            palette={palette}
            onPaletteChange={onPaletteChange}
            onShowHistory={() => navigate('/history')}
            onLogout={() => guardNavigation(() => void logout())}
            signOutError={logoutError}
            embedded
          />
        </Dialog>
      )}
    </>
  );
}
