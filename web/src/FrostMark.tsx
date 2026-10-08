import { SNOWFLAKE_BRANCHES, SNOWFLAKE_SPOKES } from './snowflakeGeometry';

interface Props {
  size?: number;
}

/**
 * Snowflake for a frozen streak: it shimmers slowly while a small glint twinkles on the upper-right arm, out of phase.
 * Both loops live in index.css (ice-shimmer / ice-twinkle) so reduced motion can switch them off; the glow is a static
 * drop-shadow. The glint sits inside the same box as the flake, so a clipped row never cuts it off.
 */
export default function FrostMark({ size = 14 }: Props) {
  return (
    <span
      className="frost-mark"
      aria-hidden="true"
      style={{ position: 'relative', display: 'inline-block', flexShrink: 0, width: size, height: size, verticalAlign: 'middle' }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--c-ice)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        className="frost-shimmer" style={{ position: 'absolute', inset: 0 }}>
        {SNOWFLAKE_SPOKES.map(s => <line key={s.y1 + ':' + s.x1} {...s} />)}
        <path d={SNOWFLAKE_BRANCHES} />
      </svg>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 10 10" className="frost-twinkle" style={{ position: 'absolute', top: 0, right: 0 }}>
        <path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z" fill="var(--c-ice)" />
      </svg>
    </span>
  );
}
