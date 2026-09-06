import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@eiyu/shared';

const css = readFileSync(path.resolve(import.meta.dirname, '../index.css'), 'utf-8');

const DARK_BLOCK = new RegExp(':root\\s*\\{([^}]*)\\}');
const LIGHT_BLOCK = new RegExp('\\[data-theme="light"\\]\\s*\\{([^}]*)\\}');

function readCssVar(blockRegex: RegExp, varName: string): string {
  const blockMatch = css.match(blockRegex);
  if (!blockMatch) throw new Error(`Could not find theme block matching ${blockRegex}`);
  const varMatch = blockMatch[1].match(new RegExp(`--${varName}:\\s*([^;]+);`));
  if (!varMatch) throw new Error(`Could not find --${varName} in the matched theme block`);
  return varMatch[1].trim();
}

describe('redesign flat-surface tokens — dark theme (read live from web/src/index.css)', () => {
  const pageFlat = readCssVar(DARK_BLOCK, 'c-page-flat');
  const oldMuted = readCssVar(DARK_BLOCK, 'c-muted');
  const newMutedFlat = readCssVar(DARK_BLOCK, 'c-muted-flat');
  const oldDim = readCssVar(DARK_BLOCK, 'c-dim');
  const newDimFlat = readCssVar(DARK_BLOCK, 'c-dim-flat');

  it('existing --c-muted fails AA body-text contrast against the new flat background', () => {
    expect(contrastRatio(oldMuted, pageFlat)).toBeLessThan(4.5);
  });
  it('--c-muted-flat passes AA body-text contrast (>=4.5:1) against --c-page-flat', () => {
    expect(contrastRatio(newMutedFlat, pageFlat)).toBeGreaterThanOrEqual(4.5);
  });
  it('existing --c-dim fails AA body-text contrast against the new flat background', () => {
    expect(contrastRatio(oldDim, pageFlat)).toBeLessThan(4.5);
  });
  it('--c-dim-flat passes AA body-text contrast (>=4.5:1) against --c-page-flat', () => {
    expect(contrastRatio(newDimFlat, pageFlat)).toBeGreaterThanOrEqual(4.5);
  });
  it('--c-dim-flat is still measurably dimmer than --c-muted-flat, preserving their relative hierarchy', () => {
    expect(contrastRatio(newDimFlat, pageFlat)).toBeLessThan(contrastRatio(newMutedFlat, pageFlat));
  });
});

describe('redesign flat-surface tokens — light theme (read live from web/src/index.css)', () => {
  const pageFlat = readCssVar(LIGHT_BLOCK, 'c-page-flat');
  const oldMuted = readCssVar(LIGHT_BLOCK, 'c-muted');
  const newMutedFlat = readCssVar(LIGHT_BLOCK, 'c-muted-flat');
  const oldDim = readCssVar(LIGHT_BLOCK, 'c-dim');
  const newDimFlat = readCssVar(LIGHT_BLOCK, 'c-dim-flat');

  it('existing light --c-muted fails AA body-text contrast against the new flat light background', () => {
    expect(contrastRatio(oldMuted, pageFlat)).toBeLessThan(4.5);
  });
  it('light --c-muted-flat passes AA body-text contrast (>=4.5:1) against the light --c-page-flat', () => {
    expect(contrastRatio(newMutedFlat, pageFlat)).toBeGreaterThanOrEqual(4.5);
  });
  it('existing light --c-dim fails AA body-text contrast against the new flat light background', () => {
    expect(contrastRatio(oldDim, pageFlat)).toBeLessThan(4.5);
  });
  it('light --c-dim-flat passes AA body-text contrast (>=4.5:1) against the light --c-page-flat', () => {
    expect(contrastRatio(newDimFlat, pageFlat)).toBeGreaterThanOrEqual(4.5);
  });
  it('light --c-dim-flat is still measurably dimmer than light --c-muted-flat', () => {
    expect(contrastRatio(newDimFlat, pageFlat)).toBeLessThan(contrastRatio(newMutedFlat, pageFlat));
  });
});
