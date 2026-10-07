import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAccountPalette, resolvePaletteOnLoad, saveAccountPalette } from '@eiyu/shared';
import { readStoredPalette, readStoredPaletteChoice, storePalette, type Palette } from './palette';

/**
 * The palette follows the account. The browser copy paints first, so there is no wait and no flash; the account's
 * choice then wins. An account with no choice takes the one this browser has stored, cyan included, and pushes it up
 * so the account adopts it. A failed read changes nothing and pushes nothing, so a flaky read cannot overwrite the
 * account. A palette is cosmetic, so a failed save never surfaces: the pick still applies here, and the next one tries
 * the account again.
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
      const resolved = resolvePaletteOnLoad({ account: saved, local: readStoredPaletteChoice() });
      if (resolved.storeAccount) {
        setPalette(resolved.palette);
        storePalette(resolved.palette);
      } else if (resolved.pushLocal) {
        void saveAccountPalette(resolved.palette).catch(() => {});
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
