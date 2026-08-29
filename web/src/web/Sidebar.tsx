import { BoardIcon, StatusIcon, ScrollIcon, GearIcon } from '../Icons';
import { RANK_CONFIG } from '@eiyu/shared';
import { useEiyu } from '../store/eiyu-store';

export type Screen = 'board' | 'status' | 'longquests' | 'settings';

interface Props {
  current: Screen;
  onChange: (s: Screen) => void;
}

const NAV: { id: Screen; label: string; Icon: React.FC<{ active: boolean }> }[] = [
  { id: 'board', label: 'BOARD', Icon: BoardIcon },
  { id: 'status', label: 'STATUS', Icon: StatusIcon },
  { id: 'longquests', label: 'LONG QUESTS', Icon: ScrollIcon },
  { id: 'settings', label: 'SETTINGS', Icon: GearIcon },
];

export default function Sidebar({ current, onChange }: Props) {
  const { user } = useEiyu();
  const rankCfg = RANK_CONFIG[user.rank];

  return (
    <div style={{
      width: 220, minHeight: '100svh',
      position: 'fixed', top: 0, left: 0, zIndex: 30,
      background: 'var(--c-nav)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRight: '1px solid var(--c-nav-border)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Logo */}
      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid var(--c-glass-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'var(--c-accent-glass)',
            border: '1.5px solid var(--c-accent-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Rajdhani', fontSize: 19, fontWeight: 700, color: 'var(--c-accent)',
            boxShadow: '0 0 16px var(--c-accent-glass)',
            flexShrink: 0,
          }}>英</div>
          <div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 17, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.1em', lineHeight: 1 }}>
              EIYU
            </div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 10, fontWeight: 600, color: 'var(--c-muted)', letterSpacing: '0.18em' }}>
              SYSTEM
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: 8 }}>
        {NAV.map(({ id, label, Icon }) => {
          const active = current === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px',
                background: active ? 'var(--c-accent-glass)' : 'transparent',
                borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                borderLeft: `3px solid ${active ? 'var(--c-accent)' : 'transparent'}`,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--c-accent-glass)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <Icon active={active} />
              <span style={{
                fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 600, letterSpacing: '0.12em',
                color: active ? 'var(--c-accent)' : 'var(--c-nav-dim)',
                transition: 'color 0.15s',
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* User card */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--c-glass-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: 'var(--c-accent-glass)',
            border: '1.5px solid var(--c-accent-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)',
          }}>
            {user.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 14, fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-muted)' }}>
              {user.userClass}
            </div>
          </div>
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: rankCfg.bg,
            border: `1.5px solid ${rankCfg.color}`,
            fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: rankCfg.color,
            boxShadow: `0 0 10px ${rankCfg.glow}`,
          }}>
            {user.rank}
          </div>
        </div>
      </div>
    </div>
  );
}
