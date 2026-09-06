interface Props {
  size?: number;
}

const OUTER_PATH = 'M13 2 C 7 8 3 13 3 19 C 3 25 8 29 13 29 C 18 29 23 25 23 19 C 23 13 19 8 13 2 Z';
const INNER_PATH = 'M13 6 C 9 11 6.5 15 6.5 19.5 C 6.5 24 9.5 27 13 27 C 16.5 27 19.5 24 19.5 19.5 C 19.5 15 17 11 13 6 Z';
const CORE_PATH = 'M13 12 C 11 15 10 18 10 20.5 C 10 23.5 11.3 25.5 13 25.5 C 14.7 25.5 16 23.5 16 20.5 C 16 18 15 15 13 12 Z';

/**
 * Layered flame for an active streak (redesign spec §7.2). Three silhouettes
 * animate on independent durations so the composite shape actually distorts
 * frame to frame — a single pulsing shape reads as a candle, not fire. No
 * ember particles at this inline badge scale (~14px) — they'd be illegible
 * noise; the flicker itself is the one authored moment here.
 */
export default function FireStreak({ size = 14 }: Props) {
  const height = size * (30 / 26);
  return (
    <span
      className="fire-flame"
      aria-hidden="true"
      style={{
        position: 'relative', display: 'inline-block', width: size, height,
        verticalAlign: 'middle', animation: 'fireGlow 1.3s ease-in-out infinite',
      }}
    >
      <svg width={size} height={height} viewBox="0 0 26 30" className="fire-flame"
        style={{ position: 'absolute', inset: 0, animation: 'lick-outer 1.1s ease-in-out infinite', transformOrigin: '50% 100%' }}>
        <path d={OUTER_PATH} fill="var(--c-fire-outer)" />
      </svg>
      <svg width={size} height={height} viewBox="0 0 26 30" className="fire-flame"
        style={{ position: 'absolute', inset: 0, animation: 'lick-inner 0.8s ease-in-out infinite', transformOrigin: '50% 100%' }}>
        <path d={INNER_PATH} fill="var(--c-fire-inner)" />
      </svg>
      <svg width={size} height={height} viewBox="0 0 26 30" className="fire-flame"
        style={{ position: 'absolute', inset: 0, animation: 'lick-core 0.65s ease-in-out infinite', transformOrigin: '50% 100%' }}>
        <path d={CORE_PATH} fill="var(--c-fire-core)" />
      </svg>
    </span>
  );
}
