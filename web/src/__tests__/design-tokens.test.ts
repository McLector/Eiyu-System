import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@eiyu/shared';

describe('redesign flat-surface tokens — dark theme (must match web/src/index.css :root)', () => {
  const pageFlat = '#050b14';
  const oldMuted = 'rgba(163,210,230,0.55)'; // existing --c-muted, tuned for the old gradient bg
  const newMutedFlat = 'rgba(163,210,230,0.62)'; // --c-muted-flat

  it('documents that the existing --c-muted token fails AA body-text contrast against the new flat background', () => {
    expect(contrastRatio(oldMuted, pageFlat)).toBeLessThan(4.5);
  });

  it('--c-muted-flat passes AA body-text contrast (>=4.5:1) against --c-page-flat', () => {
    expect(contrastRatio(newMutedFlat, pageFlat)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('redesign flat-surface tokens — light theme (must match web/src/index.css [data-theme="light"])', () => {
  const pageFlat = '#e8f4fb';
  const oldMuted = 'rgba(14,52,80,0.55)'; // existing light --c-muted, tuned for the old gradient bg
  const newMutedFlat = 'rgba(14,52,80,0.72)'; // light --c-muted-flat

  it('documents that the existing light --c-muted token also fails AA contrast against the new flat light background', () => {
    expect(contrastRatio(oldMuted, pageFlat)).toBeLessThan(4.5);
  });

  it('light --c-muted-flat passes AA body-text contrast (>=4.5:1) against the light --c-page-flat', () => {
    expect(contrastRatio(newMutedFlat, pageFlat)).toBeGreaterThanOrEqual(4.5);
  });
});
