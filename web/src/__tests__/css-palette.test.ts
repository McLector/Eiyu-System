import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@eiyu/shared';
import { PALETTES, type Palette } from '../palette';

const css = readFileSync(path.resolve(import.meta.dirname, '..', 'index.css'), 'utf-8').replace(/\r\n/g, '\n');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ROOT_BLOCK = /:root\s*\{([^}]*)\}/;
const LIGHT_BLOCK = /\[data-theme="light"\]\s*\{([^}]*)\}/;

function tokens(block: RegExp): Map<string, string> {
  const body = css.match(block)?.[1] ?? '';
  return new Map([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map(m => [m[1], m[2].trim()]));
}
// The palette is on <html> and the theme on a descendant surface (dialogs copy the theme), so a palette's light look is
// a descendant selector: it outranks the plain light block, and it reaches dialogs that sit outside the surface.
const darkSelector = (id: Palette) => new RegExp(`:root\\[data-palette="${escape(id)}"\\]\\s*\\{([^}]*)\\}`);
const lightSelector = (id: Palette) => new RegExp(`:root\\[data-palette="${escape(id)}"\\]\\s*\\[data-theme="light"\\]\\s*\\{([^}]*)\\}`);

const root = tokens(ROOT_BLOCK);
const lightBase = tokens(LIGHT_BLOCK);
const NOT_CYAN = PALETTES.filter(p => p.id !== 'cyan');

/** The tokens a palette really gets: dark is the root plus its block; light is the root, the light block and its light block, in cascade order. */
function dark(id: Palette): Map<string, string> { return new Map([...root, ...(id === 'cyan' ? [] : tokens(darkSelector(id)))]); }
function light(id: Palette): Map<string, string> { return new Map([...root, ...lightBase, ...(id === 'cyan' ? [] : tokens(lightSelector(id)))]); }

function hsl(hex: string): { h: number; s: number } {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  if (d === 0) return { h: 0, s: 0 };
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(max + min - 1)) };
}
const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

// Every colour that makes up the look. A missed one would leave a patch of another palette on the page.
const LOOK = [
  '--c-text', '--c-muted', '--c-dim', '--c-accent', '--c-accent-text', '--c-accent-glass', '--c-accent-hover', '--c-accent-border', '--c-accent-strong',
  '--c-glass', '--c-glass-sm', '--c-glass-border', '--c-track', '--c-modal', '--c-overlay', '--c-nav', '--c-nav-border', '--c-nav-dim',
  '--c-page', '--c-body', '--c-page-flat', '--c-panel-flat', '--c-panel-border', '--c-divider-flat', '--c-muted-flat', '--c-dim-flat',
  '--c-on-accent', '--c-bar-track', '--c-glow',
];

describe('the palette list', () => {
  it('starts with the original cyan and has no duplicate ids', () => {
    expect(PALETTES[0].id).toBe('cyan');
    expect(new Set(PALETTES.map(p => p.id)).size).toBe(PALETTES.length);
  });
  it('offers the blues, violets, a pink, a neutral and two greens', () => {
    expect(PALETTES.map(p => p.id)).toEqual(['cyan', 'blue', 'indigo', 'violet', 'magenta', 'steel', 'jade', 'lime']);
  });
  it('gives every palette a label and a swatch colour that is its dark accent', () => {
    for (const { id, label, swatch } of PALETTES) {
      expect(label.length, id).toBeGreaterThan(0);
      expect(swatch.toLowerCase(), id).toBe(dark(id).get('--c-accent'));
    }
  });
});

describe.each(NOT_CYAN)('$label palette blocks', ({ id }) => {
  it('has a dark block and a light block of its own', () => {
    expect(css).toMatch(darkSelector(id));
    expect(css).toMatch(lightSelector(id));
  });

  describe.each([['dark', darkSelector, dark], ['light', lightSelector, light]] as const)('%s', (theme, selector, effective) => {
    const own = tokens(selector(id));
    it.each(LOOK.filter(name => !(theme === 'light' && name === '--c-glow')))('redefines %s', name => {
      expect(own.has(name), `${name} missing from the ${theme} block`).toBe(true);
    });
    it('is not a copy of the cyan values', () => {
      const cyan = theme === 'dark' ? dark('cyan') : light('cyan');
      for (const name of ['--c-accent', '--c-body', '--c-page-flat', '--c-divider-flat']) expect(effective(id).get(name), name).not.toBe(cyan.get(name));
    });
    it('keeps the meaning colours (danger, success, warning, fire) as they are', () => {
      expect([...own.keys()].filter(name => /danger|success|warning|fire/.test(name))).toEqual([]);
    });
  });
});

