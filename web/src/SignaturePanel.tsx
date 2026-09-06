import type { CSSProperties, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  tint?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Signature-panel framing (redesign spec §3): a flat panel with a full
 * border plus four independent corner-bracket accents on top of it. Reserve
 * for the one or two "pay attention here" panels per screen — everything
 * else uses the plain `.panel-flat`-less grouping style (no border at all).
 */
export default function SignaturePanel({ children, tint, style, className }: Props) {
  const borderColor = tint ?? 'var(--c-panel-border)';
  const bracketColor = tint ?? 'var(--c-accent)';
  return (
    <div
      className={['panel-flat', className].filter(Boolean).join(' ')}
      style={{ position: 'relative', borderColor, ...style }}
    >
      <span className="panel-corner panel-corner-tl" style={{ borderColor: bracketColor }} />
      <span className="panel-corner panel-corner-tr" style={{ borderColor: bracketColor }} />
      <span className="panel-corner panel-corner-bl" style={{ borderColor: bracketColor }} />
      <span className="panel-corner panel-corner-br" style={{ borderColor: bracketColor }} />
      {children}
    </div>
  );
}
