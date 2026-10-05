import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@eiyu/shared';

const css = readFileSync(path.resolve(import.meta.dirname, '..', 'index.css'), 'utf-8').replace(/\r\n/g, '\n');
const ROOT_BLOCK = /:root\s*\{([^}]*)\}/;
const LIGHT_BLOCK = /\[data-theme="light"\]\s*\{([^}]*)\}/;
const BLUE_BLOCK = /:root\[data-palette="blue"\]\s*\{([^}]*)\}/;

function tokens(block: RegExp): Map<string, string> {
  const body = css.match(block)?.[1] ?? '';
  return new Map([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map(m => [m[1], m[2].trim()]));
}
const root = tokens(ROOT_BLOCK);
const blue = tokens(BLUE_BLOCK);
const light = tokens(LIGHT_BLOCK);
const value = (name: string) => blue.get(name) ?? root.get(name) ?? '';

describe('System blue palette tokens', () => {
  it('is its own block on the page root, so the page behind a dialog and the dialog agree', () => {
    expect(css).toMatch(BLUE_BLOCK);
    expect(blue.size).toBeGreaterThan(10);
  });

  // Every colour that makes up the cyan look. A missed one would leave a cyan patch in the blue theme.
  const LOOK = [
    '--c-text', '--c-muted', '--c-dim', '--c-accent', '--c-accent-text', '--c-accent-glass', '--c-accent-hover', '--c-accent-border', '--c-accent-strong',
    '--c-glass', '--c-glass-sm', '--c-glass-border', '--c-track', '--c-modal', '--c-overlay', '--c-nav', '--c-nav-border', '--c-nav-dim',
    '--c-page', '--c-body', '--c-page-flat', '--c-panel-flat', '--c-panel-border', '--c-divider-flat', '--c-muted-flat', '--c-dim-flat',
    '--c-on-accent', '--c-bar-track', '--c-glow',
  ];
  it.each(LOOK)('redefines %s', name => {
    expect(blue.has(name), `${name} missing from the blue block`).toBe(true);
    expect(root.has(name), `${name} missing from the cyan base`).toBe(true);
  });

  it('is not a copy of the cyan values', () => {
    for (const name of ['--c-accent', '--c-body', '--c-page-flat', '--c-glass-border', '--c-divider-flat']) expect(blue.get(name)).not.toBe(root.get(name));
  });

  it('keeps the meaning colours (danger, success, warning, fire) as they are', () => {
    const touched = [...blue.keys()].filter(name => /danger|success|warning|fire/.test(name));
    expect(touched).toEqual([]);
  });

  it('draws the accent in blue, not cyan: more blue than green', () => {
    const [, r, g, b] = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value('--c-accent'))!.map((part, i) => (i ? parseInt(part, 16) : 0));
    expect(b).toBeGreaterThan(g + 40);
    expect(g).toBeGreaterThan(r);
  });

  describe('reads clearly on its own backgrounds (WCAG)', () => {
    const body = value('--c-body');
    const flat = value('--c-page-flat');
    it('keeps body text above 7:1', () => {
      expect(contrastRatio(value('--c-text'), body)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(value('--c-text'), flat)).toBeGreaterThanOrEqual(7);
    });
    it('keeps secondary text above 4.5:1 on the flat surface', () => {
      expect(contrastRatio(value('--c-muted-flat'), flat)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(value('--c-dim-flat'), flat)).toBeGreaterThanOrEqual(4.5);
    });
    it('keeps accent text above 4.5:1 and the accent fill above 3:1 against the page', () => {
      expect(contrastRatio(value('--c-accent-text'), flat)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(value('--c-accent-text'), body)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(value('--c-accent'), flat)).toBeGreaterThanOrEqual(3);
    });
    it('keeps the text on a filled accent button above 4.5:1', () => {
      expect(contrastRatio(value('--c-on-accent'), value('--c-accent'))).toBeGreaterThanOrEqual(4.5);
    });
    it('keeps the unchanged semantic colours readable on the blue page', () => {
      for (const name of ['--c-danger', '--c-success', '--c-warning']) expect(contrastRatio(value(name), flat), name).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('glow', () => {
  it('is off by default and in the light theme, and on only in System blue', () => {
    expect(root.get('--c-glow')).toBe('transparent');
    expect(light.get('--c-glow')).toBe('transparent');
    expect(blue.get('--c-glow')).not.toBe('transparent');
  });
  it('is drawn from the token, never from a colour literal', () => {
    const rules = [...css.matchAll(/([^{}\n@][^{}]*)\{([^}]*)\}/g)].filter(m => /text-shadow|box-shadow/.test(m[2]) && /--c-glow/.test(m[2]));
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) expect(body.match(/--c-glow/g)?.length, selector.trim()).toBeGreaterThan(0);
  });
});

describe('the palette picker', () => {
  it('styles the two options as one segmented control', () => {
    expect(css).toMatch(/\.palette-options\s*\{/);
    expect(css).toMatch(/\.palette-option\b/);
  });
});
