import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAccountPalette, saveAccountPalette } from '@eiyu/shared';
import { isPalette, readStoredPalette, storePalette, type Palette } from './palette';

/**
 * The palette follows the account. The browser copy paints first, so there is no wait and no flash; the account's
 * choice then wins, and an account with none takes the one this browser already uses. A palette is cosmetic, so a
 * failed read or save never surfaces: the pick still applies here, and the next one tries the account again.
 */
export function useAccountPalette(userId: string | undefined): [Palette, (next: Palette) => void] {
  const [palette, setPalette] = useState<Palette>(readStoredPalette);
  const picked = useRef(false);

  useEffect(() => {
    if (!userId) return;
    picked.current = false;
    let current = true;
    void fetchAccountPalette(userId).then(saved => {
      if (!current || picked.current) return;
      if (saved === null) {
        const local = readStoredPalette();
        if (local !== 'cyan') void saveAccountPalette(local).catch(() => {});
      } else if (isPalette(saved)) {
        setPalette(saved);
        storePalette(saved);
      }
    });
    return () => { current = false; };
  }, [userId]);

  const change = useCallback((next: Palette) => {
    picked.current = true;
    setPalette(next);
    storePalette(next);
    if (userId) void saveAccountPalette(next).catch(() => {});
  }, [userId]);

  return [palette, change];
}
