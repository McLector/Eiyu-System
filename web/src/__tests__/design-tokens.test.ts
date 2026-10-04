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

describe('every text colour used in the stylesheet reaches AA (4.5:1) on the page, in both themes', () => {
  // Tokens that only ever sit on their own fill (a button, the painted map) are checked against that fill elsewhere.
  const ON_OWN_FILL = new Set(['c-on-accent', 'c-journey-route']);
  const used = [...new Set([...css.matchAll(/(?<![\w-])color:\s*var\(--(c-[\w-]+)\)/g)].map(m => m[1]))].filter(t => !ON_OWN_FILL.has(t));

  const resolve = (block: RegExp, name: string): string => {
    const value = readCssVar(block, name);
    const alias = value.match(/^var\(--([\w-]+)\)$/);
    return alias ? resolve(block, alias[1]) : value;
  };
  const channels = (value: string): [number, number, number, number] => {
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as [number, number, number, number];
    const rgba = value.match(/rgba?\(([^)]+)\)/);
    if (!rgba) throw new Error(`Cannot read colour ${value}`);
    const [r, g, b, a] = rgba[1].split(',').map(Number);
    return [r, g, b, a ?? 1];
  };
  const onto = (fg: string, bg: string): string => {
    const [r, g, b, a] = channels(fg);
    const back = channels(bg);
    return '#' + [r, g, b].map((c, i) => Math.round(c * a + back[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
  };

  for (const [theme, block] of [['dark', DARK_BLOCK], ['light', LIGHT_BLOCK]] as const) {
    it(`${theme}: ${used.length} text tokens pass`, () => {
      const page = resolve(block, 'c-page-flat');
      const failing = used.flatMap(token => {
        const ratio = contrastRatio(onto(resolve(block, token), page), page);
        return ratio >= 4.5 ? [] : [`${token} ${ratio.toFixed(2)}`];
      });
      expect(failing).toEqual([]);
    });
  }
  it('has a text-only accent that is darker than the fill accent in the light theme', () => {
    const page = readCssVar(LIGHT_BLOCK, 'c-page-flat');
    expect(contrastRatio(readCssVar(LIGHT_BLOCK, 'c-accent'), page)).toBeLessThan(4.5);
    expect(contrastRatio(readCssVar(LIGHT_BLOCK, 'c-accent-text'), page)).toBeGreaterThanOrEqual(4.5);
  });
  it('never sets text in the fill accent', () => {
    expect(css).not.toMatch(/(?<![\w-])color:\s*var\(--c-accent\)/);
  });
});

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

describe('on-accent and semantic tokens stay legible in both themes', () => {
  // The primary button label was inheriting the body text colour (~1.2:1 on the cyan fill) because --c-bg was never defined.
  for (const [theme, block] of [['dark', DARK_BLOCK], ['light', LIGHT_BLOCK]] as const) {
    const pageFlat = readCssVar(block, 'c-page-flat');
    it(`${theme}: --c-on-accent passes AA against --c-accent`, () => {
      expect(contrastRatio(readCssVar(block, 'c-on-accent'), readCssVar(block, 'c-accent'))).toBeGreaterThanOrEqual(4.5);
    });
    for (const token of ['c-danger', 'c-success', 'c-warning']) {
      it(`${theme}: --${token} passes AA as text on --c-page-flat`, () => {
        expect(contrastRatio(readCssVar(block, token), pageFlat)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
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
