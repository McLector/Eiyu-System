import { createContext, useContext, type ReactNode } from 'react';

import { nudgedLetterSpacing, nudgeOffsetForChanges, useFontScaleChanges, type FontScaleNudge } from '@/lib/font-scale-nudge';

/** Number of system font-scale changes since launch. 0 without a provider, so a bare tree never patches. */
const FontScaleChangesContext = createContext(0);

/**
 * Listens to the system font scale once and shares the change count, so every AppText reads it from context instead of
 * subscribing to window dimensions itself. Mount it near the root; it renders only a context provider, so it never
 * remounts its children.
 */
export function FontScaleNudgeProvider({ children }: { children: ReactNode }) {
  const changes = useFontScaleChanges();
  return <FontScaleChangesContext.Provider value={changes}>{children}</FontScaleChangesContext.Provider>;
}

/** Shared-context twin of useFontScaleNudge: no window listener of its own. */
export function useSharedFontScaleNudge(baseLetterSpacing?: number): FontScaleNudge | undefined {
  const offset = nudgeOffsetForChanges(useContext(FontScaleChangesContext));
  return offset === undefined ? undefined : { letterSpacing: nudgedLetterSpacing(baseLetterSpacing, offset) };
}
