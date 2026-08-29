import { MoonIcon, SunIcon } from '../Icons';

interface Props {
  darkMode: boolean;
  onToggleDark: () => void;
  onShowHistory: () => void;
  onLogout: () => void;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      width: 44, height: 24, borderRadius: 12,
      background: on ? 'var(--c-accent-strong)' : 'var(--c-track)',
      border: `1.5px solid ${on ? 'var(--c-accent-border)' : 'var(--c-glass-border)'}`,
      position: 'relative', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%', position: 'absolute',
        top: 2, left: on ? 22 : 2,
        background: on ? 'var(--c-accent)' : 'var(--c-dim)',
        boxShadow: on ? '0 0 8px var(--c-accent)' : 'none',
        transition: 'left 0.2s, background 0.2s',
      }} />
    </button>
  );
}

function SettingRow({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--c-glass-border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--c-text)' }}>{label}</div>
        {sub && <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim)', marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-dim)', marginTop: 24, marginBottom: 4 }}>{label}</div>;
}

export default function WebSettings({ darkMode, onToggleDark, onShowHistory, onLogout }: Props) {
  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontFamily: 'Rajdhani', fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.06em', margin: '0 0 4px' }}>SETTINGS</h2>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted)', marginBottom: 20 }}>Configure your experience</p>

      <div className="glass" style={{ padding: '4px 20px 4px' }}>
        <SectionLabel label="APPEARANCE" />
        <SettingRow
          label="Dark Mode"
          sub="Use the dark glass interface"
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SunIcon />
              <Toggle on={darkMode} onToggle={onToggleDark} />
              <MoonIcon />
            </div>
          }
        />

        <SectionLabel label="DATA" />
        <SettingRow
          label="Quest History"
          sub="View your completion calendar"
          right={
            <button onClick={onShowHistory} className="btn-ghost" style={{ padding: '6px 16px', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em' }}>
              VIEW
            </button>
          }
        />

        <SectionLabel label="ACCOUNT" />
        <div style={{ paddingBottom: 4 }}>
          <SettingRow
            label="Sign Out"
            sub="Return to the login screen"
            right={
              <button onClick={onLogout} style={{ padding: '6px 16px', borderRadius: 50, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.08)', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: '#f87171', letterSpacing: '0.08em', cursor: 'pointer', transition: 'all 0.15s' }}>
                SIGN OUT
              </button>
            }
          />
        </div>
      </div>

      <div style={{ marginTop: 24, textAlign: 'center', fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim)' }}>
        Eiyu System v1.0.0 · Built for the ascent
      </div>
    </div>
  );
}
