import type { ReactNode } from 'react';

/** One loading / empty / error treatment for every screen. Copy is the caller's; tone and live-region role are ours. */
export default function StateBlock({ kind, title, onRetry, retryLabel = 'Retry', children }: {
  kind: 'loading' | 'empty' | 'error'; title?: string; onRetry?: () => void; retryLabel?: string; children?: ReactNode;
}) {
  const role = kind === 'loading' ? 'status' : kind === 'error' ? 'alert' : undefined;
  return (
    <div className={`state-block is-${kind}`} role={role}>
      {title && <strong className="state-block-title">{title}</strong>}
      {children && <p>{children}</p>}
      {kind === 'error' && onRetry && <button type="button" className="btn-secondary" onClick={onRetry}>{retryLabel}</button>}
    </div>
  );
}