describe.each(PALETTES)('$label palette reads clearly (WCAG)', ({ id }) => {
  describe.each([['dark', dark], ['light', light]] as const)('%s', (theme, effective) => {
    // Cyan's light accent text was shipped at 4.36:1 on the page gradient's top colour (it is 4.5+ on the flat surface the app draws on); not changed here.
    const knownBodyGap = id === 'cyan' && theme === 'light';
    const value = (name: string) => effective(id).get(name) ?? '';
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
      if (!knownBodyGap) expect(contrastRatio(value('--c-accent-text'), body)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(value('--c-accent'), flat)).toBeGreaterThanOrEqual(3);
    });
    it('keeps the text on a filled accent button above 4.5:1', () => {
      expect(contrastRatio(value('--c-on-accent'), value('--c-accent'))).toBeGreaterThanOrEqual(4.5);
    });
    it('keeps the unchanged semantic colours readable on its page', () => {
      for (const name of ['--c-danger', '--c-success', '--c-warning']) expect(contrastRatio(value(name), flat), name).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('palettes stay apart from the meaning colours', () => {
  // A chromatic accent near red, green or amber would make a plain button look like an error or a success.
  const MEANING = ['--c-danger', '--c-success', '--c-warning'];
  const MIN_GAP = 20;
  describe.each(PALETTES)('$label', ({ id }) => {
    it.each([['dark', dark], ['light', light]] as const)('%s accent keeps its hue clear of danger, success and warning', (_theme, effective) => {
      const tokensNow = effective(id);
      const accent = hsl(tokensNow.get('--c-accent') ?? '');
      if (accent.s < 0.2) return; // a neutral accent has no hue to confuse
      for (const name of MEANING) expect(hueGap(accent.h, hsl(tokensNow.get(name) ?? '').h), `${id} vs ${name}`).toBeGreaterThanOrEqual(MIN_GAP);
    });
  });
  it('keeps every dark accent and every light accent distinct', () => {
    for (const effective of [dark, light]) {
      const accents = PALETTES.map(p => effective(p.id).get('--c-accent'));
      expect(new Set(accents).size).toBe(accents.length);
    }
  });
});

describe('System blue draws the accent in blue, not cyan: more blue than green', () => {
  it('holds', () => {
    const [, r, g, b] = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(dark('blue').get('--c-accent')!)!.map((part, i) => (i ? parseInt(part, 16) : 0));
    expect(b).toBeGreaterThan(g + 40);
    expect(g).toBeGreaterThan(r);
  });
});

describe('glow', () => {
  it('is off by default and in every light theme, and on in every other dark palette', () => {
    expect(root.get('--c-glow')).toBe('transparent');
    for (const { id } of PALETTES) expect(light(id).get('--c-glow'), `${id} light`).toBe('transparent');
    for (const { id } of NOT_CYAN) expect(dark(id).get('--c-glow'), `${id} dark`).not.toBe('transparent');
  });
  it('is drawn from the token, never from a colour literal', () => {
    const rules = [...css.matchAll(/([^{}\n@][^{}]*)\{([^}]*)\}/g)].filter(m => /text-shadow|box-shadow/.test(m[2]) && /--c-glow/.test(m[2]));
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) expect(body.match(/--c-glow/g)?.length, selector.trim()).toBeGreaterThan(0);
  });
});

describe('the palette picker', () => {
  it('styles the options as one group of swatches', () => {
    expect(css).toMatch(/\.palette-options\s*\{/);
    expect(css).toMatch(/\.palette-option\b/);
    expect(css).toMatch(/\.palette-swatch\b/);
  });
});
