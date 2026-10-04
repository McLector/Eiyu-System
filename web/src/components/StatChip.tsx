import { STAT_COLORS, type Stat } from '@eiyu/shared';
import { StatIcon } from '../Icons';

/** One selectable stat in an editor. Shared so both quest editors look and announce the same way. */
export default function StatChip({ stat, selected, onClick, disabled }: { stat: Stat; selected: boolean; onClick: () => void; disabled?: boolean }) {
  const color = STAT_COLORS[stat];
  return (
    <button
      type="button"
      className="stat-chip"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      style={selected ? { background: color + '18', borderColor: color + '55' } : undefined}
    >
      <StatIcon stat={stat} size={13} />
      <span style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: selected ? color : 'var(--c-dim-flat)' }}>{stat}</span>
    </button>
  );
}
