import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '..');
const css = readFileSync(path.join(SRC, 'index.css'), 'utf-8');

const ROOT_BLOCK = /:root\s*\{([^}]*)\}/;
const LIGHT_BLOCK = /\[data-theme="light"\]\s*\{([^}]*)\}/;

function tsxSources(): { file: string; text: string }[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter(f => f.endsWith('.tsx') && !f.includes('__tests__'))
    .map(f => ({ file: f.replace(/\\/g, '/'), text: readFileSync(path.join(SRC, f), 'utf-8') }));
}

function declaredIn(block: RegExp): Set<string> {
  const body = css.match(block)?.[1] ?? '';
  return new Set([...body.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));
}

describe('every custom property that is read is also defined', () => {
  // Defined anywhere in the stylesheet (theme blocks, component classes, @theme) or set from a component.
  const declared = new Set<string>([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));
  for (const { text } of tsxSources()) {
    for (const m of text.matchAll(/['"](--[a-z0-9-]+)['"]\s*:/gi)) declared.add(m[1]);
    for (const m of text.matchAll(/setProperty\(\s*['"](--[a-z0-9-]+)['"]/gi)) declared.add(m[1]);
  }

  function referenced(): Map<string, string[]> {
    const where = new Map<string, string[]>();
    const scan = (file: string, text: string) => {
      // `var(--x, fallback)` carries its own fallback, so only bare reads can silently resolve to nothing.
      for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) where.set(m[1], [...(where.get(m[1]) ?? []), file]);
    };
    scan('index.css', css);
    for (const { file, text } of tsxSources()) scan(file, text);
    return where;
  }

  it('has no var(--token) read that nothing defines', () => {
    const missing = [...referenced()].filter(([name]) => !declared.has(name)).map(([name, files]) => `${name} (in ${[...new Set(files)].join(', ')})`);
    expect(missing).toEqual([]);
  });
});

describe('themed tokens exist in both themes', () => {
  const MUST_THEME = [
    'c-on-accent',
    'c-danger', 'c-danger-border', 'c-danger-glass',
    'c-success', 'c-success-border', 'c-success-glass',
    'c-warning', 'c-warning-border', 'c-warning-glass',
    'c-journey-route',
    'c-checkpoint-done-bg', 'c-checkpoint-done-border',
    'c-checkpoint-available-bg', 'c-checkpoint-available-border',
    'c-checkpoint-locked-bg', 'c-checkpoint-locked-border',
    'c-checkpoint-label-bg',
    'c-bar-track',
    'c-accent-text',
    'c-journey-overlay',
  ];
  const dark = declaredIn(ROOT_BLOCK);
  const light = declaredIn(LIGHT_BLOCK);
  it.each(MUST_THEME)('--%s is defined for dark and light', name => {
    expect({ token: name, dark: dark.has(`--${name}`), light: light.has(`--${name}`) }).toEqual({ token: name, dark: true, light: true });
  });
});

describe('motion tokens', () => {
  const root = css.match(ROOT_BLOCK)?.[1] ?? '';
  const read = (name: string) => root.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  it('uses the shared easing curves', () => {
    expect(read('ease-out')).toBe('cubic-bezier(0.23, 1, 0.32, 1)');
    expect(read('ease-in-out')).toBe('cubic-bezier(0.77, 0, 0.175, 1)');
    expect(read('ease-drawer')).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
  });
  it('keeps UI durations at or under 300ms', () => {
    expect(['dur-press', 'dur-fast', 'dur-base', 'dur-slow'].map(read)).toEqual(['160ms', '150ms', '200ms', '300ms']);
  });
});

describe('control system', () => {
  // Every declaration block whose selector list mentions the given class, in source order.
  const bodiesFor = (className: string) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(m => m[1].includes(className)).map(m => m[2]).join(';');

  it('does not flatten letter-spacing on every button and heading with !important', () => {
    expect(css).not.toMatch(/button,\s*input,\s*select,\s*textarea\s*\{\s*letter-spacing:\s*0\s*!important/);
    expect(css).not.toMatch(/h1,\s*h2,\s*h3\s*\{\s*letter-spacing:\s*0\s*!important/);
  });
  it('gives every button role one tracked, uppercase HUD label', () => {
    const shared = css.match(/\.btn-primary,\s*\.btn-secondary,[^{]*\{([^}]*)\}/)?.[1] ?? '';
    expect(shared).toMatch(/text-transform:\s*uppercase/);
    expect(shared).toMatch(/letter-spacing:\s*0?\.0[5-9]em/);
  });
  it('defines .btn-ghost once, inside the shared button block', () => {
    expect(css).not.toMatch(/(?:^|\n)\.btn-ghost\s*\{/);
    expect(css.match(/\.btn-ghost/g)?.length ?? 0).toBeGreaterThan(0);
  });
  it('uses the system radius on buttons, not a pill', () => {
    const shared = css.match(/\.btn-primary,\s*\.btn-secondary,[^{]*\{([^}]*)\}/)?.[1] ?? '';
    expect(shared).toMatch(/border-radius:\s*4px/);
  });
  it('gives page titles their own text colour so they never depend on the page they sit in', () => {
    expect(bodiesFor('.page-title')).toMatch(/color:\s*var\(--c-text\)/);
  });
  it('has a shared field label that is tracked uppercase', () => {
    const label = bodiesFor('.field-label');
    expect(label).toMatch(/text-transform:\s*uppercase/);
    expect(label).toMatch(/letter-spacing:\s*\.12em/);
  });
  it('never animates "all" properties in the stylesheet', () => {
    expect(css).not.toMatch(/transition:\s*all/);
  });
});

describe('board and gym layout consistency', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => ({ selector: m[1].trim(), body: m[2] }));
  const scoped = rules.filter(r => /\.(?:web-)?board-|\.gym-/.test(r.selector));

  it('keeps every board and gym label at 11px or larger', () => {
    const small = scoped.flatMap(r => {
      const sizes = [...r.body.matchAll(/font(?:-size)?:\s*(?:[\w-]+\s+)*?(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
      return sizes.some(s => s < 11) ? [r.selector] : [];
    });
    expect(small).toEqual([]);
  });
  it('uses the 4px system radius on lanes, cards and the gym table', () => {
    const radii = scoped
      .filter(r => /^\.(board-lane|board-quest-card|board-catalog-card)\b/.test(r.selector.split(',')[0].trim()) && !/-(header|body|empty|tabs)/.test(r.selector.split(',')[0]))
      .flatMap(r => [...r.body.matchAll(/border-radius:\s*([^;]+)/g)].map(m => `${r.selector} -> ${m[1].trim()}`));
    expect(radii.filter(line => !/-> (4px|0)$/.test(line))).toEqual([]);
  });
  it('defines the compact control modifier after the shared button block so it wins the cascade', () => {
    const shared = css.search(/\.btn-primary,\s*\.btn-secondary,[^{]*\{/);
    const compact = css.search(/\.btn-compact\s*\{/);
    expect(shared).toBeGreaterThan(-1);
    expect(compact).toBeGreaterThan(shared);
    expect(css.match(/\.btn-compact\s*\{([^}]*)\}/)?.[1]).toMatch(/min-height:\s*30px/);
  });
  it('retires the bespoke board action and lifecycle rules', () => {
    expect(css).not.toMatch(/\.board-action-button|\.board-edit-button|\.board-card-lifecycle/);
  });
  it('styles the archived toggle with the accent colour rather than the white native control', () => {
    expect(rules.filter(r => /\.gym-checkbox/.test(r.selector)).map(r => r.body).join(';')).toMatch(/accent-color:\s*var\(--c-accent\)/);
  });
});

describe('journey as a HUD window', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => ({ selector: m[1].trim(), body: m[2] }));
  const journey = rules.filter(r => /\.journey|\.stage-row/.test(r.selector));
  const body = (needle: RegExp) => journey.filter(r => needle.test(r.selector)).map(r => r.body).join(';');

  it('keeps every journey label at 11px or larger', () => {
    const small = journey.flatMap(r => {
      const sizes = [...r.body.matchAll(/font(?:-size)?:\s*(?:[\w-]+\s+)*?(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));
      return sizes.some(s => s < 11) ? [r.selector] : [];
    });
    expect(small).toEqual([]);
  });
  it('stops stretching the painting: terrain is cropped, never distorted', () => {
    expect(body(/\.journey-terrain/)).toMatch(/object-fit:\s*cover/);
    expect(body(/\.journey-terrain/)).not.toMatch(/object-fit:\s*fill/);
  });
  it('frames the expanded map with a hairline panel border and corner brackets', () => {
    expect(body(/\.journey\.is-expanded \.journey-map(?!::)/)).toMatch(/border:\s*1px solid var\(--c-panel-border\)/);
    expect(css).toMatch(/\.journey\.is-expanded \.journey-map::before/);
  });
  it('tints the painting per theme so the map sits under the UI', () => {
    expect(css.match(/--c-journey-overlay:/g)?.length).toBe(2);
    expect(css).toMatch(/\.journey-map::after[^{]*\{[^}]*var\(--c-journey-overlay\)/);
  });
  it('keeps route, checkpoints and hero above the overlay', () => {
    for (const selector of [/\.journey-route/, /\.journey-checkpoint(?![-.:\w])/, /\.journey-hero/]) {
      expect(Number(body(selector).match(/z-index:\s*(\d+)/)?.[1] ?? 0)).toBeGreaterThanOrEqual(1);
    }
  });
  it('styles stage rows as plain checklist rows: a hairline, no card background, no radius', () => {
    const row = body(/\.stage-row(?![-.:\w])/);
    expect(row).toMatch(/border-bottom:\s*1px solid var\(--c-divider-flat\)/);
    expect(row).not.toMatch(/border-radius:\s*[1-9]/);
    expect(row).not.toMatch(/background:\s*var\(--c-accent-glass\)/);
  });
});

describe('semantic colours are tokens, not literals', () => {
  // Red/green/amber were typed in ~40 times with no light-theme value (1.5-2.6:1 on the light page).
  const HUES = /#f87171|#4ade80|#fbbf24|rgba?\(\s*248\s*,\s*113\s*,\s*113|rgba?\(\s*74\s*,\s*222\s*,\s*128|rgba?\(\s*251\s*,\s*191\s*,\s*36/gi;
  const cssOutsideThemeBlocks = css.replace(ROOT_BLOCK, '').replace(LIGHT_BLOCK, '');

  it('index.css only spells them inside the two theme blocks', () => {
    expect(cssOutsideThemeBlocks.match(HUES) ?? []).toEqual([]);
  });
  it('does not grow the pile of colour literals outside the theme blocks (ratchet: lower this number, never raise it)', () => {
    const literals = cssOutsideThemeBlocks.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
    expect(literals.length).toBeLessThanOrEqual(2);
  });
  it('no component sets inline text smaller than 11px', () => {
    const small = tsxSources().flatMap(({ file, text }) =>
      [...text.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)\b/g)].filter(m => Number(m[1]) < 11 && !/size=/.test(m[0])).map(m => `${file}: fontSize ${m[1]}`));
    expect(small).toEqual([]);
  });
  it('the radar chart and its tooltip read the theme tokens instead of hardcoded colours', () => {
    const status = tsxSources().find(s => s.file.endsWith('WebStatus.tsx'))!.text;
    expect(status).not.toMatch(/#67e8f9|#0891b2|#dff0fb|#0b1e32|rgba\(\s*(103|8|5|237)\s*,/i);
    expect(status).toMatch(/var\(--c-accent-text\)/);
  });
  it('keeps colour literals in components to the painted map halo and the landing glow (ratchet: lower, never raise)', () => {
    const literals = tsxSources().flatMap(({ file, text }) => (text.match(/#[0-9a-fA-F]{6}\b|rgba?\(/g) ?? []).map(() => file));
    expect(literals.length).toBeLessThanOrEqual(3);
  });
  it('components never set text in the fill accent, which fails AA on the light page', () => {
    const offenders = tsxSources().filter(({ text }) => /(?<![\w-])color:\s*(?:[^,;{}\n]*?\?\s*)?'var\(--c-accent\)'/.test(text)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
  it('components never spell them', () => {
    const offenders = tsxSources().map(({ file, text }) => [file, (text.match(HUES) ?? []).length] as const).filter(([, n]) => n > 0);
    expect(offenders).toEqual([]);
  });
});
