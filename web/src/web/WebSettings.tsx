import { MoonIcon, SunIcon } from '../Icons';
import { PALETTES, type Palette } from '../palette';

interface Props {
  darkMode: boolean;
  onToggleDark: () => void;
  palette: Palette;
  onPaletteChange: (palette: Palette) => void;
  onShowHistory: () => void;
  onLogout: () => void;
  signOutError?: string | null;
  embedded?: boolean;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button aria-label="Dark mode" role="switch" aria-checked={on} onClick={onToggle} style={{
      width: 44, height: 24, borderRadius: 12,
      background: on ? 'var(--c-accent-strong)' : 'var(--c-track)',
      border: `1.5px solid ${on ? 'var(--c-accent-border)' : 'var(--c-divider-flat)'}`,
      position: 'relative', cursor: 'pointer', transition: 'background-color var(--dur-base) ease, border-color var(--dur-base) ease', flexShrink: 0,
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%', position: 'absolute',
        top: 2, left: 2, transform: `translateX(${on ? 20 : 0}px)`,
        background: on ? 'var(--c-accent)' : 'var(--c-dim-flat)',
        boxShadow: on ? '0 0 8px var(--c-accent)' : 'none',
        transition: 'transform var(--dur-base) var(--ease-in-out), background-color var(--dur-base) ease',
      }} />
    </button>
  );
}

function PaletteChoice({ palette, onChange }: { palette: Palette; onChange: (palette: Palette) => void }) {
  return (
    <div role="radiogroup" aria-label="Colour palette" className="palette-options">
      {PALETTES.map(({ id, label, swatch }) => (
        <label key={id} className={`palette-option${palette === id ? ' is-selected' : ''}`}>
          <input type="radio" name="palette" value={id} checked={palette === id} onChange={() => { if (palette !== id) onChange(id); }} />
          <span className="palette-swatch" aria-hidden="true" style={{ '--swatch': swatch } as React.CSSProperties} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function SettingRow({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--c-text)' }}>{label}</div>
        {sub && <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim-flat)', marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function SectionLabel({ label, first }: { label: string; first?: boolean }) {
  return <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-dim-flat)', marginTop: first ? 0 : 24, marginBottom: 4 }}>{label}</div>;
}

export default function WebSettings({ darkMode, onToggleDark, palette, onPaletteChange, onShowHistory, onLogout, signOutError, embedded }: Props) {
  return (
    <div style={{ maxWidth: 560 }}>
      {!embedded && <>
        <h2 style={{ fontFamily: 'Rajdhani', fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.06em', margin: '0 0 4px' }}>SETTINGS</h2>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted-flat)', marginBottom: 20 }}>Configure your experience</p>
      </>}

      <SectionLabel label="APPEARANCE" first />
      <SettingRow
        label="Dark Mode"
        sub="Switch between light and dark surfaces"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SunIcon />
            <Toggle on={darkMode} onToggle={onToggleDark} />
            <MoonIcon />
          </div>
        }
      />

      <SettingRow
        label="Colour palette"
        sub="Tints the whole app, in light and dark"
        right={<PaletteChoice palette={palette} onChange={onPaletteChange} />}
      />

      <div className="divider-flat" />

      <SectionLabel label="DATA" />
      <SettingRow
        label="Quest History"
        sub="View your completion calendar"
        right={
          <button onClick={onShowHistory} className="btn-secondary">
            VIEW
          </button>
        }
      />

      {!embedded && <>
        <div className="divider-flat" />
        <SectionLabel label="ACCOUNT" />
        <SettingRow
          label="Sign Out"
          sub="Return to the login screen"
          right={
            <button onClick={onLogout} className="btn-destructive">
              SIGN OUT
            </button>
          }
        />
        {signOutError && <p role="alert" className="phase4-error">{signOutError}</p>}
      </>}

      <div style={{ marginTop: 24, textAlign: 'center', fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim-flat)' }}>
        Eiyu System v1.0.0 · Built for the ascent
      </div>
    </div>
  );
}
